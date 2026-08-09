import { AlertCircle, BadgeCheck, CheckCircle2, Clock3, GraduationCap, LoaderCircle, Send, Stethoscope, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FileField, { attachmentLabel } from "../components/FileField";
import PageShell from "../components/PageShell";
import { formatDateTime } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import {
  loadMyApplications,
  removeCredential,
  uploadCredential,
  loadMyRoles,
  submitApplication,
  withdrawApplication,
  type ProviderApplication,
  type ProviderKind,
} from "../lib/provider";

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "غير مقبول",
  withdrawn: "مسحوب",
};

const KIND_LABEL: Record<ProviderKind, string> = {
  specialist: "أخصائي علاج طبيعي",
  trainer: "مدرب دورات",
};

const EMPTY = {
  displayName: "",
  title: "",
  bio: "",
  specialties: "",
  languages: "العربية",
  yearsExperience: "",
  licenseNumber: "",
  credentialsNote: "",
  contactEmail: "",
  contactPhone: "",
};

/**
 * Applying to join as a specialist or a course instructor.
 *
 * The form only files a request. The role itself is granted by an administrator
 * in /admin, through a function that re-checks their privilege — so nothing a
 * user types here can promote them.
 */
export default function JoinProviderPage() {
  const [kind, setKind] = useState<ProviderKind>("specialist");
  const [form, setForm] = useState(EMPTY);
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function attach(list: File[]) {
    if (!list.length) return;
    setUploading(true);
    setError("");
    try {
      const added: string[] = [];
      for (const file of list) added.push(await uploadCredential(file));
      setFiles((current) => [...current, ...added]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر رفع الملف");
    } finally {
      setUploading(false);
    }
  }

  async function detach(path: string) {
    setFiles((current) => current.filter((item) => item !== path));
    await removeCredential(path).catch(() => undefined);
  }

  async function reload() {
    setLoading(true);
    try {
      const [apps, myRoles] = await Promise.all([loadMyApplications(), loadMyRoles()]);
      setApplications(apps);
      setRoles(myRoles);
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/join")}`;
        return;
      }
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value }),
  });

  const pending = applications.find((item) => item.status === "pending" && item.kind === kind);
  const alreadyHasRole = roles.includes(kind);

  const missing = [
    form.displayName.trim().length < 3 && "الاسم المعروض",
    form.title.trim().length < 3 && "المسمى المهني",
  ].filter(Boolean) as string[];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await submitApplication({
        kind,
        displayName: form.displayName,
        title: form.title,
        bio: form.bio,
        specialties: form.specialties.split(/[،,\n]/).map((item) => item.trim()).filter(Boolean),
        languages: form.languages.split(/[،,\n]/).map((item) => item.trim()).filter(Boolean),
        yearsExperience: Number(form.yearsExperience) || 0,
        licenseNumber: form.licenseNumber,
        credentialsNote: form.credentialsNote,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        credentialFiles: files,
      });
      setDone(true);
      setForm(EMPTY);
      setFiles([]);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    try { await withdrawApplication(id); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر سحب الطلب"); }
    finally { setBusy(false); }
  }

  return <PageShell>
    <section className="page-hero compact-hero">
      <div className="container narrow">
        <span className="eyebrow"><BadgeCheck /> الانضمام كمقدم خدمة</span>
        <h1>انضم إلى فريق بلو للتأهيل</h1>
        <p>قدّم طلبك مرة واحدة، وتراجعه الإدارة. عند القبول تُفعَّل لوحتك تلقائياً ويظهر ملفك للمستفيدين.</p>
      </div>
    </section>

    <section className="section"><div className="container narrow">
      {loading && <div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ التحميل…</p></div>}

      {!loading && <>
        {applications.length > 0 && <div className="application-list">
          <h2>طلباتك</h2>
          {applications.map((item) => <article key={item.id} className={`application-card status-${item.status}`}>
            <header>
              <div>
                <strong>{KIND_LABEL[item.kind]}</strong>
                <small>{item.title} · قُدّم في {formatDateTime(item.createdAt)}</small>
              </div>
              <em>
                {item.status === "pending" && <Clock3 />}
                {item.status === "approved" && <CheckCircle2 />}
                {item.status === "rejected" && <XCircle />}
                {STATUS_LABEL[item.status]}
              </em>
            </header>
            {item.reviewNote && <p className="application-note">ملاحظة الإدارة: {item.reviewNote}</p>}
            {item.status === "approved" && <Link className="button button-small" to={item.kind === "specialist" ? "/specialist" : "/trainer"}>
              {item.kind === "specialist" ? <Stethoscope /> : <GraduationCap />} فتح لوحتي
            </Link>}
            {item.status === "pending" && <button className="button button-small button-secondary" type="button" disabled={busy} onClick={() => void withdraw(item.id)}>سحب الطلب</button>}
          </article>)}
        </div>}

        {done && <div className="form-result"><CheckCircle2 /><span><strong>تم استلام طلبك.</strong><p>ستصلك النتيجة كإشعار في حسابك.</p></span></div>}

        {!pending && !alreadyHasRole && <div className="application-form">
          <h2>تقديم طلب جديد</h2>

          <div className="kind-picker" role="group" aria-label="نوع الطلب">
            {(["specialist", "trainer"] as ProviderKind[]).map((option) => <button
              key={option} type="button"
              className={kind === option ? "selected" : ""}
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
            >
              {option === "specialist" ? <Stethoscope /> : <GraduationCap />}
              <span><strong>{KIND_LABEL[option]}</strong>
                <small>{option === "specialist" ? "استقبال الحالات وإدارة الخطط العلاجية" : "إنشاء الدورات ومتابعة المتدربين"}</small>
              </span>
            </button>)}
          </div>

          <div className="form-grid">
            <label><span>الاسم المعروض <b className="req">*</b></span><input placeholder="كما تريد أن يظهر للمستفيدين" {...field("displayName")} /></label>
            <label><span>المسمى المهني <b className="req">*</b></span><input placeholder={kind === "specialist" ? "أخصائي علاج طبيعي — إصابات رياضية" : "مدرب معتمد في التأهيل"} {...field("title")} /></label>
            <label><span>سنوات الخبرة</span><input type="number" min={0} max={70} {...field("yearsExperience")} /></label>
            <label><span>رقم الترخيص الصحي</span><input placeholder="اختياري — يسرّع المراجعة" dir="ltr" {...field("licenseNumber")} /></label>
            <label><span>التخصصات (افصل بفاصلة)</span><input placeholder="تأهيل الركبة، إصابات رياضية" {...field("specialties")} /></label>
            <label><span>اللغات (افصل بفاصلة)</span><input {...field("languages")} /></label>
            <label><span>بريد للتواصل</span><input type="email" dir="ltr" {...field("contactEmail")} /></label>
            <label><span>جوال للتواصل</span><input dir="ltr" placeholder="05xxxxxxxx" {...field("contactPhone")} /></label>
            <label className="wide"><span>نبذة تعريفية</span><textarea rows={3} placeholder="خبرتك ومجالات تركيزك." {...field("bio")} /></label>
            <label className="wide"><span>المؤهلات والشهادات</span><textarea rows={3} placeholder="اذكر شهاداتك وجهات الإصدار." {...field("credentialsNote")} /></label>
            <div className="wide">
              <FileField
                label="إرفاق ما يثبت المؤهلات"
                hint="PDF أو صورة، حتى ١٠ ميغابايت لكل ملف. تُحفظ بشكل خاص ولا يراها إلا الإدارة."
                accept="application/pdf,image/*"
                multiple
                busy={uploading}
                onSelect={(picked) => void attach(picked)}
                attached={files.map((path, index) => ({ id: path, name: attachmentLabel(path, index) }))}
                onRemove={(path) => void detach(path)}
              />
            </div>
          </div>

          {missing.length > 0 && <p className="booking-missing"><AlertCircle /> يتبقى: {missing.join(" · ")}</p>}
          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="button" type="button" disabled={busy || missing.length > 0} onClick={() => void submit()}>
            {busy ? <LoaderCircle className="spin" /> : <Send />} إرسال الطلب للمراجعة
          </button>
          <p className="application-hint">لن تُمنح الصلاحية إلا بعد اعتماد الإدارة. تُسجَّل كل موافقة باسم معتمِدها.</p>
        </div>}

        {alreadyHasRole && <div className="catalog-message">
          <strong>حسابك مفعّل بالفعل كـ{KIND_LABEL[kind]}.</strong>
          <Link className="button" to={kind === "specialist" ? "/specialist" : "/trainer"}>فتح لوحتي</Link>
        </div>}
      </>}
    </div></section>
  </PageShell>;
}
