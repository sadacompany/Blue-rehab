import { CreditCard } from "lucide-react";
import { formatCurrency, formatDateTime } from "../lib/format";
import type { AdminPayment } from "../lib/admin";

const PAYMENT_STATUS: Record<string, string> = {
  pending: "معلق", processing: "قيد التنفيذ", succeeded: "مدفوع",
  failed: "فشل", cancelled: "ملغي", refunded: "مسترد", partially_refunded: "مسترد جزئياً",
};

/** The payment ledger — read-only here, same as it always was. */
export default function AdminPayments({ payments }: { payments: AdminPayment[] }) {
  return <section className="specialist-panel">
    {payments.length ? <div className="admin-list">
      {payments.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          <div>
            <strong>{formatCurrency(item.amount)} · {item.kind === "booking" ? "جلسة" : "دورة"}</strong>
            <small>{item.userName}</small>
            <small dir="ltr">{item.orderNumber}</small>
            <small>{item.paidAt ? `دُفع في ${formatDateTime(item.paidAt)}` : `أُنشئ في ${formatDateTime(item.createdAt)}`}</small>
            {item.failureReason && <small className="admin-quote">سبب الفشل: {item.failureReason}</small>}
          </div>
          <em>{PAYMENT_STATUS[item.status] ?? item.status}</em>
        </div>
      </article>)}
    </div> : <div className="portal-empty"><CreditCard /><p>لا توجد مدفوعات.</p></div>}
  </section>;
}
