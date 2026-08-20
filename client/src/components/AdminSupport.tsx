import { LifeBuoy } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { setSupportStatus, type AdminSupportRequest } from "../lib/admin";
import type { AdminTabActions } from "./AdminShared";

const SUPPORT_STATUS: Record<string, string> = {
  new: "جديد", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلق",
};

/** Support tickets submitted from the contact form. */
export default function AdminSupport({ support, busy, run }: AdminTabActions & { support: AdminSupportRequest[] }) {
  return <section className="specialist-panel">
    {support.length ? <div className="admin-list">
      {support.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          <div>
            <strong>{item.subject}</strong>
            <small>{item.name}{item.email ? ` · ${item.email}` : ""}{item.phone ? ` · ${item.phone}` : ""}</small>
            <small className="admin-quote">{item.message}</small>
            <small>{formatDateTime(item.createdAt)}</small>
          </div>
          <em>{SUPPORT_STATUS[item.status] ?? item.status}</em>
        </div>
        <div className="admin-row-actions role-picker">
          {Object.entries(SUPPORT_STATUS).map(([value, label]) => <button
            key={value} type="button" className={item.status === value ? "chip selected" : "chip"} disabled={busy === item.id}
            onClick={() => void run(item.id, () => setSupportStatus(item.id, value))}
          >{label}</button>)}
        </div>
      </article>)}
    </div> : <div className="portal-empty"><LifeBuoy /><p>لا توجد طلبات دعم.</p></div>}
  </section>;
}
