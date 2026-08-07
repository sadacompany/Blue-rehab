import { AlertCircle, BookOpenCheck, CheckCircle2, GraduationCap, LoaderCircle, Plus, RefreshCcw, Send, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import {
  addModule,
  createCourse,
  loadTrainerCourses,
  setStudentProgress,
  submitCourseForReview,
  type TrainerCourse,
} from "../lib/trainer";
import PageShell from "./PageShell";
import { SkeletonGrid, SkeletonLine } from "./Skeleton";

const REVIEW_LABEL: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  published: "معتمدة ومنشورة",
  archived: "موقوفة",
};

const ENROL_STATUS: Record<string, string> = {
  pending_payment: "بانتظار الدفع",
  active: "نشط",
  completed: "مكتمل",
  cancelled: "ملغي",
};

function ModuleComposer({ course, onAdded }: { course: TrainerCourse; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!title.trim()) { setError("عنوان الوحدة مطلوب"); return; }
    setBusy(true);
    setError("");
    try {
      // `course_modules` has a unique (course_id, position); continue the sequence.
      const next = course.modules.reduce((max, item) => Math.max(max, item.position), 0) + 1;
      await addModule(course.id, title, summary, next);
      setTitle(""); setSummary("");
      onAdded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إضافة الوحدة");
    } finally { setBusy(false); }
  }

  return <div className="specialist-exercise-composer">
    <input placeholder="عنوان الوحدة" value={title} onChange={(event) => setTitle(event.target.value)} />
    <textarea rows={2} placeholder="وصف مختصر لما تغطيه الوحدة" value={summary} onChange={(event) => setSummary(event.target.value)} />
    {error && <p className="specialist-error">{error}</p>}
    <button className="button button-small" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} إضافة وحدة
    </button>
  </div>;
}

/** Instructors could not create a course at all — only manage assigned ones. */
function CourseComposer({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", summary: "", price: "", durationHours: "6", mode: "onsite", level: "متوسط" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (form.title.trim().length < 3) { setError("عنوان الدورة مطلوب"); return; }
    setBusy(true); setError("");
    try {
      await createCourse({
        title: form.title, summary: form.summary,
        price: Number(form.price) || 0, durationHours: Number(form.durationHours) || 1,
        mode: form.mode, level: form.level,
      });
      setForm({ title: "", summary: "", price: "", durationHours: "6", mode: "onsite", level: "متوسط" });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إنشاء الدورة");
    } finally { setBusy(false); }
  }

  return <div className="specialist-plan-composer">
    <label><span>عنوان الدورة <b className="req">*</b></span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: التأهيل المتقدم للكتف" /></label>
    <label><span>وصف مختصر</span><textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
    <div className="specialist-plan-composer-row">
      <label><span>السعر (ر.س)</span><input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
      <label><span>عدد الساعات</span><input type="number" min={1} value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} /></label>
    </div>
    <div className="specialist-plan-composer-row">
      <label><span>طريقة التقديم</span>
        <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
          <option value="onsite">حضوري</option>
          <option value="recorded">مسجل</option>
          <option value="hybrid">هجين</option>
          <option value="remote">عن بُعد</option>
        </select>
      </label>
      <label><span>المستوى</span>
        <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
          <option>مبتدئ</option><option>متوسط</option><option>متقدم</option>
        </select>
      </label>
    </div>
    {error && <p className="specialist-error">{error}</p>}
    <p className="application-hint">تُنشأ الدورة كمسودة، ولا تظهر للطلاب حتى تنشرها.</p>
    <button className="button" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} إنشاء الدورة
    </button>
  </div>;
}

export default function TrainerDashboard() {
  const [courses, setCourses] = useState<TrainerCourse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCourses(await loadTrainerCourses());
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/trainer")}`;
        return;
      }
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الدورات");
    } finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, []);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try { await action(); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  if (loading) return <PageShell><section className="specialist-page"><div className="container" aria-busy="true">
    <div className="skeleton-head"><SkeletonLine width="110px" height={13} /><SkeletonLine width="230px" height={34} /></div>
    <SkeletonGrid count={2} lines={4} />
  </div></section></PageShell>;

  return <PageShell><section className="specialist-page"><div className="container">
    <header className="specialist-head">
      <div>
        <span className="eyebrow"><GraduationCap /> لوحة المدرب</span>
        <h1>دوراتي التدريبية</h1>
        <p>جهّز محتوى دورتك وقدّمها للاعتماد، وتابع متدربيك بعد النشر.</p>
      </div>
      <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> تحديث</button>
    </header>

    {error && <div className="form-error" role="alert">{error}</div>}

{courses && courses.length === 0 && <div className="catalog-message">
      <BookOpenCheck />
      <strong>لا توجد دورات مرتبطة بحسابك بعد.</strong>
      <p>أنشئ دورتك الأولى أدناه، أو انتظر إسناد دورة قائمة إليك من الإدارة.</p>
    </div>}

    <details className="specialist-new-plan" open={courses?.length === 0}>
      <summary><Plus /> دورة جديدة</summary>
      <CourseComposer onCreated={() => void reload()} />
    </details>

    {courses?.map((course) => {
      const active = course.students.filter((s) => s.status === "active").length;
      return <section className="specialist-panel trainer-course" key={course.id}>
        <header className="trainer-course-head">
          <div>
            <h2>{course.title}</h2>
            <small>{formatCurrency(course.price)} · {course.startsAt ? formatDate(course.startsAt) : "يحدد لاحقاً"}{course.capacity ? ` · السعة ${course.capacity}` : ""}</small>
          </div>
          <div className="trainer-course-actions">
            <em className={course.reviewStatus === "published" ? "is-published" : ""}>{REVIEW_LABEL[course.reviewStatus] ?? course.reviewStatus}</em>
            {course.reviewStatus === "draft" && <button className="button button-small" disabled={busy === course.id}
              onClick={() => void run(course.id, () => submitCourseForReview(course.id))}>
              <Send /> تقديم للمراجعة
            </button>}
            {course.reviewStatus === "in_review" && <small className="application-hint">بانتظار قرار الإدارة.</small>}
          </div>
        </header>

        {course.reviewNote && <p className="application-note">ملاحظة الإدارة: {course.reviewNote}</p>}
        {course.reviewStatus === "draft" && course.modules.length === 0 && <p className="booking-missing">
          <AlertCircle /> أضف وحدة واحدة على الأقل ووصفاً للدورة قبل التقديم للمراجعة.
        </p>}

        <div className="portal-live-metrics">
          <article><Users /><span><small>المسجلون</small><strong>{course.students.length}</strong></span></article>
          <article><CheckCircle2 /><span><small>نشط</small><strong>{active}</strong></span></article>
          <article><BookOpenCheck /><span><small>الوحدات</small><strong>{course.modules.length}</strong></span></article>
        </div>

        <h3 className="trainer-section-title">المتدربون</h3>
        {course.students.length ? <div className="admin-list">
          {course.students.map((student) => <article className="admin-row" key={student.enrollmentId}>
            <div className="admin-row-main">
              <div>
                <strong>{student.studentName}</strong>
                <small>{ENROL_STATUS[student.status] ?? student.status}</small>
                <div className="portal-progress"><i style={{ width: `${student.progress}%` }} /></div>
                <small>التقدم: {student.progress}%</small>
              </div>
              <em>{student.completedAt ? "أكمل الدورة" : `${student.progress}%`}</em>
            </div>
            {student.status !== "pending_payment" && <div className="admin-row-actions role-picker">
              {[0, 25, 50, 75, 100].map((value) => <button
                key={value} type="button"
                className={student.progress === value ? "chip selected" : "chip"}
                disabled={busy === student.enrollmentId}
                onClick={() => void run(student.enrollmentId, () => setStudentProgress(student.enrollmentId, value))}
              >{value}%</button>)}
            </div>}
            {student.status === "pending_payment" && <p className="application-note">لم يكتمل الدفع بعد — لا يمكن تحديث التقدم.</p>}
          </article>)}
        </div> : <div className="portal-empty"><Users /><p>لم يسجل أحد في هذه الدورة بعد.</p></div>}

        <h3 className="trainer-section-title">محتوى الدورة</h3>
        {course.modules.length > 0 && <ol className="specialist-exercise-list">
          {course.modules.map((module) => <li key={module.id}>
            <div>
              <strong>{module.title}</strong>
              {module.summary && <small>{module.summary}</small>}
              <small>{module.lessonCount} درس</small>
            </div>
          </li>)}
        </ol>}
        <ModuleComposer course={course} onAdded={() => void reload()} />
      </section>;
    })}
  </div></section></PageShell>;
}
