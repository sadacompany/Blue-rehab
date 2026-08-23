import { apiUrl } from "./api";
import { loadCatalog, loadCourseDetail } from "./catalog";
import type {
  AvailabilitySlot,
  Course,
  DeliveryMode,
  Service,
  Specialist,
} from "./catalog-types";
import { supabase } from "./supabase";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationRequiredError";
  }
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

// Catalogue reads live in ./catalog so public pages never import the database
// client. Re-exported here for callers that already need Supabase anyway.
export { loadCatalog, loadCourseDetail };

type BookingInput = {
  service: Service;
  specialist: Specialist;
  slot: AvailabilitySlot;
  notes: string;
};

/**
 * What the server returns when a patient asks to book.
 *
 * No booking id, because no booking exists yet — this is an intent with the
 * price frozen and the slot held. The appointment is created after the payment
 * is verified.
 */
export type BookingResult = {
  orderNumber: string;
  total: number;
  currency: string;
  starts_at: string;
  ends_at: string | null;
  mode: DeliveryMode;
  reservedUntil: string | null;
};

/** Exported so other lib modules (admin.ts's Meet-test tool) hit the API the same authenticated way, rather than a second copy of this. */
export async function authorizedFetch(path: string, init?: RequestInit) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new AuthenticationRequiredError();

  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `REQUEST_FAILED_${response.status}`);
  return payload;
}

/**
 * Create a booking through the API. The price, the slot lock and the payment
 * record are all decided server-side — the browser only names what it wants.
 */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const payload = await authorizedFetch("/bookings/drafts", {
    method: "POST",
    body: JSON.stringify({
      serviceId: input.service.id,
      specialistId: input.specialist.id,
      slotId: input.slot.id,
      mode: input.slot.mode,
      notes: input.notes,
    }),
  });
  return payload.data as BookingResult;
}

export type TelehealthConsentInput = {
  /** Which revision of the wording was on screen. */
  templateVersion: string;
  /** The exact text shown, verbatim. See lib/telehealth-consent.ts. */
  consentText: string;
  /** Usually null: pay-first means no booking row exists yet when consent is taken. */
  bookingId?: string | null;
};

export type TelehealthConsentRecord = { id: string; granted_at: string };

/**
 * Record the patient's informed consent to a remote session.
 *
 * Goes straight to the table rather than through the API: the row belongs to
 * the caller, RLS already limits an insert to their own `user_id`, and the
 * columns that must not be self-reported — `granted_at`, the IP and the user
 * agent — are stamped by a database trigger from the request itself, not taken
 * from this payload. Sending them from here would be theatre; the browser is
 * the one party whose account of when it consented cannot be trusted.
 *
 * Failure is fatal to the booking on purpose. NHIC §3.1.17 requires the consent
 * to be *recorded* before the telehealth activity, so a session that proceeds
 * on an unrecorded consent is a session that should not have proceeded.
 */
export async function recordTelehealthConsent(input: TelehealthConsentInput): Promise<TelehealthConsentRecord> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const { data, error } = await supabase
    .from("consent_records")
    .insert({
      user_id: user.id,
      booking_id: input.bookingId ?? null,
      purpose: "telehealth_session",
      template_version: input.templateVersion,
      consent_text: input.consentText,
    })
    .select("id,granted_at")
    .single();

  if (error) throw new Error(`CONSENT_NOT_RECORDED: ${error.message}`);
  return data as TelehealthConsentRecord;
}

export type PaymentConfig = {
  provider: string;
  configured: boolean;
  testMode: boolean;
  publishableKey: string | null;
  currency: string;
  /** False when Google Meet credentials are absent — no link can be issued. */
  meetEnabled?: boolean;
};

export async function loadPaymentConfig(): Promise<PaymentConfig> {
  const response = await fetch(apiUrl("/payments/config"));
  if (!response.ok) throw new Error(`PAYMENT_CONFIG_FAILED_${response.status}`);
  return (await response.json()) as PaymentConfig;
}

/** Start checkout and get the Moyasar-hosted payment URL to redirect to. */
export async function startCheckout(orderNumber: string): Promise<{ paymentUrl: string }> {
  const payload = await authorizedFetch("/payments/checkout", {
    method: "POST",
    body: JSON.stringify({ orderNumber }),
  });
  return payload as { paymentUrl: string };
}

export type VerifyResult = {
  status: string;
  persisted: boolean;
  orderNumber?: string;
  bookingId?: string | null;
  enrollmentId?: string | null;
  /** What was paid for, so the confirmation can name it. */
  kind?: "booking" | "course";
  amount?: number;
  title?: string;
  specialistName?: string | null;
  startsAt?: string | null;
  mode?: DeliveryMode | null;
  meetingUrl?: string | null;
  slug?: string | null;
  reason?: string;
};

/**
 * Confirm a payment outcome. The server re-reads it from Moyasar.
 *
 * Accepts either identifier: card flows return a payment id, Apple Pay and some
 * wallet flows return only the invoice id.
 */
export async function verifyPayment(ref: { paymentId?: string; invoiceId?: string }): Promise<VerifyResult> {
  return (await authorizedFetch("/payments/verify", {
    method: "POST",
    body: JSON.stringify(ref),
  })) as VerifyResult;
}

export type SettleResult = { checked: number; settled: number; reason?: string };

/**
 * Ask the server to re-read any of the user's still-open orders from Moyasar and
 * record the outcome. Makes the portal self-repairing when a payer never made it
 * back to the callback page.
 */
export async function settlePayments(): Promise<SettleResult> {
  return (await authorizedFetch("/payments/settle", { method: "POST" })) as SettleResult;
}

export async function enrollViaApi(courseId: string) {
  const payload = await authorizedFetch("/enrollments", {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
  // orderNumber is null for a free course: create_enrollment_intent() skips
  // the payments row and activates the seat outright, so there is nothing to
  // check out.
  return payload.data as { status: string; amountDue: number; orderNumber: string | null; currency: string; courseTitle: string };
}

export type MeetingLinkResult = { meetingUrl: string | null; configured?: boolean; reused?: boolean };

/**
 * Ask the server to generate (or return an existing) Google Meet link for a
 * remote booking. Secrets live server-side, so this always goes through the API.
 * Returns { meetingUrl: null } when the integration is not configured yet.
 */
export async function requestMeetingLink(bookingId: string): Promise<MeetingLinkResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new AuthenticationRequiredError();

  const response = await fetch(apiUrl(`/bookings/${bookingId}/meet`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const message = await response.json().then((body) => body?.error).catch(() => null);
    throw new Error(message || `MEET_REQUEST_FAILED_${response.status}`);
  }
  return (await response.json()) as MeetingLinkResult;
}

/**
 * Enroll in a course. Like bookings, the price and the seat check are enforced
 * server-side; re-enrolling returns the existing record instead of duplicating.
 */
export async function enrollInCourse(course: Course) {
  return enrollViaApi(course.id);
}

export type SupportRequestInput = {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
};

const SUPPORT_ERRORS: Record<string, string> = {
  NAME_INVALID: "الاسم يجب أن يكون بين حرفين و120 حرفًا.",
  SUBJECT_INVALID: "اختر نوع الطلب.",
  MESSAGE_INVALID: "الرسالة يجب أن تكون بين 20 و1000 حرف.",
  EMAIL_INVALID: "البريد الإلكتروني غير صالح.",
  PHONE_INVALID: "رقم الجوال غير صالح.",
};

/**
 * Submit the contact form.
 *
 * Goes through an RPC rather than a direct insert: the form needs the new row's
 * id back as a reference number, and a plain insert returns it via RETURNING,
 * which anonymous visitors cannot read under RLS. See
 * supabase/migrations/20260804170000_support_request_rpc.sql.
 */
export async function createSupportRequest(input: SupportRequestInput) {
  const { data, error } = await supabase
    .rpc("submit_support_request", {
      p_name: input.name,
      p_email: input.email,
      p_phone: input.phone || null,
      p_subject: input.subject,
      p_message: input.message,
    })
    .single();

  if (error) {
    const code = Object.keys(SUPPORT_ERRORS).find((key) => error.message.includes(key));
    throw new Error(code ? SUPPORT_ERRORS[code] : error.message);
  }
  return data as { id: string; status: string; created_at: string };
}

export type PortalSnapshot = {
  profile: { full_name: string; phone: string | null; roles: string[] } | null;
  // `mode` and `meeting_url` are what a patient needs on the day: whether to
  // travel to the centre or wait for a link, and where that link is. Neither was
  // fetched, so the account page could not say either.
  bookings: Array<{ id: string; status: string; starts_at: string; total: number | null; service_id: string; mode: string; meeting_url: string | null; specialist_name: string | null }>;
  enrollments: Array<{ id: string; status: string; progress: number; amount_due: number; course_id: string }>;
  payments: Array<{ id: string; status: string; amount: number; order_number: string; created_at: string }>;
  notifications: Array<{ id: string; title: string; body: string; read_at: string | null; created_at: string }>;
  services: Record<string, string>;
  courses: Record<string, string>;
};

/**
 * Mark notifications as read.
 *
 * Nothing ever set `read_at`, so every notice a patient had ever received stayed
 * flagged as new — including ones later contradicted by a newer notice. RLS
 * limits the update to the caller's own rows and to the `read_at` column.
 */
export async function markNotificationsRead(ids?: string[]) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids?.length) query = query.in("id", ids);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function loadPortalSnapshot(): Promise<PortalSnapshot> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  // Two name lookups, not the entire catalogue. loadCatalog() also pulls
  // specialists, branches, availability and every description — none of which
  // this page shows — and it was the slowest call in the set.
  const [profileResult, bookingsResult, enrollmentsResult, paymentsResult, notificationsResult, serviceNames, courseNames] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,roles").eq("id", user.id).maybeSingle(),
    supabase.from("bookings").select("id,status,starts_at,total,service_id,mode,meeting_url,specialist:specialists(display_name)").order("starts_at", { ascending: false }).limit(20),
    supabase.from("enrollments").select("id,status,progress,amount_due,course_id").order("created_at", { ascending: false }).limit(20),
    supabase.from("payments").select("id,status,amount,order_number,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("notifications").select("id,title,body,read_at,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("services").select("id,name"),
    supabase.from("courses").select("id,title"),
  ]);

  const error = firstError([profileResult, bookingsResult, enrollmentsResult, paymentsResult, notificationsResult]);
  if (error) throw new Error(error.message);

  return {
    profile: profileResult.data ? {
      full_name: profileResult.data.full_name,
      phone: profileResult.data.phone,
      roles: profileResult.data.roles ?? [],
    } : null,
    bookings: (bookingsResult.data ?? []).map((item) => {
      // PostgREST returns an embedded row as an object or a single-element array
      // depending on the relationship it infers; accept either.
      const joined = item as typeof item & { specialist?: { display_name?: string } | Array<{ display_name?: string }> };
      const specialist = Array.isArray(joined.specialist) ? joined.specialist[0] : joined.specialist;
      return {
        ...item,
        total: item.total === null ? null : Number(item.total),
        specialist_name: specialist?.display_name ?? null,
      };
    }),
    enrollments: (enrollmentsResult.data ?? []).map((item) => ({ ...item, amount_due: Number(item.amount_due) })),
    payments: (paymentsResult.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })),
    notifications: notificationsResult.data ?? [],
    services: Object.fromEntries((serviceNames.data ?? []).map((item) => [item.id, item.name])),
    courses: Object.fromEntries((courseNames.data ?? []).map((item) => [item.id, item.title])),
  };
}
