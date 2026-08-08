import { Activity, BadgeCheck, CalendarDays, ClipboardList, LoaderCircle, LogOut, NotebookPen, Plus, RefreshCcw, Stethoscope, Trash2, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { countLabel, deliveryLabel, formatCurrency, formatDateTime, formatDayLabel } from "../lib/format";
import { AuthenticationRequiredError } from "../lib/platform";
import {
  addExercise,
  createTreatmentPlan,
  deleteExercise,
  closeSlot,
  loadMySlots,
  loadSpecialistDashboard,
  NotASpecialistError,
  openSlots,
  saveSessionNote,
  setAppointmentStatus,
  updateTreatmentPlan,
  type SessionNoteInput,
  type SpecialistAppointment,
  type OpenSlot,
  type SpecialistDashboard as DashboardData,
  type TreatmentPlan,
} from "../lib/specialist";
import { supabase } from "../lib/supabase";
import PageShell from "./PageShell";
import { SkeletonLine, SkeletonMetrics, SkeletonRows } from "./Skeleton";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending_payment: "بانتظار الدفع",
  confirmed: "مؤكد",
  rescheduled: "أُعيد جدولته",
  cancelled: "ملغي",
  completed: "مكتمل",
  no_show: "لم يحضر",
  refunded: "مسترد",
};

const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;

const EMPTY_NOTE: SessionNoteInput = { assessment: "", interventions: "", response: "", recommendations: "" };

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

/** Session note editor, opened inline from an appointment row. */
function SessionNoteEditor({ appointment, specialistId, onSaved }: {
  appointment: SpecialistAppointment;
  specialistId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SessionNoteInput>(appointment.note ?? EMPTY_NOTE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = (key: keyof SessionNoteInput) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, [key]: event.target.value }),
  });

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveSessionNote(appointment.id, specialistId, form);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ الملاحظة");
    } finally {
      setSaving(false);
    }
  }

  return <div className="specialist-note-editor">
    <label><span>التقييم</span><textarea rows={2} placeholder="نتائج الفحص والتقييم" {...field("assessment")} /></label>
    <label><span>التدخلات العلاجية</span><textarea rows={2} placeholder="ما طُبّق خلال الجلسة" {...field("interventions")} /></label>
    <label><span>استجابة المريض</span><textarea rows={2} placeholder="مستوى الألم، التحسن، الملاحظات" {...field("response")} /></label>
    <label><span>التوصيات</span><textarea rows={2} placeholder="التوصيات والمتابعة" {...field("recommendations")} /></label>
    {error && <p className="specialist-error">{error}</p>}
    <div className="specialist-note-actions">
      <button className="button button-small" type="button" disabled={saving} onClick={() => void save()}>
        {saving ? <LoaderCircle className="spin" /> : <NotebookPen />} حفظ الملاحظة
      </button>
    </div>
  </div>;
}

function AppointmentRow({ appointment, specialistId, onChanged }: {
  appointment: SpecialistAppointment;
  specialistId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mark(status: "completed" | "no_show") {
    setBusy(true);
    setError("");
    try {
      await setAppointmentStatus(appointment.id, status);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث الحالة");
    } finally {
      setBusy(false);
    }
  }

  return <article className={`specialist-appointment status-${appointment.status}`}>
    <div className="specialist-appointment-main">
      <span className="record-icon"><UserRound /></span>
      <div>
        <strong>{appointment.patientName}</strong>
        <small>{appointment.serviceName} · {deliveryLabel(appointment.mode)}</small>
        <small>{formatDateTime(appointment.startsAt)}</small>
        {appointment.total !== null && <small>{formatCurrency(appointment.total)}</small>}
        {appointment.notes && <small className="specialist-intake">ملاحظات المريض: {appointment.notes}</small>}
      </div>
      <em>{statusLabel(appointment.status)}</em>
    </div>

    <div className="specialist-appointment-actions">
      {appointment.meetingUrl && <a className="button button-small button-secondary" href={appointment.meetingUrl} target="_blank" rel="noreferrer"><Video /> دخول الجلسة</a>}
      <button className="button button-small button-secondary" type="button" onClick={() => setOpen(!open)}>
        <NotebookPen /> {appointment.note ? "تعديل الملاحظة" : "إضافة ملاحظة"}
      </button>
      {appointment.status === "confirmed" && <>
        <button className="button button-small" type="button" disabled={busy} onClick={() => void mark("completed")}>تم الحضور</button>
        <button className="button button-small button-ghost" type="button" disabled={busy} onClick={() => void mark("no_show")}>لم يحضر</button>
      </>}
    </div>

    {error && <p className="specialist-error">{error}</p>}
    {open && <SessionNoteEditor appointment={appointment} specialistId={specialistId} onSaved={() => { setOpen(false); onChanged(); }} />}
  </article>;
}

function ExerciseComposer({ planId, position, onAdded }: { planId: string; position: number; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", repetitions: "", scheduleText: "", safetyInstructions: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!form.name.trim()) { setError("اسم التمرين مطلوب"); return; }
    setBusy(true);
    setError("");
    try {
      await addExercise(planId, position, form);
      setForm({ name: "", description: "", repetitions: "", scheduleText: "", safetyInstructions: "" });
      onAdded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إضافة التمرين");
    } finally {
      setBusy(false);
    }
  }

  return <div className="specialist-exercise-composer">
    <input placeholder="اسم التمرين" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
    <input placeholder="التكرارات (مثال: 3 مجموعات × 10)" value={form.repetitions} onChange={(event) => setForm({ ...form, repetitions: event.target.value })} />
    <input placeholder="الجدول (مثال: يوميًا صباحًا)" value={form.scheduleText} onChange={(event) => setForm({ ...form, scheduleText: event.target.value })} />
    <input placeholder="تعليمات السلامة" value={form.safetyInstructions} onChange={(event) => setForm({ ...form, safetyInstructions: event.target.value })} />
    <textarea rows={2} placeholder="وصف التمرين وطريقة الأداء" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
    {error && <p className="specialist-error">{error}</p>}
    <button className="button button-small" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} إضافة تمرين
    </button>
  </div>;
}

function PlanCard({ plan, onChanged }: { plan: TreatmentPlan; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية"); }
    finally { setBusy(false); }
  }

  return <article className="specialist-plan">
    <header>
      <div>
        <strong>{plan.patientName}</strong>
        <small>{plan.diagnosisSummary || "لم يُسجل تشخيص بعد"}</small>
      </div>
      <em className={plan.isPublished ? "is-published" : ""}>{plan.isPublished ? "منشورة للمريض" : "مسودة"}</em>
    </header>

    <dl className="specialist-plan-meta">
      {plan.proposedSessions !== null && <div><dt>الجلسات المقترحة</dt><dd>{plan.proposedSessions}</dd></div>}
      {plan.durationWeeks !== null && <div><dt>المدة</dt><dd>{plan.durationWeeks} أسبوع</dd></div>}
      <div><dt>التمارين</dt><dd>{plan.exercises.length}</dd></div>
    </dl>

    {plan.goals.length > 0 && <ul className="specialist-goals">{plan.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul>}
    {plan.precautions && <p className="specialist-precautions"><strong>محاذير:</strong> {plan.precautions}</p>}

    {plan.exercises.length > 0 && <ol className="specialist-exercise-list">
      {plan.exercises.map((exercise) => <li key={exercise.id}>
        <div>
          <strong>{exercise.name}</strong>
          {exercise.repetitions && <small>{exercise.repetitions}</small>}
          {exercise.scheduleText && <small>{exercise.scheduleText}</small>}
          {exercise.description && <small>{exercise.description}</small>}
        </div>
        <button className="icon-button" type="button" aria-label={`حذف ${exercise.name}`} disabled={busy} onClick={() => void run(() => deleteExercise(exercise.id))}><Trash2 /></button>
      </li>)}
    </ol>}

    <ExerciseComposer planId={plan.id} position={plan.exercises.length} onAdded={onChanged} />

    {error && <p className="specialist-error">{error}</p>}
    <div className="specialist-plan-actions">
      <button className="button button-small button-secondary" type="button" disabled={busy}
        onClick={() => void run(() => updateTreatmentPlan(plan.id, { isPublished: !plan.isPublished }))}>
        {plan.isPublished ? "إرجاع إلى مسودة" : "نشر الخطة للمريض"}
      </button>
    </div>
  </article>;
}

function PlanComposer({ specialistId, patients, onCreated }: {
  specialistId: string;
  patients: Array<{ id: string; name: string }>;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ patientId: "", diagnosisSummary: "", goals: "", proposedSessions: "", durationWeeks: "", safetyInstructions: "", precautions: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!form.patientId) { setError("اختر المريض"); return; }
    setBusy(true);
    setError("");
    try {
      await createTreatmentPlan(specialistId, {
        patientId: form.patientId,
        diagnosisSummary: form.diagnosisSummary,
        goals: form.goals.split("\n").map((goal) => goal.trim()).filter(Boolean),
        proposedSessions: form.proposedSessions ? Number(form.proposedSessions) : null,
        durationWeeks: form.durationWeeks ? Number(form.durationWeeks) : null,
        safetyInstructions: form.safetyInstructions,
        precautions: form.precautions,
        isPublished: false,
      });
      setForm({ patientId: "", diagnosisSummary: "", goals: "", proposedSessions: "", durationWeeks: "", safetyInstructions: "", precautions: "" });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إنشاء الخطة");
    } finally {
      setBusy(false);
    }
  }

  if (!patients.length) {
    return <div className="portal-empty"><ClipboardList /><p>لا يوجد مرضى مرتبطون بحسابك بعد. تظهر الخطط بعد أول حجز مؤكد.</p></div>;
  }

  return <div className="specialist-plan-composer">
    <label><span>المريض</span>
      <select value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })}>
        <option value="">اختر المريض…</option>
        {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
      </select>
    </label>
    <label><span>ملخص التشخيص</span><textarea rows={2} value={form.diagnosisSummary} onChange={(event) => setForm({ ...form, diagnosisSummary: event.target.value })} /></label>
    <label><span>الأهداف العلاجية (هدف في كل سطر)</span><textarea rows={3} value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} /></label>
    <div className="specialist-plan-composer-row">
      <label><span>عدد الجلسات</span><input type="number" min={1} value={form.proposedSessions} onChange={(event) => setForm({ ...form, proposedSessions: event.target.value })} /></label>
      <label><span>المدة (أسابيع)</span><input type="number" min={1} value={form.durationWeeks} onChange={(event) => setForm({ ...form, durationWeeks: event.target.value })} /></label>
    </div>
    <label><span>تعليمات السلامة</span><textarea rows={2} value={form.safetyInstructions} onChange={(event) => setForm({ ...form, safetyInstructions: event.target.value })} /></label>
    <label><span>المحاذير</span><textarea rows={2} value={form.precautions} onChange={(event) => setForm({ ...form, precautions: event.target.value })} /></label>
    {error && <p className="specialist-error">{error}</p>}
    <button className="button" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} إنشاء خطة علاجية
    </button>
  </div>;
}

/**
 * Opening appointment times.
 *
 * Availability had no interface at all: the only slots that existed were the
 * ones inserted by a seeding script, which meant a newly approved specialist was
 * unbookable until someone touched the database. Days × times generates the
 * grid in one pass, which is how a clinic actually thinks about a week.
 */
function AvailabilityPanel({ specialistId }: { specialistId: string }) {
  const [slots, setSlots] = useState<OpenSlot[] | null>(null);
  const [mode, setMode] = useState<"remote" | "clinic">("remote");
  const [duration, setDuration] = useState(45);
  const [days, setDays] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>(["09:00", "11:00", "13:00"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = async () => {
    try { setSlots(await loadMySlots(specialistId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل المواعيد"); }
  };
  useEffect(() => { void reload(); }, [specialistId]);

  // The next fourteen days, which is as far ahead as a rehab schedule is useful.
  const upcomingDays = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    return date.toISOString().slice(0, 10);
  }), []);

  const toggle = (list: string[], value: string, set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  async function publish() {
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await openSlots(specialistId, { dates: days, times, mode, durationMinutes: duration });
      setMessage(created ? `تمت إضافة ${countLabel(created, ["موعد واحد","موعدين","مواعيد","موعداً"])}.` : "لم يُضف أي موعد — تحقق من الأيام والأوقات.");
      setDays([]);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر فتح المواعيد");
    } finally { setBusy(false); }
  }

  async function remove(slotId: string) {
    setBusy(true); setError("");
    try { await closeSlot(slotId); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إغلاق الموعد"); }
    finally { setBusy(false); }
  }

  const open = slots?.filter((item) => item.isAvailable) ?? [];
  const booked = slots?.filter((item) => !item.isAvailable) ?? [];

  return <div className="availability-panel">
    <div className="availability-composer">
      <h3>فتح مواعيد جديدة</h3>

      <label className="availability-field"><span>الأيام</span>
        <div className="chip-grid">{upcomingDays.map((date) => <button
          key={date} type="button" className={days.includes(date) ? "chip selected" : "chip"}
          aria-pressed={days.includes(date)} onClick={() => toggle(days, date, setDays)}
        >{formatDayLabel(date)}</button>)}</div>
      </label>

      <label className="availability-field"><span>الأوقات</span>
        <div className="chip-grid">{["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "19:00"].map((time) => <button
          key={time} type="button" className={times.includes(time) ? "chip selected" : "chip"}
          aria-pressed={times.includes(time)} onClick={() => toggle(times, time, setTimes)}
        >{time}</button>)}</div>
      </label>

      <div className="availability-row">
        <label><span>طريقة الجلسة</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as "remote" | "clinic")}>
            <option value="remote">عن بُعد</option>
            <option value="clinic">في المركز</option>
          </select>
        </label>
        <label><span>مدة الجلسة (دقيقة)</span>
          <input type="number" min={15} max={180} step={5} value={duration} onChange={(event) => setDuration(Number(event.target.value) || 45)} />
        </label>
      </div>

      {error && <p className="specialist-error">{error}</p>}
      {message && <p className="availability-message">{message}</p>}
      <p className="application-hint">سيتم إنشاء {countLabel(days.length * times.length, ["موعد واحد","موعدين","مواعيد","موعداً"])}.</p>

      <button className="button" type="button" disabled={busy || !days.length || !times.length} onClick={() => void publish()}>
        {busy ? <LoaderCircle className="spin" /> : <CalendarDays />} فتح المواعيد
      </button>
    </div>

    <div className="availability-lists">
      <h3>مواعيد مفتوحة ({open.length})</h3>
      {open.length ? <div className="slot-times">{open.map((item) => <button
        key={item.id} type="button" className="chip" disabled={busy}
        title="اضغط لإغلاق الموعد" onClick={() => void remove(item.id)}
      >{formatDateTime(item.startsAt)} ✕</button>)}</div>
        : <p className="application-hint">لا توجد مواعيد مفتوحة. المرضى لن يتمكنوا من الحجز حتى تفتح مواعيد.</p>}

      <h3>مواعيد محجوزة ({booked.length})</h3>
      {booked.length ? <div className="slot-times">{booked.map((item) => <span key={item.id} className="chip is-booked">{formatDateTime(item.startsAt)}</span>)}</div>
        : <p className="application-hint">لا توجد حجوزات قادمة.</p>}
    </div>
  </div>;
}

export default function SpecialistDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<"appointments" | "plans" | "availability">("appointments");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setData(await loadSpecialistDashboard());
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/specialist")}`;
        return;
      }
      if (reason instanceof NotASpecialistError) { setDenied(true); return; }
      setError(reason instanceof Error ? reason.message : "تعذر تحميل اللوحة");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const metrics = useMemo(() => {
    if (!data) return null;
    const upcoming = data.appointments.filter((item) => new Date(item.startsAt) > new Date() && item.status === "confirmed");
    return {
      today: data.appointments.filter((item) => isToday(item.startsAt)).length,
      upcoming: upcoming.length,
      plans: data.plans.filter((plan) => plan.isPublished).length,
      pendingNotes: data.appointments.filter((item) => item.status === "completed" && !item.note).length,
    };
  }, [data]);

  return <PageShell><section className="specialist-page"><div className="container">
    {loading && <div aria-busy="true">
      <div className="skeleton-head"><SkeletonLine width="110px" height={13} /><SkeletonLine width="250px" height={34} /></div>
      <SkeletonMetrics /><SkeletonRows count={3} />
    </div>}

    {!loading && denied && <div className="catalog-message">
      <strong>هذه اللوحة مخصصة للأخصائيين.</strong>
      <p>حسابك غير مرتبط بملف أخصائي. إن كنت أخصائيًا، تواصل مع الإدارة لتفعيل ملفك.</p>
      <Link className="button" to="/portal">الذهاب إلى حسابي</Link>
    </div>}

    {!loading && !denied && error && <div className="catalog-message">
      <strong>تعذر تحميل اللوحة.</strong><p>{error}</p>
      <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button>
    </div>}

    {!loading && !denied && data && metrics && <>
      <header className="specialist-head">
        <div>
          <span className="eyebrow"><Stethoscope /> لوحة الأخصائي</span>
          <h1>{data.specialist.displayName} {data.specialist.isVerified && <BadgeCheck className="verified-mark" aria-label="موثّق" />}</h1>
          <p>{data.specialist.title}</p>
        </div>
        <button className="button button-secondary" onClick={() => void signOut()}><LogOut /> تسجيل الخروج</button>
      </header>

      <div className="portal-live-metrics">
        <article><CalendarDays /><span><small>مواعيد اليوم</small><strong>{metrics.today}</strong></span></article>
        <article><Activity /><span><small>مواعيد قادمة</small><strong>{metrics.upcoming}</strong></span></article>
        <article><ClipboardList /><span><small>خطط منشورة</small><strong>{metrics.plans}</strong></span></article>
        <article><NotebookPen /><span><small>ملاحظات ناقصة</small><strong>{metrics.pendingNotes}</strong></span></article>
      </div>

      <div className="specialist-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "appointments"} className={tab === "appointments" ? "is-active" : ""} onClick={() => setTab("appointments")}>المواعيد ({data.appointments.length})</button>
        <button role="tab" aria-selected={tab === "plans"} className={tab === "plans" ? "is-active" : ""} onClick={() => setTab("plans")}>الخطط العلاجية ({data.plans.length})</button>
        <button role="tab" aria-selected={tab === "availability"} className={tab === "availability" ? "is-active" : ""} onClick={() => setTab("availability")}>مواعيدي المتاحة</button>
      </div>

      {tab === "appointments" && <section className="specialist-panel">
        {data.appointments.length
          ? <div className="specialist-appointment-list">{data.appointments.map((appointment) =>
              <AppointmentRow key={appointment.id} appointment={appointment} specialistId={data.specialist.id} onChanged={() => void reload()} />)}
            </div>
          : <div className="portal-empty"><CalendarDays /><p>لا توجد مواعيد مرتبطة بحسابك بعد.</p></div>}
      </section>}

      {tab === "plans" && <section className="specialist-panel">
        <div className="specialist-plan-grid">
          {data.plans.map((plan) => <PlanCard key={plan.id} plan={plan} onChanged={() => void reload()} />)}
        </div>
        <details className="specialist-new-plan">
          <summary><Plus /> خطة علاجية جديدة</summary>
          <PlanComposer specialistId={data.specialist.id} patients={data.patients} onCreated={() => void reload()} />
        </details>
      </section>}

      {tab === "availability" && <section className="specialist-panel">
        <AvailabilityPanel specialistId={data.specialist.id} />
      </section>}
    </>}
  </div></section></PageShell>;
}
