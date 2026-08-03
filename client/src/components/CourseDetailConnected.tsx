import { Award, BookOpen, CalendarDays, CheckCircle2, ChevronDown, Clock3, Languages, LoaderCircle, LockKeyhole, MonitorPlay, RefreshCcw, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { CourseDetailResponse } from "../lib/catalog-types";
import { courseModeLabel, formatCurrency, formatDate } from "../lib/format";
import { AuthenticationRequiredError, enrollInCourse, loadCourseDetail } from "../lib/platform";
import DemoBadge from "./DemoBadge";

export default function CourseDetailConnected({ slug }: { slug: string }) {
  const [data, setData] = useState<CourseDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<{ id: string; status: string; progress: number; amount_due: number } | null>(null);
  const [enrollError, setEnrollError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try { setData(await loadCourseDetail(slug)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل الدورة"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, [slug]);

  async function enroll() {
    if (!data) return;
    setEnrolling(true);
    setEnrollError("");
    try {
      const result = await enrollInCourse(data.course);
      setEnrollment({ ...result, amount_due: Number(result.amount_due) });
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        const returnTo = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?returnTo=${returnTo}`;
        return;
      }
      const message = reason instanceof Error ? reason.message : "تعذر التسجيل";
      setEnrollError(message.includes("COURSE_FULL") ? "اكتمل عدد المقاعد لهذه الدورة." : message);
    } finally { setEnrolling(false); }
  }

  if (loading) return <section className="section"><div className="container course-detail-loading"><LoaderCircle className="spin" /><i /><i /></div></section>;
  if (error || !data) return <section className="section"><div className="container catalog-message"><strong>تعذر تحميل الدورة.</strong><p>قد تكون الدورة غير منشورة أو تعذر الاتصال مؤقتًا.</p><button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button><a className="button" href="/courses">العودة إلى الدورات</a></div></section>;

  const { course, modules } = data;
  return <>
    <section className="course-detail-hero"><div className="container course-detail-grid"><div><div className="course-labels"><span>{courseModeLabel(course.mode)}</span><span>{course.level}</span>{course.isDemo && <DemoBadge compact />}</div><h1>{course.title}</h1><p>{course.description || course.summary}</p><div className="course-keyfacts"><span><Clock3 /> {course.durationHours} ساعة</span><span><Languages /> {course.language}</span><span><CalendarDays /> {course.startsAt ? formatDate(course.startsAt) : "يحدد لاحقًا"}</span></div></div><aside className="enrollment-card"><small>{course.isDemo ? "قيمة توضيحية" : "رسوم التسجيل"}</small><strong>{formatCurrency(course.price)}</strong><p>يُنشأ التسجيل والفاتورة في Supabase بعد تسجيل الدخول.</p>{enrollment ? <div className="enrollment-success"><CheckCircle2 /><span><b>تم تسجيل طلبك</b><small>الحالة: {enrollment.status === "pending_payment" ? "بانتظار الدفع" : "نشط"}</small><small>رقم التسجيل: <span dir="ltr">{enrollment.id}</span></small></span></div> : <button className="button" disabled={enrolling} onClick={() => void enroll()}>{enrolling ? <LoaderCircle className="spin" /> : <CheckCircle2 />} التسجيل في الدورة</button>}{enrollError && <div className="form-error" role="alert">{enrollError}</div>}<span><ShieldCheck /> لا تُخزن بيانات البطاقة في المنصة.</span></aside></div></section>
    <section className="section"><div className="container detail-content-grid"><div><section className="detail-block"><h2>نتائج التعلم</h2><ul className="check-list">{course.learningOutcomes.map((item) => <li key={item}><CheckCircle2 /> {item}</li>)}</ul></section><section className="detail-block"><h2>المحتوى</h2><div className="module-list">{modules.length ? modules.map((module, index) => <details key={module.id} open={index === 0}><summary><span><i>{index + 1}</i><b>{module.title}</b></span><ChevronDown /></summary><div><p>{module.summary || "تظهر تفاصيل الوحدة عند نشر المحتوى."}</p>{module.lessons.length ? <ul>{module.lessons.map((lesson) => <li key={lesson.id}><MonitorPlay /><span><b>{lesson.title}</b><small>{lesson.durationMinutes ? `${lesson.durationMinutes} دقيقة` : "المدة تحدد داخل المحتوى"}</small></span>{lesson.isPreview ? <em>معاينة</em> : <LockKeyhole />}</li>)}</ul> : <span className="locked-note"><LockKeyhole /> تظهر الدروس للمسجلين حسب سياسة إتاحة المحتوى.</span>}</div></details>) : <div className="catalog-message"><strong>لم تنشر الوحدات بعد.</strong><p>تضاف الوحدات والدروس من لوحة المدرب.</p></div>}</div></section></div><aside className="detail-sidebar"><section><h3>المتطلبات السابقة</h3><ul>{course.prerequisites.map((item) => <li key={item}><UsersRound /> {item}</li>)}</ul></section><section><h3>شروط الشهادة</h3>{course.certificateAvailable ? <p><Award /> تصدر بعد استيفاء الحضور والمحتوى والتقييمات المحددة.</p> : <p>لا تتضمن هذه الدورة شهادة.</p>}</section><section><h3>إتاحة المحتوى</h3><p><BookOpen /> ينشر المحتوى وفق الجدول، وقد يشترط إكمال درس سابق.</p></section></aside></div></section>
  </>;
}
