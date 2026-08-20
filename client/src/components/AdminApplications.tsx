import { BadgeCheck, CheckCircle2, FileText, LoaderCircle, UserRound, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { reviewApplication } from "../lib/admin";
import { attachmentLabel } from "./FileField";
import { credentialUrl, type ProviderApplication } from "../lib/provider";
import type { AdminTabActions } from "./AdminShared";

/**
 * The applicant's portrait, next to their application.
 *
 * The bucket is private, so this resolves a short-lived signed URL the same way
 * the credential attachments do. A reviewer should see who they are approving —
 * the picture goes on the front page the moment the role is granted.
 */
function ApplicantPortrait({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    credentialUrl(path).then((signed) => { if (alive) setUrl(signed); }).catch(() => undefined);
    return () => { alive = false; };
  }, [path]);

  return <span className="applicant-portrait">
    {url ? <img src={url} alt="" /> : <UserRound aria-hidden="true" />}
  </span>;
}

/** Provider (specialist/trainer) applications, pending review or already decided. */
export default function AdminApplications({ applications, note, setNote, busy, run, onError }: AdminTabActions & {
  applications: ProviderApplication[];
  note: Record<string, string>;
  setNote: (next: Record<string, string>) => void;
}) {
  return <section className="specialist-panel">
    {applications.length ? <div className="admin-list">
      {applications.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          {item.photoPath && <ApplicantPortrait path={item.photoPath} />}
          <div>
            <strong>{item.displayName}</strong>
            <small>{item.kind === "specialist" ? "أخصائي" : "مدرب"} · {item.title}</small>
            <small>{item.yearsExperience} سنة خبرة{item.licenseNumber ? ` · ترخيص ${item.licenseNumber}` : ""}</small>
            {item.specialties.length > 0 && <small>التخصصات: {item.specialties.join("، ")}</small>}
            {item.bio && <small className="admin-quote">{item.bio}</small>}
            {item.credentialsNote && <small className="admin-quote">المؤهلات: {item.credentialsNote}</small>}
            {(item.contactEmail || item.contactPhone) && <small dir="ltr">{[item.contactEmail, item.contactPhone].filter(Boolean).join(" · ")}</small>}
          </div>
          <em>{item.status === "pending" ? "قيد المراجعة" : item.status === "approved" ? "مقبول" : item.status === "rejected" ? "مرفوض" : "مسحوب"}</em>
        </div>
        {/* Approving means looking at the evidence, so the files are openable
            rather than merely counted. The bucket is private; these are
            short-lived signed links. */}
        {item.credentialFiles.length > 0 && <ul className="file-list">
          {item.credentialFiles.map((path, index) => <li key={path}>
            <FileText />
            <span><b dir="auto">{attachmentLabel(path, index)}</b></span>
            <button type="button" className="button button-small button-secondary"
              onClick={() => void credentialUrl(path).then((url) => window.open(url, "_blank", "noopener")).catch(() => onError("تعذر فتح المرفق."))}>
              فتح
            </button>
          </li>)}
        </ul>}
        {item.status === "pending" && <div className="admin-row-actions">
          <input placeholder="ملاحظة للمتقدم (اختيارية)" value={note[item.id] ?? ""} onChange={(event) => setNote({ ...note, [item.id]: event.target.value })} />
          <button className="button button-small" disabled={busy === item.id} onClick={() => void run(item.id, () => reviewApplication(item.id, true, note[item.id] ?? ""))}>
            {busy === item.id ? <LoaderCircle className="spin" /> : <CheckCircle2 />} اعتماد
          </button>
          <button className="button button-small button-ghost" disabled={busy === item.id} onClick={() => void run(item.id, () => reviewApplication(item.id, false, note[item.id] ?? ""))}>
            <XCircle /> رفض
          </button>
        </div>}
        {item.reviewNote && item.status !== "pending" && <p className="application-note">ملاحظة: {item.reviewNote}</p>}
      </article>)}
    </div> : <div className="portal-empty"><BadgeCheck /><p>لا توجد طلبات انضمام.</p></div>}
  </section>;
}
