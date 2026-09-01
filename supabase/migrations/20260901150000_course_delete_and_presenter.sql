-- Deleting a course, and naming whoever actually presents it.
--
-- Two follow-ups to 20260901140000, both from the client trying the new course
-- form and finding the edges of it.
--
-- 1. A course could be created and never removed. Content got
--    `admin_delete_content` in the same change; courses did not, and a course
--    created by mistake is at least as likely as an article created by mistake.
--
-- 2. The trainer picker offered only accounts holding the `trainer` role. Most
--    of the people who actually teach at this centre are in `specialists`, and
--    some are not on the platform at all — a visiting presenter booked for one
--    Saturday has no account and does not need one. Naming them was impossible.
--
-- The second is not a new column: `courses.presenter_name` has existed since
-- 20260818110000 for exactly this — «Free-text credit for who presents the
-- course. `trainer_id` needs a real account with the trainer role, which the
-- presenter may not have yet.» What was missing is that nothing offered to fill
-- it in. So this widens the argument list rather than the schema.
--
-- The distinction between the two fields is real and worth keeping:
--
--   `trainer_id`      an account that can *manage* the course — add modules and
--                     lessons from the trainer dashboard. `courses_trainer_all`
--                     grants that only to a profile holding the `trainer` role,
--                     so pointing this at a specialist who is not also a trainer
--                     credits them without granting anything. That is a
--                     legitimate thing to want and the interface says so.
--   `presenter_name`  a name on the course page, and nothing else.

-- ------------------------------------------------------------------ delete --
--
-- A course carries history that must outlive it. `enrollments`, `payments`
-- (via `intent_course_id`) and `reviews` all reference `courses` *without*
-- `on delete cascade`, so the database would already refuse — but it would
-- refuse with a foreign-key violation, which tells an administrator nothing.
-- The counts are checked first so the refusal can name what is in the way and
-- point at unpublishing instead.
--
-- What does cascade — modules, lessons, price tiers, registrations that never
-- became enrolments — is course structure, and goes with it by design.
create or replace function public.admin_delete_course(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_row jsonb;
  v_enrollments integer;
  v_payments integer;
  v_reviews integer;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select to_jsonb(c) into v_row from public.courses c where c.id = p_course_id;
  if v_row is null then raise exception 'COURSE_NOT_FOUND'; end if;

  select count(*) into v_enrollments from public.enrollments e where e.course_id = p_course_id;
  select count(*) into v_payments   from public.payments p    where p.intent_course_id = p_course_id;
  select count(*) into v_reviews    from public.reviews r     where r.course_id = p_course_id;

  -- Somebody enrolled, paid, or reviewed. Deleting the course would take a
  -- financial and clinical record with it; unpublishing achieves what the
  -- administrator actually wants and keeps the history intact.
  if v_enrollments > 0 or v_payments > 0 or v_reviews > 0 then
    raise exception 'COURSE_HAS_HISTORY: enrollments=% payments=% reviews=%',
      v_enrollments, v_payments, v_reviews;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'course_deleted', 'course', p_course_id, v_row, null);

  delete from public.courses where id = p_course_id;

  -- Returned so the caller can drop the cover image from storage too.
  return v_row;
end;
$$;

comment on function public.admin_delete_course(uuid) is
  'Permanently deletes a course that has no enrolments, payments or reviews. The row is copied into audit_logs first.';

-- ------------------------------------------------------------------ create --
--
-- Same function as 20260901140000 with `p_presenter_name` added. Dropped and
-- recreated rather than replaced: a different argument list makes a second
-- function rather than a new body, and the old one would go on being chosen.
drop function if exists public.admin_create_course(text, text, text, numeric, numeric, text, text, uuid);

create or replace function public.admin_create_course(
  p_title text,
  p_mode text,
  p_level text,
  p_price numeric default 0,
  p_duration_hours numeric default 1,
  p_summary text default null,
  p_language text default 'العربية',
  p_trainer_id uuid default null,
  p_presenter_name text default null
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_presenter text := nullif(btrim(coalesce(p_presenter_name, '')), '');
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_title = '' then raise exception 'TITLE_REQUIRED'; end if;
  if length(v_title) > 200 then raise exception 'TITLE_TOO_LONG'; end if;
  if coalesce(p_price, 0) < 0 then raise exception 'PRICE_INVALID'; end if;
  if coalesce(p_duration_hours, 0) <= 0 then raise exception 'DURATION_INVALID'; end if;
  if nullif(btrim(coalesce(p_mode, '')), '') is null then raise exception 'MODE_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_level, '')), '') is null then raise exception 'LEVEL_REQUIRED'; end if;
  if v_presenter is not null and length(v_presenter) > 120 then
    raise exception 'PRESENTER_NAME_TOO_LONG';
  end if;

  v_slug := btrim(regexp_replace(lower(v_title), '[^[:alnum:]]+', '-', 'g'), '-');
  if v_slug = '' then v_slug := 'course'; end if;
  v_slug := left(v_slug, 60);
  if exists (select 1 from public.courses c where c.slug = v_slug) then
    v_slug := left(v_slug, 52) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.courses (
    title, slug, summary, price, duration_hours, mode, level, language,
    trainer_id, presenter_name, is_published, review_status
  ) values (
    v_title, v_slug, nullif(btrim(coalesce(p_summary, '')), ''),
    coalesce(p_price, 0), coalesce(p_duration_hours, 1),
    p_mode::public.course_mode, btrim(p_level),
    coalesce(nullif(btrim(coalesce(p_language, '')), ''), 'العربية'),
    p_trainer_id, v_presenter, false, 'draft'
  )
  returning * into v_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'course_created', 'course', v_course.id, null,
          jsonb_build_object('title', v_course.title, 'slug', v_course.slug,
                             'price', v_course.price, 'mode', v_course.mode,
                             'presenter_name', v_course.presenter_name));

  if v_course.trainer_id is not null and v_course.trainer_id <> v_admin then
    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (v_course.trainer_id, 'in_app', 'course_created',
            'أُنشئت دورة باسمك',
            format('أنشأت الإدارة دورة «%s» وأسندتها إليك. يمكنك إضافة الوحدات والدروس من لوحة المدرب.', v_course.title),
            jsonb_build_object('course_id', v_course.id, 'title', v_course.title));
  end if;

  return v_course;
end;
$$;

-- --------------------------------------------------- who may present a course --
--
-- Everyone an administrator can credit, in one list: accounts holding the
-- `trainer` role, and the published specialists. `can_manage` is the honest
-- part — it says whether choosing this person also gives them the trainer
-- dashboard, which is true only where the role is actually held. The interface
-- uses it to explain the difference rather than hide it.
create or replace function public.admin_course_presenters()
returns table (
  profile_id uuid,
  display_name text,
  kind text,
  can_manage boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, 'trainer'::text, true
    from public.profiles p
   where 'trainer' = any (p.roles)
  union
  -- A specialist may or may not have an account. Without one there is nothing
  -- to point `trainer_id` at, so `profile_id` comes back null and the caller
  -- credits them by name instead.
  select s.profile_id, s.display_name, 'specialist'::text,
         coalesce(s.profile_id is not null and exists (
           select 1 from public.profiles p2
            where p2.id = s.profile_id and 'trainer' = any (p2.roles)
         ), false)
    from public.specialists s
   where not s.is_demo
   order by 3, 2;
end;
$$;

-- ------------------------------------------------------------------ grants --

revoke all on function public.admin_delete_course(uuid) from public, anon;
revoke all on function public.admin_create_course(text, text, text, numeric, numeric, text, text, uuid, text) from public, anon;
revoke all on function public.admin_course_presenters() from public, anon;

grant execute on function public.admin_delete_course(uuid) to authenticated;
grant execute on function public.admin_create_course(text, text, text, numeric, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.admin_course_presenters() to authenticated;
