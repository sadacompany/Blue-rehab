import { AuthenticationRequiredError } from "./platform";
import { supabase } from "./supabase";
import type { ProviderApplication } from "./provider";

/**
 * Administration data layer.
 *
 * Reads rely on the admin RLS policies added in 20260805100000; writes that
 * change privilege or status go through SECURITY DEFINER functions that re-check
 * the caller is an administrator. Nothing here trusts the browser's claim to be
 * an admin — the badge in the interface is a convenience, not the gate.
 *
 * Clinical records are absent on purpose. Administrators see bookings, money and
 * accounts; session notes, treatment plans and health profiles stay with the
 * patient and their specialist.
 */

export class NotAnAdminError extends Error {
  constructor() {
    super("NOT_AN_ADMIN");
    this.name = "NotAnAdminError";
  }
}

export type AdminOverview = {
  users: { total: number; patients: number; specialists: number; trainers: number; admins: number };
  applications: { pending: number; approved: number; rejected: number };
  bookings: { total: number; confirmed: number; pending_payment: number; completed: number; cancelled: number; today: number; upcoming: number };
  courses: { published: number; enrollments: number; active_enrollments: number };
  revenue: { currency: string; collected: number; collected_30d: number; outstanding: number; refunded: number; failed_count: number };
  support: { open: number; total: number };
  capacity: { free_slots: number; verified_specialists: number };
};

export type AdminUser = {
  id: string;
  fullName: string;
  phone: string | null;
  roles: string[];
  createdAt: string;
};

export type AdminBooking = {
  id: string;
  status: string;
  startsAt: string;
  mode: string;
  total: number | null;
  patientName: string;
  specialistName: string;
  serviceName: string;
};

export type AdminPayment = {
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
  userName: string;
  kind: "booking" | "course";
};

export type AdminSupportRequest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
};

export type AdminSnapshot = {
  overview: AdminOverview;
  applications: ProviderApplication[];
  users: AdminUser[];
  bookings: AdminBooking[];
  payments: AdminPayment[];
  support: AdminSupportRequest[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const one = <T,>(value: T | T[] | null | undefined): T | undefined =>
  (Array.isArray(value) ? value[0] : value ?? undefined);

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new AuthenticationRequiredError();

  const overviewResult = await supabase.rpc("admin_overview");
  if (overviewResult.error) {
    // The function refuses non-administrators outright.
    if (/FORBIDDEN|42501/.test(overviewResult.error.message)) throw new NotAnAdminError();
    throw new Error(overviewResult.error.message);
  }

  const [applications, users, bookings, payments, support] = await Promise.all([
    supabase.from("provider_applications").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id,full_name,phone,roles,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("bookings")
      .select("id,status,starts_at,mode,total,patient:profiles!bookings_patient_id_fkey(full_name),specialist:specialists(display_name),service:services(name)")
      .order("starts_at", { ascending: false }).limit(100),
    supabase.from("payments")
      .select("id,order_number,status,amount,currency,paid_at,failure_reason,created_at,booking_id,enrollment_id,user:profiles(full_name)")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("support_requests").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const failed = [applications, users, bookings, payments, support].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    overview: overviewResult.data as AdminOverview,
    applications: (applications.data ?? []).map((row: any) => ({
      id: row.id, kind: row.kind, displayName: row.display_name, title: row.title,
      bio: row.bio ?? "", specialties: row.specialties ?? [], languages: row.languages ?? [],
      yearsExperience: row.years_experience ?? 0, licenseNumber: row.license_number,
      credentialsNote: row.credentials_note, contactEmail: row.contact_email,
      contactPhone: row.contact_phone, status: row.status, reviewNote: row.review_note,
      reviewedAt: row.reviewed_at, createdAt: row.created_at,
    })),
    users: (users.data ?? []).map((row: any) => ({
      id: row.id, fullName: row.full_name, phone: row.phone, roles: row.roles ?? [], createdAt: row.created_at,
    })),
    bookings: (bookings.data ?? []).map((row: any) => ({
      id: row.id, status: row.status, startsAt: row.starts_at, mode: row.mode,
      total: row.total === null ? null : Number(row.total),
      patientName: one<any>(row.patient)?.full_name ?? "—",
      specialistName: one<any>(row.specialist)?.display_name ?? "—",
      serviceName: one<any>(row.service)?.name ?? "—",
    })),
    payments: (payments.data ?? []).map((row: any) => ({
      id: row.id, orderNumber: row.order_number, status: row.status,
      amount: Number(row.amount), currency: row.currency, paidAt: row.paid_at,
      failureReason: row.failure_reason, createdAt: row.created_at,
      userName: one<any>(row.user)?.full_name ?? "—",
      kind: row.booking_id ? "booking" : "course",
    })),
    support: (support.data ?? []).map((row: any) => ({
      id: row.id, name: row.name, email: row.email, phone: row.phone,
      subject: row.subject, message: row.message, status: row.status, createdAt: row.created_at,
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN: "هذه العملية تتطلب صلاحية إدارية.",
  ALREADY_REVIEWED: "تمت مراجعة هذا الطلب مسبقاً.",
  APPLICATION_NOT_FOUND: "لم نجد الطلب.",
  CANNOT_DEMOTE_SELF: "لا يمكنك إزالة صلاحيتك الإدارية عن نفسك.",
  USER_NOT_FOUND: "لم نجد المستخدم.",
  ROLES_REQUIRED: "اختر صفة واحدة على الأقل.",
  STATUS_INVALID: "حالة غير صالحة.",
};

function translate(message: string): string {
  const code = Object.keys(ADMIN_ERRORS).find((key) => message.includes(key));
  return code ? ADMIN_ERRORS[code] : message;
}

/** Approving provisions the account: role, specialist profile, audit entry. */
export async function reviewApplication(applicationId: string, approve: boolean, note: string) {
  const { error } = await supabase.rpc("review_provider_application", {
    p_application_id: applicationId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw new Error(translate(error.message));
}

export async function setUserRoles(userId: string, roles: string[]) {
  const { error } = await supabase.rpc("admin_set_user_roles", { p_user_id: userId, p_roles: roles });
  if (error) throw new Error(translate(error.message));
}

export async function setSupportStatus(requestId: string, status: string) {
  const { error } = await supabase.rpc("admin_set_support_status", { p_request_id: requestId, p_status: status });
  if (error) throw new Error(translate(error.message));
}
