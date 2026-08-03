"use client";

import { Award, BookOpen, CalendarDays, CheckCircle2, ChevronDown, Clock3, Languages, LockKeyhole, MonitorPlay, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { apiUrl } from "../lib/api";
import type { CourseDetailResponse } from "../lib/catalog-types";
import { courseModeLabel, formatCurrency, formatDate } from "../lib/format";
import DemoBadge from "./DemoBadge";

export default function CourseDetail({ slug }: { slug: string }) {
  const [data, setData] = useState<CourseDetailResponse | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/courses/${encodeURIComponent(slug)}`))
      .then((response) => {
        if (!response.ok) throw new Error("course unavailable");
        return response.json() as Promise<CourseDetailResponse>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);

  if (error) return <section className="section"><div className="container catalog-message"><strong>تعذر تحميل الدورة.</strong><p>تحقق من الرابط أو أعد المحاولة لاحقاً.</p><a className="button" href="/courses">العودة إلى الدورات</a></div></section>;
  if (!data) return <section className="section"><div className="container course-detail-loading"><i /><i /><i /></div></section>;

  const { course, modules } = data;
  return (
    <>
      <section className="course-detail-hero">
        <div className="container course-detail-grid">
          <div>
            <div className="course-labels"><span>{courseModeLabel(course.mode)}</span><span>{course.level}</span>{course.isDemo && <DemoBadge compact />}</div>
            <h1>{course.title}</h1>
            <p>{course.description || course.summary}</p>
            <div className="course-keyfacts"><span><Clock3 /> {course.durationHours} ساعة</span><span><Languages /> {course.language}</span><span><CalendarDays /> {formatDate(course.startsAt)}</span></div>
          </div>
          <aside className="enrollment-card">
            <small>{course.isDemo ? "قيمة توضيحية" : "رسوم التسجيل"}</small>
            <strong>{formatCurrency(course.price)}</strong>
            <p>تظهر الفاتورة والسياسة والمبلغ النهائي قبل الدفع.</p>
            <button className="button" onClick={() => setNotice(true)}>اختبار طلب التسجيل</button>
            <span><ShieldCheck /> لا تُخزن بيانات البطاقة في المنصة.</span>
          </aside>
        </div>
      </section>

      <section className="section"><div className="container detail-content-grid"><div>
        <section className="detail-block"><h2>نتائج التعلم</h2><ul className="check-list">{course.learningOutcomes.map((item) => <li key={item}><CheckCircle2 /> {item}</li>)}</ul></section>
        <section className="detail-block"><h2>المحتوى</h2><div className="module-list">{modules.length ? modules.map((module, index) => <details key={module.id} open={index === 0}><summary><span><i>{index + 1}</i><b>{module.title}</b></span><ChevronDown /></summary><div><p>{module.summary || "تظهر تفاصيل الوحدة عند نشر المحتوى."}</p>{module.lessons.length ? <ul>{module.lessons.map((lesson) => <li key={lesson.id}><MonitorPlay /><span><b>{lesson.title}</b><small>{lesson.durationMinutes ? `${lesson.durationMinutes} دقيقة` : "المدة تحدد داخل المحتوى"}</small></span>{lesson.isPreview ? <em>معاينة</em> : <LockKeyhole />}</li>)}</ul> : <span className="locked-note"><LockKeyhole /> تفاصيل الدروس متاحة للمسجلين بعد النشر.</span>}</div></details>) : <div className="catalog-message"><strong>لم تنشر الوحدات بعد.</strong><p>تضاف الوحدات والدروس من لوحة المدرب.</p></div>}</div></section>
      </div><aside className="detail-sidebar">
        <section><h3>المتطلبات السابقة</h3><ul>{course.prerequisites.map((item) => <li key={item}><UsersRound /> {item}</li>)}</ul></section>
        <section><h3>شروط الشهادة</h3>{course.certificateAvailable ? <p><Award /> تصدر بعد استيفاء الحضور والمحتوى والتقييمات المحددة في النسخة النهائية للدورة.</p> : <p>لا تتضمن هذه الدورة شهادة.</p>}</section>
        <section><h3>إتاحة المحتوى</h3><p><BookOpen /> ينشر المحتوى وفق الجدول، وقد يشترط إكمال درس سابق قبل فتح الدرس التالي.</p></section>
      </aside></div></section>

      {notice && <div className="modal-backdrop" role="presentation" onClick={() => setNotice(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="enroll-title" onClick={(event) => event.stopPropagation()}><span className="modal-icon"><CheckCircle2 /></span><h2 id="enroll-title">مسار التسجيل يعمل كعرض تشغيلي</h2><p>لم يُنشأ تسجيل ولم يُخصم مبلغ. تفعيل التسجيل الفعلي يتطلب ربط حساب Supabase Auth وبوابة الدفع المعتمدة.</p><div><a className="button" href="/portal?view=student">معاينة لوحة الطالب</a><button className="button button-secondary" onClick={() => setNotice(false)}>إغلاق</button></div></div></div>}
    </>
  );
}
