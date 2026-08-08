-- A course needs lessons, not just headings.
--
-- `submit_course_for_review` accepted any course with at least one module. A
-- module is a heading; `course_lessons` holds the content. The instructor had no
-- way to add lessons at all, so every course submitted so far reaches approval
-- with empty modules — and once approved it is sold to students who find nothing
-- inside. The interface now offers lesson authoring, and this closes the door
-- that let an empty course through.
--
-- Only submission is tightened. Courses already published stay published; this
-- decides what may be submitted from now on.

create or replace function public.submit_course_for_review(p_course_id uuid)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_modules integer;
  v_lessons integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select * into v_course from public.courses where id = p_course_id;
  if not found then raise exception 'COURSE_NOT_FOUND'; end if;
  if v_course.trainer_id <> v_user then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_course.review_status = 'in_review' then raise exception 'ALREADY_SUBMITTED'; end if;
  if v_course.review_status = 'published' then raise exception 'ALREADY_PUBLISHED'; end if;

  -- Enough to review: a subject, a description, and some content.
  if coalesce(btrim(v_course.title), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  if coalesce(btrim(coalesce(v_course.summary, v_course.description, '')), '') = '' then
    raise exception 'DESCRIPTION_REQUIRED';
  end if;

  select count(*) into v_modules from public.course_modules m where m.course_id = p_course_id;
  if v_modules = 0 then raise exception 'CONTENT_REQUIRED'; end if;

  select count(*) into v_lessons
    from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
   where m.course_id = p_course_id;
  if v_lessons = 0 then raise exception 'LESSONS_REQUIRED'; end if;

  update public.courses
     set review_status = 'in_review', submitted_at = now(), review_note = null
   where id = p_course_id
  returning * into v_course;

  -- Tell every administrator there is something waiting.
  insert into public.notifications (user_id, channel, event_type, title, body, data)
  select p.id, 'in_app', 'course_submitted', 'دورة بانتظار المراجعة',
         'قدّم أحد المدربين دورة للمراجعة والاعتماد.',
         jsonb_build_object('course_id', p_course_id, 'title', v_course.title)
    from public.profiles p
   where 'admin' = any(p.roles);

  return v_course;
end;
$$;

revoke all on function public.submit_course_for_review(uuid) from public, anon;
grant execute on function public.submit_course_for_review(uuid) to authenticated;
