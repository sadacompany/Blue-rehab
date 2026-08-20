import { Award, BookOpen, CalendarDays, CheckCircle2, ChevronDown, Clock3, CreditCard, Languages, LoaderCircle, LockKeyhole, MonitorPlay, PlayCircle, RefreshCcw, ShieldCheck, UserRoundCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { CourseModule } from "../lib/catalog-types";
import { countLabel, courseModeLabel, formatDate, formatPrice, isOnOffer } from "../lib/format";
import { loadCourseDetail } from "../lib/catalog";
import { loadLessonAccess, type LessonAccess } from "../lib/learning";
import { AuthenticationRequiredError, enrollInCourse, startCheckout } from "../lib/platform";
import { useAsync } from "../lib/use-async";
import DemoBadge from "./DemoBadge";
import OfferBadge from "./OfferBadge";
import { Link } from "react-router-dom";

/**
 * One lesson in the syllabus.
 *
 * Every lesson used to render with a padlock whether or not the reader had paid,
 * and no lesson was openable by anyone — the course ended at its table of
 * contents. What can be opened is decided by the row-level policy: `access`
 * carries only the lessons this reader is allowed to read, so a title appearing
 * here without an entry is genuinely locked, not merely un-fetched.
 */
function LessonRow({ lesson, access }: { lesson: CourseModule["lessons"][number]; access: LessonAccess }) {
  const open = access.content[lesson.id];
  const label = <span><b>{lesson.title}</b><small>
    {lesson.durationMinutes ? countLabel(lesson.durationMinutes, ["دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة"]) : "المدة تحدد داخل المحتوى"}
  </small></span>;

  if (open?.contentUrl) return <li className="lesson-open">
    <MonitorPlay />{label}
    <a className="button button-small" href={open.contentUrl} target="_blank" rel="noreferrer">
      <PlayCircle /> فتح الدرس
    </a>
  </li>;

  // Readable, but the instructor has not attached anything to open yet.
  if (open) return <li className="lesson-open"><MonitorPlay />{label}<em>متاح</em></li>;

  return <li><MonitorPlay />{label}{lesson.isPreview ? <em>معاينة</em> : <LockKeyhole />}</li>;
}

export default function CourseDetailConnected({ slug }: { slug: string }) {
  const { data, error, loading, reload } = useAsync(() => loadCourseDetail(slug), [slug]);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<{ status: string; amountDue: number; orderNumber: string | null } | null>(null);
  const [enrollError, setEnrollError] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [access, setAccess] = useState<LessonAccess>({ status: null, unlocked: false, content: {} });

  // What this reader may open. Runs after the course arrives because it is keyed
  // by course id, and never blocks the page: the catalogue renders either way.
  useEffect(() => {
    if (!data?.course.id) return;
    let alive = true;
    void loadLessonAccess(data.course.id)
      .then((result) => { if (alive) setAccess(result); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [data?.course.id]);

  async function enroll() {
    if (!data) return;
    setEnrolling(true);
    setEnrollError("");
    try {
      const result = await enrollInCourse(data.course);

      // A free course enrols immediately — create_enrollment_intent() skips
      // the payments row entirely and activates the seat outright, so there
      // is no order number and nothing to send the visitor to Moyasar for.
      // Re-reading access is what flips the UI to "أنت مسجل"; the enrolment
      // itself already happened on the server.
      if (!result.orderNumber) {
        const refreshed = await loadLessonAccess(data.course.id).catch(() => null);
        if (refreshed) setAccess(refreshed);
        return;
      }

      // A paid course only reserves the price. Nothing is recorded against
      // the student until payment clears, so send them straight to the
      // gateway rather than showing "you are registered" over an unpaid seat.
      setEnrollment(result);
      const { paymentUrl } = await startCheckout(result.orderNumber);
      window.location.href = paymentUrl;
      return;
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

  /** Hand the student off to the Moyasar-hosted payment page. */
  async function payCourse() {
    if (!enrollment?.orderNumber) return;
    setPayBusy(true);
    setEnrollError("");
    try {
      const { paymentUrl } = await startCheckout(enrollment.orderNumber);
      window.location.href = paymentUrl;
    } catch (reason) {
      setEnrollError(reason instanceof Error ? reason.message : "تعذر فتح صفحة الدفع.");
      setPayBusy(false);
    }
  }

  if (loading) return <section className="section"><div className="container course-detail-loading"><LoaderCircle className="spin" /><i /><i /></div></section>;
  if (error || !data) return <section className="section"><div className="container catalog-message"><strong>تعذر تحميل الدورة.</strong><p>قد تكون الدورة غير منشورة أو تعذر الاتصال مؤقتًا.</p><button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button><Link className="button" to="/courses">العودة إلى الدورات</Link></div></section>;

  const { course, modules } = data;
  const onOffer = isOnOffer(course);
  return <>
    <section className="course-detail-hero"><div className="container course-detail-grid"><div><div className="course-labels"><span>{courseModeLabel(course.mode)}</span><span>{course.level}</span>{onOffer && <OfferBadge />}{course.isDemo && <DemoBadge compact />}</div><h1>{course.title}</h1>{course.presenterName && <p className="course-presenter detail"><UserRoundCheck /> {course.presenterName}</p>}<p>{course.description || course.summary}</p><div className="course-keyfacts"><span><Clock3 /> {course.durationHours} ساعة</span><span><Languages /> {course.language}</span><span><CalendarDays /> {course.startsAt ? formatDate(course.startsAt) : "يحدد لاحقًا"}</span></div></div><aside className="enrollment-card">{course.coverUrl && <span className="enrollment-poster"><img src={course.coverUrl} alt="" /></span>}{onOffer && <OfferBadge />}<small>{course.isDemo ? "قيمة توضيحية" : course.price <= 0 ? "الدورة" : onOffer ? "رسوم التسجيل بعد العرض" : "رسوم التسجيل"}</small><strong className="price-line">{formatPrice(course.price)}{onOffer && <s>{formatPrice(course.compareAtPrice as number)}</s>}</strong><p>{course.price <= 0 ? "التسجيل فوري بعد تسجيل الدخول — لا توجد رسوم." : "يُنشأ التسجيل والفاتورة بعد تسجيل الدخول."}</p>{access.unlocked ? <div className="enrollment-success"><CheckCircle2 /><span><b>أنت مسجل في هذه الدورة</b><small>المحتوى مفتوح لك أدناه.</small><Link className="button" to="/portal">متابعة من حسابي</Link></span></div>
      : enrollment ? <div className="enrollment-success"><CreditCard /><span><b>الخطوة الأخيرة: إتمام الدفع</b><small>لا يُفعَّل التسجيل قبل اكتمال الدفع.</small><small>رقم الطلب: <span dir="ltr">{enrollment.orderNumber}</span></small><button className="button" disabled={payBusy} onClick={() => void payCourse()}>{payBusy ? <LoaderCircle className="spin" /> : <CreditCard />} ادفع {formatPrice(enrollment.amountDue)}</button></span></div>
      : <button className="button" disabled={enrolling} onClick={() => void enroll()}>{enrolling ? <LoaderCircle className="spin" /> : <CheckCircle2 />} {course.price <= 0 ? "سجّل الآن مجاناً" : "التسجيل في الدورة"}</button>}{enrollError && <div className="form-error" role="alert">{enrollError}</div>}<span><ShieldCheck /> لا تُخزن بيانات البطاقة في المنصة.</span></aside></div></section>
    <section className="section"><div className="container detail-content-grid"><div><section className="detail-block"><h2>نتائج التعلم</h2><ul className="check-list">{course.learningOutcomes.map((item) => <li key={item}><CheckCircle2 /> {item}</li>)}</ul></section><section className="detail-block"><h2>المحتوى</h2><div className="module-list">{modules.length ? modules.map((module, index) => <details key={module.id} open={index === 0}><summary><span><i>{index + 1}</i><b>{module.title}</b></span><ChevronDown /></summary><div><p>{module.summary || "تظهر تفاصيل الوحدة عند نشر المحتوى."}</p>{module.lessons.length ? <ul>{module.lessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} access={access} />)}</ul> : <span className="locked-note"><LockKeyhole /> تظهر الدروس للمسجلين حسب سياسة إتاحة المحتوى.</span>}</div></details>) : <div className="catalog-message"><strong>لم تنشر الوحدات بعد.</strong><p>تضاف الوحدات والدروس من لوحة المدرب.</p></div>}</div></section></div><aside className="detail-sidebar"><section><h3>المتطلبات السابقة</h3><ul>{course.prerequisites.map((item) => <li key={item}><UsersRound /> {item}</li>)}</ul></section><section><h3>شروط الشهادة</h3>{course.certificateAvailable ? <p><Award /> تصدر بعد استيفاء الحضور والمحتوى والتقييمات المحددة.</p> : <p>لا تتضمن هذه الدورة شهادة.</p>}</section><section><h3>إتاحة المحتوى</h3><p><BookOpen /> ينشر المحتوى وفق الجدول، وقد يشترط إكمال درس سابق.</p></section></aside></div></section>
  </>;
}
