import { Bell, BookOpenCheck, CalendarDays, CheckCircle2, CreditCard, LoaderCircle, LogOut, RefreshCcw, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency, formatDateTime } from "../lib/format";
import { AuthenticationRequiredError, loadPortalSnapshot, type PortalSnapshot } from "../lib/platform";
import { supabase } from "../lib/supabase";
import PageShell from "./PageShell";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "مسودة",
    pending_payment: "بانتظار الدفع",
    confirmed: "مؤكد",
    active: "نشط",
    completed: "مكتمل",
    cancelled: "ملغي",
    paid: "مدفوع",
    failed: "متعذر",
  };
  return labels[status] ?? status;
}

export default function ConnectedPortal() {
  const [data, setData] = useState<PortalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try { setData(await loadPortalSnapshot()); }
    catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        const returnTo = encodeURIComponent("/portal");
        window.location.href = `/login?returnTo=${returnTo}`;
        return;
      }
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الحساب");
    } finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return <PageShell><section className="portal-live-page"><div className="container">
    {loading && <div className="booking-loader"><LoaderCircle className="spin" /><p>جار تحميل حسابك…</p></div>}
    {!loading && error && <div className="catalog-message"><strong>تعذر تحميل الحساب.</strong><p>{error}</p><button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button></div>}
    {!loading && data && <>
      <header className="portal-live-head"><div><span className="eyebrow"><UserRound /> الحساب الشخصي</span><h1>مرحبًا، {data.profile?.full_name || "المستخدم"}</h1><p>جميع المعلومات أدناه مقروءة من سجلات حسابك في Supabase.</p></div><button className="button button-secondary" onClick={() => void signOut()}><LogOut /> تسجيل الخروج</button></header>
      <div className="portal-live-metrics"><article><CalendarDays /><span><small>الحجوزات</small><strong>{data.bookings.length}</strong></span></article><article><BookOpenCheck /><span><small>الدورات</small><strong>{data.enrollments.length}</strong></span></article><article><CreditCard /><span><small>المدفوعات</small><strong>{data.payments.length}</strong></span></article><article><Bell /><span><small>الإشعارات</small><strong>{data.notifications.filter((item) => !item.read_at).length}</strong></span></article></div>
      <div className="portal-live-grid">
        <section className="portal-live-panel"><header><CalendarDays /><div><small>الرعاية</small><h2>حجوزاتي</h2></div><a href="/booking">حجز جديد</a></header>{data.bookings.length ? <div className="portal-record-list">{data.bookings.map((item) => <article key={item.id}><span className="record-icon"><CalendarDays /></span><div><strong>{data.services[item.service_id] || "جلسة علاج طبيعي"}</strong><small>{formatDateTime(item.starts_at)}</small><small>رقم الحجز: <b dir="ltr">{item.id.slice(0, 8)}</b></small></div><em>{statusLabel(item.status)}</em></article>)}</div> : <div className="portal-empty"><CalendarDays /><p>لا توجد حجوزات في حسابك.</p><a className="button" href="/booking">احجز جلستك الأولى</a></div>}</section>
        <section className="portal-live-panel"><header><BookOpenCheck /><div><small>التعلم</small><h2>دوراتي</h2></div><a href="/courses">استعراض الدورات</a></header>{data.enrollments.length ? <div className="portal-record-list">{data.enrollments.map((item) => <article key={item.id}><span className="record-icon"><BookOpenCheck /></span><div><strong>{data.courses[item.course_id] || "دورة تأهيلية"}</strong><small>التقدم: {item.progress}%</small><div className="portal-progress"><i style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} /></div></div><em>{statusLabel(item.status)}</em></article>)}</div> : <div className="portal-empty"><BookOpenCheck /><p>لم تسجل في دورة بعد.</p><a className="button" href="/courses">اختر دورة</a></div>}</section>
        <section className="portal-live-panel"><header><CreditCard /><div><small>الحسابات</small><h2>المدفوعات</h2></div></header>{data.payments.length ? <div className="portal-record-list">{data.payments.map((item) => <article key={item.id}><span className="record-icon"><CreditCard /></span><div><strong>{formatCurrency(item.amount)}</strong><small>طلب: <b dir="ltr">{item.order_number}</b></small><small>{formatDateTime(item.created_at)}</small></div><em>{statusLabel(item.status)}</em></article>)}</div> : <div className="portal-empty"><CreditCard /><p>لا توجد عمليات دفع بعد.</p></div>}</section>
        <section className="portal-live-panel"><header><Bell /><div><small>التحديثات</small><h2>الإشعارات</h2></div></header>{data.notifications.length ? <div className="portal-record-list">{data.notifications.map((item) => <article key={item.id} className={!item.read_at ? "unread" : ""}><span className="record-icon">{item.read_at ? <CheckCircle2 /> : <Bell />}</span><div><strong>{item.title}</strong><small>{item.body}</small><small>{formatDateTime(item.created_at)}</small></div></article>)}</div> : <div className="portal-empty"><Bell /><p>لا توجد إشعارات جديدة.</p></div>}</section>
      </div>
    </>}
  </div></section></PageShell>;
}
