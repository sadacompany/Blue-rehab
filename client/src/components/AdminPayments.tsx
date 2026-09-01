import { CreditCard, LoaderCircle, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency, formatDateTime } from "../lib/format";
import { refundPayment, type AdminPayment } from "../lib/admin";

const PAYMENT_STATUS: Record<string, string> = {
  pending: "معلق", processing: "قيد التنفيذ", succeeded: "مدفوع",
  failed: "فشل", cancelled: "ملغي", refunded: "مسترد", partially_refunded: "مسترد جزئياً",
};

/** Only money that actually arrived can go back. */
const REFUNDABLE = new Set(["succeeded", "partially_refunded"]);

/**
 * Refunding one payment.
 *
 * Two presses, like the other destructive actions on this dashboard, and for a
 * stronger reason: this one moves real money and cannot be taken back from
 * here. The amount defaults to the whole remaining balance, which is what
 * «wrong payment» almost always means — a partial figure is available for the
 * cases where only part of it was wrong.
 *
 * The figure typed here is a *request*. The server recomputes what is actually
 * refundable from its own `payments` row and refuses anything larger, so this
 * box can ask for less than was charged but never for more.
 */
function RefundPayment({ payment, onDone, onError }: {
  payment: AdminPayment;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // What will actually go back. Shown, never typed — the server computes the
  // same figure from its own row and the request cannot influence it.
  const refundable = Math.round((payment.amount - payment.refundedAmount) * 100) / 100;

  async function submit() {
    setBusy(true);
    try {
      const result = await refundPayment(payment.orderNumber, reason);
      onError(`تم استرداد ${formatCurrency(result.refunded)} بالكامل للطلب ${payment.orderNumber}، وأُلغي الحجز أو التسجيل المرتبط به.`);
      setArmed(false);
      setReason("");
      onDone();
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "تعذر تنفيذ الاسترداد");
    } finally { setBusy(false); }
  }

  if (!armed) {
    return <button type="button" className="button button-small button-danger-ghost" disabled={busy}
      onClick={() => setArmed(true)}>
      <RotateCcw /> استرداد {formatCurrency(refundable)}
    </button>;
  }

  return <div className="refund-confirm" role="alert">
    <div className="refund-confirm-head">
      <TriangleAlert />
      <div>
        <b>تأكيد استرداد المبلغ كاملاً</b>
        <small>الطلب <span dir="ltr">{payment.orderNumber}</span> — {payment.userName}</small>
      </div>
      {/* The figure gets its own place in the layout rather than a sentence:
          it is the one thing that must be read before pressing. */}
      <span className="refund-figure">{formatCurrency(refundable)}</span>
    </div>

    <ul className="refund-consequences">
      <li>يُنفَّذ الاسترداد لدى بوابة الدفع فوراً، ولا يمكن التراجع عنه من هذه اللوحة.</li>
      <li>يُلغى الحجز أو التسجيل المرتبط، ويعود الموعد متاحاً في التقويم.</li>
      <li>يُسترد المبلغ كاملاً — لا يمكن تحديد مبلغ جزئي.</li>
    </ul>

    <label><span>سبب الاسترداد (اختياري — يُحفظ في السجل)</span>
      <input value={reason} placeholder="دفعة بالخطأ"
        onChange={(event) => setReason(event.target.value)} /></label>

    <div className="refund-actions">
      <button type="button" className="button button-small button-secondary" disabled={busy}
        onClick={() => { setArmed(false); setReason(""); }}>إلغاء</button>
      <button type="button" className="button button-small is-danger" disabled={busy}
        onClick={() => void submit()}>
        {busy ? <LoaderCircle className="spin" /> : <RotateCcw />} نعم، استرد {formatCurrency(refundable)}
      </button>
    </div>
  </div>;
}

/**
 * The payment ledger.
 *
 * Read-only until now. `refundPayment()` has existed in server/src/moyasar.ts
 * since the gateway was integrated and was never wired to anything, so a
 * payment taken by mistake could only be settled outside the platform and then
 * reconciled by hand.
 */
/** The filter tabs, in the order an administrator actually reaches for them. */
const FILTERS: Array<[string, string]> = [
  ["all", "الكل"],
  ["succeeded", "مدفوع"],
  ["refunded", "مسترد"],
  ["pending", "لم يكتمل"],
  ["failed", "فشل"],
];

/** Which stored statuses each tab covers. `all` matches everything. */
const FILTER_MATCH: Record<string, (status: string) => boolean> = {
  all: () => true,
  succeeded: (s) => s === "succeeded",
  refunded: (s) => s === "refunded" || s === "partially_refunded",
  pending: (s) => s === "pending" || s === "processing",
  failed: (s) => s === "failed" || s === "cancelled",
};

export default function AdminPayments({ payments, onError, reload }: {
  payments: AdminPayment[];
  onError: (message: string) => void;
  reload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const [key] of FILTERS) tally[key] = payments.filter((p) => FILTER_MATCH[key](p.status)).length;
    return tally;
  }, [payments]);

  /*
   * One box, four fields.
   *
   * An administrator is not asked «find order BR-…»; they are told «a man
   * called about a charge, his number ends 725» or «someone paid twice, here is
   * her email». So the search reads across the name, the email, the phone and
   * the order number at once rather than making them pick a column first.
   *
   * Digits are compared with separators stripped, so 0533498725 finds a number
   * stored as +966 53 349 8725 — the way people read a phone number aloud is
   * not the way it is stored.
   */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return payments.filter((item) => {
      if (!FILTER_MATCH[filter](item.status)) return false;
      if (!needle) return true;
      const text = [item.userName, item.userEmail, item.orderNumber]
        .some((field) => field?.toLowerCase().includes(needle));
      const phone = digits.length >= 3
        && (item.userPhone ?? "").replace(/\D/g, "").includes(digits);
      return text || phone;
    });
  }, [payments, query, filter]);

  return <section className="specialist-panel">
    <h3 className="trainer-section-title">المدفوعات</h3>
    <p className="application-hint">
      آخر {payments.length} عملية. ابحث بالاسم أو البريد أو الجوال أو رقم الطلب، ثم نفّذ الاسترداد من نفس الصف.
    </p>

    <div className="promo-toolbar">
      <label className="promo-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث بالاسم أو البريد أو الجوال أو رقم الطلب"
          aria-label="بحث في المدفوعات" />
      </label>
      <div className="promo-filters" role="tablist">
        {FILTERS.map(([key, label]) => <button key={key} type="button" role="tab"
          aria-selected={filter === key}
          className={`chip${filter === key ? " selected" : ""}`}
          onClick={() => setFilter(key)}
        >{label}{counts[key] ? ` (${counts[key]})` : ""}</button>)}
      </div>
    </div>

    {shown.length ? <div className="admin-list">
      {shown.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          <div>
            <strong>{formatCurrency(item.amount)} · {item.kind === "booking" ? "جلسة" : "دورة"}</strong>
            <small>{item.userName}</small>
            {/* Contact details on the row itself: the person searching by phone
                needs to see the phone to be sure they found the right payment. */}
            {(item.userEmail || item.userPhone) && <small dir="ltr" className="payment-contact">
              {[item.userPhone, item.userEmail].filter(Boolean).join(" · ")}
            </small>}
            <small dir="ltr">{item.orderNumber}</small>
            <small>{item.paidAt ? `دُفع في ${formatDateTime(item.paidAt)}` : `أُنشئ في ${formatDateTime(item.createdAt)}`}</small>
            {item.refundedAmount > 0 && <small className="admin-quote">
              المسترد حتى الآن: {formatCurrency(item.refundedAmount)}
            </small>}
            {item.failureReason && <small className="admin-quote">سبب الفشل: {item.failureReason}</small>}
          </div>
          <em>{PAYMENT_STATUS[item.status] ?? item.status}</em>
        </div>

        {REFUNDABLE.has(item.status) && <div className="admin-row-danger">
          <RefundPayment payment={item} onError={onError} onDone={() => void reload()} />
        </div>}
      </article>)}
    </div> : <div className="portal-empty"><CreditCard />
      <p>{payments.length === 0 ? "لا توجد مدفوعات." : "لا توجد عملية تطابق البحث."}</p>
    </div>}
  </section>;
}
