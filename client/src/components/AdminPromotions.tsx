import { BadgePercent, Check, Copy, LoaderCircle, Link2, Pause, Play, Plus, RefreshCcw, Save, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createPromoCode, loadPromoCodes, loadPromoRedemptions, promotionUrl,
  PROMO_STATUS_LABEL, updatePromoCode,
  type PromoCode, type PromoKind, type PromoRedemption, type PromoStatus,
} from "../lib/promotions";
import { formatCurrency, formatDate } from "../lib/format";
import { useAsync } from "../lib/use-async";
import { SkeletonLine } from "./Skeleton";

/**
 * Discount and marketer codes.
 *
 * Loads its own data rather than joining `AdminSnapshot`, on the same grounds
 * as AdminTeam: nothing else on the dashboard reads a promotion code, and
 * putting it in the shared snapshot would make every tab wait for a query only
 * this one needs.
 *
 * The panel is arranged the way running a campaign actually goes — make a
 * code, hand out its link, then come back later to see whether it worked — so
 * creation is at the top, and the list below leads with the two numbers that
 * answer "did it work": arrivals on the link, and sales through it.
 */

const KIND_LABEL: Record<PromoKind, string> = { discount: "خصم", marketer: "مسوّق" };

/** The tabs across the bottom of the composer, in the screenshot's order. */
const FILTERS: Array<[PromoStatus | "all", string]> = [
  ["all", "الكل"],
  ["active", "نشط"],
  ["scheduled", "مجدول"],
  ["paused", "متوقف"],
  ["expired", "منتهي"],
  ["exhausted", "مكتمل الاستخدام"],
];

/** `datetime-local` gives «2026-09-01T13:00»; the database wants a real instant. */
const toInstant = (value: string): string | undefined =>
  value ? new Date(value).toISOString() : undefined;

const BLANK = {
  code: "", kind: "discount" as PromoKind, discountPercent: "20",
  marketerName: "", usageLimit: "", startsAt: "", endsAt: "", internalNote: "",
};

function Composer({ onCreated, onError }: { onCreated: () => void; onError: (message: string) => void }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof BLANK, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setBusy(true);
    try {
      await createPromoCode({
        code: form.code,
        kind: form.kind,
        discountPercent: Number(form.discountPercent || 0),
        marketerName: form.kind === "marketer" ? form.marketerName : null,
        // An empty box means «بلا حد» — the absence is the answer, so it is
        // sent as one rather than as a zero the server would have to reject.
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        startsAt: toInstant(form.startsAt) ?? null,
        endsAt: toInstant(form.endsAt) ?? null,
        internalNote: form.internalNote || null,
      });
      setForm(BLANK);
      onCreated();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "تعذر إنشاء الكود");
    } finally { setBusy(false); }
  }

  return <div className="specialist-plan-composer">
    <div className="specialist-plan-composer-row">
      <label><span>الكود</span>
        {/* Upper-cased as it is typed so that what is on screen is what will be
            stored — the database normalises anyway, and a field that silently
            changes its value on save is a field nobody trusts. */}
        <input dir="ltr" value={form.code} placeholder="SARA20"
          onChange={(event) => set("code", event.target.value.toUpperCase())} /></label>

      <label><span>النوع</span>
        <span className="segmented" role="group">
          {(["discount", "marketer"] as PromoKind[]).map((kind) => <button
            key={kind} type="button" aria-pressed={form.kind === kind}
            className={form.kind === kind ? "is-active" : ""}
            onClick={() => set("kind", kind)}
          >{KIND_LABEL[kind]}</button>)}
        </span></label>

      <label><span>الخصم</span>
        <span className="suffixed-field">
          <input type="number" min={0} max={100} step={1} dir="ltr" value={form.discountPercent}
            onChange={(event) => set("discountPercent", event.target.value)} />
          <em>%</em>
        </span></label>

      <label><span>حد الاستخدام (فارغ = بلا حد)</span>
        <input type="number" min={1} step={1} dir="ltr" value={form.usageLimit} placeholder="100"
          onChange={(event) => set("usageLimit", event.target.value)} /></label>
    </div>

    <div className="specialist-plan-composer-row">
      <label><span>يبدأ من (اختياري)</span>
        <input type="datetime-local" value={form.startsAt}
          onChange={(event) => set("startsAt", event.target.value)} /></label>
      <label><span>ينتهي في (اختياري)</span>
        <input type="datetime-local" value={form.endsAt}
          onChange={(event) => set("endsAt", event.target.value)} /></label>
      <label><span>ملاحظة داخلية (اختياري)</span>
        <input value={form.internalNote} placeholder="حملة تويتر مثلاً"
          onChange={(event) => set("internalNote", event.target.value)} /></label>
    </div>

    {/* Only asked for where it means something. A marketer code without a name
        is refused by a database constraint, not merely by this form. */}
    {form.kind === "marketer" && <div className="specialist-plan-composer-row">
      <label><span>اسم المسوّق</span>
        <input value={form.marketerName} placeholder="سارة العتيبي"
          onChange={(event) => set("marketerName", event.target.value)} /></label>
      <p className="application-hint">
        كود المسوّق يُنسب إليه كل ما يأتي عبر رابطه. اجعل نسبة الخصم صفراً إن كان الرابط للتتبع فقط دون خصم للعميل.
      </p>
    </div>}

    <button className="button" type="button" disabled={busy || !form.code} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} إنشاء الكود
    </button>
  </div>;
}

/** Inline editing for one existing code. The code itself is not editable — see the migration. */
function Editor({ promo, onSaved, onError }: {
  promo: PromoCode; onSaved: () => void; onError: (message: string) => void;
}) {
  const [discount, setDiscount] = useState(String(promo.discountPercent));
  const [limit, setLimit] = useState(promo.usageLimit === null ? "" : String(promo.usageLimit));
  const [note, setNote] = useState(promo.internalNote ?? "");
  const [endsAt, setEndsAt] = useState(promo.endsAt ? promo.endsAt.slice(0, 16) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const clear: Array<"usage_limit" | "ends_at" | "internal_note"> = [];
      if (!limit) clear.push("usage_limit");
      if (!endsAt) clear.push("ends_at");
      if (!note) clear.push("internal_note");

      await updatePromoCode(promo.id, {
        discountPercent: Number(discount || 0),
        usageLimit: limit ? Number(limit) : undefined,
        endsAt: toInstant(endsAt),
        internalNote: note || undefined,
        clear,
      });
      onSaved();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "تعذر حفظ التعديل");
    } finally { setBusy(false); }
  }

  return <div className="specialist-plan-composer">
    <div className="specialist-plan-composer-row">
      <label><span>الخصم %</span>
        <input type="number" min={0} max={100} dir="ltr" value={discount}
          onChange={(event) => setDiscount(event.target.value)} /></label>
      <label><span>حد الاستخدام</span>
        <input type="number" min={promo.uses || 1} dir="ltr" value={limit} placeholder="بلا حد"
          onChange={(event) => setLimit(event.target.value)} /></label>
      <label><span>ينتهي في</span>
        <input type="datetime-local" value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)} /></label>
    </div>
    <label><span>ملاحظة داخلية</span>
      <input value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <p className="application-hint">
      لا يمكن تغيير نص الكود بعد إنشائه — الروابط الموزّعة تشير إليه، والاستخدامات السابقة مسجّلة باسمه. أوقفه وأنشئ غيره.
    </p>
    <button className="button button-small" type="button" disabled={busy} onClick={() => void save()}>
      {busy ? <LoaderCircle className="spin" /> : <Save />} حفظ
    </button>
  </div>;
}

/** Who used a code. Loaded only when the row is opened — most never are. */
function Redemptions({ promoId, onError }: { promoId: string; onError: (message: string) => void }) {
  const [rows, setRows] = useState<PromoRedemption[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (rows || busy) return;
    setBusy(true);
    try { setRows(await loadPromoRedemptions(promoId)); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "تعذر تحميل الاستخدامات"); }
    finally { setBusy(false); }
  }

  return <details onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary className="link-button"><Users /> الاستخدامات</summary>
    {busy && <SkeletonLine width="100%" height={18} />}
    {rows && (rows.length === 0
      ? <p className="application-hint">لم يُستخدم هذا الكود بعد.</p>
      : <table className="data-table"><thead><tr>
          <th>المشترك</th><th>الطلب</th><th>قبل الخصم</th><th>الخصم</th><th>المحصّل</th><th>التاريخ</th>
        </tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}>
            <td>{row.userName}</td>
            <td dir="ltr">{row.orderNumber ?? "—"}</td>
            <td>{formatCurrency(row.grossAmount)}</td>
            <td>−{formatCurrency(row.discountAmount)}</td>
            <td>{formatCurrency(row.netAmount)}</td>
            <td>{formatDate(row.redeemedAt)}</td>
          </tr>)}
        </tbody></table>)}
  </details>;
}

/** Copy the promotion link, and say so — a copy button with no feedback is a button nobody believes. */
function CopyLink({ code, onError }: { code: string; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const url = promotionUrl(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context, and on an
      // insecure origin there is no fallback worth pretending about.
      onError("تعذر نسخ الرابط. انسخه يدوياً من الحقل.");
    }
  }

  return <span className="promo-link">
    <input dir="ltr" readOnly value={url} onFocus={(event) => event.target.select()} aria-label={`رابط الكود ${code}`} />
    <button type="button" className="button button-small button-secondary" onClick={() => void copy()}>
      {copied ? <><Check /> نُسخ</> : <><Copy /> نسخ الرابط</>}
    </button>
  </span>;
}

export default function AdminPromotions() {
  const { data, loading, error: loadError, reload } = useAsync(loadPromoCodes, []);
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<PromoStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");

  const codes = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const tally: Record<string, number> = { all: codes.length };
    for (const promo of codes) tally[promo.status] = (tally[promo.status] ?? 0) + 1;
    return tally;
  }, [codes]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return codes.filter((promo) => {
      if (filter !== "all" && promo.status !== filter) return false;
      if (!needle) return true;
      // The three things anyone actually remembers about a code: what it was
      // called, who it was for, and why it was made.
      return [promo.code, promo.marketerName, promo.internalNote]
        .some((field) => field?.toLowerCase().includes(needle));
    });
  }, [codes, filter, query]);

  async function togglePause(promo: PromoCode) {
    setBusyId(promo.id);
    setActionError("");
    try {
      await updatePromoCode(promo.id, { isPaused: !promo.isPaused });
      await reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "تعذر تغيير حالة الكود");
    } finally { setBusyId(""); }
  }

  const error = actionError || loadError;

  return <section className="specialist-panel">
    <h3 className="trainer-section-title">أكواد الخصم والمسوّقين</h3>
    <p className="application-hint">
      كل كود يحمل رابطاً خاصاً به. الزيارات تُحتسب من الرابط، والمبيعات تُحتسب بعد اكتمال الدفع فقط — لا تُحسب محاولة دفع لم تكتمل.
    </p>

    {error && <div className="form-error" role="alert">{error}</div>}

    <details className="specialist-new-plan" open={codes.length === 0}>
      <summary><Plus /> إنشاء كود جديد</summary>
      <Composer onCreated={() => void reload()} onError={setActionError} />
    </details>

    <div className="promo-toolbar">
      <label className="promo-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث بالكود أو اسم المسوّق أو الملاحظة" aria-label="بحث في الأكواد" />
      </label>
      <div className="promo-filters" role="tablist">
        {FILTERS.map(([key, label]) => <button
          key={key} role="tab" aria-selected={filter === key}
          className={`chip${filter === key ? " selected" : ""}`}
          onClick={() => setFilter(key)}
        >{label}{counts[key] ? ` (${counts[key]})` : ""}</button>)}
      </div>
    </div>

    {loading && <div className="admin-list"><SkeletonLine width="100%" height={64} /><SkeletonLine width="100%" height={64} /></div>}

    {!loading && shown.length === 0 && <div className="catalog-message">
      <BadgePercent />
      <strong>{codes.length === 0 ? "لا توجد أكواد بعد." : "لا يوجد كود يطابق البحث."}</strong>
      <p>{codes.length === 0 ? "أنشئ كوداً من الأعلى، وستظهر إحصاءاته هنا فور استخدامه." : "جرّب كلمة أخرى أو أعد الفلتر إلى «الكل»."}</p>
    </div>}

    <div className="admin-list">
      {shown.map((promo) => <article key={promo.id} className={`admin-row promo-row status-${promo.status}`}>
        <div className="admin-row-main">
          <div>
            <strong className="promo-code" dir="ltr">{promo.code}</strong>
            <small>
              {KIND_LABEL[promo.kind]}
              {promo.marketerName ? ` · ${promo.marketerName}` : ""}
              {promo.discountPercent > 0 ? ` · خصم ${promo.discountPercent}%` : " · بلا خصم — تتبع فقط"}
            </small>
            {promo.internalNote && <small className="admin-quote">{promo.internalNote}</small>}
            <small>
              {promo.startsAt ? `من ${formatDate(promo.startsAt)}` : "بلا تاريخ بدء"}
              {" · "}
              {promo.endsAt ? `حتى ${formatDate(promo.endsAt)}` : "بلا تاريخ انتهاء"}
            </small>
          </div>
          <em className={`promo-status is-${promo.status}`}>{PROMO_STATUS_LABEL[promo.status]}</em>
        </div>

        {/* The four figures that say whether the campaign is working, in the
            order the question is asked: did anyone arrive, did anyone buy, what
            did it cost us, what did it bring in. */}
        <dl className="promo-stats">
          <div><dt>الزيارات</dt><dd>{promo.visits}</dd></div>
          <div><dt>المبيعات</dt><dd>{promo.uses}{promo.usageLimit ? ` / ${promo.usageLimit}` : ""}</dd></div>
          <div><dt>قيمة الخصم</dt><dd>{formatCurrency(promo.discountTotal)}</dd></div>
          <div><dt>المحصّل</dt><dd>{formatCurrency(promo.netTotal)}</dd></div>
        </dl>

        <CopyLink code={promo.code} onError={setActionError} />

        <div className="admin-row-actions">
          <button className="button button-small button-secondary" disabled={busyId === promo.id}
            onClick={() => void togglePause(promo)}>
            {busyId === promo.id ? <LoaderCircle className="spin" /> : promo.isPaused ? <Play /> : <Pause />}
            {promo.isPaused ? "تشغيل" : "إيقاف"}
          </button>
          <details><summary className="link-button">تعديل</summary>
            <Editor promo={promo} onSaved={() => void reload()} onError={setActionError} />
          </details>
          <Redemptions promoId={promo.id} onError={setActionError} />
        </div>
      </article>)}
    </div>

    <button className="button button-secondary" onClick={() => void reload()}>
      <RefreshCcw /> تحديث الإحصاءات
    </button>
    <p className="application-hint">
      <Link2 /> الرابط يعمل على أي صفحة: أضف <code dir="ltr">?ref=الكود</code> إلى عنوان صفحة الدورة أو الخدمة التي تروّج لها.
    </p>
  </section>;
}
