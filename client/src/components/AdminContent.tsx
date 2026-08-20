import { FileText } from "lucide-react";
import { setContentStatus, type AdminContentItem } from "../lib/admin";
import { CoverField, type AdminTabActions } from "./AdminShared";

const CONTENT_LABEL: Record<string, string> = {
  articles: "مقال", research_reviews: "مراجعة بحثية", rehab_programs: "برنامج علاجي",
};
const CONTENT_STATUS: Record<string, string> = {
  draft: "مسودة", in_review: "قيد المراجعة", published: "منشور", archived: "مؤرشف",
};

/** Publication review for articles, research reviews and rehab programs. */
export default function AdminContent({ content, busy, run, onError, reload }: AdminTabActions & {
  content: AdminContentItem[];
  reload: () => Promise<void>;
}) {
  return <section className="specialist-panel">
    {content.length ? <div className="admin-list">
      {content.map((item) => <article key={`${item.table}-${item.id}`} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          <CoverField table={item.table} id={item.id} coverUrl={item.coverUrl}
            onDone={() => void reload()} onError={onError} />
          <div>
            <strong>{item.title}</strong>
            <small>{CONTENT_LABEL[item.table]}</small>
            <small dir="ltr">/{item.table === "articles" ? "articles" : item.table === "research_reviews" ? "research" : "programs"}/{item.slug}</small>
          </div>
          <em>{CONTENT_STATUS[item.status] ?? item.status}</em>
        </div>
        <div className="admin-row-actions role-picker">
          {Object.entries(CONTENT_STATUS).map(([value, label]) => <button key={value} type="button"
            className={item.status === value ? "chip selected" : "chip"} disabled={busy === item.id}
            onClick={() => void run(item.id, () => setContentStatus(item.table, item.id, value))}
          >{label}</button>)}
        </div>
      </article>)}
    </div> : <div className="portal-empty"><FileText /><p>لا يوجد محتوى بعد.</p></div>}
  </section>;
}
