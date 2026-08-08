import { supabase } from "./supabase";

/**
 * What a student who has paid can actually open.
 *
 * The public course endpoint deliberately never selects `content_url` — it is
 * served to anyone browsing the catalogue. The consequence was that nobody could
 * open a lesson at all: a student paid, saw a list of titles with a padlock
 * beside each one, and that was the end of the course.
 *
 * This reads the same rows through the signed-in client instead, so the row-level
 * policy decides what comes back. After 20260808130000 that policy returns a
 * lesson only when it is a free preview, or when the reader holds an enrolment
 * that has actually been paid for. Nothing here needs to re-check that: an
 * unpaid student simply receives fewer rows.
 */

export type LessonAccess = {
  /** null when the visitor is signed out or has never enrolled. */
  status: string | null;
  /** Paid for, so the whole course is open. */
  unlocked: boolean;
  /** Keyed by lesson id; only the lessons this reader is allowed to open. */
  content: Record<string, { contentUrl: string | null; contentType: string }>;
};

const EMPTY: LessonAccess = { status: null, unlocked: false, content: {} };

export async function loadLessonAccess(courseId: string): Promise<LessonAccess> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;

  // The lesson query runs signed out too: a free preview is meant to be opened
  // before buying, and the anon policy returns exactly those. Guarding on a
  // session here would have hidden previews from the visitors they exist for.
  const [enrolment, lessons] = await Promise.all([
    userId
      ? supabase.from("enrollments").select("status").eq("course_id", courseId)
          .eq("student_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("course_lessons")
      .select("id,content_url,content_type,course_modules!inner(course_id)")
      .eq("course_modules.course_id", courseId),
  ]);

  // A read failure here is not worth breaking the course page over — the lesson
  // list still renders, locked, which is the correct fallback.
  if (lessons.error) return EMPTY;

  const status = enrolment.data?.status ?? null;
  return {
    status,
    unlocked: status === "active" || status === "completed",
    content: Object.fromEntries(
      (lessons.data ?? []).map((row) => [row.id, { contentUrl: row.content_url, contentType: row.content_type }]),
    ),
  };
}
