import { AlertTriangle, BadgeCheck, Bell, BookOpenCheck, CalendarDays, CalendarPlus, CheckCircle2, CreditCard, GraduationCap, LifeBuoy, LoaderCircle, LogOut, MapPin, RefreshCcw, ShieldCheck, Stethoscope, UserRound, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deliveryLabel, formatCurrency, formatDateTime } from "../lib/format";
import { downloadIcs } from "../lib/invites";
import { AuthenticationRequiredError, loadPortalSnapshot, markNotificationsRead, requestMeetingLink, settlePayments, type PortalSnapshot } from "../lib/platform";
import { supabase } from "../lib/supabase";
import { useAsync } from "../lib/use-async";
import PageShell from "./PageShell";
import { PortalSkeleton } from "./Skeleton";
import { Link } from "react-router-dom";

/**
 * One booking, as the patient needs it on the day.
 *
 * The row used to carry a service name, a time and a reference number. It never
 * said whether the session was remote or at the centre — a patient could only
 * guess from the service name — and never showed the meeting link, so someone
 * who had paid for a remote session had nowhere to join it from. The link was
 * shown once on the payment receipt and then only to the specialist.
 */
function BookingRow({ booking, serviceName, onLinkIssued }: {
  booking: PortalSnapshot["bookings"][number];
  serviceName: string;
  /** Called after a retry actually produces a link, so the parent can refetch and replace this row's data. */
  onLinkIssued: () => void;
}) {
  const remote = booking.mode === "remote";
  const upcoming = new Date(booking.starts_at).getTime() > Date.now();
  const live = upcoming && booking.status === "confirmed";

  return <article>
    <span className="record-icon">{remote ? <Video /> : <MapPin />}</span>
    <div>
      <strong>{serviceName}</strong>
      <small>{formatDateTime(booking.starts_at)} · {deliveryLabel(booking.mode as "remote" | "clinic")}</small>
      {booking.specialist_name && <small>مع {booking.specialist_name}</small>}
      <small>رقم الحجز: <b dir="ltr">{booking.id.slice(0, 8)}</b></small>
      {live && <div className="portal-booking-actions">
        {remote && booking.meeting_url && <a className="button button-small" href={booking.meeting_url} target="_blank" rel="noreferrer">
          <Video /> دخول الجلسة
        </a>}
        {remote && !booking.meeting_url && <MeetingLinkRetry bookingId={booking.id} onIssued={onLinkIssued} />}
        <button className="button button-small button-secondary" type="button" onClick={() => downloadIcs({
          bookingId: booking.id, serviceName, startsAt: booking.starts_at,
          specialistName: booking.specialist_name ?? "الأخصائي المعالج",
          isRemote: remote, meetingUrl: booking.meeting_url,
        })}><CalendarPlus /> أضف إلى التقويم</button>
      </div>}
    </div>
    <em>{statusLabel(booking.status)}</em>
  </article>;
}

/**
 * Recovery path for the one case `issueMeetingLinkIfRemote` (runtime-api.ts)
 * cannot fix on its own: it never throws past a failed Google Calendar call,
 * by design — a hiccup there must not look like a failed payment. That
 * correctly protects the booking, but it also meant a real failure had no way
 * back: the portal just said "the link will appear before the appointment"
 * forever, on a booking that was already paid and confirmed. `requestMeetingLink`
 * (`POST /bookings/:id/meet`) existed for exactly this and was never called
 * from anywhere — this is that missing call site.
 */
function MeetingLinkRetry({ bookingId, onIssued }: { bookingId: string; onIssued: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function retry() {
    setBusy(true);
    setError("");
    try {
      const result = await requestMeetingLink(bookingId);
      if (result.meetingUrl) onIssued();
      else setError("لم يصلنا رابط بعد. تُنشئ المنصة الرابط تلقائياً عادةً — إن استمر الأمر، تواصل معنا.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إنشاء الرابط الآن.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="meeting-link-retry">
    <button className="button button-small button-secondary" type="button" disabled={busy} onClick={() => void retry()}>
      {busy ? <LoaderCircle className="spin" /> : <Video />} {busy ? "جارٍ الإنشاء…" : "طلب رابط الجلسة"}
    </button>
    {error
      ? <small className="application-hint"><AlertTriangle /> {error}</small>
      : <small className="application-hint">لم يُنشأ رابط الجلسة بعد. اطلبه الآن، أو انتظر — يُنشأ تلقائياً غالباً قبل الموعد.</small>}
  </div>;
}

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

/** What each stored status means to the person who filed the request. */
const SUPPORT_STATUS: Record<string, string> = {
  new: "قيد الاستلام", in_progress: "قيد المعالجة",
  resolved: "تم الحل", closed: "مغلق",
};

export default function ConnectedPortal() {
  const fetchPortal = useCallback(async (): Promise<PortalSnapshot | null> => {
    try {
      return await loadPortalSnapshot();
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        const returnTo = encodeURIComponent("/portal");
        window.location.href = `/login?returnTo=${returnTo}`;
        return null;
      }
      throw reason;
    }
  }, []);

  const { data, loading, error, reload, setData } = useAsync(fetchPortal, [fetchPortal]);

  // Reconciliation runs *after* the page is on screen, not before it.
  //
  // It re-reads every open order from the payment gateway, which took over a
  // second on its own, and the account page used to sit behind it showing a
  // spinner. Nothing here is needed to render: it only matters when an order was
  // paid but never confirmed, so it runs in the background and the page is
  // refreshed only if it actually changed something.
  useEffect(() => {
    let alive = true;
    void settlePayments()
      .then((result) => { if (alive && result.settled > 0) void reload(); })
      .catch(() => undefined);
    return () => { alive = false; };
    // `reload` is stable (see `useAsync`), so this still only runs once on
    // mount — listing it is what the rule actually asks for, not a behaviour
    // change.
  }, [reload]);

  async function markAllRead() {
    setData((current) => current && { ...current, notifications: current.notifications.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })) });
    await markNotificationsRead().catch(() => void reload());
  }

  async function markOneRead(id: string) {
    setData((current) => current && { ...current, notifications: current.notifications.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)) });
    await markNotificationsRead([id]).catch(() => void reload());
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return <PageShell><section className="portal-live-page"><div className="container">
    {loading && <PortalSkeleton />}
    {!loading && error && <div className="catalog-message"><strong>تعذر تحميل الحساب.</strong><p>{error}</p><button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button></div>}
    {!loading && data && <>
      <header className="portal-live-head"><div><span className="eyebrow"><UserRound /> الحساب الشخصي</span><h1>مرحبًا، {data.profile?.full_name || "المستخدم"}</h1><p>تابع حجوزاتك ودوراتك ومدفوعاتك من مكان واحد.</p></div><div className="portal-head-actions">{data.profile?.roles.includes("admin") && <Link className="button button-secondary" to="/admin"><ShieldCheck /> لوحة الإدارة</Link>}{data.profile?.roles.includes("specialist") && <Link className="button button-secondary" to="/specialist"><Stethoscope /> لوحة الأخصائي</Link>}{data.profile?.roles.includes("trainer") && <Link className="button button-secondary" to="/trainer"><GraduationCap /> لوحة المدرب</Link>}{!data.profile?.roles.some((role) => ["specialist", "trainer"].includes(role)) && <Link className="button button-secondary" to="/join"><BadgeCheck /> انضم كمقدم خدمة</Link>}<button className="button button-secondary" onClick={() => void signOut()}><LogOut /> تسجيل الخروج</button></div></header>
      <div className="portal-live-metrics"><article><CalendarDays /><span><small>الحجوزات</small><strong>{data.bookings.length}</strong></span></article><article><BookOpenCheck /><span><small>الدورات</small><strong>{data.enrollments.length}</strong></span></article><article><CreditCard /><span><small>المدفوعات</small><strong>{data.payments.length}</strong></span></article><article><Bell /><span><small>الإشعارات</small><strong>{data.notifications.filter((item) => !item.read_at).length}</strong></span></article></div>
      <div className="portal-live-grid">
        <section className="portal-live-panel"><header><CalendarDays /><div><small>الرعاية</small><h2>حجوزاتي</h2></div><Link to="/booking">حجز جديد</Link></header>{data.bookings.length ? <div className="portal-record-list">{data.bookings.map((item) => <BookingRow key={item.id} booking={item} serviceName={data.services[item.service_id] || "جلسة علاج طبيعي"} onLinkIssued={() => void reload()} />)}</div> : <div className="portal-empty"><CalendarDays /><p>لا توجد حجوزات في حسابك.</p><Link className="button" to="/booking">احجز جلستك الأولى</Link></div>}</section>
        <section className="portal-live-panel"><header><BookOpenCheck /><div><small>التعلم</small><h2>دوراتي</h2></div><Link to="/courses">استعراض الدورات</Link></header>{data.enrollments.length ? <div className="portal-record-list">{data.enrollments.map((item) => <article key={item.id}><span className="record-icon"><BookOpenCheck /></span><div><strong>{data.courses[item.course_id] || "دورة تأهيلية"}</strong><small>التقدم: {item.progress}%</small><div className="portal-progress"><i style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} /></div></div><em>{statusLabel(item.status)}</em></article>)}</div> : <div className="portal-empty"><BookOpenCheck /><p>لم تسجل في دورة بعد.</p><Link className="button" to="/courses">اختر دورة</Link></div>}</section>
        <section className="portal-live-panel"><header><CreditCard /><div><small>الحسابات</small><h2>المدفوعات</h2></div></header>{data.payments.length ? <div className="portal-record-list">{data.payments.map((item) => <article key={item.id}><span className="record-icon"><CreditCard /></span><div><strong>{formatCurrency(item.amount)}</strong><small>طلب: <b dir="ltr">{item.order_number}</b></small><small>{formatDateTime(item.created_at)}</small></div><em>{statusLabel(item.status)}</em></article>)}</div> : <div className="portal-empty"><CreditCard /><p>لا توجد عمليات دفع بعد.</p></div>}</section>
        {/* Support, where somebody looking for help will actually pass.
            The form has always existed at /contact and was linked only from the
            footer, so the client could not find it — and once filed, a request
            vanished: `support_requests_own_read` allowed the sender to see it
            and nothing read it back. Both halves are fixed here, the entry
            point and the receipt. */}
        <section className="portal-live-panel"><header><LifeBuoy /><div><small>المساعدة</small><h2>الدعم والشكاوى</h2></div><Link to="/contact">طلب جديد</Link></header>{data.support.length ? <div className="portal-record-list">{data.support.map((item) => <article key={item.id}><span className="record-icon"><LifeBuoy /></span><div><strong>{item.subject}</strong><small className="admin-quote">{item.message}</small><small>رقم الطلب: <b dir="ltr">{item.id.slice(0, 8)}</b> · {formatDateTime(item.created_at)}</small></div><em>{SUPPORT_STATUS[item.status] ?? item.status}</em></article>)}</div> : <div className="portal-empty"><LifeBuoy /><p>لا توجد طلبات دعم. إن واجهتك أي مشكلة أو لديك شكوى، أرسلها وسنتابعها معك.</p><Link className="button" to="/contact">تواصل معنا</Link></div>}</section>
        <section className="portal-live-panel"><header><Bell /><div><small>التحديثات</small><h2>الإشعارات</h2></div>{data.notifications.some((item) => !item.read_at) && <button className="link-button" type="button" onClick={() => void markAllRead()}>تعليم الكل كمقروء</button>}</header>{data.notifications.length ? <div className="portal-record-list">{data.notifications.map((item) => <article key={item.id} className={!item.read_at ? "unread" : ""}><span className="record-icon">{item.read_at ? <CheckCircle2 /> : <Bell />}</span><div><strong>{item.title}</strong><small>{item.body}</small><small>{formatDateTime(item.created_at)}</small></div>{!item.read_at && <button className="link-button" type="button" aria-label={`تعليم "${item.title}" كمقروء`} onClick={() => void markOneRead(item.id)}>تم</button>}</article>)}</div> : <div className="portal-empty"><Bell /><p>لا توجد إشعارات جديدة.</p></div>}</section>
      </div>
    </>}
  </div></section></PageShell>;
}
