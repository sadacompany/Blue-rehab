import { authorizedFetch, AuthenticationRequiredError } from "./platform";
import { typedSupabase as supabase } from "./supabase";
import type { ProviderApplication } from "./provider";
import type { Database } from "./database.types";

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

export type AdminService = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  modes: string[];
  isActive: boolean;
};

export type AdminContentItem = {
  id: string;
  table: "articles" | "research_reviews" | "rehab_programs";
  title: string;
  slug: string;
  status: string;
  coverUrl: string | null;
  /** Short summary — `excerpt` for articles/research, `summary` for programs (aliased in the query below). */
  excerpt: string | null;
  /** The actual piece being reviewed — `body` for articles/research, `description` for programs (aliased below). Was never fetched at all; a reviewer approving or rejecting content had no way to read it. */
  body: string | null;
};

/**
 * A course as the administration panel sees it — every field the editor can
 * change, not just the few the review queue used to show. The panel is now the
 * one place a course can be corrected without database access, so it has to be
 * able to *display* what it is about to let someone edit.
 */
export type AdminCourse = {
  id: string;
  title: string;
  slug: string;
  trainerId: string | null;
  isPublished: boolean;
  reviewStatus: string;
  summary: string;
  description: string;
  durationHours: number;
  price: number;
  compareAtPrice: number | null;
  mode: string;
  level: string;
  startsAt: string | null;
  capacity: number | null;
  learningOutcomes: string[];
  prerequisites: string[];
  language: string;
  certificateAvailable: boolean;
  coverUrl: string | null;
  presenterName: string | null;
  modules: number;
};

export type AdminSnapshot = {
  services: AdminService[];
  content: AdminContentItem[];
  trainers: Array<{ id: string; fullName: string }>;
  courses: AdminCourse[];
  overview: AdminOverview;
  applications: ProviderApplication[];
  users: AdminUser[];
  bookings: AdminBooking[];
  payments: AdminPayment[];
  support: AdminSupportRequest[];
};

const one = <T,>(value: T | T[] | null | undefined): T | undefined =>
  (Array.isArray(value) ? value[0] : value ?? undefined);

/*
 * Row shapes for the joined queries below.
 *
 * These are written out by hand rather than leaned on the query builder's
 * string-parsed inference: the moment a `select()` string carries an alias
 * (`patient:profiles!bookings_patient_id_fkey(...)`) or an aggregate
 * (`course_modules(count)`), that inference gets fragile enough that it is
 * worth pinning the shape explicitly against the generated `Database` rows —
 * accurate beats clever here. The embedded relations are typed as either the
 * object or the one-element array PostgREST can return for a to-one join,
 * which is exactly what `one()` above already unwraps.
 */
/** The column shape shared by articles, research reviews and rehab programs — `excerpt`/`body` are aliased onto programs' `summary`/`description` in the queries below, so one shape and one mapper covers all three. */
type ContentRowSlim = { id: string; title: string; slug: string; status: string; cover_url: string | null; excerpt: string | null; body: string | null };

type ProfileNameEmbed = Pick<Database["public"]["Tables"]["profiles"]["Row"], "full_name">;
type SpecialistNameEmbed = Pick<Database["public"]["Tables"]["specialists"]["Row"], "display_name">;
type ServiceNameEmbed = Pick<Database["public"]["Tables"]["services"]["Row"], "name">;

type AdminBookingRow = Pick<Database["public"]["Tables"]["bookings"]["Row"], "id" | "status" | "starts_at" | "mode" | "total"> & {
  patient: ProfileNameEmbed | ProfileNameEmbed[] | null;
  specialist: SpecialistNameEmbed | SpecialistNameEmbed[] | null;
  service: ServiceNameEmbed | ServiceNameEmbed[] | null;
};

type AdminPaymentRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  "id" | "order_number" | "status" | "amount" | "currency" | "paid_at" | "failure_reason" | "created_at" | "booking_id" | "enrollment_id"
> & { user: ProfileNameEmbed | ProfileNameEmbed[] | null };

/** `course_modules(count)` comes back as a one-element array holding the tally. */
type AdminCourseRow = Pick<
  Database["public"]["Tables"]["courses"]["Row"],
  "id" | "title" | "slug" | "summary" | "description" | "duration_hours" | "price" | "compare_at_price" |
  "mode" | "level" | "starts_at" | "capacity" | "learning_outcomes" | "prerequisites" | "language" |
  "certificate_available" | "cover_url" | "presenter_name" | "trainer_id" | "is_published" | "review_status" | "submitted_at"
> & { course_modules: { count: number }[] };

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new AuthenticationRequiredError();

  const overviewResult = await supabase.rpc("admin_overview");
  if (overviewResult.error) {
    // The function refuses non-administrators outright.
    if (/FORBIDDEN|42501/.test(overviewResult.error.message)) throw new NotAnAdminError();
    throw new Error(overviewResult.error.message);
  }

  const [applications, users, bookings, payments, support, services, articles, research, programs, courses] = await Promise.all([
    supabase.from("provider_applications").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id,full_name,phone,roles,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("bookings")
      .select("id,status,starts_at,mode,total,patient:profiles!bookings_patient_id_fkey(full_name),specialist:specialists(display_name),service:services(name)")
      .order("starts_at", { ascending: false }).limit(100),
    supabase.from("payments")
      .select("id,order_number,status,amount,currency,paid_at,failure_reason,created_at,booking_id,enrollment_id,user:profiles(full_name)")
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("support_requests").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("services").select("id,name,price,duration_minutes,allowed_modes,is_active").order("name"),
    // excerpt/body were missing entirely — a reviewer saw a title, a slug and
    // a cover thumbnail and had to approve or reject blind. rehab_programs has
    // no excerpt/body columns of its own; `summary`/`description` are its
    // equivalents, aliased here so asContent() below can treat all three
    // tables the same way.
    supabase.from("articles").select("id,title,slug,status,cover_url,excerpt,body").order("created_at", { ascending: false }).limit(50),
    supabase.from("research_reviews").select("id,title,slug,status,cover_url,excerpt,body").order("created_at", { ascending: false }).limit(50),
    supabase.from("rehab_programs").select("id,title,slug,status,cover_url,excerpt:summary,body:description").order("position").limit(50),
    supabase.from("courses").select("id,title,slug,summary,description,duration_hours,price,compare_at_price,mode,level,starts_at,capacity,learning_outcomes,prerequisites,language,certificate_available,cover_url,presenter_name,trainer_id,is_published,review_status,submitted_at,course_modules(count)").order("submitted_at", { ascending: false, nullsFirst: false }),
  ]);

  const failed = [applications, users, bookings, payments, support, services, articles, research, programs, courses].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  // The three joined queries carry a `select()` string too irregular (aliases,
  // an `!fkey` hint, an aggregate) for the query builder's own inference to be
  // trusted — see the row types above.
  const bookingRows = (bookings.data ?? []) as unknown as AdminBookingRow[];
  const paymentRows = (payments.data ?? []) as unknown as AdminPaymentRow[];
  const courseRows = (courses.data ?? []) as unknown as AdminCourseRow[];

  const asContent = (rows: ContentRowSlim[], table: AdminContentItem["table"]): AdminContentItem[] =>
    rows.map((row) => ({
      id: row.id, table, title: row.title, slug: row.slug, status: row.status, coverUrl: row.cover_url ?? null,
      excerpt: row.excerpt ?? null, body: row.body ?? null,
    }));

  return {
    overview: overviewResult.data as AdminOverview,
    services: (services.data ?? []).map((row) => ({
      id: row.id, name: row.name, price: Number(row.price),
      durationMinutes: Number(row.duration_minutes), modes: row.allowed_modes ?? [],
      isActive: Boolean(row.is_active),
    })),
    content: [
      ...asContent(articles.data ?? [], "articles"),
      ...asContent(research.data ?? [], "research_reviews"),
      ...asContent(programs.data ?? [], "rehab_programs"),
    ],
    trainers: (users.data ?? []).filter((row) => (row.roles ?? []).includes("trainer"))
      .map((row) => ({ id: row.id, fullName: row.full_name })),
    courses: courseRows.map((row) => ({
      id: row.id, title: row.title, slug: row.slug ?? "", trainerId: row.trainer_id,
      isPublished: Boolean(row.is_published), reviewStatus: row.review_status ?? "draft",
      summary: row.summary ?? "", description: row.description ?? "",
      durationHours: Number(row.duration_hours ?? 1), price: Number(row.price ?? 0),
      compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : Number(row.compare_at_price),
      mode: row.mode ?? "onsite", level: row.level ?? "",
      startsAt: row.starts_at ?? null,
      capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
      learningOutcomes: row.learning_outcomes ?? [],
      prerequisites: row.prerequisites ?? [],
      language: row.language ?? "العربية",
      certificateAvailable: Boolean(row.certificate_available),
      coverUrl: row.cover_url ?? null,
      presenterName: row.presenter_name ?? null,
      modules: row.course_modules?.[0]?.count ?? 0,
    })),
    applications: (applications.data ?? []).map((row) => ({
      id: row.id, kind: row.kind, displayName: row.display_name, title: row.title,
      bio: row.bio ?? "", specialties: row.specialties ?? [], languages: row.languages ?? [],
      yearsExperience: row.years_experience ?? 0, licenseNumber: row.license_number,
      credentialsNote: row.credentials_note, contactEmail: row.contact_email,
      contactPhone: row.contact_phone, status: row.status, reviewNote: row.review_note,
      reviewedAt: row.reviewed_at, credentialFiles: row.credential_files ?? [],
      photoPath: row.photo_path ?? null,
      createdAt: row.created_at,
    })),
    users: (users.data ?? []).map((row) => ({
      id: row.id, fullName: row.full_name, phone: row.phone, roles: row.roles ?? [], createdAt: row.created_at,
    })),
    bookings: bookingRows.map((row) => ({
      id: row.id, status: row.status, startsAt: row.starts_at, mode: row.mode,
      total: row.total === null ? null : Number(row.total),
      patientName: one(row.patient)?.full_name ?? "—",
      specialistName: one(row.specialist)?.display_name ?? "—",
      serviceName: one(row.service)?.name ?? "—",
    })),
    payments: paymentRows.map((row) => ({
      id: row.id, orderNumber: row.order_number, status: row.status,
      amount: Number(row.amount), currency: row.currency, paidAt: row.paid_at,
      failureReason: row.failure_reason, createdAt: row.created_at,
      userName: one(row.user)?.full_name ?? "—",
      kind: row.booking_id ? "booking" as const : "course" as const,
    })),
    support: (support.data ?? []).map((row) => ({
      id: row.id, name: row.name, email: row.email, phone: row.phone,
      subject: row.subject, message: row.message, status: row.status, createdAt: row.created_at,
    })),
  };
}

const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN: "هذه العملية تتطلب صلاحية إدارية.",
  ALREADY_REVIEWED: "تمت مراجعة هذا الطلب مسبقاً.",
  APPLICATION_NOT_FOUND: "لم نجد الطلب.",
  CANNOT_DEMOTE_SELF: "لا يمكنك إزالة صلاحيتك الإدارية عن نفسك.",
  USER_NOT_FOUND: "لم نجد المستخدم.",
  ROLES_REQUIRED: "اختر صفة واحدة على الأقل.",
  STATUS_INVALID: "حالة غير صالحة.",
  COURSE_NOT_FOUND: "لم نجد الدورة.",
  FIELD_NOT_EDITABLE: "أحد الحقول غير قابل للتعديل من هنا.",
  PATCH_INVALID: "تعذر قراءة التعديل.",
  TITLE_REQUIRED: "عنوان الدورة مطلوب.",
  TITLE_TOO_LONG: "عنوان الدورة طويل جداً.",
  SLUG_REQUIRED: "رابط الدورة مطلوب.",
  SLUG_INVALID: "رابط الدورة يحتوي على مسافات أو رموز غير مسموحة.",
  SLUG_TAKEN: "هذا الرابط مستخدم في دورة أخرى.",
  DURATION_INVALID: "عدد الساعات يجب أن يكون أكبر من صفر.",
  MODE_REQUIRED: "طريقة التقديم مطلوبة.",
  // Before PRICE_INVALID, and it has to stay there: translate() matches by
  // substring, and "COMPARE_AT_PRICE_INVALID" contains "PRICE_INVALID".
  COMPARE_AT_PRICE_INVALID: "السعر قبل العرض يجب أن يكون أعلى من السعر الحالي.",
  PRICE_INVALID: "السعر يجب ألا يكون سالباً.",
  CAPACITY_INVALID: "السعة يجب أن تكون أكبر من صفر، أو تُترك فارغة.",
  LEVEL_REQUIRED: "مستوى الدورة مطلوب.",
  LANGUAGE_REQUIRED: "لغة التقديم مطلوبة.",
  COURSE_IS_FREE: "لا يمكن تفعيل عرض على دورة مجانية — حدّد سعراً أولاً.",
  PRICE_TOO_SMALL: "سعر الدورة أقل من أن يُنصَّف.",
  OFFER_STATE_REQUIRED: "لم تحدد تفعيل العرض أو إلغاءه.",
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
    // `p_note` is `text default null` (20260805100000) — omitting the key has
    // the same effect on the function as sending `null` explicitly, and the
    // generated Args type only allows the former: `supabase gen types` does
    // not carry `| null` for optional RPC parameters the way it does for
    // table columns, so `undefined` is the accurate spelling here now.
    p_note: note || undefined,
  });
  if (error) throw new Error(translate(error.message));
}

export async function setUserRoles(userId: string, roles: string[]) {
  // `roles` stays `string[]` in this function's own signature — it is public
  // API and every caller already treats a role as a plain string — but the
  // generated function only accepts the database's own `user_role` enum, so
  // the boundary is exactly here rather than at every call site.
  const { error } = await supabase.rpc("admin_set_user_roles", {
    p_user_id: userId,
    p_roles: roles as Database["public"]["Enums"]["user_role"][],
  });
  if (error) throw new Error(translate(error.message));
}

/** Pricing is administrative: the amount charged is derived from this row. */
export async function saveService(input: {
  id?: string; name: string; price: number; durationMinutes: number; modes: string[]; isActive: boolean;
}) {
  const row = {
    name: input.name.trim(),
    price: input.price,
    duration_minutes: input.durationMinutes,
    // Same boundary as `setUserRoles` above: the form works with delivery mode
    // as a plain string, `services.allowed_modes` is the database's enum.
    allowed_modes: input.modes as Database["public"]["Enums"]["delivery_mode"][],
    is_active: input.isActive,
  };
  const { error } = input.id
    ? await supabase.from("services").update(row).eq("id", input.id)
    : await supabase.from("services").insert(row);
  if (error) throw new Error(translate(error.message));
}

const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * Attach cover artwork to a piece of content.
 *
 * The landing page presents دوراتنا, مقالاتنا and أبحاثنا as pictures, so this
 * is what puts an item on the front page at all. Stored under the table and row
 * id and upserted, so a piece of content has exactly one cover and replacing it
 * leaves nothing behind. The bucket is public — these are published covers.
 */
export async function uploadContentCover(
  table: "articles" | "research_reviews" | "rehab_programs" | "courses",
  id: string,
  file: File,
): Promise<string> {
  if (file.size > MAX_COVER_BYTES) throw new Error("حجم الصورة يتجاوز ٥ ميغابايت.");
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("تُقبل صور JPG أو PNG أو WebP أو AVIF فقط.");

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${table}/${id}/cover.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("content-covers")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (uploadError) throw new Error("تعذر رفع الصورة.");

  const { data } = supabase.storage.from("content-covers").getPublicUrl(path);
  // Cache-bust so a replaced cover is not served from the old copy.
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase.from(table).update({ cover_url: url }).eq("id", id);
  if (error) throw new Error(translate(error.message));
  return url;
}

/** Remove the cover, which also takes the item off the landing page. */
export async function clearContentCover(
  table: "articles" | "research_reviews" | "rehab_programs" | "courses",
  id: string,
): Promise<void> {
  const { error } = await supabase.from(table).update({ cover_url: null }).eq("id", id);
  if (error) throw new Error(translate(error.message));
}

/** Publication runs through a checked function so the timestamp is never missed. */
export async function setContentStatus(table: string, id: string, status: string) {
  const { error } = await supabase.rpc("publish_content", {
    p_table: table, p_id: id,
    // Same boundary as `setUserRoles` above — `status` is a plain string on
    // this function's public signature, `content_status` is the database enum.
    p_status: status as Database["public"]["Enums"]["content_status"],
  });
  if (error) throw new Error(translate(error.message));
}

/** Approving publishes the course; refusing returns it to the instructor. */
export async function reviewCourse(courseId: string, approve: boolean, note: string) {
  const { error } = await supabase.rpc("review_course", {
    // `p_note` is `text default null` (20260808100000) — see the comment on
    // `reviewApplication` above for why `undefined` replaces `null` here.
    p_course_id: courseId, p_approve: approve, p_note: note || undefined,
  });
  if (error) throw new Error(translate(error.message));
}

export async function unpublishCourse(courseId: string, note: string) {
  const { error } = await supabase.rpc("unpublish_course", { p_course_id: courseId, p_note: note || undefined });
  if (error) throw new Error(translate(error.message));
}

/**
 * The fields an administrator may change on a course, in the database's own
 * spelling because the patch is passed through to `admin_update_course`
 * verbatim. Every key is optional and only the ones present are written — the
 * function decides what actually changed from that, and tells the trainer.
 *
 * The names are snake_case rather than the camelCase used everywhere else in
 * this file on purpose: an allow-list is checked on the server, and translating
 * the keys here would put a second, silent list in the browser that has to be
 * kept in step with it. Sending the column names means a field this file has
 * not heard of is refused by the database rather than dropped in transit.
 */
export type CourseEditPatch = Partial<{
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  duration_hours: number;
  price: number;
  compare_at_price: number | null;
  mode: string;
  level: string;
  starts_at: string | null;
  capacity: number | null;
  learning_outcomes: string[];
  prerequisites: string[];
  language: string;
  certificate_available: boolean;
  cover_url: string | null;
  presenter_name: string | null;
}>;

/**
 * Edit a course as an administrator.
 *
 * Not a plain `.update()` even though `courses_admin_all` would allow one: the
 * trainer has to be told what changed, and a notification the browser writes is
 * a notification the browser can forget. Inside the function the edit, the audit
 * entry and the notice are one transaction.
 */
export async function updateCourse(courseId: string, patch: CourseEditPatch) {
  const { error } = await supabase.rpc("admin_update_course", {
    p_course_id: courseId,
    p_patch: patch,
  });
  if (error) throw new Error(translate(error.message));
}

/**
 * Put a course on offer at half price, or take it off.
 *
 * The new price is never sent from here. It is computed by the function from
 * the price already stored, which is the only way "half" can be guaranteed to
 * mean half — and the only way pressing the button twice cannot quarter it.
 */
export async function setCourseOffer(courseId: string, enabled: boolean) {
  const { error } = await supabase.rpc("admin_set_course_offer", {
    p_course_id: courseId,
    p_enabled: enabled,
  });
  if (error) throw new Error(translate(error.message));
}

export async function assignCourseTrainer(courseId: string, trainerId: string | null) {
  const { error } = await supabase.from("courses").update({ trainer_id: trainerId }).eq("id", courseId);
  if (error) throw new Error(translate(error.message));
}

export async function setSupportStatus(requestId: string, status: string) {
  const { error } = await supabase.rpc("admin_set_support_status", { p_request_id: requestId, p_status: status });
  if (error) throw new Error(translate(error.message));
}

// -------------------------------------------------------- Meet test tool --
//
// A specialist's email is not readable from the browser at all (see
// 20260823100000_specialist_and_profile_email.sql) — even for an admin — so
// every call here goes through the Node API (server/src/runtime-api.ts),
// which reads it with the service-role client and never sends the raw
// address back down, only whether one is on file.

export type MeetTestSpecialist = { id: string; displayName: string; hasEmail: boolean };

export async function loadMeetTestSpecialists(): Promise<MeetTestSpecialist[]> {
  return authorizedFetch("/admin/meet-test/specialists");
}

export type MeetTestResult = {
  meetingUrl: string;
  eventId: string;
  attendees: string[];
  specialistName: string;
  specialistEmail: string;
  testEmail: string;
  startsAt: string;
};

export async function createMeetTest(specialistId: string, testEmail: string): Promise<MeetTestResult> {
  return authorizedFetch("/admin/meet-test", {
    method: "POST",
    body: JSON.stringify({ specialistId, testEmail }),
  });
}

export async function cancelMeetTest(eventId: string): Promise<void> {
  await authorizedFetch("/admin/meet-test/cancel", {
    method: "POST",
    body: JSON.stringify({ eventId }),
  });
}

export type RepairMeetingResult = { attendees: string[]; specialistName: string | null };

/**
 * Adds whoever is now on file (patient and/or specialist email) to an
 * already-created remote booking's Meet event, without touching the time or
 * the link. For bookings made before a patient's email was ever collected —
 * the reservation already exists, so the fix in the booking flow itself
 * cannot reach it retroactively; this is the one-time catch-up for those.
 */
export async function repairBookingMeeting(bookingId: string): Promise<RepairMeetingResult> {
  return authorizedFetch("/admin/bookings/repair-meeting", {
    method: "POST",
    body: JSON.stringify({ bookingId }),
  });
}
