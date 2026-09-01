import { z } from "zod";
import { config } from "./config.js";
import { addMeetEventAttendees, deleteMeetEvent } from "./google-meet.js";
import { createMeeting, isMeetingConfigured, meetingProvider } from "./meetings.js";
import {
  createInvoice,
  fetchInvoice,
  fetchPayment,
  isMoyasarConfigured,
  isMoyasarTestMode,
  mapPaymentStatus,
  MoyasarError,
  refundPayment,
  type MoyasarPayment,
} from "./moyasar.js";
import { adminClient, authenticatedClient, catalog } from "./supabase.js";

export type ApiResult = { status: number; body: unknown; cacheControl?: string };
const publicCache = "public, max-age=30, s-maxage=120";
const noStore = "no-store";

const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  specialistId: z.string().uuid(),
  slotId: z.string().uuid(),
  mode: z.enum(["remote", "clinic"]).optional(),
  notes: z.string().max(800).optional(),
  /** A code, never an amount — see the note on `enrollmentSchema` below. */
  promoCode: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/).optional(),
});

/** Errors raised by the SQL functions, mapped to HTTP status + Arabic copy. */
const BOOKING_ERRORS: Record<string, { status: number; message: string }> = {
  AUTH_REQUIRED: { status: 401, message: "يلزم تسجيل الدخول." },
  SERVICE_UNAVAILABLE: { status: 409, message: "الخدمة غير متاحة حالياً." },
  SLOT_UNAVAILABLE: { status: 409, message: "هذا الموعد لم يعد متاحاً. اختر موعداً آخر." },
  SLOT_SPECIALIST_MISMATCH: { status: 409, message: "الموعد لا يخص المختص المحدد." },
  MODE_NOT_ALLOWED: { status: 409, message: "طريقة الجلسة غير متاحة لهذه الخدمة." },
  SERVICE_NOT_OFFERED: { status: 409, message: "هذا المختص لا يقدم هذه الخدمة. اختر خدمة أخرى أو مختصاً آخر." },
  COURSE_UNAVAILABLE: { status: 409, message: "الدورة غير متاحة للتسجيل." },
  COURSE_FULL: { status: 409, message: "اكتمل العدد في هذه الدورة." },
  // Unmapped codes fell through to "خطأ غير متوقع", so a student who pressed
  // enrol twice was told the server had broken rather than that they were
  // already on the course.
  ALREADY_ENROLLED: { status: 409, message: "أنت مسجل في هذه الدورة بالفعل. تجدها في «دوراتي»." },
  PAYMENT_NOT_FOUND: { status: 404, message: "لم نجد عملية الدفع. حدّث الصفحة أو تواصل معنا." },
  INTENT_KIND_UNKNOWN: { status: 409, message: "تعذّر تحديد نوع الطلب. ابدأ من جديد أو تواصل معنا." },
  // Raised by create_booking_intent (20260820160000) when a remote slot is
  // requested with no live consent_records row for the caller. The client
  // records consent immediately before this call in the normal flow, so this
  // should only ever surface for a caller that skipped that step.
  TELEHEALTH_CONSENT_REQUIRED: { status: 412, message: "يلزم تسجيل الموافقة على الجلسة عن بُعد أولاً." },
  // Raised by promo_apply (20260901110000). Five refusals rather than one,
  // because the five situations ask different things of the person holding the
  // code — the reasoning is set out in full in client/src/lib/promotions.ts,
  // which carries the same wording for the paths that call Supabase directly.
  PROMO_NOT_FOUND: { status: 404, message: "لا يوجد كود بهذا الاسم. تأكد من كتابته كما وصلك." },
  PROMO_PAUSED: { status: 409, message: "هذا الكود متوقف مؤقتاً." },
  PROMO_EXPIRED: { status: 409, message: "انتهت صلاحية هذا الكود." },
  PROMO_SCHEDULED: { status: 409, message: "لم يبدأ العمل بهذا الكود بعد." },
  PROMO_EXHAUSTED: { status: 409, message: "اكتمل عدد مرات استخدام هذا الكود." },
  PROMO_ALREADY_USED: { status: 409, message: "سبق أن استخدمت هذا الكود." },
  PROMO_ON_FREE_COURSE: { status: 409, message: "هذه الدورة مجانية أصلاً، ولا حاجة لكود خصم." },
  PROMO_COVERS_WHOLE_SESSION: { status: 409, message: "هذا الكود يغطي قيمة الجلسة بالكامل ولا يمكن إتمام الحجز به. تواصل معنا." },
  SERVICE_COMING_SOON: { status: 409, message: "هذه الخدمة «قريباً» ولا تقبل الحجز بعد." },
  // Raised by the intent functions (20260901130000) when a price is above
  // zero but below what Moyasar will invoice. Refused where the amount is
  // decided, so nobody fills in a form for something that cannot be paid for.
  AMOUNT_BELOW_GATEWAY_MINIMUM: { status: 409, message: "قيمة هذا الطلب أقل من الحد الأدنى الذي تقبله بوابة الدفع (١ ر.س). تواصل معنا لإتمام التسجيل." },
};

/**
 * Give a freshly converted remote booking somewhere to meet.
 *
 * Called once, straight after `convert_paid_intent` succeeds. Never throws: a
 * missing meeting link is a degraded booking, not a failed payment, and the
 * `/bookings/:id/meet` endpoint remains as the way to mint one later.
 */
async function issueMeetingLinkIfRemote(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  orderNumber: string,
) {
  if (!isMeetingConfigured()) return;
  try {
    // `patient:profiles(email)` / `specialist:specialists(email)` ride along
    // on the same query via the existing patient_id/specialist_id foreign
    // keys — this is the fix for the "both people just wait" bug. Neither
    // column is reachable through the client's own grants (see
    // 20260823100000_specialist_and_profile_email.sql); `admin` here is the
    // service-role client, which reads past that by design.
    const { data: row } = await admin
      .from("payments")
      .select("booking:bookings(id,mode,starts_at,ends_at,meeting_url,patient:profiles(email),specialist:specialists(email))")
      .eq("order_number", orderNumber)
      .maybeSingle();

    const joined = (row as { booking?: unknown } | null)?.booking;
    const booking = (Array.isArray(joined) ? joined[0] : joined) as
      | {
          id: string; mode: string; starts_at: string; ends_at: string | null; meeting_url: string | null;
          patient?: { email: string | null } | { email: string | null }[] | null;
          specialist?: { email: string | null } | { email: string | null }[] | null;
        }
      | undefined;

    if (!booking || booking.mode !== "remote" || booking.meeting_url) return;

    const patientEmail = Array.isArray(booking.patient) ? booking.patient[0]?.email : booking.patient?.email;
    const specialistEmail = Array.isArray(booking.specialist) ? booking.specialist[0]?.email : booking.specialist?.email;

    const meeting = await createMeeting({
      bookingId: booking.id,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      attendeeEmails: [patientEmail, specialistEmail],
    });
    if (!meeting) return;

    await admin.from("bookings").update({
      meeting_url: meeting.url,
      meeting_event_id: meeting.eventId ?? null,
      meeting_provider: meeting.provider,
    }).eq("id", booking.id);
  } catch (reason) {
    console.error("meeting_link_issue_failed", orderNumber, reason);
  }
}

// Exported (only) so it can be unit-tested directly against every code in
// BOOKING_ERRORS without going through a live `create_booking_intent` /
// `create_enrollment_intent` RPC call. Behavior is unchanged.
export function mapDomainError(message: string | undefined) {
  const key = Object.keys(BOOKING_ERRORS).find((code) => message?.includes(code));
  return key ? BOOKING_ERRORS[key] : null;
}

type SupabaseClientLike = ReturnType<typeof authenticatedClient>;
type AuthOutcome =
  | { ok: true; client: SupabaseClientLike; user: { id: string; email?: string | null } }
  | { ok: false; result: ApiResult };

async function authenticate(authorization: string | null): Promise<AuthOutcome> {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, result: { status: 401, body: { error: "Authentication required" }, cacheControl: noStore } };
  const client = authenticatedClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false, result: { status: 401, body: { error: "Invalid session" }, cacheControl: noStore } };
  return { ok: true, client, user: data.user };
}

export function getHealth(): ApiResult {
  // `meeting` reports the *effective* provider, not the configured one: asking
  // for google without credentials resolves to "none". A deploy that lost its
  // GOOGLE_OAUTH_* values is then visible here, rather than only surfacing as
  // remote bookings that quietly come out with no link.
  return { status: 200, body: { status: "ok", service: "blue-rehab-api", catalog: "supabase", protectedWrites: "authenticated-rls", meeting: meetingProvider() }, cacheControl: noStore };
}

export async function getCatalog(): Promise<ApiResult> {
  const now = new Date().toISOString();
  const [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult] = await Promise.all([
    catalog.from("services").select("id,name,description,duration_minutes,price,allowed_modes,is_demo,is_coming_soon").eq("is_active", true).order("price"),
    catalog.from("specialists").select("id,display_name,title,bio,specialties,photo_url,languages,is_verified,is_demo").order("created_at"),
    catalog.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo,cover_url,compare_at_price,presenter_name").eq("is_published", true).order("starts_at"),
    catalog.from("branches").select("id,name,city,address,is_demo").eq("is_active", true).order("name"),
    catalog.from("availability_slots").select("id,specialist_id,branch_id,starts_at,ends_at,mode").eq("is_available", true).gt("starts_at", now).order("starts_at").limit(40),
  ]);
  const error = [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult].find((result) => result.error)?.error;
  if (error) throw error;
  return {
    status: 200,
    cacheControl: publicCache,
    body: {
      source: "supabase",
      services: (servicesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", durationMinutes: Number(row.duration_minutes), price: Number(row.price), modes: row.allowed_modes, isDemo: row.is_demo, isComingSoon: row.is_coming_soon })),
      specialists: (specialistsResult.data ?? []).map((row) => ({ id: row.id, name: row.display_name, title: row.title, bio: row.bio ?? "", specialties: row.specialties, languages: row.languages, isVerified: row.is_verified, isDemo: row.is_demo, photoUrl: row.photo_url ?? null })),
      courses: (coursesResult.data ?? []).map((row) => ({ id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo, coverUrl: row.cover_url ?? null, compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price), presenterName: row.presenter_name ?? null })),
      branches: (branchesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, city: row.city, address: row.address, isDemo: row.is_demo })),
      availability: (slotsResult.data ?? []).map((row) => ({ id: row.id, specialistId: row.specialist_id, branchId: row.branch_id, startsAt: row.starts_at, endsAt: row.ends_at, mode: row.mode })),
    },
  };
}

export async function getCourseDetail(slugValue: string): Promise<ApiResult> {
  // A course slug is a DB-generated kebab token (e.g. "acl-diagnosis-and-treatment").
  // Anything outside that shape cannot name a real course, so it is a miss — not a
  // 500. Guarding here also keeps quotes/semicolons/spaces out of the PostgREST
  // filter value, where certain combinations otherwise raise a parse error that
  // surfaced to the caller as an "Unexpected server error".
  const parsed = z.string().min(2).max(160).regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/).safeParse(slugValue);
  if (!parsed.success) return { status: 404, body: { error: "Course not found" }, cacheControl: noStore };
  const slug = parsed.data;
  const courseResult = await catalog.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo,cover_url,compare_at_price,presenter_name").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) return { status: 404, body: { error: "Course not found" }, cacheControl: noStore };
  const modulesResult = await catalog.from("course_modules").select("id,title,summary,position").eq("course_id", courseResult.data.id).order("position");
  if (modulesResult.error) throw modulesResult.error;
  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  // The syllabus is what a buyer is deciding on, so every lesson title belongs
  // on the page — the padlock beside it is the point. Read through the anon key
  // and RLS returns only the free previews, so a paid course looked like it had
  // one lesson. This reads past that, and the column list is the guard: it has
  // never included `content_url`, which is what actually needs paying for. A
  // student's own access to that is granted by RLS, client-side, in learning.ts.
  const lessonReader = adminClient() ?? catalog;
  const lessonsResult = moduleIds.length ? await lessonReader.from("course_lessons").select("id,module_id,title,content_type,duration_minutes,is_preview,position").in("module_id", moduleIds).order("position") : { data: [], error: null };
  if (lessonsResult.error) throw lessonsResult.error;
  const row = courseResult.data;
  return {
    status: 200,
    cacheControl: publicCache,
    body: {
      source: "supabase",
      course: { id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo, coverUrl: row.cover_url ?? null, compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price), presenterName: row.presenter_name ?? null },
      modules: (modulesResult.data ?? []).map((module) => ({ id: module.id, title: module.title, summary: module.summary ?? "", position: module.position, lessons: (lessonsResult.data ?? []).filter((lesson) => lesson.module_id === module.id).map((lesson) => ({ id: lesson.id, title: lesson.title, contentType: lesson.content_type, durationMinutes: lesson.duration_minutes, isPreview: lesson.is_preview })) })),
    },
  };
}

type IntentRow = {
  order_number: string;
  amount: number;
  currency: string;
  starts_at: string;
  ends_at: string | null;
  mode: "remote" | "clinic";
  reserved_until: string | null;
};

type BookingRow = {
  booking_id: string;
  order_number: string;
  amount: number;
  currency: string;
  starts_at: string;
  ends_at: string | null;
  mode: "remote" | "clinic";
  status: string;
};

/**
 * Create a booking. The price, the slot check and the matching payment row all
 * come from `create_booking_with_payment` in the database, so the browser cannot
 * influence what is charged. Remote sessions are auto-scheduled in Google
 * Calendar, which also emails the invitation to the patient.
 */
export async function createBookingDraft(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  const body = bookingSchema.parse(payload);

  // Creates an *intent*, not a booking. The appointment only comes into
  // existence once the payment is verified — an abandoned checkout should leave
  // nothing behind, and no screen should say "booked" before money moves. The
  // slot is held briefly so two payers rarely collide over the same time.
  const { data, error } = await auth.client.rpc("create_booking_intent", {
    p_service_id: body.serviceId,
    p_specialist_id: body.specialistId,
    p_slot_id: body.slotId,
    p_notes: body.notes ?? null,
    p_promo_code: body.promoCode ?? null,
  });
  if (error) {
    const mapped = mapDomainError(error.message);
    if (mapped) return { status: mapped.status, body: { error: mapped.message }, cacheControl: noStore };
    throw error;
  }
  const intent = (Array.isArray(data) ? data[0] : data) as IntentRow | undefined;
  if (!intent) return { status: 409, body: { error: "تعذر تجهيز الطلب." }, cacheControl: noStore };

  return {
    status: 201,
    cacheControl: noStore,
    body: {
      data: {
        orderNumber: intent.order_number,
        total: Number(intent.amount),
        currency: intent.currency,
        starts_at: intent.starts_at,
        ends_at: intent.ends_at,
        mode: intent.mode,
        reservedUntil: intent.reserved_until,
      },
      next: isMoyasarConfigured() ? "payment" : "payment_unconfigured",
    },
  };
}

const meetingParamsSchema = z.object({ bookingId: z.string().uuid() });

/**
 * Generate (or return an existing) Google Meet link for a remote booking that
 * belongs to the authenticated user. Persisting the link is best-effort so a
 * missing column or policy never blocks the patient from receiving it.
 */
export async function createBookingMeeting(authorization: string | null, params: unknown): Promise<ApiResult> {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401, body: { error: "Authentication required" }, cacheControl: noStore };
  const { bookingId } = meetingParamsSchema.parse(params);

  const client = authenticatedClient(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return { status: 401, body: { error: "Invalid session" }, cacheControl: noStore };

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("id,patient_id,specialist_id,mode,starts_at,ends_at,meeting_url")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { status: 404, body: { error: "Booking not found" }, cacheControl: noStore };
  if (booking.patient_id !== userData.user.id) return { status: 403, body: { error: "Forbidden" }, cacheControl: noStore };
  if (booking.mode !== "remote") return { status: 409, body: { error: "Booking is not a remote session" }, cacheControl: noStore };

  if (booking.meeting_url) {
    return { status: 200, body: { meetingUrl: booking.meeting_url, reused: true }, cacheControl: noStore };
  }
  if (!isMeetingConfigured()) {
    return { status: 200, body: { meetingUrl: null, configured: false }, cacheControl: noStore };
  }

  // `userData.user.email` is never real here — this platform authenticates by
  // phone (see 20260823100000_specialist_and_profile_email.sql), so under the
  // old code this endpoint minted a Meet link with no attendee at all, same
  // bug as issueMeetingLinkIfRemote. `email` is grant-restricted away from
  // `authenticated` (client), which is why this reads through `admin` —
  // ownership was already established above via the RLS-scoped client, so
  // this is only ever fetching contact emails for a booking this caller owns.
  const admin = adminClient();
  const [patientRow, specialistRow] = await Promise.all([
    admin?.from("profiles").select("email").eq("id", booking.patient_id).maybeSingle().then((r) => r.data),
    admin?.from("specialists").select("email").eq("id", booking.specialist_id).maybeSingle().then((r) => r.data),
  ]);

  const meeting = await createMeeting({
    bookingId: booking.id,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    attendeeEmails: [patientRow?.email, specialistRow?.email],
  });
  if (!meeting) {
    return { status: 200, body: { meetingUrl: null, configured: false }, cacheControl: noStore };
  }

  // Best-effort persistence; the link is already returned regardless of outcome.
  await client.from("bookings")
    .update({ meeting_url: meeting.url, meeting_event_id: meeting.eventId ?? null, meeting_provider: meeting.provider })
    .eq("id", booking.id);

  return { status: 200, body: { meetingUrl: meeting.url, configured: true }, cacheControl: noStore };
}

// ---------------------------------------------------------- meet test tool --
//
// Admin-only diagnostic for the bug this whole file's Meet wiring exists to
// fix: a real Calendar event, with the same attendee mechanism a real booking
// uses, so a specialist and a tester can actually join with their real Google
// accounts and confirm neither of them sits in the waiting room. Nothing
// about this reuses booking/payment state — it exists so the fix can be
// proven with real accounts before trusting it on a real patient.

const testMeetingSchema = z.object({
  specialistId: z.string().uuid(),
  testEmail: z.string().email(),
});

async function requireAdmin(authorization: string | null): Promise<AuthOutcome> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth;
  const { data, error } = await auth.client.rpc("is_admin");
  if (error || data !== true) {
    return { ok: false, result: { status: 403, body: { error: "للإدارة فقط." }, cacheControl: noStore } };
  }
  return auth;
}

/**
 * Specialist names for the test-meeting picker, with only a boolean saying
 * whether an email is on file — never the address itself. The browser has no
 * legitimate need for it; the create/delete actions below take a specialist
 * id and resolve the real address server-side.
 */
export async function listMeetTestSpecialists(authorization: string | null): Promise<ApiResult> {
  const auth = await requireAdmin(authorization);
  if (!auth.ok) return auth.result;

  const admin = adminClient();
  if (!admin) return { status: 503, body: { error: "مفتاح الخدمة غير مهيأ على الخادم." }, cacheControl: noStore };

  const { data, error } = await admin.from("specialists").select("id,display_name,email").order("display_name");
  if (error) throw error;

  return {
    status: 200,
    cacheControl: noStore,
    body: (data ?? []).map((row) => ({ id: row.id, displayName: row.display_name, hasEmail: Boolean(row.email) })),
  };
}

export async function createTestMeeting(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await requireAdmin(authorization);
  if (!auth.ok) return auth.result;

  if (meetingProvider() !== "google") {
    return { status: 409, body: { error: "المزوّد الحالي ليس Google Meet — لا يوجد ما يُختبر." }, cacheControl: noStore };
  }

  const input = testMeetingSchema.parse(payload);
  const admin = adminClient();
  if (!admin) {
    return { status: 503, body: { error: "مفتاح الخدمة غير مهيأ على الخادم." }, cacheControl: noStore };
  }

  const { data: specialist } = await admin
    .from("specialists")
    .select("display_name,email")
    .eq("id", input.specialistId)
    .maybeSingle();
  if (!specialist) return { status: 404, body: { error: "لم نجد هذا الأخصائي." }, cacheControl: noStore };
  if (!specialist.email) {
    return { status: 422, body: { error: `لا يوجد بريد إلكتروني مسجّل لـ ${specialist.display_name}. أضِفه أولاً.` }, cacheControl: noStore };
  }

  // Ten minutes out, thirty-minute window — enough time to open the link and
  // join, short enough that a forgotten test event does not sit on the
  // clinic's calendar looking like a real appointment.
  const startsAt = new Date(Date.now() + 10 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  const meeting = await createMeeting({
    bookingId: `test-${Date.now().toString(36)}`,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    attendeeEmails: [specialist.email, input.testEmail],
  });
  if (!meeting) {
    return { status: 503, body: { error: "تعذّر إنشاء الاجتماع." }, cacheControl: noStore };
  }

  return {
    status: 200,
    cacheControl: noStore,
    body: {
      meetingUrl: meeting.url,
      eventId: meeting.eventId,
      attendees: meeting.attendees ?? [],
      specialistName: specialist.display_name,
      specialistEmail: specialist.email,
      testEmail: input.testEmail,
      startsAt: startsAt.toISOString(),
    },
  };
}

const deleteTestMeetingSchema = z.object({ eventId: z.string().min(1) });

export async function deleteTestMeeting(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await requireAdmin(authorization);
  if (!auth.ok) return auth.result;

  const { eventId } = deleteTestMeetingSchema.parse(payload);
  try {
    await deleteMeetEvent(eventId);
  } catch (reason) {
    return { status: 502, body: { error: reason instanceof Error ? reason.message : "تعذّر الحذف." }, cacheControl: noStore };
  }
  return { status: 200, body: { deleted: true }, cacheControl: noStore };
}

const repairMeetingSchema = z.object({ bookingId: z.string().uuid() });

/**
 * Re-invite a booking's specialist and patient on its existing Meet event.
 *
 * For bookings created before the attendee fix (20260823100000 /
 * 292b693): their calendar event has no guest list at all, so neither side
 * could join without knocking — and on this clinic's personal (non-Workspace)
 * Google account, only the organiser can admit a knock, which nobody ever
 * is. Re-reads whichever email(s) are on file *now* (a patient's
 * `profiles.email` may have just been added) and patches them onto the
 * event that already exists, rather than minting a new link — the booking,
 * the time and the link the patient already has stay exactly the same.
 */
export async function repairBookingMeetingAttendees(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await requireAdmin(authorization);
  if (!auth.ok) return auth.result;

  const { bookingId } = repairMeetingSchema.parse(payload);
  const admin = adminClient();
  if (!admin) return { status: 503, body: { error: "مفتاح الخدمة غير مهيأ على الخادم." }, cacheControl: noStore };

  const { data: booking } = await admin
    .from("bookings")
    .select("id,mode,meeting_event_id,meeting_provider,patient:profiles(email),specialist:specialists(email,display_name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { status: 404, body: { error: "لم نجد هذا الحجز." }, cacheControl: noStore };
  if (booking.mode !== "remote") return { status: 409, body: { error: "هذا الحجز ليس جلسة عن بُعد." }, cacheControl: noStore };
  if (booking.meeting_provider !== "google_meet" || !booking.meeting_event_id) {
    return { status: 409, body: { error: "لا يوجد اجتماع Google Meet مرتبط بهذا الحجز." }, cacheControl: noStore };
  }

  const patient = Array.isArray(booking.patient) ? booking.patient[0] : booking.patient;
  const specialist = Array.isArray(booking.specialist) ? booking.specialist[0] : booking.specialist;
  const emails = [patient?.email, specialist?.email].filter((e): e is string => Boolean(e));

  if (!emails.length) {
    return { status: 422, body: { error: "لا يوجد بريد إلكتروني لأي من المريض أو الأخصائي بعد." }, cacheControl: noStore };
  }

  try {
    const attendees = await addMeetEventAttendees(booking.meeting_event_id, emails);
    return { status: 200, cacheControl: noStore, body: { attendees, specialistName: specialist?.display_name ?? null } };
  } catch (reason) {
    return { status: 502, body: { error: reason instanceof Error ? reason.message : "تعذّر تحديث المدعوّين." }, cacheControl: noStore };
  }
}

// ------------------------------------------------------------------ courses --

const enrollmentSchema = z.object({
  courseId: z.string().uuid(),
  // A code, never an amount. What it is worth is decided by the database —
  // see 20260901110000_promotion_codes_on_payments.sql. The pattern is the
  // same one the column enforces, so a malformed string is refused here rather
  // than travelling on to be refused there.
  promoCode: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/).optional(),
});

/** Enroll in a course. Price, discount and seat check are enforced in the database. */
export async function createEnrollment(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  const body = enrollmentSchema.parse(payload);

  const { data, error } = await auth.client.rpc("create_enrollment_intent", {
    p_course_id: body.courseId,
    p_promo_code: body.promoCode ?? null,
  });
  if (error) {
    const mapped = mapDomainError(error.message);
    if (mapped) return { status: mapped.status, body: { error: mapped.message }, cacheControl: noStore };
    throw error;
  }
  // The four columns create_enrollment_intent() actually returns, plus the
  // discount added alongside them. The previous shape here named
  // `enrollment_id` and `status`, neither of which the function has returned
  // since 20260807110000 inverted the order — both arrived as `undefined` and
  // were forwarded as such. `status` is derived from the one fact the response
  // does carry: an order number means there is still something to pay.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_number: string | null; amount: number; currency: string; course_title: string; discount: number }
    | undefined;
  if (!row) return { status: 409, body: { error: "تعذر إتمام التسجيل." }, cacheControl: noStore };

  return {
    status: 201,
    cacheControl: noStore,
    body: {
      data: {
        status: row.order_number ? "pending_payment" : "active",
        amountDue: Number(row.amount),
        orderNumber: row.order_number,
        currency: row.currency,
        courseTitle: row.course_title,
        discount: Number(row.discount ?? 0),
      },
      next: isMoyasarConfigured() ? "payment" : "payment_unconfigured",
    },
  };
}

// ----------------------------------------------------------------- payments --

const checkoutSchema = z.object({ orderNumber: z.string().min(4).max(64) });

export function getPaymentConfig(): ApiResult {
  return {
    status: 200,
    cacheControl: noStore,
    body: {
      provider: "moyasar",
      configured: isMoyasarConfigured(),
      testMode: isMoyasarTestMode(),
      publishableKey: config.MOYASAR_PUBLISHABLE_KEY ?? null,
      currency: "SAR",
      // Lets the booking screen promise a Meet link only when one can actually
      // be issued, instead of telling every remote patient that a link is coming.
      meetEnabled: isMeetingConfigured(),
      meetProvider: meetingProvider(),
    },
  };
}

/**
 * Start a checkout: create a Moyasar hosted invoice for an existing pending
 * payment. The charged amount is read from our own `payments` row, never from
 * the request, so the client cannot alter what it pays.
 */
export async function createPaymentCheckout(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  if (!isMoyasarConfigured()) {
    return { status: 503, body: { error: "بوابة الدفع غير مهيأة بعد." }, cacheControl: noStore };
  }
  const body = checkoutSchema.parse(payload);

  const { data: payment, error } = await auth.client
    .from("payments")
    .select("id,order_number,user_id,amount,status,booking_id,enrollment_id,payment_url,provider_invoice_id")
    .eq("order_number", body.orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return { status: 404, body: { error: "طلب الدفع غير موجود." }, cacheControl: noStore };
  if (payment.user_id !== auth.user.id) return { status: 403, body: { error: "Forbidden" }, cacheControl: noStore };
  if (payment.status === "succeeded") {
    return { status: 409, body: { error: "تم دفع هذا الطلب مسبقاً." }, cacheControl: noStore };
  }
  // Reuse an unpaid invoice instead of minting a second one for the same order.
  if (payment.payment_url) {
    return { status: 200, body: { paymentUrl: payment.payment_url, reused: true }, cacheControl: noStore };
  }

  /*
   * A gateway refusal is not a server fault, and must not be reported as one.
   *
   * Every MoyasarError used to propagate to `apiErrorResult`, which answers
   * «Unexpected server error» — the message a patient actually saw after
   * filling in a four-step registration form for a course priced at 0.99 SAR,
   * because Moyasar declines anything under 100 halalas. The reason was
   * knowable, printed in full in the gateway's own response, and thrown away.
   *
   * The amount floor is now refused earlier, when the price is decided
   * (20260901130000), so this should no longer be reachable for that case. It
   * stays because orders created before that migration still exist, and
   * because the next refusal will be some other rule of Moyasar's that this
   * platform has not learned yet — and it should surface as itself.
   */
  let invoice;
  try {
    invoice = await createInvoice({
      amount: Number(payment.amount),
      description: payment.booking_id ? `جلسة علاج طبيعي — ${payment.order_number}` : `دورة تأهيلية — ${payment.order_number}`,
      callbackUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/payment/callback`,
      successUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/payment/callback`,
      backUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/portal`,
      orderNumber: payment.order_number,
    });
  } catch (reason) {
    if (!(reason instanceof MoyasarError)) throw reason;
    // Logged in full: the Arabic below is what the payer can act on, and the
    // gateway's own wording is what an operator needs.
    console.error("moyasar_invoice_rejected", payment.order_number, reason.message);
    const belowMinimum = /greater than or equal to 100|amount/i.test(reason.message)
      && Number(payment.amount) < 1;
    return {
      status: 422,
      cacheControl: noStore,
      body: {
        error: belowMinimum
          ? "قيمة هذا الطلب أقل من الحد الأدنى الذي تقبله بوابة الدفع (١ ر.س). تواصل معنا لإتمام التسجيل."
          : "تعذّر فتح صفحة الدفع لدى البوابة. حاول مرة أخرى، وإن تكرر الأمر تواصل معنا.",
      },
    };
  }

  // Persisting needs the service role (users cannot write payments). Best-effort:
  // the hosted URL is returned either way and verification is by payment id.
  await adminClient()?.from("payments")
    .update({ provider_invoice_id: invoice.id, payment_url: invoice.url, status: "processing", updated_at: new Date().toISOString() })
    .eq("id", payment.id);

  return { status: 200, body: { paymentUrl: invoice.url, invoiceId: invoice.id }, cacheControl: noStore };
}

const verifySchema = z
  .object({
    paymentId: z.string().min(6).max(64).optional(),
    invoiceId: z.string().min(6).max(64).optional(),
  })
  .refine((value) => Boolean(value.paymentId || value.invoiceId), {
    message: "paymentId or invoiceId is required",
  });

/**
 * Resolve the Moyasar payment behind a callback.
 *
 * Moyasar returns the payer with a payment id on card flows, but Apple Pay and
 * some wallet flows come back with only the invoice id. Accept either and read
 * the payment out of the invoice when needed.
 */
async function resolveRemotePayment(input: { paymentId?: string; invoiceId?: string }) {
  if (input.paymentId) return await fetchPayment(input.paymentId);

  const invoice = await fetchInvoice(input.invoiceId as string);
  const payments = invoice.payments ?? [];
  return payments.find((item) => item.status === "paid") ?? payments[payments.length - 1] ?? null;
}

/**
 * Find our own payment row for a remote Moyasar payment.
 *
 * An invoice carries `metadata.order_number`, but the payment created *inside*
 * that invoice does not inherit it — `metadata` comes back null. Matching on
 * metadata alone therefore failed for every hosted-invoice payment, which is the
 * whole flow. Fall back to the invoice id we stored when the invoice was minted.
 */
// Exported so the matching order (order_number, then provider_invoice_id, then
// "not found") can be unit-tested against a fake Supabase client instead of a
// live database.
export async function findLocalPayment(client: ReturnType<typeof authenticatedClient>, remote: MoyasarPayment) {
  const columns = "id,order_number,user_id,amount,status,booking_id,enrollment_id";
  const orderNumber = (remote as { metadata?: Record<string, string> | null }).metadata?.order_number;

  if (orderNumber) {
    const byOrder = await client.from("payments").select(columns).eq("order_number", orderNumber).maybeSingle();
    if (byOrder.error) throw byOrder.error;
    if (byOrder.data) return byOrder.data;
  }

  if (remote.invoice_id) {
    const byInvoice = await client.from("payments").select(columns).eq("provider_invoice_id", remote.invoice_id).maybeSingle();
    if (byInvoice.error) throw byInvoice.error;
    if (byInvoice.data) return byInvoice.data;
  }

  return null;
}

/**
 * Whether what Moyasar actually captured (halalas) matches what our own
 * `payments` row expects to be charged (SAR).
 *
 * Extracted out of `verifyPayment` so the rounding rule that decides whether a
 * payment is "close enough" to confirm — it isn't; it must match exactly — has
 * a unit test that doesn't need a live payment row or a gateway response.
 * Same rounding as `toHalalas` in moyasar.ts, kept separate because this side
 * of the comparison is about matching a stored order, not converting a price.
 */
export function amountsMatch(expectedSar: number, capturedHalalas: number): boolean {
  return Math.round(Number(expectedSar) * 100) === Number(capturedHalalas);
}

/**
 * Verify a payment against Moyasar and record the outcome.
 *
 * Callback query parameters are attacker-controlled, so nothing here trusts
 * them: the status and the amount are re-read from Moyasar with the secret key
 * and matched against our stored order before anything is marked as paid.
 */
export async function verifyPayment(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  if (!isMoyasarConfigured()) {
    return { status: 503, body: { error: "بوابة الدفع غير مهيأة بعد." }, cacheControl: noStore };
  }
  const input = verifySchema.parse(payload);

  let remote: MoyasarPayment | null;
  try {
    remote = await resolveRemotePayment(input);
  } catch (error) {
    // An identifier the gateway does not recognise is a bad request, not a
    // server fault — surface it as such instead of a 500.
    if (error instanceof MoyasarError && error.status >= 400 && error.status < 500) {
      return { status: 404, body: { error: "لم نجد عملية دفع بهذا المعرف." }, cacheControl: noStore };
    }
    throw error;
  }
  if (!remote) {
    return { status: 422, body: { error: "لم تُسجل أي عملية دفع على هذه الفاتورة بعد." }, cacheControl: noStore };
  }

  const payment = await findLocalPayment(auth.client, remote);
  if (!payment) return { status: 404, body: { error: "طلب الدفع غير موجود." }, cacheControl: noStore };
  if (payment.user_id !== auth.user.id) return { status: 403, body: { error: "Forbidden" }, cacheControl: noStore };

  const mappedStatus = mapPaymentStatus(remote.status);
  const amountMatches = amountsMatch(Number(payment.amount), Number(remote.amount));
  if (mappedStatus === "succeeded" && !amountMatches) {
    // Paid amount differs from the order: never confirm, flag for review.
    await adminClient()?.from("payments")
      .update({ status: "failed", failure_reason: "amount_mismatch", provider_payment_id: remote.id, updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    return { status: 409, body: { error: "قيمة الدفع لا تطابق الطلب." }, cacheControl: noStore };
  }

  const admin = adminClient();
  if (!admin) {
    // Without the service role we can verify but not persist. Report honestly
    // instead of pretending the booking is confirmed.
    return {
      status: 200,
      cacheControl: noStore,
      body: { status: mappedStatus, persisted: false, reason: "service_role_key_missing" },
    };
  }

  const now = new Date().toISOString();

  // Verification is idempotent. Reloading the callback page, or returning to it
  // from history, re-runs this with the same identifier; without the guard each
  // visit inserted another "payment received" notice for a payment that was
  // already settled.
  const alreadySettled = payment.status === "succeeded" && mappedStatus === "succeeded";

  if (!alreadySettled) {
    await admin.from("payments").update({
      status: mappedStatus,
      provider_payment_id: remote.id,
      paid_at: mappedStatus === "succeeded" ? now : null,
      failure_reason: mappedStatus === "failed" ? (remote.source?.message ?? "payment_failed") : null,
      updated_at: now,
    }).eq("id", payment.id);
  }

  let conflict = false;

  if (mappedStatus === "succeeded" && !alreadySettled) {
    // The booking is created here, not before payment. If the held slot lapsed
    // and somebody else took the time in the meantime, the money goes straight
    // back — a patient must never be left paid-up against an appointment that
    // belongs to someone else.
    const { data: outcome, error: convertError } = await admin.rpc("convert_paid_intent", {
      p_order_number: payment.order_number,
    });
    if (convertError) throw convertError;

    if (outcome === "slot_taken") {
      conflict = true;
      try {
        await refundPayment(remote.id);
        await admin.from("payments").update({
          status: "refunded", failure_reason: "slot_taken_refunded",
          provider_payment_id: remote.id, updated_at: now,
        }).eq("id", payment.id);
      } catch (refundError) {
        // Flag it loudly: money is held against nothing and needs a human.
        console.error("refund_failed", payment.order_number, refundError);
        await admin.from("payments").update({
          status: "succeeded", failure_reason: "slot_taken_refund_failed",
          provider_payment_id: remote.id, paid_at: now, updated_at: now,
        }).eq("id", payment.id);
      }
      await admin.from("notifications").insert({
        user_id: payment.user_id, channel: "in_app", event_type: "booking_slot_taken",
        title: "تعذر تأكيد الموعد",
        body: "حُجز هذا الموعد قبل إتمام دفعك مباشرة، وتمت إعادة المبلغ إليك. يمكنك اختيار موعد آخر.",
        data: { order_number: payment.order_number },
      });
    }
  }

  if (mappedStatus === "succeeded" && !alreadySettled && !conflict) {
    // Retire the "awaiting payment" notice for this order. Left unread it sits
    // directly under the confirmation saying the opposite thing, which reads as
    // the platform contradicting itself.
    await admin.from("notifications")
      .update({ read_at: now })
      .eq("user_id", payment.user_id)
      .in("event_type", ["booking_created", "enrollment_created"])
      .is("read_at", null)
      .contains("data", payment.booking_id
        ? { booking_id: payment.booking_id }
        : { enrollment_id: payment.enrollment_id });

    // Issue the meeting link for a remote session.
    //
    // Under pay-first the booking does not exist until this moment, and nothing
    // asked for a link afterwards — `requestMeetingLink` was written but never
    // called from anywhere. The result was that a patient paid for a remote
    // physiotherapy session and neither side had any way to meet. Doing it here
    // means the link is on the booking before the confirmation is sent, so it is
    // waiting in the account page and on the specialist's schedule.
    //
    // Deliberately still awaited, not detached: this is a plain Node function
    // (api/index.ts), not an Edge Function or one wired up with a `waitUntil`
    // primitive — background work started after the response is sent has no
    // guarantee of finishing, and a link that silently never gets written is a
    // worse bug than a slower response. What changed instead: `createMeeting`'s
    // Google calls now carry an 8s timeout (google-meet.ts), so this step has a
    // hard ceiling rather than being able to run out Vercel's 30s budget on its
    // own — a hung Calendar API can no longer turn an already-successful
    // payment into a client-visible timeout. `issueMeetingLinkIfRemote` already
    // never throws past this point either way (see its own try/catch above).
    await issueMeetingLinkIfRemote(admin, payment.order_number);

    await admin.from("notifications").insert({
      user_id: payment.user_id,
      channel: "in_app",
      event_type: "payment_succeeded",
      title: "تم استلام الدفع",
      body: payment.booking_id ? "تم تأكيد حجزك بنجاح." : "تم تأكيد تسجيلك في الدورة.",
      data: payment.booking_id
        ? { order_number: payment.order_number, booking_id: payment.booking_id }
        : { order_number: payment.order_number, enrollment_id: payment.enrollment_id },
    });
  } else if (mappedStatus === "failed") {
    // Hand the held time back rather than letting the reservation run its course.
    await admin.rpc("release_intent", { p_order_number: payment.order_number });
  }

  if (conflict) {
    return {
      status: 200,
      cacheControl: noStore,
      body: {
        status: "slot_taken", persisted: true, orderNumber: payment.order_number,
        kind: "booking", amount: Number(payment.amount),
      },
    };
  }

  // Enough context for the callback screen to confirm what was actually bought,
  // rather than showing one generic message for a session and a course alike.
  let receipt: Record<string, unknown> = {};
  const settled = await findLocalPayment(auth.client, remote);
  const bookingId = settled?.booking_id ?? payment.booking_id;
  const enrollmentId = settled?.enrollment_id ?? payment.enrollment_id;

  if (mappedStatus === "succeeded" && bookingId) {
    const { data: booked } = await admin
      .from("bookings")
      .select("starts_at,mode,meeting_url,service_id,services(name),specialists(display_name)")
      .eq("id", bookingId)
      .maybeSingle();
    const service = booked?.services as { name?: string } | { name?: string }[] | null | undefined;
    const spec = booked?.specialists as { display_name?: string } | { display_name?: string }[] | null | undefined;
    receipt = {
      title: (Array.isArray(service) ? service[0]?.name : service?.name) ?? "جلسة علاج طبيعي",
      specialistName: (Array.isArray(spec) ? spec[0]?.display_name : spec?.display_name) ?? null,
      startsAt: booked?.starts_at ?? null,
      mode: booked?.mode ?? null,
      meetingUrl: booked?.meeting_url ?? null,
    };
  } else if (mappedStatus === "succeeded" && enrollmentId) {
    const { data: enrolled } = await admin
      .from("enrollments")
      .select("course_id,courses(title,slug)")
      .eq("id", enrollmentId)
      .maybeSingle();
    const course = enrolled?.courses as { title?: string; slug?: string } | { title?: string; slug?: string }[] | null | undefined;
    const first = Array.isArray(course) ? course[0] : course;
    receipt = { title: first?.title ?? "دورة تأهيلية", slug: first?.slug ?? null };
  }

  return {
    status: 200,
    cacheControl: noStore,
    body: {
      status: mappedStatus,
      persisted: true,
      orderNumber: payment.order_number,
      bookingId,
      enrollmentId,
      kind: bookingId ? "booking" : "course",
      amount: Number(payment.amount),
      ...receipt,
    },
  };
}

/**
 * Settle any of the caller's payments that are still open at Moyasar.
 *
 * Confirmation used to depend entirely on the payer coming back to the callback
 * page. If they closed the tab, paid through a wallet that did not return
 * cleanly, or lost connection, the booking sat in `pending_payment` forever
 * while the money had actually moved. This re-reads every unsettled order from
 * Moyasar and applies the same verified path, so the portal repairs itself.
 *
 * Still worth adding a Moyasar webhook eventually — this closes the gap for
 * anyone who reopens the site, not for someone who never returns.
 */
/**
 * Why the gateway refused a refund, in words the operator can act on.
 *
 * Everything used to collapse into «راجع لوحة مُيسّر ثم حاول مرة أخرى», which
 * is advice, not a reason — and it sent somebody to retry a refund eight times
 * against an account that could not pay it. Moyasar states the cause in the
 * response every time; the useful ones are named here.
 *
 * `insufficient_balance` is the one that matters most, and it is not a fault in
 * this platform at all: a refund is paid out of the Moyasar account's own
 * balance, so an account that has not been funded or settled cannot return
 * money it no longer holds. Retrying will never fix it; adding balance will.
 */
function refundRejectionMessage(raw: string): string {
  const type = /"type"\s*:\s*"([a-z_]+)"/.exec(raw)?.[1];
  switch (type) {
    case "insufficient_balance":
      return "رصيد حساب مُيسّر لا يكفي لتنفيذ الاسترداد. الاسترداد يُخصم من رصيد الحساب لدى البوابة — أضف رصيداً أو انتظر تسوية المدفوعات، ثم أعد المحاولة. إعادة المحاولة الآن ستفشل مرة أخرى.";
    case "amount_exceeds_refundable":
    case "invalid_amount":
      return "المبلغ المطلوب أكبر مما يمكن استرداده لهذه العملية لدى البوابة.";
    case "payment_not_refundable":
      return "هذه العملية غير قابلة للاسترداد لدى البوابة — قد تكون مستردة مسبقاً أو لم تُسوَّ بعد.";
    default:
      return "رفضت بوابة الدفع طلب الاسترداد. راجع لوحة مُيسّر لمعرفة السبب.";
  }
}

/**
 * A refund names an order and nothing else.
 *
 * There is deliberately no `amount` field. It used to accept one, validated
 * against the remaining balance — which was safe, but safe in the wrong way:
 * it left an operator typing a figure into a box next to a real card, where
 * the only outcomes are the right number, a rejected number, or a smaller
 * number nobody meant. Removing the field removes the whole class. The amount
 * is what is left on the order, computed below from our own row.
 *
 * If a genuine partial refund is ever needed, it belongs here as a deliberate,
 * separately-reasoned addition — not as a text box that happens to allow it.
 */
const refundSchema = z.object({
  orderNumber: z.string().min(4).max(64),
  reason: z.string().max(300).optional(),
});

/**
 * Refund a payment that should not have been taken.
 *
 * Administration only, and the one endpoint here that sends money back rather
 * than collecting it, so the order of operations is the whole design:
 *
 *   1. Confirm the caller is an administrator.
 *   2. Read the payment with the service role and decide, from our own row,
 *      how much is actually refundable. The request never sets the figure.
 *   3. Ask Moyasar to refund that figure.
 *   4. Only then record it, cancel what it bought, and tell the payer.
 *
 * Step 4 last is what matters. Recording first and refunding second would mean
 * a gateway failure leaves a booking cancelled and a refund marked that never
 * happened — the customer loses the appointment and the money. In this order
 * the worst case is a refund Moyasar performed and we failed to write down,
 * which is visible in the gateway, recoverable by hand, and does not take an
 * appointment away from anyone.
 */
export async function refundPaymentByOrder(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await requireAdmin(authorization);
  if (!auth.ok) return auth.result;
  if (!isMoyasarConfigured()) {
    return { status: 503, body: { error: "بوابة الدفع غير مهيأة بعد." }, cacheControl: noStore };
  }
  const body = refundSchema.parse(payload);

  const admin = adminClient();
  if (!admin) {
    // Without the service role the outcome cannot be written down, and a
    // refund we cannot record is worse than one we have not made yet.
    return { status: 503, body: { error: "لا يمكن تسجيل الاسترداد — مفتاح الخدمة غير مهيأ." }, cacheControl: noStore };
  }

  const { data: payment, error } = await admin
    .from("payments")
    .select("id,order_number,amount,tax,fees,refunded_amount,status,provider_payment_id")
    .eq("order_number", body.orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return { status: 404, body: { error: "لم نجد عملية الدفع." }, cacheControl: noStore };

  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    return { status: 409, body: { error: "لا يمكن استرداد مبلغ لم يُحصَّل بعد." }, cacheControl: noStore };
  }
  if (!payment.provider_payment_id) {
    // Settled without a gateway payment id — nothing to call a refund against.
    return { status: 409, body: { error: "لا يوجد مرجع دفع لدى البوابة لهذه العملية." }, cacheControl: noStore };
  }

  const charged = Number(payment.amount) + Number(payment.tax ?? 0) + Number(payment.fees ?? 0);
  const remaining = Math.round((charged - Number(payment.refunded_amount ?? 0)) * 100) / 100;
  if (remaining <= 0) {
    return { status: 409, body: { error: "تم استرداد كامل المبلغ مسبقاً." }, cacheControl: noStore };
  }

  // The whole remaining balance, always. Nothing in the request influences it.
  const requested = remaining;

  try {
    await refundPayment(payment.provider_payment_id, requested);
  } catch (reason) {
    if (!(reason instanceof MoyasarError)) throw reason;
    console.error("moyasar_refund_rejected", payment.order_number, reason.message);
    return {
      status: 422,
      cacheControl: noStore,
      body: { error: refundRejectionMessage(reason.message) },
    };
  }

  const { data: updated, error: recordError } = await admin.rpc("record_payment_refund", {
    p_order_number: payment.order_number,
    p_amount: requested,
    p_reason: body.reason ?? null,
    p_actor: auth.user.id,
  });
  if (recordError) {
    // The money is already back with the customer. Say so plainly rather than
    // reporting a failure that would invite a second refund.
    console.error("refund_recorded_failed", payment.order_number, recordError.message);
    return {
      status: 500,
      cacheControl: noStore,
      body: {
        error: "تم تنفيذ الاسترداد لدى البوابة، لكن تعذّر تسجيله في المنصة. لا تُعد المحاولة — راجع الدعم الفني.",
      },
    };
  }

  const row = updated as unknown as { status?: string; refunded_amount?: number } | null;
  return {
    status: 200,
    cacheControl: noStore,
    body: {
      orderNumber: payment.order_number,
      refunded: requested,
      totalRefunded: Number(row?.refunded_amount ?? requested),
      status: row?.status ?? "refunded",
    },
  };
}

const deleteCourseSchema = z.object({ courseId: z.string().uuid() });

/**
 * Delete a course that people have paid for, refunding all of them first.
 *
 * The ordinary delete (`admin_delete_course`) refuses the moment a course has
 * any history, and stays that way. This is the deliberate other path, for a
 * course that should never have been sold — and the sequence is the safety:
 *
 *   1. Confirm the caller is an administrator.
 *   2. Read every payment still holding money for this course.
 *   3. Refund each one at the gateway, recording it as it succeeds.
 *   4. Only if every one came back, delete the course.
 *
 * Step 4 is conditional, and the SQL re-checks the same condition rather than
 * trusting this loop — so a refund that fails half way leaves the course
 * standing, the successful refunds recorded, and nobody out of pocket. The
 * response names exactly which orders failed so the operator can act on them
 * instead of guessing.
 *
 * Refunds run one at a time, not in parallel. Moyasar is being asked to move
 * real money for several people; a burst of concurrent calls buys a second or
 * two and costs the ability to say exactly where a partial failure stopped.
 */
export async function deleteCourseWithRefunds(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await requireAdmin(authorization);
  if (!auth.ok) return auth.result;
  const body = deleteCourseSchema.parse(payload);

  const admin = adminClient();
  if (!admin) {
    return { status: 503, body: { error: "لا يمكن تنفيذ العملية — مفتاح الخدمة غير مهيأ." }, cacheControl: noStore };
  }

  const { data: outstanding, error: readError } = await admin
    .from("payments")
    .select("id,order_number,amount,tax,fees,refunded_amount,status,provider_payment_id")
    .eq("intent_course_id", body.courseId)
    .in("status", ["succeeded", "partially_refunded"]);
  if (readError) throw readError;

  const owed = (outstanding ?? [])
    .map((row) => ({
      orderNumber: row.order_number,
      providerPaymentId: row.provider_payment_id,
      remaining: Math.round(
        (Number(row.amount) + Number(row.tax ?? 0) + Number(row.fees ?? 0) - Number(row.refunded_amount ?? 0)) * 100,
      ) / 100,
    }))
    .filter((row) => row.remaining > 0);

  if (owed.length > 0 && !isMoyasarConfigured()) {
    return { status: 503, body: { error: "بوابة الدفع غير مهيأة — لا يمكن تنفيذ الاستردادات." }, cacheControl: noStore };
  }

  const refunded: string[] = [];
  const failed: Array<{ orderNumber: string; reason: string }> = [];

  for (const item of owed) {
    if (!item.providerPaymentId) {
      failed.push({ orderNumber: item.orderNumber, reason: "لا يوجد مرجع دفع لدى البوابة." });
      continue;
    }
    try {
      await refundPayment(item.providerPaymentId, item.remaining);
      const { error: recordError } = await admin.rpc("record_payment_refund", {
        p_order_number: item.orderNumber,
        p_amount: item.remaining,
        p_reason: "حذف الدورة وإعادة الرسوم",
        p_actor: auth.user.id,
      });
      if (recordError) {
        // Refunded at the gateway, not written down. Reported as a failure so
        // the course is not deleted while our own record disagrees with
        // Moyasar's — and flagged loudly, because retrying would double-refund.
        console.error("course_refund_recorded_failed", item.orderNumber, recordError.message);
        failed.push({ orderNumber: item.orderNumber, reason: "نُفِّذ الاسترداد لدى البوابة ولم يُسجَّل — لا تُعد المحاولة." });
        continue;
      }
      refunded.push(item.orderNumber);
    } catch (reason) {
      if (!(reason instanceof MoyasarError)) throw reason;
      console.error("course_refund_rejected", item.orderNumber, reason.message);
      failed.push({ orderNumber: item.orderNumber, reason: refundRejectionMessage(reason.message) });
    }
  }

  if (failed.length > 0) {
    return {
      status: 409,
      cacheControl: noStore,
      body: {
        error: `تعذّر استرداد ${failed.length} من ${owed.length} عملية. لم تُحذف الدورة.`,
        refunded,
        failed,
      },
    };
  }

  const { error: deleteError } = await admin.rpc("admin_delete_course_with_refunds", {
    p_course_id: body.courseId,
    p_actor: auth.user.id,
  });
  if (deleteError) {
    const mapped = mapDomainError(deleteError.message);
    return {
      status: mapped?.status ?? 409,
      cacheControl: noStore,
      body: {
        error: mapped?.message ?? "أُعيدت الرسوم، لكن تعذّر حذف الدورة. راجع الدعم الفني.",
        refunded,
      },
    };
  }

  return {
    status: 200,
    cacheControl: noStore,
    body: { deleted: true, refundedOrders: refunded.length, refundedTotal: owed.reduce((sum, item) => sum + item.remaining, 0) },
  };
}

export async function settlePendingPayments(authorization: string | null): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  if (!isMoyasarConfigured()) {
    return { status: 200, body: { settled: 0, checked: 0, reason: "gateway_unconfigured" }, cacheControl: noStore };
  }

  const { data: open, error } = await auth.client
    .from("payments")
    .select("id,order_number,provider_invoice_id,provider_payment_id,status")
    .in("status", ["pending", "processing"])
    .not("provider_invoice_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;

  const pending = open ?? [];

  // Concurrently: these are independent reads of independent orders, and the
  // caller is a page waiting to render.
  const outcomes = await Promise.all(pending.map(async (row) => {
    try {
      const result = await verifyPayment(authorization,
        row.provider_payment_id
          ? { paymentId: row.provider_payment_id }
          : { invoiceId: row.provider_invoice_id });
      const body = result.body as { status?: string } | undefined;
      return result.status === 200 && body?.status === "succeeded";
    } catch {
      // One unreachable order must not block the rest.
      return false;
    }
  }));
  const settled = outcomes.filter(Boolean).length;

  return { status: 200, body: { checked: pending.length, settled }, cacheControl: noStore };
}

export function apiErrorResult(error: unknown): ApiResult {
  if (error instanceof z.ZodError) return { status: 400, body: { error: "Invalid request", details: error.issues }, cacheControl: noStore };
  console.error(error);
  return { status: 500, body: { error: "Unexpected server error" }, cacheControl: noStore };
}
