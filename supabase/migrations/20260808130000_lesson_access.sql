-- Who may read a lesson.
--
-- Two things were wrong with the pair of policies that decided this.
--
-- 1. `course_lessons_authenticated_read` accepted *any* enrolment row. Under
--    pay-first an enrolment is created `pending_payment` the moment a student
--    presses enrol, and only becomes `active` when convert_paid_intent settles
--    the payment. So pressing enrol — without paying — was enough to read every
--    lesson's content_url straight from PostgREST. Verified against the live
--    database: five unpaid enrolments had full read access to paid content.
--
-- 2. `preview_lessons_read` was granted `to anon` only. A signed-in visitor
--    matched neither policy, so signing in made the free preview lessons
--    disappear from a course page.
--
-- The rule these two should express: a preview lesson of a published course is
-- public, and everything else needs an enrolment that has been paid for.

drop policy if exists "preview_lessons_read" on public.course_lessons;
create policy "preview_lessons_read" on public.course_lessons
  for select to anon, authenticated
  using (
    is_preview
    and exists (
      select 1 from public.course_modules m
        join public.courses c on c.id = m.course_id
       where m.id = course_lessons.module_id and c.is_published
    )
  );

drop policy if exists "course_lessons_authenticated_read" on public.course_lessons;
create policy "course_lessons_authenticated_read" on public.course_lessons
  for select to authenticated
  using (
    exists (
      select 1 from public.course_modules m
        join public.enrollments e on e.course_id = m.course_id
       where m.id = course_lessons.module_id
         and e.student_id = (select auth.uid())
         -- Paid for. `pending_payment` is an unpaid intent; `cancelled` is over.
         and e.status in ('active', 'completed')
    )
  );
