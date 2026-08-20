import { AuthenticationRequiredError } from "./platform";
import { typedSupabase as supabase } from "./supabase";
import type { Database } from "./database.types";

/**
 * Course instructor data layer.
 *
 * Scoped entirely by `courses.trainer_id = auth.uid()` in RLS
 * (20260805100000), so an instructor reaches only their own courses, the
 * students enrolled in them, and those students' names — nothing else.
 */

export class NotATrainerError extends Error {
  constructor() {
    super("NOT_A_TRAINER");
    this.name = "NotATrainerError";
  }
}

export type TrainerStudent = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  status: string;
  progress: number;
  amountDue: number;
  completedAt: string | null;
  createdAt: string;
};

export type TrainerLesson = {
  id: string;
  title: string;
  contentType: string;
  contentUrl: string | null;
  durationMinutes: number | null;
  position: number;
  isPreview: boolean;
};

export type TrainerModule = {
  id: string;
  title: string;
  summary: string;
  position: number;
  lessons: TrainerLesson[];
};

/** The seven kinds `course_lessons.content_type` accepts, named for a human. */
export const LESSON_TYPES: Array<{ value: string; label: string }> = [
  { value: "video", label: "فيديو" },
  { value: "text", label: "نص" },
  { value: "pdf", label: "ملف PDF" },
  { value: "presentation", label: "عرض تقديمي" },
  { value: "link", label: "رابط خارجي" },
  { value: "quiz", label: "اختبار" },
  { value: "assignment", label: "تكليف" },
];

export type TrainerCourse = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  price: number;
  capacity: number | null;
  isPublished: boolean;
  reviewStatus: string;
  reviewNote: string | null;
  startsAt: string | null;
  students: TrainerStudent[];
  modules: TrainerModule[];
};

/** The shape one enrolment row carries back, including the joined student name. */
type TrainerEnrollmentRow = Pick<
  Database["public"]["Tables"]["enrollments"]["Row"],
  "id" | "course_id" | "student_id" | "status" | "progress" | "amount_due" | "completed_at" | "created_at"
> & { student: Pick<Database["public"]["Tables"]["profiles"]["Row"], "full_name"> | null };

type TrainerModuleRow = Database["public"]["Tables"]["course_modules"]["Row"];
type TrainerLessonRow = Database["public"]["Tables"]["course_lessons"]["Row"];

export async function loadTrainerCourses(): Promise<TrainerCourse[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const coursesResult = await supabase
    .from("courses")
    .select("id,title,slug,summary,price,capacity,is_published,review_status,review_note,starts_at")
    .eq("trainer_id", user.id)
    .order("created_at", { ascending: false });
  if (coursesResult.error) throw new Error(coursesResult.error.message);

  const courses = coursesResult.data ?? [];
  if (!courses.length) return [];

  const ids = courses.map((row) => row.id);
  const [enrolResult, moduleResult] = await Promise.all([
    supabase.from("enrollments")
      .select("id,course_id,student_id,status,progress,amount_due,completed_at,created_at,student:profiles(full_name)")
      .in("course_id", ids),
    supabase.from("course_modules").select("id,course_id,title,summary,position").in("course_id", ids).order("position"),
  ]);
  if (enrolResult.error) throw new Error(enrolResult.error.message);
  if (moduleResult.error) throw new Error(moduleResult.error.message);

  const moduleIds = (moduleResult.data ?? []).map((row) => row.id);
  const lessonResult = moduleIds.length
    ? await supabase.from("course_lessons")
        .select("id,module_id,title,content_type,content_url,duration_minutes,position,is_preview")
        .in("module_id", moduleIds).order("position")
    : { data: [], error: null };
  if (lessonResult.error) throw new Error(lessonResult.error.message);

  // Supabase embeds a to-one relationship (enrollments.student_id -> profiles)
  // as a single object, never an array, but the query builder's inferred type
  // still has to account for the to-many shape other embeds can take — so this
  // stays defensive rather than assuming the object form.
  const one = <T,>(value: T | T[] | null): T | null =>
    (Array.isArray(value) ? value[0] ?? null : value);

  const enrollments = (enrolResult.data ?? []) as TrainerEnrollmentRow[];
  const modules = (moduleResult.data ?? []) as TrainerModuleRow[];
  const lessons = (lessonResult.data ?? []) as TrainerLessonRow[];

  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    summary: course.summary ?? "",
    price: Number(course.price),
    capacity: course.capacity,
    isPublished: Boolean(course.is_published),
    reviewStatus: course.review_status ?? "draft",
    reviewNote: course.review_note,
    startsAt: course.starts_at,
    students: enrollments
      .filter((row) => row.course_id === course.id)
      .map((row) => ({
        enrollmentId: row.id,
        studentId: row.student_id,
        studentName: one(row.student)?.full_name ?? "متدرب",
        status: row.status,
        progress: Number(row.progress ?? 0),
        amountDue: Number(row.amount_due ?? 0),
        completedAt: row.completed_at,
        createdAt: row.created_at,
      })),
    modules: modules
      .filter((row) => row.course_id === course.id)
      .map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary ?? "",
        position: row.position,
        lessons: lessons
          .filter((lesson) => lesson.module_id === row.id)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            contentType: lesson.content_type,
            contentUrl: lesson.content_url,
            durationMinutes: lesson.duration_minutes,
            position: lesson.position,
            isPreview: Boolean(lesson.is_preview),
          })),
      })),
  }));
}

export type TrainerNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  /** The changed field names, the course id — whatever the writer attached. */
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

/**
 * What the platform has told this instructor.
 *
 * Administration can now edit a course it does not own — correct a price, move
 * a start date — and `admin_update_course` writes a notice naming the fields it
 * changed. The instructor had nowhere to read it: the notifications panel lived
 * on the personal account page, which is not where an instructor works. So the
 * same rows are read here.
 *
 * No filter by event type. `notifications_own_read` already scopes this to the
 * caller's own rows, and an instructor who is also a patient would rather see
 * one list than wonder which of their two dashboards a notice landed on.
 */
export async function loadTrainerNotifications(): Promise<TrainerNotification[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new AuthenticationRequiredError();

  const { data, error } = await supabase
    .from("notifications")
    .select("id,event_type,title,body,data,read_at,created_at")
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    data: (row.data ?? {}) as Record<string, unknown>,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/** Record how far a student has got. Only a paid enrolment should be advanced. */
export async function setStudentProgress(enrollmentId: string, progress: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const { error } = await supabase
    .from("enrollments")
    .update({
      progress: clamped,
      completed_at: clamped >= 100 ? new Date().toISOString() : null,
    })
    .eq("id", enrollmentId);
  if (error) throw new Error(error.message);
}

export async function addModule(courseId: string, title: string, summary: string, position: number) {
  const { error } = await supabase.from("course_modules").insert({
    course_id: courseId,
    title: title.trim(),
    summary: summary.trim() || null,
    position,
  });
  if (error) throw new Error(error.message);
}

/**
 * Add a lesson to a module.
 *
 * A module is a heading; the lessons are the course. The instructor could build
 * modules but never fill them, so every course read «٠ دروس» and could still be
 * submitted for approval and sold. `course_lessons_trainer_all` already allowed
 * this write — only the interface was missing.
 *
 * `is_preview` opens a lesson to visitors who have not paid, which is the only
 * field here that reaches beyond the enrolled students, so it is opt-in.
 */
export async function addLesson(moduleId: string, input: {
  title: string; contentType: string; contentUrl: string; durationMinutes: number | null;
  isPreview: boolean; position: number;
}) {
  const { error } = await supabase.from("course_lessons").insert({
    module_id: moduleId,
    title: input.title.trim(),
    content_type: input.contentType,
    content_url: input.contentUrl.trim() || null,
    duration_minutes: input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : null,
    position: input.position,
    is_preview: input.isPreview,
  });
  if (error) throw new Error(error.message);
}

export async function deleteLesson(lessonId: string) {
  const { error } = await supabase.from("course_lessons").delete().eq("id", lessonId);
  if (error) throw new Error(error.message);
}

/**
 * Create a course.
 *
 * trainer_id is forced to the caller: RLS demands it match, and the policy also
 * requires the `trainer` role, so this cannot be used to publish under someone
 * else's name or by someone whose application was refused.
 */
export async function createCourse(input: {
  title: string; summary: string; price: number; durationHours: number; mode: string; level: string;
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const slug = `${input.title.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "course"}-${Date.now().toString(36)}`;

  const { error } = await supabase.from("courses").insert({
    title: input.title.trim(),
    slug,
    summary: input.summary.trim() || null,
    price: input.price,
    duration_hours: input.durationHours,
    // `mode` stays `string` on this function's own input — the composer form
    // already only ever sends one of the database's `course_mode` values, so
    // narrowing is a cast at the boundary rather than a second literal-union
    // type this file would have to keep in step with the schema.
    mode: input.mode as Database["public"]["Enums"]["course_mode"],
    level: input.level,
    trainer_id: user.id,
    is_published: false,
  });
  if (error) throw new Error(error.message);
}

const REVIEW_ERRORS: Record<string, string> = {
  TITLE_REQUIRED: "عنوان الدورة مطلوب.",
  DESCRIPTION_REQUIRED: "أضف وصفاً للدورة قبل التقديم.",
  CONTENT_REQUIRED: "أضف وحدة واحدة على الأقل قبل التقديم للمراجعة.",
  LESSONS_REQUIRED: "أضف درساً واحداً على الأقل داخل الوحدات قبل التقديم للمراجعة.",
  ALREADY_SUBMITTED: "الدورة قيد المراجعة بالفعل.",
  ALREADY_PUBLISHED: "الدورة منشورة بالفعل.",
  FORBIDDEN: "هذه الدورة ليست لك.",
};

/**
 * Hand the course to administration.
 *
 * Instructors no longer publish their own work — `is_published` is outside their
 * column grant and is set only by the review function. This submits the course
 * for a decision, and refuses if there is nothing substantial to review.
 */
export async function submitCourseForReview(courseId: string) {
  const { error } = await supabase.rpc("submit_course_for_review", { p_course_id: courseId });
  if (error) {
    const code = Object.keys(REVIEW_ERRORS).find((key) => error.message.includes(key));
    throw new Error(code ? REVIEW_ERRORS[code] : error.message);
  }
}

export async function markAttendance(enrollmentId: string, sessionTitle: string, status: string) {
  const { error } = await supabase.from("attendance_records").insert({
    enrollment_id: enrollmentId,
    session_title: sessionTitle.trim(),
    starts_at: new Date().toISOString(),
    // Same boundary as `createCourse` above — `status` is a plain string on
    // this function's own signature, `attendance_status` is the database enum.
    status: status as Database["public"]["Enums"]["attendance_status"],
    checked_in_at: status === "present" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
}
