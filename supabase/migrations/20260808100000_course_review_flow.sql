-- Courses go through administration before they are visible.
--
-- The instructor could set `is_published` on their own course, so a course could
-- reach students without anyone reviewing its subject or content. That mirrors
-- the gap the provider approval flow was built to close, and it should work the
-- same way: the instructor prepares and submits, administration decides.
--
--   draft  →  (instructor submits)  →  in_review  →  (admin)  →  published
--                                                            ↘  draft + note
--
-- `is_published` is what the public catalogue reads. It is now set only by the
-- review function, and removed from the instructor's column grant, so the
-- decision cannot be taken anywhere else.

alter table public.courses
  add column if not exists review_status public.content_status not null default 'draft',
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists submitted_at timestamptz;

-- Anything already live stays live and counts as approved.
update public.courses set review_status = 'published' where is_published and review_status = 'draft';

create index if not exists courses_review_status_idx on public.courses(review_status, submitted_at desc);

-- The instructor owns the content, never the decision.
revoke update on public.courses from authenticated;
grant update (title, summary, description, price, duration_hours, capacity, mode, level,
              starts_at, ends_at, learning_outcomes, prerequisites, language,
              certificate_available, trainer_id)
  on public.courses to authenticated;

-- Administrators still need the columns the review function does not cover.
grant update (is_published, review_status, review_note, reviewed_by, reviewed_at, submitted_at)
  on public.courses to authenticated;

-- --------------------------------------------------------------- submit ----
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

-- --------------------------------------------------------------- review ----
create or replace function public.review_course(
  p_course_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_course public.courses%rowtype;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_course from public.courses where id = p_course_id for update;
  if not found then raise exception 'COURSE_NOT_FOUND'; end if;

  update public.courses
     set review_status = (case when p_approve then 'published' else 'draft' end)::public.content_status,
         is_published = p_approve,
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = p_course_id
  returning * into v_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_admin,
          case when p_approve then 'course_approved' else 'course_rejected' end,
          'course', p_course_id,
          jsonb_build_object('title', v_course.title, 'note', v_course.review_note));

  if v_course.trainer_id is not null then
    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (
      v_course.trainer_id, 'in_app',
      case when p_approve then 'course_approved' else 'course_rejected' end,
      case when p_approve then 'تم اعتماد دورتك' else 'دورتك تحتاج تعديلاً' end,
      case when p_approve
           then 'دورتك منشورة الآن ومتاحة للتسجيل.'
           else coalesce(v_course.review_note, 'راجع المحتوى ثم أعد التقديم.') end,
      jsonb_build_object('course_id', p_course_id, 'title', v_course.title)
    );
  end if;

  return v_course;
end;
$$;

-- Withdrawing a published course is also administrative.
create or replace function public.unpublish_course(p_course_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.courses
     set is_published = false, review_status = 'archived',
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_course_id;
end;
$$;

revoke all on function public.submit_course_for_review(uuid) from public, anon;
revoke all on function public.review_course(uuid, boolean, text) from public, anon;
revoke all on function public.unpublish_course(uuid, text) from public, anon;
grant execute on function public.submit_course_for_review(uuid) to authenticated;
grant execute on function public.review_course(uuid, boolean, text) to authenticated;
grant execute on function public.unpublish_course(uuid, text) to authenticated;

-- Administrators must see a course that is not yet published in order to judge it.
drop policy if exists "courses_admin_all" on public.courses;
create policy "courses_admin_all" on public.courses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Take the decision columns back.
--
-- Granting them "for administrators" does not work: a column grant applies to
-- every member of the role, and the instructor's own-row policy then let them
-- set is_published on their own course — exactly the gap this migration exists
-- to close. Verified: the instructor could publish directly until this ran.
--
-- review_course() and unpublish_course() are SECURITY DEFINER, so they write
-- these columns regardless of the grant, and they are the only way in.
revoke update (is_published, review_status, review_note, reviewed_by, reviewed_at, submitted_at)
  on public.courses from authenticated;
