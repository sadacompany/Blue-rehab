import { AuthenticationRequiredError } from "./platform";
import { supabase } from "./supabase";

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

export type TrainerModule = {
  id: string;
  title: string;
  summary: string;
  position: number;
  lessonCount: number;
};

export type TrainerCourse = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  price: number;
  capacity: number | null;
  isPublished: boolean;
  startsAt: string | null;
  students: TrainerStudent[];
  modules: TrainerModule[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadTrainerCourses(): Promise<TrainerCourse[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const coursesResult = await supabase
    .from("courses")
    .select("id,title,slug,summary,price,capacity,is_published,starts_at")
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
    ? await supabase.from("course_lessons").select("id,module_id").in("module_id", moduleIds)
    : { data: [], error: null };
  if (lessonResult.error) throw new Error(lessonResult.error.message);

  const one = (value: any) => (Array.isArray(value) ? value[0] : value);

  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    summary: course.summary ?? "",
    price: Number(course.price),
    capacity: course.capacity,
    isPublished: Boolean(course.is_published),
    startsAt: course.starts_at,
    students: (enrolResult.data ?? [])
      .filter((row: any) => row.course_id === course.id)
      .map((row: any) => ({
        enrollmentId: row.id,
        studentId: row.student_id,
        studentName: one(row.student)?.full_name ?? "متدرب",
        status: row.status,
        progress: Number(row.progress ?? 0),
        amountDue: Number(row.amount_due ?? 0),
        completedAt: row.completed_at,
        createdAt: row.created_at,
      })),
    modules: (moduleResult.data ?? [])
      .filter((row: any) => row.course_id === course.id)
      .map((row: any) => ({
        id: row.id,
        title: row.title,
        summary: row.summary ?? "",
        position: row.position,
        lessonCount: (lessonResult.data ?? []).filter((lesson: any) => lesson.module_id === row.id).length,
      })),
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

export async function setCoursePublished(courseId: string, isPublished: boolean) {
  const { error } = await supabase.from("courses").update({ is_published: isPublished }).eq("id", courseId);
  if (error) throw new Error(error.message);
}

export async function markAttendance(enrollmentId: string, sessionTitle: string, status: string) {
  const { error } = await supabase.from("attendance_records").insert({
    enrollment_id: enrollmentId,
    session_title: sessionTitle.trim(),
    starts_at: new Date().toISOString(),
    status,
    checked_in_at: status === "present" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
}
