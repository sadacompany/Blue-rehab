import { BadgePercent, CheckCircle2, LoaderCircle, Plus, Save, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { countLabel, formatCurrency, isOnOffer } from "../lib/format";
import {
  assignCourseTrainer,
  createCourse,
  deleteCourse,
  loadCoursePresenters,
  reviewCourse,
  saveService,
  setCourseOffer,
  unpublishCourse,
  updateCourse,
  type AdminCourse,
  type AdminService,
  type CoursePresenter,
  type CourseEditPatch,
} from "../lib/admin";
import { CoverField, type AdminTabActions } from "./AdminShared";
import { uploadContentCover } from "../lib/admin";
import { useAsync } from "../lib/use-async";
import OfferBadge from "./OfferBadge";

const COURSE_REVIEW: Record<string, string> = {
  draft: "مسودة", in_review: "بانتظار المراجعة",
  published: "معتمدة ومنشورة", archived: "موقوفة",
};

/** Create or edit a service. Pricing is administrative — see the RLS note. */
function ServiceEditor({ service, onSaved }: { service?: AdminService; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: service?.name ?? "",
    price: String(service?.price ?? ""),
    durationMinutes: String(service?.durationMinutes ?? "45"),
    modes: service?.modes ?? ["remote"],
    isActive: service?.isActive ?? true,
    isComingSoon: service?.isComingSoon ?? false,
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
        isComingSoon: form.isComingSoon,
      });
      if (!service) setForm({ name: "", price: "", durationMinutes: "45", modes: ["remote"], isActive: true, isComingSoon: false });
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
      <button type="button" className={form.isComingSoon ? "chip selected" : "chip"} aria-pressed={form.isComingSoon}
        onClick={() => setForm({ ...form, isComingSoon: !form.isComingSoon })}>{form.isComingSoon ? "قريباً" : "مفتوحة للحجز"}</button>
    </div>
    {form.isComingSoon && <p className="application-hint">تبقى الخدمة ظاهرة للزوار بعلامة «قريباً»، لكن لا يمكن حجزها — حتى عبر رابط مباشر.</p>}
    {error && <p className="specialist-error">{error}</p>}
    <button className="button button-small" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} {service ? "حفظ التعديل" : "إضافة خدمة"}
    </button>
  </div>;
}

const COURSE_MODES: Array<[string, string]> = [
  ["onsite", "حضوري"], ["remote", "عن بُعد"], ["recorded", "مسجل"], ["hybrid", "هجين"],
];

/**
 * Deleting a course, asked for twice — the same two-press shape the content
 * panel uses, for the same reason.
 *
 * The database refuses outright once anyone has enrolled, paid or reviewed;
 * that history has to outlive the course. Rather than let an administrator
 * discover the refusal by pressing, the confirmation says which way it will go
 * and names unpublishing as what they probably want instead.
 */
function DeleteCourse({ course, busy, onDelete }: {
  course: AdminCourse; busy: boolean; onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return <button type="button" className="link-button is-danger" disabled={busy}
      onClick={() => setArmed(true)}><Trash2 /> حذف الدورة</button>;
  }

  return <span className="delete-confirm" role="alert">
    <TriangleAlert />
    <span>
      <b>حذف «{course.title}» نهائياً؟</b>
      <small>
        تُحذف معها الوحدات والدروس وفئات الأسعار. إن كان لها أي تسجيل أو دفعة أو تقييم فسيرفض النظام الحذف —
        استخدم «إيقاف النشر» بدلاً منه.
      </small>
    </span>
    <button type="button" className="button button-small button-secondary" disabled={busy}
      onClick={() => setArmed(false)}>إلغاء</button>
    <button type="button" className="button button-small is-danger" disabled={busy}
      onClick={onDelete}>
      {busy ? <LoaderCircle className="spin" /> : <Trash2 />} نعم، احذف
    </button>
  </span>;
}

/**
 * Start a course.
 *
 * Courses could previously only begin in a trainer's dashboard, so the platform
 * could not offer one of its own without borrowing a trainer account. This asks
 * for the six fields a course cannot exist without and leaves the rest —
 * description, outcomes, capacity, cover, start date — to the editor below,
 * which already handles them. A short form that opens the real one beats a long
 * form that duplicates it.
 *
 * What it creates is a draft: nothing is public until «نشر الدورة» is pressed.
 */
function CourseComposer({ onCreated, onError }: {
  onCreated: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    title: "", summary: "", price: "0", durationHours: "1",
    mode: "onsite", level: "مبتدئ", presenterName: "", trainerId: "",
  });
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  // Trainers and specialists together, plus whether choosing one also hands
  // them the trainer dashboard. Loaded here rather than through the shared
  // snapshot because only this form asks the question.
  const { data: presenters } = useAsync(loadCoursePresenters, []);

  /** Picking somebody fills the name box and, where they can manage, the id. */
  function choose(person: CoursePresenter) {
    const already = form.presenterName === person.displayName;
    setForm((prev) => ({
      ...prev,
      presenterName: already ? "" : person.displayName,
      trainerId: already || !person.canManage || !person.profileId ? "" : person.profileId,
    }));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const courseId = await createCourse({
        title: form.title,
        mode: form.mode,
        level: form.level,
        price: Number(form.price || 0),
        durationHours: Number(form.durationHours || 1),
        summary: form.summary,
        trainerId: form.trainerId || null,
        presenterName: form.presenterName || null,
      });

      // The cover can only be attached once the row exists — the storage path
      // is keyed by the course id. A failure here leaves a created course
      // without artwork, which is worth saying rather than rolling back a
      // course somebody has just filled in a form for.
      if (cover) {
        try { await uploadContentCover("courses", courseId, cover); }
        catch (reason) {
          onError(reason instanceof Error
            ? `أُنشئت الدورة، لكن تعذّر رفع صورة الغلاف: ${reason.message}`
            : "أُنشئت الدورة، لكن تعذّر رفع صورة الغلاف.");
        }
      }

      setForm({ title: "", summary: "", price: "0", durationHours: "1", mode: "onsite", level: "مبتدئ", presenterName: "", trainerId: "" });
      setCover(null);
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إنشاء الدورة");
    } finally { setBusy(false); }
  }

  return <div className="specialist-plan-composer">
    <label><span>عنوان الدورة<b className="req" aria-hidden="true">*</b></span>
      <input value={form.title} onChange={(event) => set("title", event.target.value)}
        placeholder="الكتف المؤلم: تعقيد لا يعني صعوبة" /></label>

    <label><span>نبذة مختصرة</span>
      <input value={form.summary} onChange={(event) => set("summary", event.target.value)}
        placeholder="سطر واحد يظهر في بطاقة الدورة" /></label>

    <div className="specialist-plan-composer-row">
      <label><span>طريقة التقديم<b className="req" aria-hidden="true">*</b></span>
        <select value={form.mode} onChange={(event) => set("mode", event.target.value)}>
          {COURSE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      <label><span>المستوى<b className="req" aria-hidden="true">*</b></span>
        <input list="admin-course-levels" value={form.level}
          onChange={(event) => set("level", event.target.value)} /></label>
      <label><span>السعر (ر.س)</span>
        <input type="number" min={0} step="0.01" dir="ltr" value={form.price}
          onChange={(event) => set("price", event.target.value)} /></label>
      <label><span>عدد الساعات<b className="req" aria-hidden="true">*</b></span>
        <input type="number" min={1} dir="ltr" value={form.durationHours}
          onChange={(event) => set("durationHours", event.target.value)} /></label>
    </div>

    {/* One question — who presents this course — answered either by picking
        somebody the platform already knows, or by typing a name. A visiting
        presenter booked for one Saturday has no account and does not need one,
        and the old picker had no way to say that. */}
    <fieldset>
      <legend>مقدّم الدورة (اختياري)</legend>
      {presenters && presenters.length > 0 && <div className="chip-grid">
        {presenters.map((person) => <button key={`${person.kind}-${person.profileId ?? person.displayName}`} type="button"
          className={form.presenterName === person.displayName ? "chip selected" : "chip"}
          onClick={() => choose(person)}
        >{person.displayName}<small> · {person.kind === "trainer" ? "مدرب" : "مختص"}</small></button>)}
      </div>}
      <label><span>أو اكتب الاسم مباشرة</span>
        <input value={form.presenterName} placeholder="د. جمال أبو النجا"
          onChange={(event) => setForm((prev) => ({ ...prev, presenterName: event.target.value, trainerId: "" }))} /></label>
      {/* The difference between crediting and granting, said out loud rather
          than discovered when somebody cannot find the course in their panel. */}
      <p className="application-hint">
        {form.trainerId
          ? "هذا الحساب مدرب معتمد — سيظهر اسمه على الدورة، وستتاح له إضافة الوحدات والدروس من لوحة المدرب."
          : form.presenterName
            ? "سيظهر الاسم على صفحة الدورة فقط. لإتاحة تعديل المحتوى لصاحبه، يلزم أن يكون حسابه مدرباً معتمداً."
            : "اختر من القائمة أو اكتب اسماً. يمكن تركه فارغاً وتعبئته لاحقاً."}
      </p>
    </fieldset>

    {/* Optional, and offered here rather than only after creation: a course
        with no artwork does not appear on the landing page at all, so the
        moment it is created is the right moment to ask. */}
    <label><span>صورة الغلاف (اختيارية)</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => setCover(event.target.files?.[0] ?? null)} />
      <small className="field-hint">
        {cover ? `المُختارة: ${cover.name}` : "بدون غلاف لن تظهر الدورة في الصفحة الرئيسية. يمكن إضافتها لاحقاً."}
      </small></label>

    {/* Said before the button, not after the fact: a price under one riyal is
        accepted here and refused by the gateway at checkout, so the number is
        worth getting right while the course is still a draft. */}
    <p className="application-hint">
      تُنشأ الدورة كمسودة غير منشورة. أكمل الوصف والوحدات من «تعديل بيانات الدورة»، ثم انشرها.
      السعر إما صفر (مجانية) أو ١ ر.س فأكثر — بوابة الدفع لا تقبل أقل من ريال.
    </p>

    {error && <p className="specialist-error">{error}</p>}
    <button className="button button-small" type="button" disabled={busy || !form.title.trim()}
      onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Plus />} إنشاء الدورة
    </button>
  </div>;
}

/**
 * `starts_at` is an instant in the database and a local wall-clock reading in
 * <input type="datetime-local">, which has no timezone of its own. Both
 * directions go through here so the administrator edits the time they see on
 * the course page rather than a UTC figure that is hours away from it.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

const fromLocalInput = (value: string): string | null =>
  (value ? new Date(value).toISOString() : null);

/** Every editable field as the form holds it — strings, because inputs are. */
const courseToForm = (course: AdminCourse) => ({
  title: course.title,
  slug: course.slug,
  summary: course.summary,
  description: course.description,
  durationHours: String(course.durationHours),
  price: String(course.price),
  compareAtPrice: course.compareAtPrice === null ? "" : String(course.compareAtPrice),
  mode: course.mode,
  level: course.level,
  startsAt: toLocalInput(course.startsAt),
  capacity: course.capacity === null ? "" : String(course.capacity),
  // A list per line. The alternative is comma-separated, and an Arabic learning
  // outcome is a sentence that may well contain a comma.
  learningOutcomes: course.learningOutcomes.join("\n"),
  prerequisites: course.prerequisites.join("\n"),
  language: course.language,
  certificateAvailable: course.certificateAvailable,
  coverUrl: course.coverUrl ?? "",
  presenterName: course.presenterName ?? "",
});

const asLines = (value: string) =>
  value.split("\n").map((line) => line.trim()).filter(Boolean);

/**
 * Correct any field on a course, as administration.
 *
 * The form is diffed against the course as it was loaded and only the fields
 * that moved are sent. That is not an optimisation: `admin_update_course` names
 * the changed fields to the trainer, and posting all seventeen every time would
 * turn every typo fix into a notice claiming the whole course was rewritten.
 * The server diffs the stored row as well, so a change that survives to the
 * database but normalises back to what was already there still notifies nobody.
 */
function CourseEditor({ course, onSaved }: { course: AdminCourse; onSaved: () => void }) {
  const initial = useMemo(() => courseToForm(course), [course]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The panel reloads after every save, so `course` arrives fresh and the form
  // has to follow it — otherwise the next diff is taken against a stale copy
  // and reports fields as changed that the server already normalised.
  useEffect(() => { setForm(initial); setError(""); }, [initial]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function buildPatch(): CourseEditPatch | string {
    const patch: CourseEditPatch = {};

    if (form.title !== initial.title) {
      if (form.title.trim().length < 3) return "عنوان الدورة مطلوب.";
      patch.title = form.title.trim();
    }
    if (form.slug !== initial.slug) {
      if (!form.slug.trim()) return "رابط الدورة مطلوب.";
      patch.slug = form.slug.trim();
    }
    if (form.summary !== initial.summary) patch.summary = form.summary.trim() || null;
    if (form.description !== initial.description) patch.description = form.description.trim() || null;

    if (form.durationHours !== initial.durationHours) {
      const hours = Number(form.durationHours);
      if (!Number.isFinite(hours) || hours <= 0) return "عدد الساعات يجب أن يكون أكبر من صفر.";
      patch.duration_hours = Math.round(hours);
    }
    if (form.price !== initial.price) {
      const price = Number(form.price);
      if (!Number.isFinite(price) || price < 0) return "السعر يجب ألا يكون سالباً.";
      patch.price = price;
    }
    if (form.compareAtPrice !== initial.compareAtPrice) {
      if (!form.compareAtPrice.trim()) patch.compare_at_price = null;
      else {
        const compare = Number(form.compareAtPrice);
        if (!Number.isFinite(compare)) return "السعر قبل العرض غير صالح.";
        patch.compare_at_price = compare;
      }
    }
    if (form.mode !== initial.mode) patch.mode = form.mode;
    if (form.level !== initial.level) {
      if (!form.level.trim()) return "مستوى الدورة مطلوب.";
      patch.level = form.level.trim();
    }
    if (form.startsAt !== initial.startsAt) patch.starts_at = fromLocalInput(form.startsAt);
    if (form.capacity !== initial.capacity) {
      if (!form.capacity.trim()) patch.capacity = null;
      else {
        const capacity = Number(form.capacity);
        if (!Number.isFinite(capacity) || capacity <= 0) return "السعة يجب أن تكون أكبر من صفر.";
        patch.capacity = Math.round(capacity);
      }
    }
    if (form.learningOutcomes !== initial.learningOutcomes) patch.learning_outcomes = asLines(form.learningOutcomes);
    if (form.prerequisites !== initial.prerequisites) patch.prerequisites = asLines(form.prerequisites);
    if (form.language !== initial.language) {
      if (!form.language.trim()) return "لغة التقديم مطلوبة.";
      patch.language = form.language.trim();
    }
    if (form.certificateAvailable !== initial.certificateAvailable) patch.certificate_available = form.certificateAvailable;
    if (form.coverUrl !== initial.coverUrl) patch.cover_url = form.coverUrl.trim() || null;
    if (form.presenterName !== initial.presenterName) patch.presenter_name = form.presenterName.trim() || null;

    return patch;
  }

  async function submit() {
    const built = buildPatch();
    if (typeof built === "string") { setError(built); return; }
    if (!Object.keys(built).length) { setError("لم يتغير أي حقل، فلا شيء لحفظه."); return; }

    setBusy(true); setError("");
    try {
      await updateCourse(course.id, built);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ التعديل");
    } finally { setBusy(false); }
  }

  return <div className="specialist-plan-composer">
    <label><span>عنوان الدورة <b className="req">*</b></span>
      <input value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
    <label><span>الرابط (slug)</span>
      <input value={form.slug} onChange={(e) => set("slug", e.target.value)} />
      </label>
    <label><span>الوصف المختصر</span>
      <textarea rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} /></label>
    <label><span>الوصف التفصيلي</span>
      <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>

    <div className="specialist-plan-composer-row">
      <label><span>السعر (ر.س)</span>
        <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></label>
      <label><span>السعر قبل العرض (ر.س)</span>
        <input type="number" min={0} step="0.01" value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="اتركه فارغاً بدون عرض" /></label>
    </div>
    <p className="application-hint">
      السعر قبل العرض هو الرقم المشطوب على البطاقة، ويجب أن يكون أعلى من السعر الحالي. لتفعيل عرض النصف بضغطة واحدة استخدم زر «تفعيل عرض خاص» أعلاه.
    </p>

    <div className="specialist-plan-composer-row">
      <label><span>عدد الساعات</span>
        <input type="number" min={1} value={form.durationHours} onChange={(e) => set("durationHours", e.target.value)} /></label>
      <label><span>السعة (عدد المقاعد)</span>
        <input type="number" min={1} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="بدون حد" /></label>
    </div>

    <div className="specialist-plan-composer-row">
      <label><span>طريقة التقديم</span>
        <select value={form.mode} onChange={(e) => set("mode", e.target.value)}>
          {COURSE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      <label><span>المستوى</span>
        {/* Free text, not a three-option select: `courses.level` is a text
            column and some courses carry a level outside مبتدئ/متوسط/متقدم. A
            select would quietly rewrite those the first time anyone saved. */}
        <input list="admin-course-levels" value={form.level} onChange={(e) => set("level", e.target.value)} />
        <datalist id="admin-course-levels"><option value="مبتدئ" /><option value="متوسط" /><option value="متقدم" /></datalist>
      </label>
    </div>

    <div className="specialist-plan-composer-row">
      <label><span>تاريخ البدء</span>
        <input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></label>
      <label><span>لغة التقديم</span>
        <input value={form.language} onChange={(e) => set("language", e.target.value)} /></label>
    </div>

    <label><span>نتائج التعلم — نتيجة في كل سطر</span>
      <textarea rows={3} value={form.learningOutcomes} onChange={(e) => set("learningOutcomes", e.target.value)} /></label>
    <label><span>المتطلبات السابقة — متطلب في كل سطر</span>
      <textarea rows={3} value={form.prerequisites} onChange={(e) => set("prerequisites", e.target.value)} /></label>

    <label><span>اسم المقدّم</span>
      <input value={form.presenterName} onChange={(e) => set("presenterName", e.target.value)} placeholder="اختياري" /></label>
    <label><span>رابط صورة الغلاف</span>
      <input dir="ltr" value={form.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} placeholder="يُملأ تلقائياً عند رفع غلاف" /></label>

    <label className="policy-check">
      <input type="checkbox" checked={form.certificateAvailable} onChange={(e) => set("certificateAvailable", e.target.checked)} />
      <span>تصدر شهادة لهذه الدورة</span>
    </label>

    {error && <p className="specialist-error">{error}</p>}
    <p className="application-hint">يُبلَّغ مدرب الدورة بالحقول التي تغيّرت فعلاً، ولا يُرسل إشعار إذا لم يتغير شيء.</p>
    <button className="button button-small" type="button" disabled={busy} onClick={() => void submit()}>
      {busy ? <LoaderCircle className="spin" /> : <Save />} حفظ التعديل
    </button>
  </div>;
}

/** Services and courses — pricing, review, trainer assignment and offers. */
export default function AdminCatalogue({ services, courses, trainers, note, setNote, busy, run, onError, reload }: AdminTabActions & {
  services: AdminService[];
  courses: AdminCourse[];
  trainers: Array<{ id: string; fullName: string }>;
  note: Record<string, string>;
  setNote: (next: Record<string, string>) => void;
  reload: () => Promise<void>;
}) {
  return <section className="specialist-panel">
    <h3 className="trainer-section-title">الخدمات — يحدد سعرها ما يُخصم من المستفيد</h3>
    <div className="admin-list">
      {services.map((service) => <article key={service.id} className="admin-row">
        <div className="admin-row-main">
          <div>
            <strong>{service.name}</strong>
            <small>{formatCurrency(service.price)} · {service.durationMinutes} دقيقة</small>
            <small>{service.modes.map((m) => (m === "remote" ? "عن بُعد" : "في المركز")).join("، ")}</small>
          </div>
          <em>{!service.isActive ? "معطّلة" : service.isComingSoon ? "قريباً" : "مفعّلة"}</em>
        </div>
        <details><summary className="link-button">تعديل</summary><ServiceEditor service={service} onSaved={() => void reload()} /></details>
      </article>)}
    </div>
    <details className="specialist-new-plan">
      <summary><Plus /> خدمة جديدة</summary>
      <div className="specialist-plan-composer"><ServiceEditor onSaved={() => void reload()} /></div>
    </details>

<h3 className="trainer-section-title">الدورات — الإنشاء والمراجعة والإسناد</h3>
    <details className="specialist-new-plan">
      <summary><Plus /> دورة جديدة</summary>
      <CourseComposer onCreated={() => void reload()} onError={onError} />
    </details>
    <div className="admin-list">
      {courses.map((course) => <article key={course.id} className={`admin-row status-${course.reviewStatus}`}>
        <div className="admin-row-main">
          <CoverField table="courses" id={course.id} coverUrl={course.coverUrl}
            onDone={() => void reload()} onError={onError} />
          <div>
            <strong>{course.title}</strong>
            {course.summary && <small className="admin-quote">{course.summary}</small>}
            <small>
              {formatCurrency(course.price)}
              {isOnOffer(course) && <><s> {formatCurrency(course.compareAtPrice as number)}</s> <OfferBadge compact /></>}
              {" · "}{countLabel(course.modules, ["وحدة واحدة","وحدتان","وحدات","وحدة"])}
            </small>
          </div>
          <em>{COURSE_REVIEW[course.reviewStatus] ?? course.reviewStatus}</em>
        </div>

        {/* One button, both directions. The half is computed in the database
            from the stored price, so the panel never has to work out — or get
            wrong — what half of this course costs. */}
        <div className="admin-row-actions">
          {isOnOffer(course)
            ? <button className="button button-small button-ghost" disabled={busy === course.id}
                onClick={() => void run(course.id, () => setCourseOffer(course.id, false))}>
                {busy === course.id ? <LoaderCircle className="spin" /> : <XCircle />} إلغاء العرض
              </button>
            : <button className="button button-small" disabled={busy === course.id || course.price <= 0}
                onClick={() => void run(course.id, () => setCourseOffer(course.id, true))}>
                {busy === course.id ? <LoaderCircle className="spin" /> : <BadgePercent />} تفعيل عرض النصف
              </button>}
          {!isOnOffer(course) && course.price <= 0 && <small className="application-hint">الدورة مجانية — لا يوجد سعر يمكن تنصيفه.</small>}
          {isOnOffer(course) && <small className="application-hint">السعر قبل العرض: {formatCurrency(course.compareAtPrice as number)}</small>}
        </div>

        <details><summary className="link-button">تعديل بيانات الدورة</summary>
          <CourseEditor course={course} onSaved={() => void reload()} />
        </details>

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
        {/* A draft had no way forward at all: «اعتماد ونشر» only appeared for a
            course a trainer had submitted, so a course created here — or one
            returned to draft — could be edited forever and never published.
            Same function, stated as what it is when there is no trainer waiting
            on a verdict. */}
        {(course.reviewStatus === "draft" || course.reviewStatus === "archived") && <div className="admin-row-actions">
          <button className="button button-small" disabled={busy === course.id}
            onClick={() => void run(course.id, () => reviewCourse(course.id, true, ""))}>
            {busy === course.id ? <LoaderCircle className="spin" /> : <CheckCircle2 />} نشر الدورة
          </button>
          <small className="application-hint">تظهر للزوار فور النشر.</small>
        </div>}
        {course.reviewStatus === "published" && <div className="admin-row-actions">
          <button className="button button-small button-ghost" disabled={busy === course.id}
            onClick={() => void run(course.id, () => unpublishCourse(course.id, note[course.id] ?? ""))}>إيقاف النشر</button>
        </div>}
        <div className="admin-row-actions role-picker">
          <small className="application-hint">المدرب:</small>
          {trainers.length === 0 && <small className="application-hint">لا يوجد مدربون معتمدون بعد.</small>}
          {trainers.map((trainer) => <button key={trainer.id} type="button"
            className={course.trainerId === trainer.id ? "chip selected" : "chip"} disabled={busy === course.id}
            onClick={() => void run(course.id, () => assignCourseTrainer(course.id, course.trainerId === trainer.id ? null : trainer.id))}
          >{trainer.fullName}</button>)}
        </div>

        <div className="admin-row-danger">
          <DeleteCourse course={course} busy={busy === course.id}
            onDelete={() => void run(course.id, () => deleteCourse(course.id))} />
        </div>
      </article>)}
    </div>
  </section>;
}
