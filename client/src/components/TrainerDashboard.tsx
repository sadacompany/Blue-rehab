import { BookOpenCheck, CheckCircle2, GraduationCap, LoaderCircle, Plus, RefreshCcw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import {
  addModule,
  loadTrainerCourses,
  setCoursePublished,
  setStudentProgress,
  type TrainerCourse,
} from "../lib/trainer";
import PageShell from "./PageShell";

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

  if (loading) return <PageShell><section className="section"><div className="container"><div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ تحميل لوحة المدرب…</p></div></div></section></PageShell>;

  return <PageShell><section className="specialist-page"><div className="container">
    <header className="specialist-head">
      <div>
        <span className="eyebrow"><GraduationCap /> لوحة المدرب</span>
        <h1>دوراتي التدريبية</h1>
        <p>تابع المتدربين، حدّث التقدم، وأدر محتوى الدورة.</p>
      </div>
      <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> تحديث</button>
    </header>

    {error && <div className="form-error" role="alert">{error}</div>}

    {courses && courses.length === 0 && <div className="catalog-message">
      <BookOpenCheck />
      <strong>لا توجد دورات مرتبطة بحسابك.</strong>
      <p>تُسند الدورات إليك من الإدارة. تواصل معها لربط دوراتك بحسابك كمدرب.</p>
      <a className="button button-secondary" href="/portal">حسابي</a>
    </div>}

    {courses?.map((course) => {
      const active = course.students.filter((s) => s.status === "active").length;
      return <section className="specialist-panel trainer-course" key={course.id}>
        <header className="trainer-course-head">
          <div>
            <h2>{course.title}</h2>
            <small>{formatCurrency(course.price)} · {course.startsAt ? formatDate(course.startsAt) : "يحدد لاحقاً"}{course.capacity ? ` · السعة ${course.capacity}` : ""}</small>
          </div>
          <div className="trainer-course-actions">
            <em className={course.isPublished ? "is-published" : ""}>{course.isPublished ? "منشورة" : "مسودة"}</em>
            <button className="button button-small button-secondary" disabled={busy === course.id}
              onClick={() => void run(course.id, () => setCoursePublished(course.id, !course.isPublished))}>
              {course.isPublished ? "إلغاء النشر" : "نشر الدورة"}
            </button>
          </div>
        </header>

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
