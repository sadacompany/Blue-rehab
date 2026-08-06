import { AlertCircle, BadgeCheck, BookOpenCheck, CalendarDays, CheckCircle2, CreditCard, LifeBuoy, LoaderCircle, RefreshCcw, ShieldCheck, Users, Wallet, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency, formatDateTime } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import {
  loadAdminSnapshot,
  NotAnAdminError,
  reviewApplication,
  setSupportStatus,
  setUserRoles,
  type AdminSnapshot,
} from "../lib/admin";
import PageShell from "./PageShell";

const ALL_ROLES = ["patient", "student", "specialist", "trainer", "receptionist", "admin"] as const;

const ROLE_LABEL: Record<string, string> = {
  patient: "مستفيد",
  student: "طالب",
  specialist: "أخصائي",
  trainer: "مدرب",
  receptionist: "موظف استقبال",
  admin: "إدارة",
};

const BOOKING_STATUS: Record<string, string> = {
  draft: "مسودة", pending_payment: "بانتظار الدفع", confirmed: "مؤكد",
  rescheduled: "أُعيد جدولته", cancelled: "ملغي", completed: "مكتمل",
  no_show: "لم يحضر", refunded: "مسترد",
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "معلق", processing: "قيد التنفيذ", succeeded: "مدفوع",
  failed: "فشل", cancelled: "ملغي", refunded: "مسترد", partially_refunded: "مسترد جزئياً",
};

const SUPPORT_STATUS: Record<string, string> = {
  new: "جديد", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلق",
};

type Tab = "overview" | "applications" | "users" | "bookings" | "payments" | "support";

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | number; hint?: string }) {
  return <article>{icon}<span><small>{label}</small><strong>{value}</strong>{hint && <i>{hint}</i>}</span></article>;
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setData(await loadAdminSnapshot());
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/admin")}`;
        return;
      }
      if (reason instanceof NotAnAdminError) { setDenied(true); return; }
      setError(reason instanceof Error ? reason.message : "تعذر تحميل اللوحة");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try { await action(); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  if (loading) return <PageShell><section className="section"><div className="container"><div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ تحميل لوحة الإدارة…</p></div></div></section></PageShell>;

  if (denied) return <PageShell><section className="section"><div className="container catalog-message">
    <ShieldCheck /><strong>هذه اللوحة مخصصة للإدارة.</strong>
    <p>حسابك لا يملك صلاحية إدارية.</p>
    <a className="button" href="/portal">الذهاب إلى حسابي</a>
  </div></section></PageShell>;

  if (!data) return <PageShell><section className="section"><div className="container catalog-message">
    <strong>تعذر تحميل اللوحة.</strong><p>{error}</p>
    <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button>
  </div></section></PageShell>;

  const { overview } = data;
  const pendingApps = data.applications.filter((item) => item.status === "pending");

  return <PageShell><section className="admin-page"><div className="container">
    <header className="specialist-head">
      <div>
        <span className="eyebrow"><ShieldCheck /> لوحة الإدارة</span>
        <h1>إدارة المنصة</h1>
        <p>المستخدمون والطلبات والحجوزات والمدفوعات والدعم في مكان واحد.</p>
      </div>
      <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> تحديث</button>
    </header>

    {error && <div className="form-error" role="alert">{error}</div>}

    <div className="specialist-tabs" role="tablist">
      {([
        ["overview", "نظرة عامة"],
        ["applications", `طلبات الانضمام${pendingApps.length ? ` (${pendingApps.length})` : ""}`],
        ["users", `المستخدمون (${data.users.length})`],
        ["bookings", `الحجوزات (${data.bookings.length})`],
        ["payments", `المدفوعات (${data.payments.length})`],
        ["support", `الدعم${overview.support.open ? ` (${overview.support.open})` : ""}`],
      ] as [Tab, string][]).map(([key, label]) => <button
        key={key} role="tab" aria-selected={tab === key}
        className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}
      >{label}</button>)}
    </div>

    {tab === "overview" && <>
      <div className="portal-live-metrics admin-metrics">
        <Metric icon={<Wallet />} label="المحصّل" value={formatCurrency(overview.revenue.collected)} hint={`آخر ٣٠ يوماً: ${formatCurrency(overview.revenue.collected_30d)}`} />
        <Metric icon={<CreditCard />} label="مستحق غير محصّل" value={formatCurrency(overview.revenue.outstanding)} hint={`${overview.revenue.failed_count} عملية فاشلة`} />
        <Metric icon={<CalendarDays />} label="حجوزات اليوم" value={overview.bookings.today} hint={`${overview.bookings.upcoming} قادمة مؤكدة`} />
        <Metric icon={<Users />} label="المستخدمون" value={overview.users.total} hint={`${overview.users.specialists} أخصائي · ${overview.users.trainers} مدرب`} />
      </div>
      <div className="portal-live-metrics admin-metrics">
        <Metric icon={<BadgeCheck />} label="طلبات انضمام معلّقة" value={overview.applications.pending} hint={`${overview.applications.approved} مقبول`} />
        <Metric icon={<CheckCircle2 />} label="حجوزات مؤكدة" value={overview.bookings.confirmed} hint={`${overview.bookings.pending_payment} بانتظار الدفع`} />
        <Metric icon={<BookOpenCheck />} label="تسجيلات الدورات" value={overview.courses.enrollments} hint={`${overview.courses.published} دورة منشورة`} />
        <Metric icon={<LifeBuoy />} label="طلبات دعم مفتوحة" value={overview.support.open} hint={`${overview.capacity.free_slots} موعد متاح`} />
      </div>
      {overview.applications.pending > 0 && <div className="admin-callout">
        <AlertCircle /><span>لديك {overview.applications.pending} طلب انضمام بانتظار المراجعة.</span>
        <button className="button button-small" onClick={() => setTab("applications")}>مراجعتها الآن</button>
      </div>}
    </>}

    {tab === "applications" && <section className="specialist-panel">
      {data.applications.length ? <div className="admin-list">
        {data.applications.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{item.displayName}</strong>
              <small>{item.kind === "specialist" ? "أخصائي" : "مدرب"} · {item.title}</small>
              <small>{item.yearsExperience} سنة خبرة{item.licenseNumber ? ` · ترخيص ${item.licenseNumber}` : ""}</small>
              {item.specialties.length > 0 && <small>التخصصات: {item.specialties.join("، ")}</small>}
              {item.bio && <small className="admin-quote">{item.bio}</small>}
              {item.credentialsNote && <small className="admin-quote">المؤهلات: {item.credentialsNote}</small>}
              {(item.contactEmail || item.contactPhone) && <small dir="ltr">{[item.contactEmail, item.contactPhone].filter(Boolean).join(" · ")}</small>}
            </div>
            <em>{item.status === "pending" ? "قيد المراجعة" : item.status === "approved" ? "مقبول" : item.status === "rejected" ? "مرفوض" : "مسحوب"}</em>
          </div>
          {item.status === "pending" && <div className="admin-row-actions">
            <input placeholder="ملاحظة للمتقدم (اختيارية)" value={note[item.id] ?? ""} onChange={(event) => setNote({ ...note, [item.id]: event.target.value })} />
            <button className="button button-small" disabled={busy === item.id} onClick={() => void run(item.id, () => reviewApplication(item.id, true, note[item.id] ?? ""))}>
              {busy === item.id ? <LoaderCircle className="spin" /> : <CheckCircle2 />} اعتماد
            </button>
            <button className="button button-small button-ghost" disabled={busy === item.id} onClick={() => void run(item.id, () => reviewApplication(item.id, false, note[item.id] ?? ""))}>
              <XCircle /> رفض
            </button>
          </div>}
          {item.reviewNote && item.status !== "pending" && <p className="application-note">ملاحظة: {item.reviewNote}</p>}
        </article>)}
      </div> : <div className="portal-empty"><BadgeCheck /><p>لا توجد طلبات انضمام.</p></div>}
    </section>}

    {tab === "users" && <section className="specialist-panel">
      <div className="admin-list">
        {data.users.map((user) => <article key={user.id} className="admin-row">
          <div className="admin-row-main">
            <div>
              <strong>{user.fullName}</strong>
              <small dir="ltr">{user.phone ?? "—"}</small>
              <small>انضم في {formatDateTime(user.createdAt)}</small>
            </div>
            <em>{user.roles.map((role) => ROLE_LABEL[role] ?? role).join("، ") || "—"}</em>
          </div>
          <div className="admin-row-actions role-picker">
            {ALL_ROLES.map((role) => {
              const active = user.roles.includes(role);
              return <button
                key={role} type="button" className={active ? "chip selected" : "chip"} disabled={busy === user.id}
                aria-pressed={active}
                onClick={() => void run(user.id, () => setUserRoles(user.id, active ? user.roles.filter((r) => r !== role) : [...user.roles, role]))}
              >{ROLE_LABEL[role]}</button>;
            })}
          </div>
        </article>)}
      </div>
    </section>}

    {tab === "bookings" && <section className="specialist-panel">
      {data.bookings.length ? <div className="admin-list">
        {data.bookings.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{item.patientName}</strong>
              <small>{item.serviceName} · {item.specialistName}</small>
              <small>{formatDateTime(item.startsAt)} · {item.mode === "remote" ? "عن بُعد" : "في المركز"}</small>
            </div>
            <em>{BOOKING_STATUS[item.status] ?? item.status}{item.total !== null ? ` · ${formatCurrency(item.total)}` : ""}</em>
          </div>
        </article>)}
      </div> : <div className="portal-empty"><CalendarDays /><p>لا توجد حجوزات.</p></div>}
    </section>}

    {tab === "payments" && <section className="specialist-panel">
      {data.payments.length ? <div className="admin-list">
        {data.payments.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{formatCurrency(item.amount)} · {item.kind === "booking" ? "جلسة" : "دورة"}</strong>
              <small>{item.userName}</small>
              <small dir="ltr">{item.orderNumber}</small>
              <small>{item.paidAt ? `دُفع في ${formatDateTime(item.paidAt)}` : `أُنشئ في ${formatDateTime(item.createdAt)}`}</small>
              {item.failureReason && <small className="admin-quote">سبب الفشل: {item.failureReason}</small>}
            </div>
            <em>{PAYMENT_STATUS[item.status] ?? item.status}</em>
          </div>
        </article>)}
      </div> : <div className="portal-empty"><CreditCard /><p>لا توجد مدفوعات.</p></div>}
    </section>}

    {tab === "support" && <section className="specialist-panel">
      {data.support.length ? <div className="admin-list">
        {data.support.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{item.subject}</strong>
              <small>{item.name}{item.email ? ` · ${item.email}` : ""}{item.phone ? ` · ${item.phone}` : ""}</small>
              <small className="admin-quote">{item.message}</small>
              <small>{formatDateTime(item.createdAt)}</small>
            </div>
            <em>{SUPPORT_STATUS[item.status] ?? item.status}</em>
          </div>
          <div className="admin-row-actions role-picker">
            {Object.entries(SUPPORT_STATUS).map(([value, label]) => <button
              key={value} type="button" className={item.status === value ? "chip selected" : "chip"} disabled={busy === item.id}
              onClick={() => void run(item.id, () => setSupportStatus(item.id, value))}
            >{label}</button>)}
          </div>
        </article>)}
      </div> : <div className="portal-empty"><LifeBuoy /><p>لا توجد طلبات دعم.</p></div>}
    </section>}
  </div></section></PageShell>;
}
