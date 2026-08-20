import { z } from "zod";
import { config } from "./config.js";
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
    const { data: row } = await admin
      .from("payments")
      .select("booking:bookings(id,mode,starts_at,ends_at,meeting_url)")
      .eq("order_number", orderNumber)
      .maybeSingle();

    const joined = (row as { booking?: unknown } | null)?.booking;
    const booking = (Array.isArray(joined) ? joined[0] : joined) as
      | { id: string; mode: string; starts_at: string; ends_at: string | null; meeting_url: string | null }
      | undefined;

    if (!booking || booking.mode !== "remote" || booking.meeting_url) return;

    const meeting = await createMeeting({
      bookingId: booking.id,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      attendeeEmail: null,
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
    catalog.from("services").select("id,name,description,duration_minutes,price,allowed_modes,is_demo").eq("is_active", true).order("price"),
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
      services: (servicesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, description: row.description ?? "", durationMinutes: Number(row.duration_minutes), price: Number(row.price), modes: row.allowed_modes, isDemo: row.is_demo })),
      specialists: (specialistsResult.data ?? []).map((row) => ({ id: row.id, name: row.display_name, title: row.title, bio: row.bio ?? "", specialties: row.specialties, languages: row.languages, isVerified: row.is_verified, isDemo: row.is_demo, photoUrl: row.photo_url ?? null })),
      courses: (coursesResult.data ?? []).map((row) => ({ id: row.id, slug: row.slug, title: row.title, summary: row.summary ?? "", description: row.description ?? "", durationHours: Number(row.duration_hours), price: Number(row.price), mode: row.mode, level: row.level, startsAt: row.starts_at, learningOutcomes: row.learning_outcomes, prerequisites: row.prerequisites, language: row.language, certificateAvailable: row.certificate_available, isDemo: row.is_demo, coverUrl: row.cover_url ?? null, compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price), presenterName: row.presenter_name ?? null })),
      branches: (branchesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, city: row.city, address: row.address, isDemo: row.is_demo })),
      availability: (slotsResult.data ?? []).map((row) => ({ id: row.id, specialistId: row.specialist_id, branchId: row.branch_id, startsAt: row.starts_at, endsAt: row.ends_at, mode: row.mode })),
    },
  };
}

export async function getCourseDetail(slugValue: string): Promise<ApiResult> {
  const slug = z.string().min(2).max(160).parse(slugValue);
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
    .select("id,patient_id,mode,starts_at,ends_at,meeting_url")
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

  const meeting = await createMeeting({
    bookingId: booking.id,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    attendeeEmail: userData.user.email ?? null,
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

// ------------------------------------------------------------------ courses --

const enrollmentSchema = z.object({ courseId: z.string().uuid() });

/** Enroll in a course. Price and seat check are enforced in the database. */
export async function createEnrollment(authorization: string | null, payload: unknown): Promise<ApiResult> {
  const auth = await authenticate(authorization);
  if (!auth.ok) return auth.result;
  const body = enrollmentSchema.parse(payload);

  const { data, error } = await auth.client.rpc("create_enrollment_intent", { p_course_id: body.courseId });
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

  const invoice = await createInvoice({
    amount: Number(payment.amount),
    description: payment.booking_id ? `جلسة علاج طبيعي — ${payment.order_number}` : `دورة تأهيلية — ${payment.order_number}`,
    callbackUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/payment/callback`,
    successUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/payment/callback`,
    backUrl: `${config.PUBLIC_SITE_URL.replace(/\/$/, "")}/portal`,
    orderNumber: payment.order_number,
  });

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
