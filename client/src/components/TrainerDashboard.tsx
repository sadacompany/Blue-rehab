import { AlertCircle, BookOpenCheck, CheckCircle2, GraduationCap, LoaderCircle, Plus, RefreshCcw, Send, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { countLabel, formatCurrency, formatDate } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import {
  addLesson,
  addModule,
  createCourse,
  deleteLesson,
  LESSON_TYPES,
  loadTrainerCourses,
  setStudentProgress,
  submitCourseForReview,
  type TrainerCourse,
  type TrainerModule,
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

/**
 * A lesson is the actual content. Modules could be created but never filled, so
 * a course could reach approval with every module empty.
 */
function LessonComposer({ module, onAdded }: { module: TrainerModule; onAdded: () => void }) {
  const [form, setForm] = useState({ title: "", contentType: "video", contentUrl: "", duration: "", isPreview: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!form.title.trim()) { setError("عنوان الدرس مطلوب"); return; }
    setBusy(true);
    setError("");
    try {
      // `course_lessons` has a unique (module_id, position); continue the sequence.
      const next = module.lessons.reduce((max, item) => Math.max(max, item.position), 0) + 1;
      await addLesson(module.id, {
        title: form.title, contentType: form.contentType, contentUrl: form.contentUrl,
        durationMinutes: Number(form.duration) || null, isPreview: form.isPreview, position: next,
      });
      setForm({ title: "", contentType: "video", contentUrl: "", duration: "", isPreview: false });
      onAdded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إضافة الدرس");
    } finally { setBusy(false); }
  }

  return <details className="trainer-lesson-composer">
    <summary><Plus /> إضافة درس إلى «{module.title}»</summary>
    <div className="specialist-plan-composer">
      <label><span>عنوان الدرس <b className="req">*</b></span>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: تشريح مفصل الكتف" /></label>
      <div className="specialist-plan-composer-row">
        <label><span>نوع المحتوى</span>
          <select value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value })}>
            {LESSON_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select></label>
        <label><span>المدة (دقيقة)</span>
          <input type="number" min={1} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="اختياري" /></label>
      </div>
      <label><span>رابط المحتوى</span>
        <input dir="ltr" value={form.contentUrl} onChange={(e) => setForm({ ...form, contentUrl: e.target.value })} placeholder="https://… — اختياري" /></label>
      <label className="policy-check">
        <input type="checkbox" checked={form.isPreview} onChange={(e) => setForm({ ...form, isPreview: e.target.checked })} />
        <span>إتاحة هذا الدرس كمعاينة مجانية قبل الشراء</span>
      </label>
      {error && <p className="specialist-error">{error}</p>}
      <button className="button button-small" type="button" disabled={busy} onClick={() => void submit()}>
        {busy ? <LoaderCircle className="spin" /> : <Plus />} إضافة الدرس
      </button>
    </div>
  </details>;
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
        {course.reviewStatus === "draft" && course.modules.reduce((sum, m) => sum + m.lessons.length, 0) === 0 && <p className="booking-missing">
          <AlertCircle /> أضف وصفاً للدورة، ووحدة تحتوي على درس واحد على الأقل، قبل التقديم للمراجعة.
        </p>}

        <div className="portal-live-metrics">
          <article><Users /><span><small>المسجلون</small><strong>{course.students.length}</strong></span></article>
          <article><CheckCircle2 /><span><small>نشط</small><strong>{active}</strong></span></article>
          <article><BookOpenCheck /><span><small>الوحدات والدروس</small><strong>{course.modules.length} · {course.modules.reduce((sum, m) => sum + m.lessons.length, 0)}</strong></span></article>
        </div>

        <h3 className="trainer-section-title">المتدربون</h3>
        {course.students.length ? <div className="admin-list">
          {course.students.map((student) => <article className="admin-row" key={student.enrollmentId}>
            <div className="admin-row-main">
              <div>
                <strong>{student.studentName}</strong>
                <small>{ENROL_STATUS[student.status] ?? student.status}</small>
                <div className="portal-progress"><i style={{ width: `${student.progress}%` }} /></div>
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
        {course.modules.map((module) => <div className="trainer-module" key={module.id}>
          <header>
            <div>
              <strong>{module.title}</strong>
              {module.summary && <small>{module.summary}</small>}
            </div>
            <em>{countLabel(module.lessons.length, ["درس واحد", "درسان", "دروس", "درساً"])}</em>
          </header>

          {module.lessons.length > 0 ? <ol className="trainer-lesson-list">
            {module.lessons.map((lesson) => <li key={lesson.id}>
              <span className="trainer-lesson-kind">{LESSON_TYPES.find((t) => t.value === lesson.contentType)?.label ?? lesson.contentType}</span>
              <div>
                <strong>{lesson.title}</strong>
                <small>
                  {lesson.durationMinutes ? `${countLabel(lesson.durationMinutes, ["دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة"])}` : "المدة غير محددة"}
                  {lesson.isPreview && " · معاينة مجانية"}
                </small>
              </div>
              <button type="button" className="icon-button" aria-label={`حذف الدرس: ${lesson.title}`}
                disabled={busy === lesson.id}
                onClick={() => void run(lesson.id, () => deleteLesson(lesson.id))}><Trash2 /></button>
            </li>)}
          </ol> : <p className="booking-missing"><AlertCircle /> لا توجد دروس في هذه الوحدة بعد — أضف درساً حتى يكون للوحدة محتوى.</p>}

          <LessonComposer module={module} onAdded={() => void reload()} />
        </div>)}

        <ModuleComposer course={course} onAdded={() => void reload()} />
      </section>;
    })}
  </div></section></PageShell>;
}
