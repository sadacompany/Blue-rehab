import { supabase } from "./supabase";
import { AuthenticationRequiredError } from "./platform";
import { translatePromoError } from "./promotions";

/**
 * Registering for a course held in a room.
 *
 * The questions below are the ones the client has been asking on a Google Form
 * — see the header of
 * `supabase/migrations/20260901120000_onsite_course_registration.sql` for what
 * was carried over and what was deliberately not. The option lists are here
 * rather than in the database because they are the wording of a question, not
 * data: a course does not reference them, nothing joins on them, and an answer
 * is stored as the text that was chosen.
 *
 * Prices are never computed in this file. `quoteRegistration()` asks the same
 * function that will do the charging, so the figure shown to the attendee and
 * the figure taken from their card cannot disagree.
 */

/** «ما الهدف الرئيسي من حضورك للدورة؟» — multiple choice. */
export const REGISTRATION_GOALS = [
  "تطوير مهاراتي السريرية",
  "التعرف على أحدث الأدلة العلمية",
  "تحسين التشخيص واتخاذ القرار",
  "التطوير المهني",
  "الاستعداد للعمل",
  "أخرى",
] as const;

/** The option that opens the free-text box beside it. */
export const GOAL_OTHER = "أخرى";

/** «أي المحاور التالية يهمك أكثر؟» */
export const REGISTRATION_TOPICS = [
  "التشخيص",
  "اتخاذ القرار السريري",
  "الحالات السريرية",
  "التطبيق العملي",
] as const;

/** The 1–5 scale, labelled at both ends the way the original form labels it. */
export const KNOWLEDGE_SCALE = { min: 1, max: 5, minLabel: "مبتدئ", maxLabel: "متقدم" } as const;

export type CoursePriceTier = {
  id: string;
  key: string;
  label: string;
  price: number;
  position: number;
};

export type RegistrationQuote = {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  /** «عضوية» or «كود خصم» — what took the money off, or null if nothing did. */
  discountLabel: string | null;
};

export type OnsiteRegistrationInput = {
  courseId: string;
  tierKey: string;
  fullName: string;
  phone: string;
  email: string;
  organization: string;
  jobTitle: string;
  yearsExperience: string;
  knowledgeLevel: number;
  attendedSimilar: boolean;
  goals: string[];
  goalOther: string;
  topics: string[];
  question: string;
  isMember: boolean;
  membershipNumber: string;
  promoCode: string;
};

export type OnsiteRegistrationResult = {
  registrationId: string;
  orderNumber: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  courseTitle: string;
};

const REGISTRATION_ERRORS: Record<string, string> = {
  COURSE_UNAVAILABLE: "هذه الدورة غير متاحة للتسجيل حالياً.",
  COURSE_NOT_ONSITE: "هذه الدورة ليست حضورية — التسجيل فيها يتم مباشرة من صفحة الدورة.",
  COURSE_FULL: "اكتمل عدد المقاعد لهذه الدورة.",
  ALREADY_ENROLLED: "أنت مسجل في هذه الدورة بالفعل.",
  ALREADY_REGISTERED: "تسجيلك في هذه الدورة مكتمل بالفعل.",
  TIER_REQUIRED: "اختر فئة التسجيل.",
  TIER_UNKNOWN: "فئة التسجيل غير معروفة.",
  MEMBERSHIP_NOT_OFFERED: "لا يوجد خصم عضوية على هذه الدورة.",
  MEMBERSHIP_NUMBER_REQUIRED: "رقم العضوية مطلوب لتطبيق خصم العضوية.",
  KNOWLEDGE_LEVEL_REQUIRED: "حدد مستوى معرفتك الحالي بموضوع الدورة.",
  ATTENDED_SIMILAR_REQUIRED: "أخبرنا إن كنت قد حضرت دورة مشابهة.",
  GOALS_REQUIRED: "اختر هدفاً واحداً على الأقل.",
  TOPICS_REQUIRED: "اختر محوراً واحداً على الأقل.",
  NOTHING_TO_PAY: "لا توجد رسوم على هذا التسجيل. تواصل معنا لإتمامه.",
  FORBIDDEN: "هذه العملية تتطلب صلاحية إدارية.",
  REGISTRATION_NOT_FOUND: "لم نجد هذا التسجيل.",
  NOT_A_MEMBERSHIP_CLAIM: "هذا التسجيل لا يتضمن ادعاء عضوية.",
  TIER_IN_USE: "لا يمكن حذف فئة سجّل بها أحد المشاركين.",
  TIERS_INVALID: "تعذر قراءة فئات الأسعار.",
};

/**
 * Discount refusals reach this flow too — the code box lives on the last step —
 * so the promotion wording is consulted before falling back to this file's own.
 */
function translate(message: string): string {
  const code = Object.keys(REGISTRATION_ERRORS).find((key) => message.includes(key));
  if (code) return REGISTRATION_ERRORS[code];
  return translatePromoError(message);
}

function fail(message: string): never {
  if (message.includes("AUTH_REQUIRED")) throw new AuthenticationRequiredError();
  throw new Error(translate(message));
}

const num = (value: unknown): number => Number(value ?? 0);

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped rows from the plain client, mapped field by field at each call site. */

/**
 * The three things only an in-person course has: where it is, how many seats,
 * and whether members get a rate.
 *
 * Read here rather than added to the shared catalogue payload, and that is a
 * deliberate blast-radius decision. `/catalog` and `/courses/:slug` feed the
 * landing page and every course card; widening their `select()` to columns
 * added by 20260901120000 would take the whole catalogue down on any deploy
 * that reached production before the migration did — PostgREST fails the query
 * outright on an unknown column rather than omitting it. Read from the one
 * screen that needs them, a missing migration costs exactly this page.
 *
 * Public read: `courses` is already readable for published rows.
 */
export type OnsiteCourseInfo = {
  venue: string | null;
  capacity: number | null;
  membershipDiscountPercent: number | null;
};

export async function loadOnsiteCourseInfo(courseId: string): Promise<OnsiteCourseInfo> {
  const { data, error } = await supabase
    .from("courses")
    .select("venue,capacity,membership_discount_percent")
    .eq("id", courseId)
    .maybeSingle();
  if (error) fail(error.message);

  const row = data as { venue?: string | null; capacity?: number | null; membership_discount_percent?: number | null } | null;
  return {
    venue: row?.venue ?? null,
    capacity: row?.capacity === null || row?.capacity === undefined ? null : Number(row.capacity),
    membershipDiscountPercent:
      row?.membership_discount_percent === null || row?.membership_discount_percent === undefined
        ? null : Number(row.membership_discount_percent),
  };
}

/** The fee bands a course offers. Empty means the course has a single price. */
export async function loadCoursePriceTiers(courseId: string): Promise<CoursePriceTier[]> {
  const { data, error } = await supabase
    .from("course_price_tiers")
    .select("id,key,label,price,position")
    .eq("course_id", courseId)
    .order("position");
  if (error) fail(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id, key: row.key, label: row.label,
    price: num(row.price), position: num(row.position),
  }));
}

/**
 * What this attendee would pay, before they commit to anything.
 *
 * Called on every change to the tier, the membership answer and the code, so
 * the summary on the last step is always the live figure. Refusals — an
 * expired code, a membership on a course that has no member rate — surface
 * here rather than after the form is submitted.
 */
export async function quoteRegistration(input: {
  courseId: string; tierKey: string; isMember: boolean; promoCode?: string;
}): Promise<RegistrationQuote> {
  const { data, error } = await supabase.rpc("onsite_registration_quote", {
    p_course_id: input.courseId,
    p_tier_key: input.tierKey || undefined,
    p_is_member: input.isMember,
    p_promo_code: input.promoCode?.trim() || undefined,
  });
  if (error) fail(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) fail("COURSE_UNAVAILABLE");
  return {
    grossAmount: num(row.gross_amount),
    discountAmount: num(row.discount_amount),
    netAmount: num(row.net_amount),
    discountLabel: row.discount_label ?? null,
  };
}

/**
 * Submit the registration and get an order number to pay.
 *
 * Nothing is confirmed by this call. It writes the answers and reserves a
 * priced order; the seat is created by `convert_paid_intent` once the payment
 * clears — the same guarantee every other paid thing on the platform has, and
 * the reason the confirmation screen can say «تم التسجيل» without qualification
 * when it finally appears.
 */
export async function submitOnsiteRegistration(
  input: OnsiteRegistrationInput,
): Promise<OnsiteRegistrationResult> {
  const { data, error } = await supabase.rpc("create_onsite_registration_intent", {
    p_course_id: input.courseId,
    p_tier_key: input.tierKey || undefined,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email,
    p_knowledge_level: input.knowledgeLevel,
    p_attended_similar: input.attendedSimilar,
    p_goals: input.goals,
    p_topics: input.topics,
    p_organization: input.organization || undefined,
    p_job_title: input.jobTitle || undefined,
    p_years_experience: input.yearsExperience || undefined,
    p_goal_other: input.goalOther || undefined,
    p_question: input.question || undefined,
    p_is_member: input.isMember,
    p_membership_number: input.membershipNumber || undefined,
    p_promo_code: input.promoCode?.trim() || undefined,
  });
  if (error) fail(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) fail("COURSE_UNAVAILABLE");
  return {
    registrationId: row.registration_id,
    orderNumber: row.order_number,
    grossAmount: num(row.gross_amount),
    discountAmount: num(row.discount_amount),
    netAmount: num(row.net_amount),
    courseTitle: row.course_title,
  };
}

// ------------------------------------------------------ the register --

/**
 * Who is coming, for an administrator or the trainer teaching the course.
 *
 * The money columns come back null for a trainer — the function decides that,
 * not this file. Typed as nullable here so the interface has to say so rather
 * than render `0 ر.س` over a figure it was not given.
 */
export type RosterEntry = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  organization: string | null;
  jobTitle: string | null;
  yearsExperience: string | null;
  knowledgeLevel: number;
  attendedSimilar: boolean;
  goals: string[];
  goalOther: string | null;
  topics: string[];
  question: string | null;
  tierKey: string;
  isMember: boolean;
  membershipNumber: string | null;
  membershipVerifiedAt: string | null;
  status: string;
  grossAmount: number | null;
  discountAmount: number | null;
  netAmount: number | null;
  createdAt: string;
};

export async function loadCourseRoster(courseId: string): Promise<RosterEntry[]> {
  const { data, error } = await supabase.rpc("course_registration_roster", { p_course_id: courseId });
  if (error) fail(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    organization: row.organization ?? null,
    jobTitle: row.job_title ?? null,
    yearsExperience: row.years_experience ?? null,
    knowledgeLevel: num(row.knowledge_level),
    attendedSimilar: Boolean(row.attended_similar),
    goals: row.goals ?? [],
    goalOther: row.goal_other ?? null,
    topics: row.topics ?? [],
    question: row.question ?? null,
    tierKey: row.tier_key ?? "",
    isMember: Boolean(row.is_member),
    membershipNumber: row.membership_number ?? null,
    membershipVerifiedAt: row.membership_verified_at ?? null,
    status: row.status,
    grossAmount: row.gross_amount === null || row.gross_amount === undefined ? null : num(row.gross_amount),
    discountAmount: row.discount_amount === null || row.discount_amount === undefined ? null : num(row.discount_amount),
    netAmount: row.net_amount === null || row.net_amount === undefined ? null : num(row.net_amount),
    createdAt: row.created_at,
  }));
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Confirm or withdraw a membership claim. Never reprices — see the migration. */
export async function verifyMembership(registrationId: string, verified: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_verify_membership", {
    p_registration_id: registrationId,
    p_verified: verified,
  });
  if (error) fail(error.message);
}

export async function setCoursePriceTiers(
  courseId: string,
  tiers: Array<{ key: string; label: string; price: number }>,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_course_price_tiers", {
    p_course_id: courseId,
    p_tiers: tiers.map((tier, index) => ({ ...tier, position: index })),
  });
  if (error) fail(error.message);
}
