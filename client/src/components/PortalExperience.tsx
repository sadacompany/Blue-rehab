"use client";

import { Activity, Bell, BookOpenCheck, CalendarDays, CheckCircle2, ChevronLeft, ClipboardList, CreditCard, Dumbbell, FileText, GraduationCap, HeartPulse, LayoutDashboard, LockKeyhole, Menu, MessageSquareText, PanelRightClose, Settings, ShieldCheck, Stethoscope, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

type View = "patient" | "student" | "specialist" | "trainer" | "admin";

const views: Array<{ id: View; label: string; icon: typeof HeartPulse }> = [
  { id: "patient", label: "المصاب", icon: HeartPulse },
  { id: "student", label: "الطالب", icon: GraduationCap },
  { id: "specialist", label: "الأخصائي", icon: Stethoscope },
  { id: "trainer", label: "المدرب", icon: BookOpenCheck },
  { id: "admin", label: "الإدارة", icon: ShieldCheck },
];

const exerciseSeed = [
  { id: 1, name: "مدى حركة الركبة", dose: "3 مجموعات × 10 تكرارات", done: true },
  { id: 2, name: "تنشيط العضلة الأمامية", dose: "4 مجموعات × 8 ثوانٍ", done: false },
  { id: 3, name: "التوازن المدعوم", dose: "3 مرات × 30 ثانية", done: false },
];

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof HeartPulse }) {
  return <article className="metric-card"><span><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function PatientDashboard() {
  const [exercises, setExercises] = useState(exerciseSeed);
  const completed = exercises.filter((item) => item.done).length;
  return <>
    <div className="metrics-grid"><Metric label="الجلسة القادمة" value="الثلاثاء، 5:30 م" note="موعد توضيحي عن بُعد" icon={CalendarDays} /><Metric label="التزام الأسبوع" value={`${completed} من ${exercises.length}`} note="يحتسب من سجل التنفيذ" icon={Activity} /><Metric label="الخطة الحالية" value="الأسبوع الثاني" note="من نموذج خطة لأربعة أسابيع" icon={ClipboardList} /></div>
    <div className="dashboard-grid two-one"><section className="dashboard-panel"><header><div><small>تمارين اليوم</small><h2>ثلاث مهام وفق الخطة</h2></div><span className="panel-status">بيانات توضيحية</span></header><div className="exercise-list">{exercises.map((item) => <button type="button" className={item.done ? "done" : ""} key={item.id} onClick={() => setExercises((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}><i>{item.done ? <CheckCircle2 /> : <Dumbbell />}</i><span><strong>{item.name}</strong><small>{item.dose}</small></span><em>{item.done ? "مكتمل" : "تسجيل الإنجاز"}</em></button>)}</div></section><aside className="dashboard-panel plan-summary"><header><div><small>ملخص الخطة</small><h2>هدف وظيفي</h2></div></header><p>تحسين القدرة على صعود الدرج تدريجياً مع مراقبة الألم والاستجابة.</p><div className="mini-progress"><span><b>تقدم توضيحي</b><strong>58%</strong></span><i><b style={{ width: "58%" }} /></i></div><a href="/services">تفاصيل الخطة <ChevronLeft /></a></aside></div>
    <div className="dashboard-grid three"><section className="dashboard-panel compact-panel"><FileText /><div><small>الملفات</small><h3>التقارير والأشعة</h3><p>مساحة خاصة مرتبطة بالحالة.</p></div><LockKeyhole /></section><section className="dashboard-panel compact-panel"><MessageSquareText /><div><small>ملاحظة الأخصائي</small><h3>راجع الألم بعد التمرين</h3><p>مثال رسالة ضمن الخطة.</p></div><ChevronLeft /></section><section className="dashboard-panel compact-panel"><CreditCard /><div><small>المدفوعات</small><h3>لا توجد عمليات فعلية</h3><p>الفواتير تظهر بعد الربط.</p></div><ChevronLeft /></section></div>
  </>;
}

function StudentDashboard() {
  return <>
    <div className="metrics-grid"><Metric label="الدورة الحالية" value="تأهيل إصابات الركبة" note="نموذج دورة توضيحي" icon={BookOpenCheck} /><Metric label="التقدم" value="2 من 6 وحدات" note="مثال لاحتساب الإنجاز" icon={Activity} /><Metric label="المحاضرة القادمة" value="الخميس، 7:00 م" note="موعد توضيحي" icon={CalendarDays} /></div>
    <div className="dashboard-grid two-one"><section className="dashboard-panel"><header><div><small>المحتوى التدريبي</small><h2>الوحدات والدروس</h2></div><span className="panel-status">عرض الطالب</span></header><div className="lesson-list"><span className="complete"><i><CheckCircle2 /></i><b>أسس الفحص السريري</b><small>مكتمل</small></span><span className="active"><i>2</i><b>بناء التدرج التأهيلي</b><small>قيد الدراسة</small></span><span><i><LockKeyhole /></i><b>معايير العودة للنشاط</b><small>يفتح بعد الوحدة السابقة</small></span><span><i><LockKeyhole /></i><b>دراسة حالة تطبيقية</b><small>مقفل</small></span></div></section><aside className="dashboard-panel certificate-panel"><AwardIcon /><h2>الشهادة</h2><p>تفتح بعد اكتمال الحضور والمحتوى والتقييم المطلوب.</p><div className="requirement"><span><CheckCircle2 /> المحتوى</span><b>33%</b></div><div className="requirement"><span><CheckCircle2 /> الحضور</span><b>1/3</b></div><button disabled><LockKeyhole /> غير متاحة بعد</button></aside></div>
    <div className="dashboard-panel"><header><div><small>الإعلانات</small><h2>آخر التحديثات</h2></div></header><div className="announcement"><Bell /><span><strong>إضافة مادة تمهيدية</strong><p>مثال إشعار يظهر عند نشر المدرب ملفاً أو إعلاناً جديداً.</p></span><small>اليوم</small></div></div>
  </>;
}

function AwardIcon() { return <span className="certificate-icon"><GraduationCap /></span>; }

function SpecialistDashboard() {
  return <>
    <div className="metrics-grid"><Metric label="مواعيد اليوم" value="4 نماذج" note="2 حضور · 2 عن بُعد" icon={CalendarDays} /><Metric label="خطط تحتاج مراجعة" value="2" note="قيم توضيحية" icon={ClipboardList} /><Metric label="تنبيه متابعة" value="1" note="ارتفاع ألم مسجل في نموذج" icon={Bell} /></div>
    <section className="dashboard-panel"><header><div><small>جدول اليوم</small><h2>المواعيد والحالات المسندة</h2></div><span className="panel-status">بيانات توضيحية</span></header><div className="data-table"><div className="table-head"><span>الوقت</span><span>الحالة</span><span>نوع الجلسة</span><span>الحضور</span><span>الإجراء</span></div>{[["09:00 ص","حالة BR-104","تشخيص أولي","في المركز","فتح الملف"],["11:30 ص","حالة BR-117","متابعة","عن بُعد","الانضمام"],["03:00 م","حالة BR-121","جلسة علاجية","في المركز","تسجيل الحضور"],["05:30 م","حالة BR-108","متابعة","عن بُعد","مراجعة الخطة"]].map((row) => <div className="table-row" key={row[0]}>{row.map((cell, index) => <span key={cell} data-label={["الوقت","الحالة","النوع","الحضور","الإجراء"][index]} className={index === 4 ? "table-action" : ""}>{cell}</span>)}</div>)}</div></section>
    <div className="dashboard-grid two"><section className="dashboard-panel"><header><div><small>متابعة الالتزام</small><h2>سجل التمارين</h2></div></header><div className="alert-row"><Activity /><span><strong>الحالة BR-108</strong><p>سُجل ألم 7/10 بعد تمرين التوازن. مثال تنبيه للمراجعة.</p></span><button>مراجعة</button></div></section><section className="dashboard-panel"><header><div><small>آخر تحديث</small><h2>خطة بحاجة للنشر</h2></div></header><div className="alert-row neutral"><ClipboardList /><span><strong>الحالة BR-121</strong><p>أضيفت الأهداف والتمارين وبقيت تعليمات السلامة.</p></span><button>إكمال</button></div></section></div>
  </>;
}

function TrainerDashboard() {
  return <>
    <div className="metrics-grid"><Metric label="الدورات المسندة" value="3 نماذج" note="حضوري · هجين · عن بُعد" icon={BookOpenCheck} /><Metric label="جلسة قادمة" value="الخميس، 7:00 م" note="موعد توضيحي" icon={CalendarDays} /><Metric label="مهام تحتاج مراجعة" value="6" note="قيم عرض للواجهة" icon={FileText} /></div>
    <section className="dashboard-panel"><header><div><small>إدارة الدورة</small><h2>التأهيل المتقدم لإصابات الركبة</h2></div><span className="panel-status">نموذج منشور</span></header><div className="trainer-course-grid"><div><strong>هيكل المحتوى</strong><span>3 وحدات</span><div className="mini-progress"><i><b style={{ width: "66%" }} /></i><small>وحدتان مجهزتان</small></div></div><div><strong>الحضور</strong><span>جلسة من 3</span><div className="mini-progress"><i><b style={{ width: "33%" }} /></i><small>سجل توضيحي</small></div></div><div><strong>الإكمال</strong><span>لا شهادات صادرة</span><div className="mini-progress"><i><b style={{ width: "0%" }} /></i><small>بانتظار استيفاء الشروط</small></div></div></div></section>
    <div className="dashboard-grid two"><section className="dashboard-panel"><header><div><small>المحتوى</small><h2>آخر الوحدات</h2></div></header><div className="simple-list"><span><BookOpenCheck /><b>التقييم السريري للركبة</b><em>منشورة</em></span><span><BookOpenCheck /><b>بناء التدرج التأهيلي</b><em>مسودة</em></span><span><LockKeyhole /><b>العودة للنشاط</b><em>غير منشورة</em></span></div></section><section className="dashboard-panel"><header><div><small>الحضور</small><h2>الجلسة القادمة</h2></div></header><div className="session-box"><CalendarDays /><div><strong>التطبيق العملي الأول</strong><p>الخميس · 7:00 م · عرض توضيحي</p></div><button>فتح السجل</button></div></section></div>
  </>;
}

function AdminDashboard() {
  return <>
    <div className="metrics-grid admin-metrics"><Metric label="المستخدمون الفعليون" value="0" note="لا حسابات إنتاجية" icon={UsersRound} /><Metric label="الحجوزات الفعلية" value="0" note="المسار في وضع العرض" icon={CalendarDays} /><Metric label="المدفوعات الفعلية" value="0 ر.س" note="لا بوابة دفع مربوطة" icon={CreditCard} /><Metric label="عناصر الكتالوج" value="7 نماذج" note="3 خدمات · 3 دورات · فرع" icon={LayoutDashboard} /></div>
    <div className="dashboard-grid two-one"><section className="dashboard-panel"><header><div><small>حالة التشغيل</small><h2>جاهزية الوحدات</h2></div><span className="panel-status good">قاعدة البيانات متصلة</span></header><div className="readiness-list">{[["قاعدة البيانات والجداول","جاهز"],["سياسات RLS","جاهز"],["تخزين الملفات الخاص","جاهز"],["موفر الرسائل OTP","بانتظار التعاقد"],["بوابة الدفع","بانتظار الاختيار"],["مزود الاجتماعات","بانتظار الاختيار"]].map(([label,status]) => <span key={label}><b>{label}</b><em className={status === "جاهز" ? "ready" : "pending"}>{status}</em></span>)}</div></section><aside className="dashboard-panel"><header><div><small>أمان القاعدة</small><h2>مراجعة الصلاحيات</h2></div></header><div className="security-score"><ShieldCheck /><strong>RLS مفعل</strong><p>على جميع جداول المجال العام، مع تقييد تعديل الأدوار.</p></div></aside></div>
    <section className="dashboard-panel"><header><div><small>سجل العمليات</small><h2>أمثلة الأحداث التي يسجلها النظام</h2></div></header><div className="data-table audit-table"><div className="table-head"><span>الحدث</span><span>المنفذ</span><span>العنصر</span><span>الوقت</span><span>الحالة</span></div>{[["تعديل خطة علاجية","أخصائي","حالة BR-108","منذ 12 دقيقة","مسجل"],["نشر مادة تدريبية","مدرب","دورة الركبة","منذ ساعة","مسجل"],["تغيير سعر خدمة","مدير نظام","جلسة متابعة","أمس","مسجل"]].map((row) => <div className="table-row" key={row[0]}>{row.map((cell,index) => <span key={cell} data-label={["الحدث","المنفذ","العنصر","الوقت","الحالة"][index]}>{cell}</span>)}</div>)}</div></section>
  </>;
}

export default function PortalExperience({ displayName, initialView }: { displayName: string; initialView: View }) {
  const [view, setView] = useState<View>(initialView);
  const [navOpen, setNavOpen] = useState(false);
  const current = useMemo(() => views.find((item) => item.id === view) ?? views[0], [view]);
  const title = { patient: "لوحة المصاب", student: "لوحة الطالب", specialist: "لوحة الأخصائي", trainer: "لوحة المدرب", admin: "لوحة الإدارة" }[view];

  return <div className="portal-app" dir="rtl"><aside className={`portal-sidebar ${navOpen ? "open" : ""}`}><div className="portal-brand"><span><HeartPulse /></span><strong>بلو ريهاب<small>بيئة العرض التشغيلية</small></strong><button onClick={() => setNavOpen(false)}><PanelRightClose /></button></div><nav>{views.map((item) => <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setNavOpen(false); }}><item.icon /><span>{item.label}</span></button>)}</nav><div className="sidebar-bottom"><a href="/"><ChevronLeft /> العودة للموقع</a><button><Settings /> الإعدادات</button></div></aside>{navOpen && <button className="sidebar-scrim" onClick={() => setNavOpen(false)} aria-label="إغلاق القائمة" />}
    <main className="portal-main"><header className="portal-topbar"><button className="portal-menu" onClick={() => setNavOpen(true)}><Menu /></button><div><small>مرحباً، {displayName}</small><h1>{title}</h1></div><div className="portal-top-actions"><span><Bell /><i /></span><a href="/">الموقع العام</a></div></header><div className="demo-banner"><ShieldCheck /><div><strong>هذه لوحة تفاعلية ببيانات توضيحية فقط.</strong><p>يمكن التبديل بين الأدوار واختبار الواجهات. لا تمثل الأرقام مرضى أو طلاباً أو مدفوعات فعلية.</p></div><button onClick={() => setNavOpen(true)}>تبديل الدور: {current.label}</button></div><div className="portal-content">{view === "patient" && <PatientDashboard />}{view === "student" && <StudentDashboard />}{view === "specialist" && <SpecialistDashboard />}{view === "trainer" && <TrainerDashboard />}{view === "admin" && <AdminDashboard />}</div></main>
  </div>;
}
