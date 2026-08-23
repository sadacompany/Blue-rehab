import { FileText } from "lucide-react";
import { setContentStatus, type AdminContentItem } from "../lib/admin";
import { renderBody } from "../pages/SectionPages";
import { CoverField, type AdminTabActions } from "./AdminShared";

const CONTENT_LABEL: Record<string, string> = {
  articles: "مقال", research_reviews: "مراجعة بحثية", rehab_programs: "برنامج علاجي",
};
const CONTENT_STATUS: Record<string, string> = {
  draft: "مسودة", in_review: "قيد المراجعة", published: "منشور", archived: "مؤرشف",
};

/**
 * Publication review for articles, research reviews and rehab programs.
 *
 * Used to show a title, a slug and a cover thumbnail — nothing a reviewer
 * could actually read. `loadAdminSnapshot()` (lib/admin.ts) now fetches
 * `excerpt`/`body` too (aliased from `summary`/`description` for programs,
 * which have no columns literally named that), and this renders them with
 * the same `renderBody()` the public article/research pages use, so what an
 * admin approves is what a visitor will actually see — not raw, unformatted
 * text standing in for it.
 */
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

        {item.excerpt && <p className="admin-content-excerpt">{item.excerpt}</p>}

        {item.body
          ? <details className="admin-content-body">
              <summary className="link-button">قراءة المحتوى كاملاً</summary>
              <div className="article-body">{renderBody(item.body)}</div>
            </details>
          : <p className="admin-content-empty">لا يوجد نص بعد — لا يمكن مراجعته حتى يُضاف.</p>}

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
