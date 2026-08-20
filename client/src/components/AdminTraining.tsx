import { FileText, GraduationCap } from "lucide-react";
import { formatDateTime } from "../lib/format";
import { cvDownloadUrl, setTrainingStatus, type TrainingApplication } from "../lib/training";
import type { AdminTabActions } from "./AdminShared";

/** The register of student trainees the clinics draw from. */
const TRAINING_STATUS: Record<string, string> = {
  new: "جديد", reviewing: "قيد المراجعة", shortlisted: "مرشح",
  placed: "تم إلحاقه بعيادة", declined: "معتذر عنه", archived: "مؤرشف",
};

export default function AdminTraining({ training, note, setNote, busy, run, onError }: AdminTabActions & {
  training: TrainingApplication[];
  note: Record<string, string>;
  setNote: (next: Record<string, string>) => void;
}) {
  return <section className="specialist-panel">
    <p className="application-hint">
      <GraduationCap /> قائمة الطلاب المسجلين للتدريب الإكلينيكي. تُحفظ حتى تحتاج إحدى العيادات متدربين، فتُراجع وتُرشّح منها.
    </p>
    {training.length ? <div className="admin-list">
      {training.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          <div>
            <strong>{item.fullName}</strong>
            <small>{item.specialty} · {item.university}{item.college ? ` — ${item.college}` : ""}</small>
            <small dir="ltr">{item.phone}{item.email ? ` · ${item.email}` : ""}</small>
            <small>
              {item.academicLevel ?? "المستوى غير محدد"}
              {item.studentNumber ? ` · الرقم الجامعي: ${item.studentNumber}` : ""}
              {item.availableFrom ? ` · متاح من ${item.availableFrom}` : ""}
              {item.availableTo ? ` إلى ${item.availableTo}` : ""}
              {item.requiredHours ? ` · ${item.requiredHours}` : ""}
            </small>
            {item.note && <small className="admin-quote">{item.note}</small>}
            <small>{formatDateTime(item.createdAt)}</small>
          </div>
          <em>{TRAINING_STATUS[item.status] ?? item.status}</em>
        </div>
        {item.reviewNote && <p className="application-note">ملاحظة: {item.reviewNote}</p>}
        <div className="admin-row-actions">
          {item.cvPath
            ? <button className="button button-small button-secondary" type="button"
                onClick={() => void cvDownloadUrl(item.cvPath!).then((url) => window.open(url, "_blank", "noopener")).catch(() => onError("تعذر فتح السيرة الذاتية."))}>
                <FileText /> السيرة الذاتية
              </button>
            : <small className="application-hint">لم تُرفق سيرة ذاتية.</small>}
        </div>
        <input placeholder="ملاحظة داخلية (اختيارية)" value={note[item.id] ?? ""}
          onChange={(e) => setNote({ ...note, [item.id]: e.target.value })} />
        <div className="admin-row-actions role-picker">
          {Object.entries(TRAINING_STATUS).map(([value, label]) => <button
            key={value} type="button" className={item.status === value ? "chip selected" : "chip"} disabled={busy === item.id}
            onClick={() => void run(item.id, () => setTrainingStatus(item.id, value, note[item.id] ?? ""))}
          >{label}</button>)}
        </div>
      </article>)}
    </div> : <div className="portal-empty"><GraduationCap /><p>لا توجد طلبات تدريب بعد.</p></div>}
  </section>;
}
