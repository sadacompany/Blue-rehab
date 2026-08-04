import { z } from "zod";
import { config } from "./config.js";
import { createMeetEvent, isGoogleMeetConfigured } from "./google-meet.js";
import {
  createInvoice,
  fetchPayment,
  isMoyasarConfigured,
  isMoyasarTestMode,
  mapPaymentStatus,
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
});

/** Errors raised by the SQL functions, mapped to HTTP status + Arabic copy. */
const BOOKING_ERRORS: Record<string, { status: number; message: string }> = {
  AUTH_REQUIRED: { status: 401, message: "يلزم تسجيل الدخول." },
  SERVICE_UNAVAILABLE: { status: 409, message: "الخدمة غير متاحة حالياً." },
  SLOT_UNAVAILABLE: { status: 409, message: "هذا الموعد لم يعد متاحاً. اختر موعداً آخر." },
  SLOT_SPECIALIST_MISMATCH: { status: 409, message: "الموعد لا يخص المختص المحدد." },
  MODE_NOT_ALLOWED: { status: 409, message: "طريقة الجلسة غير متاحة لهذه الخدمة." },
  COURSE_UNAVAILABLE: { status: 409, message: "الدورة غير متاحة للتسجيل." },
  COURSE_FULL: { status: 409, message: "اكتمل العدد في هذه الدورة." },
};

function mapDomainError(message: string | undefined) {
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
  return { status: 200, body: { status: "ok", service: "blue-rehab-api", catalog: "supabase", protectedWrites: "authenticated-rls" }, cacheControl: noStore };
}

export async function getCatalog(): Promise<ApiResult> {
  const now = new Date().toISOString();
  const [servicesResult, specialistsResult, coursesResult, branchesResult, slotsResult] = await Promise.all([
    catalog.from("services").select("id,name,description,duration_minutes,price,allowed_modes,is_demo").eq("is_active", true).order("price"),
    catalog.from("specialists").select("id,display_name,title,bio,specialties,languages,is_verified,is_demo").order("created_at"),
    catalog.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo").eq("is_published", true).order("starts_at"),
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
      services: (servicesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", durationMinutes: Number(row.duration_minutes), price: Number(row.price), modes: row.allowed_modes, isDemo: row.is_demo })),
      specialists: (specialistsResult.data ?? []).map((row) => ({ id: row.id, name: row.display_name, title: row.title, bio: row.bio ?? "", specialties: row.specialties, languages: row.languages, isVerified: row.is_verified, isDemo: row.is_demo })),
      courses: (coursesResult.data ?? []).map((row) => ({ id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo })),
      branches: (branchesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, city: row.city, address: row.address, isDemo: row.is_demo })),
      availability: (slotsResult.data ?? []).map((row) => ({ id: row.id, specialistId: row.specialist_id, branchId: row.branch_id, startsAt: row.starts_at, endsAt: row.ends_at, mode: row.mode })),
    },
  };
}

export async function getCourseDetail(slugValue: string): Promise<ApiResult> {
  const slug = z.string().min(2).max(160).parse(slugValue);
  const courseResult = await catalog.from("courses").select("id,slug,title,summary,description,duration_hours,price,mode,level,starts_at,learning_outcomes,prerequisites,language,certificate_available,is_demo").eq("slug", slug).eq("is_published", true).maybeSingle();
  if (courseResult.error) throw courseResult.error;
  if (!courseResult.data) return { status: 404, body: { error: "Course not found" }, cacheControl: noStore };
  const modulesResult = await catalog.from("course_modules").select("id,title,description,sort_order").eq("course_id", courseResult.data.id).order("sort_order");
  if (modulesResult.error) throw modulesResult.error;
  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  const lessonsResult = moduleIds.length ? await catalog.from("course_lessons").select("id,module_id,title,lesson_type,duration_minutes,is_preview,sort_order").in("module_id", moduleIds).order("sort_order") : { data: [], error: null };
  if (lessonsResult.error) throw lessonsResult.error;
  const row = courseResult.data;
  return {
    status: 200,
    cacheControl: publicCache,
    body: {
      source: "supabase",
      course: { id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo },
      modules: (modulesResult.data ?? []).map((module) => ({ id: module.id, title: module.title, summary: module.description ?? "", position: module.sort_order, lessons: (lessonsResult.data ?? []).filter((lesson) => lesson.module_id === module.id).map((lesson) => ({ id: lesson.id, title: lesson.title, contentType: lesson.lesson_type, durationMinutes: lesson.duration_minutes, isPreview: lesson.is_preview })) })),
    },
  };
}

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

  const { data, error } = await auth.client.rpc("create_booking_with_payment", {
    p_service_id: body.serviceId,
    p_specialist_id: body.specialistId,
    p_slot_id: body.slotId,
    p_notes: body.notes ?? null,
  });
  if (error) {
    const mapped = mapDomainError(error.message);
    if (mapped) return { status: mapped.status, body: { error: mapped.message }, cacheControl: noStore };
    throw error;
  }
  const booking = (Array.isArray(data) ? data[0] : data) as BookingRow | undefined;
  if (!booking) return { status: 409, body: { error: "تعذر إنشاء الحجز." }, cacheControl: noStore };

  const meeting = booking.mode === "remote"
    ? await scheduleMeeting(auth.client, booking, auth.user.email ?? null)
    : null;

  return {
    status: 201,
    cacheControl: noStore,
    body: {
      data: {
        id: booking.booking_id,
        status: booking.status,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        mode: booking.mode,
        total: Number(booking.amount),
        orderNumber: booking.order_number,
        currency: booking.currency,
        meetingUrl: meeting?.meetUrl ?? null,
      },
      next: isMoyasarConfigured() ? "payment" : "payment_unconfigured",
    },
  };
}

/**
 * Best-effort Google Meet scheduling. A failure here never fails the booking —
 * the patient still has a confirmed slot and the link can be retried later.
 */
async function scheduleMeeting(client: SupabaseClientLike, booking: BookingRow, email: string | null) {
  if (!isGoogleMeetConfigured()) return null;
  try {
    const meeting = await createMeetEvent({
      summary: "جلسة بلو ريهاب عن بُعد",
      description: `رقم الحجز: ${booking.booking_id}\nرقم الطلب: ${booking.order_number}`,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      attendees: email ? [email] : [],
    });
    await client
      .from("bookings")
      .update({ meeting_url: meeting.meetUrl, meeting_event_id: meeting.eventId, meeting_provider: "google_meet" })
      .eq("id", booking.booking_id);
    return meeting;
  } catch (error) {
    console.error("meet_scheduling_failed", error);
    return null;
  }
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
    .select("id,patient_id,mode,starts_at,ends_at,meeting_url")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { status: 404, body: { error: "Booking not found" }, cacheControl: noStore };
  if (booking.patient_id !== userData.user.id) return { status: 403, body: { error: "Forbidden" }, cacheControl: noStore };
  if (booking.mode !== "remote") return { status: 409, body: { error: "Booking is not a remote session" }, cacheControl: noStore };

  if (booking.meeting_url) {
    return { status: 200, body: { meetingUrl: booking.meeting_url, reused: true }, cacheControl: noStore };
  }
  if (!isGoogleMeetConfigured()) {
    return { status: 200, body: { meetingUrl: null, configured: false }, cacheControl: noStore };
  }

  const meeting = await createMeetEvent({
    summary: "جلسة بلو ريهاب عن بُعد",
    description: `رقم الحجز: ${booking.id}`,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    attendees: userData.user.email ? [userData.user.email] : [],
  });

  // Best-effort persistence; the link is already returned regardless of outcome.
  await client.from("bookings").update({ meeting_url: meeting.meetUrl }).eq("id", booking.id);

  return { status: 200, body: { meetingUrl: meeting.meetUrl, configured: true }, cacheControl: noStore };
}

// ------------------------------------------------------------------ courses --

const enrollmentSchema = z.object({ courseId: z.string().uuid() });

/** Enroll in a course. Price and seat check are enforced in the database. */
export async function createEnrollment(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  const body = enrollmentSchema.parse(payload);

  const { data, error } = await auth.client.rpc("create_enrollment_with_payment", { p_course_id: body.courseId });
  if (error) {
    const mapped = mapDomainError(error.message);
    if (mapped) return { status: mapped.status, body: { error: mapped.message }, cacheControl: noStore };
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { enrollment_id: string; order_number: string | null; amount: number; currency: string; status: string }
    | undefined;
  if (!row) return { status: 409, body: { error: "تعذر إتمام التسجيل." }, cacheControl: noStore };

  return {
    status: 201,
    cacheControl: noStore,
    body: {
      data: {
        id: row.enrollment_id,
        status: row.status,
        amountDue: Number(row.amount),
        orderNumber: row.order_number,
        currency: row.currency,
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

  const invoice = await createInvoice({
    amount: Number(payment.amount),
    description: payment.booking_id ? `جلسة علاج طبيعي — ${payment.order_number}` : `دورة تأهيلية — ${payment.order_number}`,
    callbackUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/payment/callback`,
    orderNumber: payment.order_number,
  });

  // Persisting needs the service role (users cannot write payments). Best-effort:
  // the hosted URL is returned either way and verification is by payment id.
  await adminClient()?.from("payments")
    .update({ provider_invoice_id: invoice.id, payment_url: invoice.url, status: "processing", updated_at: new Date().toISOString() })
    .eq("id", payment.id);

  return { status: 200, body: { paymentUrl: invoice.url, invoiceId: invoice.id }, cacheControl: noStore };
}

const verifySchema = z.object({ paymentId: z.string().min(6).max(64) });

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
  const { paymentId } = verifySchema.parse(payload);

  const remote = await fetchPayment(paymentId);
  const orderNumber = (remote as { metadata?: Record<string, string> }).metadata?.order_number;
  if (!orderNumber) {
    return { status: 422, body: { error: "لا يمكن مطابقة عملية الدفع بطلب معروف." }, cacheControl: noStore };
  }

  const { data: payment, error } = await auth.client
    .from("payments")
    .select("id,order_number,user_id,amount,status,booking_id,enrollment_id")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return { status: 404, body: { error: "طلب الدفع غير موجود." }, cacheControl: noStore };
  if (payment.user_id !== auth.user.id) return { status: 403, body: { error: "Forbidden" }, cacheControl: noStore };

  const mappedStatus = mapPaymentStatus(remote.status);
  const amountMatches = Math.round(Number(payment.amount) * 100) === Number(remote.amount);
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
  await admin.from("payments").update({
    status: mappedStatus,
    provider_payment_id: remote.id,
    paid_at: mappedStatus === "succeeded" ? now : null,
    failure_reason: mappedStatus === "failed" ? (remote.source?.message ?? "payment_failed") : null,
    updated_at: now,
  }).eq("id", payment.id);

  if (mappedStatus === "succeeded") {
    if (payment.booking_id) {
      await admin.from("bookings").update({ status: "confirmed", updated_at: now }).eq("id", payment.booking_id);
    }
    if (payment.enrollment_id) {
      await admin.from("enrollments").update({ status: "active" }).eq("id", payment.enrollment_id);
    }
    await admin.from("notifications").insert({
      user_id: payment.user_id,
      channel: "in_app",
      event_type: "payment_succeeded",
      title: "تم استلام الدفع",
      body: payment.booking_id ? "تم تأكيد حجزك بنجاح." : "تم تأكيد تسجيلك في الدورة.",
      data: { order_number: payment.order_number },
    });
  } else if (mappedStatus === "failed" && payment.booking_id) {
    // Release the slot so the moment is not lost to a failed attempt.
    const { data: released } = await admin.from("bookings").select("slot_id").eq("id", payment.booking_id).maybeSingle();
    if (released?.slot_id) await admin.from("availability_slots").update({ is_available: true }).eq("id", released.slot_id);
  }

  return {
    status: 200,
    cacheControl: noStore,
    body: { status: mappedStatus, persisted: true, orderNumber: payment.order_number, bookingId: payment.booking_id },
  };
}

export function apiErrorResult(error: unknown): ApiResult {
  if (error instanceof z.ZodError) return { status: 400, body: { error: "Invalid request", details: error.issues }, cacheControl: noStore };
  console.error(error);
  return { status: 500, body: { error: "Unexpected server error" }, cacheControl: noStore };
}
