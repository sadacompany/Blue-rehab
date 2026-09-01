-- Two things administration could not do: remove a piece of content, and start
-- a course.
--
-- 1. Deleting content
--
-- `publish_content` could move an article between draft, in_review and
-- published, and that was the whole vocabulary. There was no delete policy on
-- `articles`, `research_reviews` or `rehab_programs` for anybody, so a piece
-- submitted in error — a duplicate, a test, something published that should
-- never have been — could only ever be hidden. The client asked for «حذف
-- تماماً», and hiding is not that.
--
-- It is a hard delete, and it is guarded three ways rather than softened:
--
--   * The whole row is copied into `audit_logs.old_values` before it goes. A
--     delete nobody can undo is a delete nobody should be asked to confirm on
--     a busy afternoon; this way «تماماً» is true of the site and recoverable
--     from the audit trail, which is where an irreversible administrative act
--     belongs anyway.
--   * The table name is checked against an allow-list, exactly as
--     publish_content does. `format(%I)` quotes the identifier, and the
--     allow-list means it can only ever be one of three known tables.
--   * The deleted row is returned, so the caller can also remove the cover
--     image from storage — SQL cannot reach the bucket, and an orphaned cover
--     is the one piece of a deleted article that would otherwise survive.
--
-- 2. Creating a course
--
-- Courses could only come into existence from a trainer's dashboard, via
-- `courses_trainer_all`. An administrator could edit every field of a course,
-- price it, put it on offer, publish it and unpublish it — but not start one,
-- which meant the platform could not offer a course of its own without first
-- borrowing a trainer account. The client is right that this is elementary.
--
-- The new course is a draft: unpublished, `review_status = 'draft'`, with a
-- generated slug. Everything after that is the editor and the publish action
-- that already exist — this adds a beginning to that flow, not a second one.

-- ----------------------------------------------------------------- delete --

create or replace function public.admin_delete_content(
  p_table text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_row jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Same allow-list as publish_content. `%I` quotes the identifier, and this
  -- check means the identifier can only ever be one of three known names.
  if p_table not in ('articles', 'research_reviews', 'rehab_programs') then
    raise exception 'TABLE_NOT_ALLOWED';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table)
    into v_row using p_id;
  if v_row is null then
    raise exception 'CONTENT_NOT_FOUND';
  end if;

  -- Written before the delete, so the record of what was removed cannot be
  -- lost to the same statement that removes it.
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'content_deleted', p_table, p_id, v_row, null);

  execute format('delete from public.%I where id = $1', p_table) using p_id;

  -- Returned so the caller can delete the cover from storage as well.
  return v_row;
end;
$$;

comment on function public.admin_delete_content(text, uuid) is
  'Permanently deletes one article/research review/rehab programme. The row is copied into audit_logs.old_values first.';

-- ----------------------------------------------------------------- create --

create or replace function public.admin_create_course(
  p_title text,
  p_mode text,
  p_level text,
  p_price numeric default 0,
  p_duration_hours numeric default 1,
  p_summary text default null,
  p_language text default 'العربية',
  p_trainer_id uuid default null
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
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- The same rules admin_update_course already enforces, so a course cannot be
  -- created in a state the editor would refuse to save.
  if v_title = '' then raise exception 'TITLE_REQUIRED'; end if;
  if length(v_title) > 200 then raise exception 'TITLE_TOO_LONG'; end if;
  if coalesce(p_price, 0) < 0 then raise exception 'PRICE_INVALID'; end if;
  if coalesce(p_duration_hours, 0) <= 0 then raise exception 'DURATION_INVALID'; end if;
  if nullif(btrim(coalesce(p_mode, '')), '') is null then raise exception 'MODE_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_level, '')), '') is null then raise exception 'LEVEL_REQUIRED'; end if;

  -- Slug from the title, Arabic included: `[:alnum:]` is character-class aware,
  -- so Arabic letters survive and only punctuation and spaces collapse. A URL
  -- carries them percent-encoded, which is what the trainer-created courses
  -- already do — this matches that rather than inventing a second convention.
  v_slug := btrim(regexp_replace(lower(v_title), '[^[:alnum:]]+', '-', 'g'), '-');
  if v_slug = '' then v_slug := 'course'; end if;
  v_slug := left(v_slug, 60);

  -- A title repeated is a realistic thing for an administrator to do — a second
  -- cohort of the same course — so collide quietly rather than refusing.
  if exists (select 1 from public.courses c where c.slug = v_slug) then
    v_slug := left(v_slug, 52) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.courses (
    title, slug, summary, price, duration_hours, mode, level, language,
    trainer_id, is_published, review_status
  ) values (
    v_title, v_slug, nullif(btrim(coalesce(p_summary, '')), ''),
    coalesce(p_price, 0), coalesce(p_duration_hours, 1),
    p_mode::public.course_mode, btrim(p_level),
    coalesce(nullif(btrim(coalesce(p_language, '')), ''), 'العربية'),
    p_trainer_id, false, 'draft'
  )
  returning * into v_course;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'course_created', 'course', v_course.id, null,
          jsonb_build_object('title', v_course.title, 'slug', v_course.slug,
                             'price', v_course.price, 'mode', v_course.mode));

  -- Told, if it was created on somebody's behalf. Never to the administrator
  -- who pressed the button — the same rule admin_update_course follows.
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

-- ------------------------------------------------------------------ grants --

revoke all on function public.admin_delete_content(text, uuid) from public, anon;
revoke all on function public.admin_create_course(text, text, text, numeric, numeric, text, text, uuid) from public, anon;

grant execute on function public.admin_delete_content(text, uuid) to authenticated;
grant execute on function public.admin_create_course(text, text, text, numeric, numeric, text, text, uuid) to authenticated;
