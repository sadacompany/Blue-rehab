import { AlertCircle, CheckCircle2, FileText, GraduationCap, LoaderCircle, Paperclip, Send, Stethoscope } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import {
  submitTrainingApplication, uploadTrainingCv, type TrainingApplicationInput,
} from "../lib/training";

/**
 * التدريب الصيفي الإكلينيكي.
 *
 * A register, not a queue. Students apply whenever they like and the clinics
 * draw from the list when they need trainees, so the page promises a record and
 * a call back rather than a decision by a date nobody has committed to.
 *
 * No account is required: a student has no other reason to hold one, and asking
 * them to verify a phone number before they can even express interest would cost
 * more applications than it saves.
 */

const EMPTY: TrainingApplicationInput = {
  fullName: "", phone: "", email: "", university: "", college: "", specialty: "",
  academicLevel: "", studentNumber: "", availableFrom: "", availableTo: "",
  requiredHours: "", note: "",
};

const LEVELS = ["السنة الثانية", "السنة الثالثة", "السنة الرابعة", "السنة الخامسة", "سنة الامتياز", "خريج"];

export default function TrainingPage() {
  const [form, setForm] = useState<TrainingApplicationInput>(EMPTY);
  const [cv, setCv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ reference: string; cvAttached: boolean } | null>(null);

  const set = (key: keyof TrainingApplicationInput) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [key]: event.target.value }),
  });

  const missing = [
    !form.fullName.trim() && "الاسم الكامل",
    !/^0?5\d{8}$/.test(form.phone.replace(/\s/g, "")) && "رقم جوال سعودي صحيح",
    !form.university.trim() && "الجامعة",
    !form.specialty.trim() && "التخصص",
  ].filter(Boolean) as string[];

  async function submit() {
    if (missing.length) { setError(`يتبقى: ${missing.join(" · ")}`); return; }
    setBusy(true);
    setError("");
    try {
      const id = await submitTrainingApplication({ ...form, phone: form.phone.replace(/\s/g, "") });

      // The application is already recorded; a failed upload must not read as a
      // failed application, so it is reported separately.
      let cvAttached = false;
      if (cv) {
        try { await uploadTrainingCv(id, cv); cvAttached = true; }
        catch { cvAttached = false; }
      }
      setDone({ reference: id.slice(0, 8), cvAttached: cvAttached || !cv });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إرسال الطلب.");
    } finally { setBusy(false); }
  }

  if (done) return <PageShell>
    <section className="page-hero compact-hero"><div className="container narrow">
      <span className="eyebrow"><GraduationCap /> أكاديمية بلو</span>
      <h1>وصلنا طلبك</h1>
    </div></section>
    <section className="section"><div className="container narrow catalog-message">
      <CheckCircle2 />
      <strong>سجّلنا بياناتك في قائمة المتدربين.</strong>
      <p>الرقم المرجعي لطلبك: <b dir="ltr">{done.reference}</b> — احتفظ به عند التواصل معنا.</p>
      {!done.cvAttached && <p className="booking-missing">
        <AlertCircle /> تعذر رفع السيرة الذاتية، لكن الطلب مسجّل. أرسلها لنا عبر صفحة التواصل مع ذكر الرقم المرجعي.
      </p>}
      <p>نراجع الطلبات عند فتح مقاعد التدريب في العيادات، ونتواصل معك على الرقم الذي أدخلته.</p>
      <div className="not-found-actions">
        <Link className="button" to="/academy">أكاديمية بلو</Link>
        <Link className="button button-secondary" to="/contact">تواصل معنا</Link>
      </div>
    </div></section>
  </PageShell>;

  return <PageShell>
    <section className="page-hero compact-hero"><div className="container narrow">
      <span className="eyebrow"><GraduationCap /> أكاديمية بلو</span>
      <h1>التدريب الصيفي الإكلينيكي</h1>
      <p>برنامج للطلاب المتدربين داخل العيادات. سجّل بياناتك وسيرتك الذاتية، ونتواصل معك عند توفر مقعد يناسب تخصصك وفترتك.</p>
    </div></section>

    <section className="section"><div className="container narrow">
      <div className="branch-note">
        <Stethoscope />
        <div>
          <strong>كيف يعمل التسجيل</strong>
          <small>هذه قائمة تسجيل مسبق وليست قبولاً فورياً. تُحفظ بياناتك لدى الإدارة، وعند فتح مقاعد التدريب في إحدى العيادات نرجع إلى القائمة ونتواصل مع من يناسب احتياج العيادة.</small>
        </div>
      </div>

      <div className="form-grid application-form">
        <label><span>الاسم الكامل <b className="req">*</b></span>
          <input {...set("fullName")} placeholder="الاسم كما في الهوية" /></label>
        <label><span>رقم الجوال <b className="req">*</b></span>
          <input {...set("phone")} dir="ltr" placeholder="05xxxxxxxx" inputMode="tel" /></label>
        <label><span>البريد الإلكتروني</span>
          <input {...set("email")} type="email" dir="ltr" placeholder="name@example.com" /></label>
        <label><span>الرقم الجامعي</span>
          <input {...set("studentNumber")} dir="ltr" placeholder="اختياري" /></label>

        <label><span>الجامعة <b className="req">*</b></span>
          <input {...set("university")} placeholder="مثال: جامعة الملك سعود" /></label>
        <label><span>الكلية</span>
          <input {...set("college")} placeholder="مثال: كلية العلوم الطبية التطبيقية" /></label>

        <label><span>التخصص <b className="req">*</b></span>
          <input {...set("specialty")} placeholder="مثال: العلاج الطبيعي" /></label>
        <label><span>المستوى الدراسي</span>
          <select {...set("academicLevel")}>
            <option value="">اختر المستوى</option>
            {LEVELS.map((level) => <option key={level}>{level}</option>)}
          </select></label>

        <label><span>الفترة المتاحة — من</span>
          <input {...set("availableFrom")} type="date" /></label>
        <label><span>الفترة المتاحة — إلى</span>
          <input {...set("availableTo")} type="date" /></label>

        <label className="wide"><span>عدد الساعات أو الأسابيع المطلوبة من الجامعة</span>
          <input {...set("requiredHours")} placeholder="مثال: 240 ساعة خلال 8 أسابيع" /></label>

        <label className="wide"><span>السيرة الذاتية (PDF أو صورة)</span>
          <input type="file" accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setCv(event.target.files?.[0] ?? null)} />
          <small className="application-hint">
            <Paperclip /> {cv ? `${cv.name} — ${(cv.size / 1024 / 1024).toFixed(1)} م.ب` : "بحد أقصى 5 ميغابايت. اختياري لكنه يرفع فرصتك."}
          </small></label>

        <label className="wide"><span>نبذة قصيرة</span>
          <textarea rows={3} {...set("note")}
            placeholder="ما الذي تود التركيز عليه في التدريب؟ وهل لديك خبرة سابقة؟" /></label>
      </div>

      {missing.length > 0 && <p className="booking-missing"><AlertCircle /> يتبقى: {missing.join(" · ")}</p>}
      {error && <div className="form-error" role="alert">{error}</div>}

      <p className="application-hint">
        <FileText /> تُستخدم بياناتك لغرض التدريب فقط، وتخضع لسياسة الخصوصية.
      </p>

      <button className="button" type="button" disabled={busy || missing.length > 0} onClick={() => void submit()}>
        {busy ? <LoaderCircle className="spin" /> : <Send />} إرسال الطلب
      </button>
    </div></section>
  </PageShell>;
}
