import { AlertCircle, BadgeCheck, BookOpenCheck, CalendarDays, CheckCircle2, CreditCard, FileText, GraduationCap, LifeBuoy, LoaderCircle, Plus, RefreshCcw, ShieldCheck, Users, Wallet, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { countLabel, formatCurrency, formatDateTime } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import { cvDownloadUrl, loadTrainingApplications, setTrainingStatus, type TrainingApplication } from "../lib/training";
import {
  assignCourseTrainer,
  loadAdminSnapshot,
  reviewCourse,
  unpublishCourse,
  NotAnAdminError,
  reviewApplication,
  saveService,
  setContentStatus,
  setSupportStatus,
  setUserRoles,
  type AdminService,
  type AdminSnapshot,
} from "../lib/admin";
import PageShell from "./PageShell";
import { SkeletonLine, SkeletonMetrics } from "./Skeleton";

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

/** The register of student trainees the clinics draw from. */
const TRAINING_STATUS: Record<string, string> = {
  new: "جديد", reviewing: "قيد المراجعة", shortlisted: "مرشح",
  placed: "تم إلحاقه بعيادة", declined: "معتذر عنه", archived: "مؤرشف",
};

const SUPPORT_STATUS: Record<string, string> = {
  new: "جديد", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلق",
};

type Tab = "overview" | "applications" | "users" | "catalogue" | "content" | "bookings" | "payments" | "support" | "training";

const COURSE_REVIEW: Record<string, string> = {
  draft: "مسودة لدى المدرب", in_review: "بانتظار المراجعة",
  published: "معتمدة ومنشورة", archived: "موقوفة",
};

const CONTENT_LABEL: Record<string, string> = {
  articles: "مقال", research_reviews: "مراجعة بحثية", rehab_programs: "برنامج علاجي",
};
const CONTENT_STATUS: Record<string, string> = {
  draft: "مسودة", in_review: "قيد المراجعة", published: "منشور", archived: "مؤرشف",
};

/** Create or edit a service. Pricing is administrative — see the RLS note. */
function ServiceEditor({ service, onSaved }: { service?: AdminService; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: service?.name ?? "",
    price: String(service?.price ?? ""),
    durationMinutes: String(service?.durationMinutes ?? "45"),
    modes: service?.modes ?? ["remote"],
    isActive: service?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggleMode = (mode: string) =>
    setForm({ ...form, modes: form.modes.includes(mode) ? form.modes.filter((m) => m !== mode) : [...form.modes, mode] });

  async function submit() {
    if (form.name.trim().length < 2) { setError("اسم الخدمة مطلوب"); return; }
    if (!form.modes.length) { setError("اختر طريقة جلسة واحدة على الأقل"); return; }
    setBusy(true); setError("");
    try {
      await saveService({
        id: service?.id, name: form.name, price: Number(form.price) || 0,
        durationMinutes: Number(form.durationMinutes) || 45, modes: form.modes, isActive: form.isActive,
      });
      if (!service) setForm({ name: "", price: "", durationMinutes: "45", modes: ["remote"], isActive: true });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الحفظ");
    } finally { setBusy(false); }
  }

  return <div className="specialist-exercise-composer">
    <input placeholder="اسم الخدمة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
    <div className="availability-row">
      <label><span>السعر (ر.س)</span><input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
      <label><span>المدة (دقيقة)</span><input type="number" min={5} step={5} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></label>
    </div>
    <div className="role-picker admin-row-actions">
      {[["remote", "عن بُعد"], ["clinic", "في المركز"]].map(([value, label]) => <button
        key={value} type="button" className={form.modes.includes(value) ? "chip selected" : "chip"}
        aria-pressed={form.modes.includes(value)} onClick={() => toggleMode(value)}
      >{label}</button>)}
      <button type="button" className={form.isActive ? "chip selected" : "chip"} aria-pressed={form.isActive}
        onClick={() => setForm({ ...form, isActive: !form.isActive })}>{form.isActive ? "مفعّلة" : "معطّلة"}</button>
    </div>
    {error && <p className="specialist-error">{error}</p>}
    <button className="button button-small" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} {service ? "حفظ التعديل" : "إضافة خدمة"}
    </button>
  </div>;
}

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
  const [training, setTraining] = useState<TrainingApplication[]>([]);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      // Started together, not one after the other: the register is a separate
      // request only because a failure to read it should not take the whole
      // dashboard down, and awaiting it in sequence added a round trip to every
      // load for no reason.
      const [snapshot, applications] = await Promise.all([
        loadAdminSnapshot(),
        loadTrainingApplications().catch(() => []),
      ]);
      setData(snapshot);
      setTraining(applications);
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

  if (loading) return <PageShell><section className="admin-page"><div className="container" aria-busy="true">
    <div className="skeleton-head"><SkeletonLine width="110px" height={13} /><SkeletonLine width="240px" height={34} /></div>
    <SkeletonMetrics /><SkeletonMetrics />
  </div></section></PageShell>;

  if (denied) return <PageShell><section className="section"><div className="container catalog-message">
    <ShieldCheck /><strong>هذه اللوحة مخصصة للإدارة.</strong>
    <p>حسابك لا يملك صلاحية إدارية.</p>
    <Link className="button" to="/portal">الذهاب إلى حسابي</Link>
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
        ["catalogue", `الخدمات والدورات${data.courses.filter((c) => c.reviewStatus === "in_review").length ? ` (${data.courses.filter((c) => c.reviewStatus === "in_review").length})` : ""}`],
        ["content", `المحتوى (${data.content.length})`],
        ["bookings", `الحجوزات (${data.bookings.length})`],
        ["payments", `المدفوعات (${data.payments.length})`],
        ["support", `الدعم${overview.support.open ? ` (${overview.support.open})` : ""}`],
        ["training", `التدريب الصيفي${training.filter((t) => t.status === "new").length ? ` (${training.filter((t) => t.status === "new").length})` : ""}`],
      ] as [Tab, string][]).map(([key, label]) => <button
        key={key} role="tab" aria-selected={tab === key}
        className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}
      >{label}</button>)}
    </div>

    {tab === "overview" && <>
      <div className="portal-live-metrics admin-metrics">
        <Metric icon={<Wallet />} label="المحصّل" value={formatCurrency(overview.revenue.collected)} hint={`آخر ٣٠ يوماً: ${formatCurrency(overview.revenue.collected_30d)}`} />
        <Metric icon={<CreditCard />} label="مستحق غير محصّل" value={formatCurrency(overview.revenue.outstanding)} hint={`${countLabel(overview.revenue.failed_count, ["عملية فاشلة واحدة","عمليتان فاشلتان","عمليات فاشلة","عملية فاشلة"])}`} />
        <Metric icon={<CalendarDays />} label="حجوزات اليوم" value={overview.bookings.today} hint={`${countLabel(overview.bookings.upcoming, ["جلسة قادمة مؤكدة","جلستان قادمتان","جلسات قادمة مؤكدة","جلسة قادمة مؤكدة"])}`} />
        <Metric icon={<Users />} label="المستخدمون" value={overview.users.total} hint={`${countLabel(overview.users.specialists, ["أخصائي واحد","أخصائيان","أخصائيين","أخصائياً"])} · ${countLabel(overview.users.trainers, ["مدرب واحد","مدربان","مدربين","مدرباً"])}`} />
      </div>
      <div className="portal-live-metrics admin-metrics">
        <Metric icon={<BadgeCheck />} label="طلبات انضمام معلّقة" value={overview.applications.pending} hint={`${countLabel(overview.applications.approved, ["طلب مقبول واحد","طلبان مقبولان","طلبات مقبولة","طلباً مقبولاً"])}`} />
        <Metric icon={<CheckCircle2 />} label="حجوزات مؤكدة" value={overview.bookings.confirmed} hint={`${countLabel(overview.bookings.pending_payment, ["حجز بانتظار الدفع","حجزان بانتظار الدفع","حجوزات بانتظار الدفع","حجزاً بانتظار الدفع"])}`} />
        <Metric icon={<BookOpenCheck />} label="تسجيلات الدورات" value={overview.courses.enrollments} hint={`${countLabel(overview.courses.published, ["دورة منشورة واحدة","دورتان منشورتان","دورات منشورة","دورة منشورة"])}`} />
        <Metric icon={<LifeBuoy />} label="طلبات دعم مفتوحة" value={overview.support.open} hint={`${countLabel(overview.capacity.free_slots, ["موعد متاح واحد","موعدان متاحان","مواعيد متاحة","موعداً متاحاً"])}`} />
      </div>
      {data.courses.filter((c) => c.reviewStatus === "in_review").length > 0 && <div className="admin-callout">
        <AlertCircle /><span>{countLabel(data.courses.filter((c) => c.reviewStatus === "in_review").length, ["دورة واحدة بانتظار الاعتماد.","دورتان بانتظار الاعتماد.","دورات بانتظار الاعتماد.","دورة بانتظار الاعتماد."])}</span>
        <button className="button button-small" onClick={() => setTab("catalogue")}>مراجعتها الآن</button>
      </div>}
      {overview.applications.pending > 0 && <div className="admin-callout">
        <AlertCircle /><span>لديك {countLabel(overview.applications.pending, ["طلب انضمام واحد","طلبا انضمام","طلبات انضمام","طلب انضمام"])} بانتظار المراجعة.</span>
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
              {item.credentialFiles.length > 0 && <small>مرفقات المؤهلات: {item.credentialFiles.length} ملف</small>}
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

    {tab === "catalogue" && <section className="specialist-panel">
      <h3 className="trainer-section-title">الخدمات — يحدد سعرها ما يُخصم من المستفيد</h3>
      <div className="admin-list">
        {data.services.map((service) => <article key={service.id} className="admin-row">
          <div className="admin-row-main">
            <div>
              <strong>{service.name}</strong>
              <small>{formatCurrency(service.price)} · {service.durationMinutes} دقيقة</small>
              <small>{service.modes.map((m) => (m === "remote" ? "عن بُعد" : "في المركز")).join("، ")}</small>
            </div>
            <em>{service.isActive ? "مفعّلة" : "معطّلة"}</em>
          </div>
          <details><summary className="link-button">تعديل</summary><ServiceEditor service={service} onSaved={() => void reload()} /></details>
        </article>)}
      </div>
      <details className="specialist-new-plan">
        <summary><Plus /> خدمة جديدة</summary>
        <div className="specialist-plan-composer"><ServiceEditor onSaved={() => void reload()} /></div>
      </details>

<h3 className="trainer-section-title">الدورات — المراجعة والإسناد</h3>
      <div className="admin-list">
        {data.courses.map((course) => <article key={course.id} className={`admin-row status-${course.reviewStatus}`}>
          <div className="admin-row-main">
            <div>
              <strong>{course.title}</strong>
              {course.summary && <small className="admin-quote">{course.summary}</small>}
              <small>{formatCurrency(course.price)} · {countLabel(course.modules, ["وحدة واحدة","وحدتان","وحدات","وحدة"])}</small>
            </div>
            <em>{COURSE_REVIEW[course.reviewStatus] ?? course.reviewStatus}</em>
          </div>
          {course.reviewStatus === "in_review" && <div className="admin-row-actions">
            <input placeholder="ملاحظة للمدرب (اختيارية)" value={note[course.id] ?? ""} onChange={(e) => setNote({ ...note, [course.id]: e.target.value })} />
            <button className="button button-small" disabled={busy === course.id}
              onClick={() => void run(course.id, () => reviewCourse(course.id, true, note[course.id] ?? ""))}>
              <CheckCircle2 /> اعتماد ونشر
            </button>
            <button className="button button-small button-ghost" disabled={busy === course.id}
              onClick={() => void run(course.id, () => reviewCourse(course.id, false, note[course.id] ?? ""))}>
              <XCircle /> إعادة للمدرب
            </button>
          </div>}
          {course.reviewStatus === "published" && <div className="admin-row-actions">
            <button className="button button-small button-ghost" disabled={busy === course.id}
              onClick={() => void run(course.id, () => unpublishCourse(course.id, note[course.id] ?? ""))}>إيقاف النشر</button>
          </div>}
          <div className="admin-row-actions role-picker">
            <small className="application-hint">المدرب:</small>
            {data.trainers.length === 0 && <small className="application-hint">لا يوجد مدربون معتمدون بعد.</small>}
            {data.trainers.map((trainer) => <button key={trainer.id} type="button"
              className={course.trainerId === trainer.id ? "chip selected" : "chip"} disabled={busy === course.id}
              onClick={() => void run(course.id, () => assignCourseTrainer(course.id, course.trainerId === trainer.id ? null : trainer.id))}
            >{trainer.fullName}</button>)}
          </div>
        </article>)}
      </div>
    </section>}

    {tab === "content" && <section className="specialist-panel">
      {data.content.length ? <div className="admin-list">
        {data.content.map((item) => <article key={`${item.table}-${item.id}`} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{item.title}</strong>
              <small>{CONTENT_LABEL[item.table]}</small>
              <small dir="ltr">/{item.table === "articles" ? "articles" : item.table === "research_reviews" ? "research" : "programs"}/{item.slug}</small>
            </div>
            <em>{CONTENT_STATUS[item.status] ?? item.status}</em>
          </div>
          <div className="admin-row-actions role-picker">
            {Object.entries(CONTENT_STATUS).map(([value, label]) => <button key={value} type="button"
              className={item.status === value ? "chip selected" : "chip"} disabled={busy === item.id}
              onClick={() => void run(item.id, () => setContentStatus(item.table, item.id, value))}
            >{label}</button>)}
          </div>
        </article>)}
      </div> : <div className="portal-empty"><FileText /><p>لا يوجد محتوى بعد.</p></div>}
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

    {tab === "training" && <section className="specialist-panel">
      <p className="application-hint">
        <GraduationCap /> قائمة الطلاب المسجلين للتدريب الإكلينيكي. تُحفظ حتى تحتاج إحدى العيادات متدربين، فتُراجع وتُرشّح منها.
      </p>
      {training.length ? <div className="admin-list">
        {training.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
          <div className="admin-row-main">
            <div>
              <strong>{item.fullName}</strong>
              <small>{item.specialty} · {item.university}{item.college ? ` — ${item.college}` : ""}</small>
              <small dir="ltr">{item.phone}{item.email ? ` · ${item.email}` : ""}</small>
              <small>
                {item.academicLevel ?? "المستوى غير محدد"}
                {item.studentNumber ? ` · الرقم الجامعي: ${item.studentNumber}` : ""}
                {item.availableFrom ? ` · متاح من ${item.availableFrom}` : ""}
                {item.availableTo ? ` إلى ${item.availableTo}` : ""}
                {item.requiredHours ? ` · ${item.requiredHours}` : ""}
              </small>
              {item.note && <small className="admin-quote">{item.note}</small>}
              <small>{formatDateTime(item.createdAt)}</small>
            </div>
            <em>{TRAINING_STATUS[item.status] ?? item.status}</em>
          </div>
          {item.reviewNote && <p className="application-note">ملاحظة: {item.reviewNote}</p>}
          <div className="admin-row-actions">
            {item.cvPath
              ? <button className="button button-small button-secondary" type="button"
                  onClick={() => void cvDownloadUrl(item.cvPath!).then((url) => window.open(url, "_blank", "noopener")).catch(() => setError("تعذر فتح السيرة الذاتية."))}>
                  <FileText /> السيرة الذاتية
                </button>
              : <small className="application-hint">لم تُرفق سيرة ذاتية.</small>}
          </div>
          <input placeholder="ملاحظة داخلية (اختيارية)" value={note[item.id] ?? ""}
            onChange={(e) => setNote({ ...note, [item.id]: e.target.value })} />
          <div className="admin-row-actions role-picker">
            {Object.entries(TRAINING_STATUS).map(([value, label]) => <button
              key={value} type="button" className={item.status === value ? "chip selected" : "chip"} disabled={busy === item.id}
              onClick={() => void run(item.id, () => setTrainingStatus(item.id, value, note[item.id] ?? ""))}
            >{label}</button>)}
          </div>
        </article>)}
      </div> : <div className="portal-empty"><GraduationCap /><p>لا توجد طلبات تدريب بعد.</p></div>}
    </section>}
  </div></section></PageShell>;
}
