import { AlertCircle, CheckCircle2, FileText, FlaskConical, GraduationCap, LoaderCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import {
  loadMySubmissions, submitContentForReview,
  type ContentKind, type MySubmission,
} from "../lib/content";

/**
 * طلب نشر — a specialist putting work forward for the scientific team to review.
 *
 * Three kinds, as the clinic describes them: مقال, بحث, دورة. The first two are
 * written here and go straight into `in_review`. A course is not a form — it is
 * modules and lessons — so that one hands over to the trainer dashboard, which
 * already builds it and submits it through the same kind of gate.
 *
 * Nothing on this screen publishes anything. Administration checks the accuracy
 * of the information and whether it matches the platform's methodology, and only
 * then does it appear publicly — which is stated here rather than left implied.
 */

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  published: "منشور",
  archived: "مؤرشف",
};

const EMPTY = {
  title: "", excerpt: "", body: "", category: "", tags: "",
  sourceTitle: "", sourceAuthors: "", sourceJournal: "", sourceYear: "", sourceUrl: "",
  practicalTakeaway: "",
};

export default function ContentSubmission() {
  const [kind, setKind] = useState<ContentKind | "course">("article");
  const [form, setForm] = useState(EMPTY);
  const [mine, setMine] = useState<MySubmission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function reload() {
    try { setMine(await loadMySubmissions()); } catch { /* the list is not the point of the screen */ }
  }
  useEffect(() => { void reload(); }, []);

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value }),
  });

  const missing = kind === "course" ? [] : [
    form.title.trim().length < 6 && "العنوان",
    form.body.trim().length < 40 && "النص",
  ].filter(Boolean) as string[];

  async function submit() {
    if (kind === "course") return;
    setBusy(true);
    setError("");
    try {
      await submitContentForReview({
        kind,
        title: form.title,
        excerpt: form.excerpt,
        body: form.body,
        category: form.category,
        tags: form.tags.split(/[،,\n]/).map((t) => t.trim()).filter(Boolean),
        sourceTitle: form.sourceTitle,
        sourceAuthors: form.sourceAuthors,
        sourceJournal: form.sourceJournal,
        sourceYear: form.sourceYear ? Number(form.sourceYear) : null,
        sourceUrl: form.sourceUrl,
        practicalTakeaway: form.practicalTakeaway,
      });
      setDone(true);
      setForm(EMPTY);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  return <section className="specialist-panel">
    <h3 className="trainer-section-title">طلب نشر محتوى</h3>
    <p className="application-hint">
      يراجع الفريق العلمي دقة المعلومة ومدى توافقها مع منهجية المنصة قبل ظهورها للعامة.
    </p>

    <div className="kind-picker" role="group" aria-label="نوع المحتوى">
      {([
        ["article", "مقال", <FileText key="a" />, "شرح مبسط لمفهوم أو حالة، بلغة يفهمها المصاب والممارس."],
        ["research", "بحث", <FlaskConical key="r" />, "قراءة نقدية لبحث منشور، وما يعنيه عملياً في العيادة."],
        ["course", "دورة", <GraduationCap key="c" />, "وحدات ودروس — تُبنى من لوحة المدرب ثم تُرسل للمراجعة."],
      ] as const).map(([value, label, icon, note]) => <button
        key={value} type="button"
        className={kind === value ? "selected" : ""}
        aria-pressed={kind === value}
        onClick={() => { setKind(value); setDone(false); }}
      >
        {icon}
        <span><strong>{label}</strong><small>{note}</small></span>
      </button>)}
    </div>

    {kind === "course" && <div className="catalog-message">
      <strong>الدورة تُبنى من لوحة المدرب.</strong>
      <p>أنشئ الدورة، أضف وحداتها ودروسها، ثم أرسلها للمراجعة من هناك.</p>
      <Link className="button" to="/trainer">فتح لوحة المدرب</Link>
    </div>}

    {done && kind !== "course" && <div className="form-result">
      <CheckCircle2 /><span><strong>تم استلام طلبك.</strong><p>سنعلمك بالنتيجة كإشعار في حسابك.</p></span>
    </div>}

    {kind !== "course" && <div className="application-form">
      <div className="form-grid">
        <label className="wide"><span>العنوان <b className="req">*</b></span>
          <input placeholder={kind === "article" ? "مثال: الألم لا يعني دائماً وجود ضرر" : "مثال: التمارين العلاجية في خشونة الركبة"} {...field("title")} /></label>

        <label className="wide"><span>مقدمة مختصرة</span>
          <textarea rows={2} placeholder="سطران يوضحان لماذا يهم هذا الموضوع." {...field("excerpt")} /></label>

        <label className="wide"><span>النص <b className="req">*</b></span>
          <textarea rows={10} placeholder="اكتب المحتوى كاملاً هنا. لعنوان فرعي ابدأ السطر بـ ## ، ولقائمة نقطية ابدأ كل سطر بـ - ، وافصل بين الفقرات بسطر فارغ." {...field("body")} /></label>

        {kind === "article" && <label><span>التصنيف</span>
          <input placeholder="فهم الألم، إرشادات…" {...field("category")} /></label>}

        <label><span>الوسوم (افصل بفاصلة)</span>
          <input placeholder="الركبة، إعادة التأهيل" {...field("tags")} /></label>

        {kind === "research" && <>
          <label className="wide"><span>عنوان البحث الأصلي</span>
            <input dir="auto" placeholder="كما نُشر" {...field("sourceTitle")} /></label>
          <label><span>الباحثون</span><input dir="auto" {...field("sourceAuthors")} /></label>
          <label><span>المجلة</span><input dir="auto" {...field("sourceJournal")} /></label>
          <label><span>سنة النشر</span><input type="number" min={1900} max={2100} dir="ltr" {...field("sourceYear")} /></label>
          <label><span>رابط البحث</span><input type="url" dir="ltr" placeholder="https://" {...field("sourceUrl")} /></label>
          <label className="wide"><span>الخلاصة العملية</span>
            <textarea rows={2} placeholder="ما الذي يغيّره هذا البحث في الممارسة؟" {...field("practicalTakeaway")} /></label>
        </>}
      </div>

      {missing.length > 0 && <p className="booking-missing"><AlertCircle /> يتبقى: {missing.join(" · ")}</p>}
      {error && <div className="form-error" role="alert">{error}</div>}

      <button className="button" type="button" disabled={busy || missing.length > 0} onClick={() => void submit()}>
        {busy ? <LoaderCircle className="spin" /> : <Send />} إرسال للمراجعة
      </button>
      <p className="application-hint">لا يُنشر المحتوى إلا بعد اعتماد الإدارة. تُسجَّل كل موافقة باسم معتمِدها.</p>
    </div>}

    {mine.length > 0 && <>
      <h3 className="trainer-section-title">طلباتك</h3>
      <div className="admin-list">
        {mine.map((item) => <article key={`${item.kind}-${item.id}`} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{item.title}</strong>
              <small>{item.kind === "article" ? "مقال" : "بحث"} · قُدّم في {formatDate(item.createdAt)}</small>
            </div>
            <em>{STATUS_LABEL[item.status] ?? item.status}</em>
          </div>
        </article>)}
      </div>
    </>}
  </section>;
}
