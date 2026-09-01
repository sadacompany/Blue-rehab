import { BadgeCheck, LoaderCircle, MapPin, Plus, Save, ShieldQuestion, Trash2, Users, X } from "lucide-react";
import { useState } from "react";
import type { AdminCourse } from "../lib/admin";
import { formatCurrency, formatDate } from "../lib/format";
import {
  loadCoursePriceTiers, loadCourseRoster, setCoursePriceTiers, verifyMembership,
  type CoursePriceTier, type RosterEntry,
} from "../lib/registration";
import { SkeletonLine } from "./Skeleton";

/**
 * The courses that happen in a room.
 *
 * Three things an in-person course needs that an online one does not, and none
 * of them had anywhere to live: the fee bands people register under, the
 * register itself, and somewhere to act on a membership claim. They are one
 * panel because they are one job — the person checking who is coming tomorrow
 * is the person who priced it and the person verifying the memberships.
 *
 * Loaded per course, on demand. A centre with thirty archived courses should
 * not fetch thirty registers to show a list of titles.
 */

function TierEditor({ courseId, onError }: { courseId: string; onError: (message: string) => void }) {
  const [tiers, setTiers] = useState<Array<{ key: string; label: string; price: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (tiers || busy) return;
    setBusy(true);
    try {
      const rows: CoursePriceTier[] = await loadCoursePriceTiers(courseId);
      setTiers(rows.map((row) => ({ key: row.key, label: row.label, price: String(row.price) })));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "تعذر تحميل الفئات");
    } finally { setBusy(false); }
  }

  async function save() {
    if (!tiers) return;
    setBusy(true);
    try {
      await setCoursePriceTiers(courseId, tiers.map((tier) => ({
        key: tier.key.trim(), label: tier.label.trim(), price: Number(tier.price || 0),
      })));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "تعذر حفظ الفئات");
    } finally { setBusy(false); }
  }

  const set = (index: number, field: "key" | "label" | "price", value: string) =>
    setTiers((prev) => prev?.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)) ?? null);

  return <details onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary className="link-button">فئات الأسعار</summary>
    <div className="specialist-plan-composer">
      <p className="application-hint">
        الفئة هي ما يختاره المتدرب عند التسجيل، والسعر المحسوب يؤخذ من هنا لا من المتصفح. اتركها فارغة ليُستخدم سعر الدورة الأساسي لكل المسجّلين.
      </p>
      {busy && !tiers && <SkeletonLine width="100%" height={40} />}
      {tiers?.map((tier, index) => <div key={index} className="specialist-plan-composer-row">
        <label><span>المعرّف (إنجليزي)</span>
          <input dir="ltr" value={tier.key} placeholder="specialist"
            onChange={(event) => set(index, "key", event.target.value.toLowerCase())} /></label>
        <label><span>الاسم الظاهر</span>
          <input value={tier.label} placeholder="مختصّون"
            onChange={(event) => set(index, "label", event.target.value)} /></label>
        <label><span>السعر</span>
          <input type="number" min={0} dir="ltr" value={tier.price}
            onChange={(event) => set(index, "price", event.target.value)} /></label>
        <button type="button" className="link-button" aria-label="حذف الفئة"
          onClick={() => setTiers((prev) => prev?.filter((_, i) => i !== index) ?? null)}><Trash2 /></button>
      </div>)}
      <div className="admin-row-actions">
        <button type="button" className="button button-small button-secondary"
          onClick={() => setTiers((prev) => [...(prev ?? []), { key: "", label: "", price: "" }])}>
          <Plus /> فئة
        </button>
        <button type="button" className="button button-small" disabled={busy || !tiers}
          onClick={() => void save()}>
          {busy ? <LoaderCircle className="spin" /> : <Save />} حفظ الفئات
        </button>
      </div>
      <p className="application-hint">
        لا يمكن حذف فئة سجّل بها أحد — التسجيل يشير إليها بالمعرّف، وحذفها يجعل كشف الحضور عاجزاً عن قول ما سجّل به المشارك.
      </p>
    </div>
  </details>;
}

/** One registrant, with the membership check where it is acted on. */
function RosterRow({ entry, onError, onChanged }: {
  entry: RosterEntry; onError: (message: string) => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function decide(verified: boolean) {
    setBusy(true);
    try { await verifyMembership(entry.id, verified); onChanged(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "تعذر تحديث حالة العضوية"); }
    finally { setBusy(false); }
  }

  return <article className="admin-row">
    <div className="admin-row-main">
      <div>
        <strong>{entry.fullName}</strong>
        <small dir="ltr">{entry.phone} · {entry.email}</small>
        <small>
          {[entry.jobTitle, entry.organization].filter(Boolean).join(" — ") || "لم يذكر جهة عمل"}
          {entry.yearsExperience ? ` · خبرة ${entry.yearsExperience}` : ""}
        </small>
        <small>
          المعرفة بالموضوع {entry.knowledgeLevel}/5 ·
          {entry.attendedSimilar ? " سبق أن حضر دورة مشابهة" : " لم يحضر دورة مشابهة"}
        </small>
      </div>
      <em>{entry.status === "confirmed" ? "مؤكد" : "بانتظار الدفع"}</em>
    </div>

    <div className="roster-answers">
      <p><b>الأهداف:</b> {[...entry.goals, entry.goalOther].filter(Boolean).join("، ")}</p>
      <p><b>المحاور:</b> {entry.topics.join("، ")}</p>
      {entry.question && <p className="admin-quote">«{entry.question}»</p>}
    </div>

    {/* The money is null for a trainer reading this — the function withholds
        it. Rendered only when it was actually given, rather than as a zero. */}
    {entry.netAmount !== null && <small className="roster-money">
      {formatCurrency(entry.grossAmount ?? 0)}
      {(entry.discountAmount ?? 0) > 0 && <> − {formatCurrency(entry.discountAmount ?? 0)}</>}
      {" = "}<b>{formatCurrency(entry.netAmount)}</b>
    </small>}

    {entry.isMember && <div className="roster-membership">
      <span>
        <ShieldQuestion /> عضوية رقم <b dir="ltr">{entry.membershipNumber ?? "—"}</b>
        {entry.membershipVerifiedAt
          ? <em className="is-verified"><BadgeCheck /> تم التحقق {formatDate(entry.membershipVerifiedAt)}</em>
          : <em className="is-pending">لم يتم التحقق بعد</em>}
      </span>
      <span className="admin-row-actions">
        {!entry.membershipVerifiedAt && <button className="button button-small" disabled={busy}
          onClick={() => void decide(true)}>
          {busy ? <LoaderCircle className="spin" /> : <BadgeCheck />} تأكيد العضوية
        </button>}
        {entry.membershipVerifiedAt && <button className="button button-small button-secondary" disabled={busy}
          onClick={() => void decide(false)}><X /> سحب التأكيد</button>}
      </span>
    </div>}
  </article>;
}

function Roster({ courseId, onError }: { courseId: string; onError: (message: string) => void }) {
  const [rows, setRows] = useState<RosterEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(force = false) {
    if ((rows && !force) || busy) return;
    setBusy(true);
    try { setRows(await loadCourseRoster(courseId)); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "تعذر تحميل كشف المسجّلين"); }
    finally { setBusy(false); }
  }

  const pendingChecks = rows?.filter((row) => row.isMember && !row.membershipVerifiedAt).length ?? 0;

  return <details onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary className="link-button">
      <Users /> كشف المسجّلين{pendingChecks ? ` — ${pendingChecks} عضوية بانتظار التحقق` : ""}
    </summary>
    {busy && !rows && <SkeletonLine width="100%" height={60} />}
    {rows && rows.length === 0 && <p className="application-hint">لم يسجل أحد في هذه الدورة بعد.</p>}
    {rows && rows.length > 0 && <div className="admin-list">
      {rows.map((entry) => <RosterRow key={entry.id} entry={entry} onError={onError}
        onChanged={() => void load(true)} />)}
    </div>}
  </details>;
}

export default function AdminOnsiteCourses({ courses, onError }: {
  courses: AdminCourse[];
  onError: (message: string) => void;
}) {
  if (courses.length === 0) return <section className="specialist-panel">
    <h3 className="trainer-section-title">الدورات الحضورية</h3>
    <div className="catalog-message">
      <MapPin />
      <strong>لا توجد دورات حضورية.</strong>
      <p>اضبط «طريقة التقديم» إلى «حضوري» أو «هجين» من تبويب الخدمات والدورات، وستظهر هنا بكشف مسجّليها وفئات أسعارها.</p>
    </div>
  </section>;

  return <section className="specialist-panel">
    <h3 className="trainer-section-title">الدورات الحضورية</h3>
    <p className="application-hint">
      التسجيل في هذه الدورات يمر بنموذج من أربع خطوات ينتهي بالدفع. لا يُحجز مقعد قبل اكتمال الدفع، وتُمنح المقاعد حسب أولوية إكمال التسجيل.
    </p>

    <div className="admin-list">
      {courses.map((course) => <article key={course.id} className="admin-row">
        <div className="admin-row-main">
          <div>
            <strong>{course.title}</strong>
            <small>
              {course.mode === "hybrid" ? "هجين" : "حضوري"} · {formatCurrency(course.price)}
              {course.capacity ? ` · ${course.capacity} مقعداً` : " · بلا حد للمقاعد"}
            </small>
            <small>{course.startsAt ? formatDate(course.startsAt) : "لم يحدد تاريخ البدء"}</small>
          </div>
          <em>{course.isPublished ? "منشورة" : "غير منشورة"}</em>
        </div>
        <div className="admin-row-actions">
          <TierEditor courseId={course.id} onError={onError} />
          <Roster courseId={course.id} onError={onError} />
        </div>
      </article>)}
    </div>
  </section>;
}
