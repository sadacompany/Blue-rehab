-- Provider onboarding and administration.
--
-- Until now the only way to become a specialist was for someone with database
-- access to insert a `specialists` row by hand and flip `is_verified`. There was
-- no application, no approval, no record of who approved whom, and no interface
-- for administration at all. This adds the whole path:
--
--   apply  →  administration reviews  →  approval provisions the account
--
-- Provisioning is automatic on approval: the role is granted, the specialist
-- profile is created from the application, and the decision is written to
-- `audit_logs`. Nothing is done by hand.
--
-- Privilege boundary: `profiles.roles` is not updatable by `authenticated`
-- (002 revoked it), so a role can only ever change inside a SECURITY DEFINER
-- function that has already checked the caller is an administrator. A user
-- cannot promote themselves by editing a request.

-- ------------------------------------------------------------ role helpers --
-- SECURITY DEFINER, so it reads `profiles` without re-entering that table's own
-- RLS. An inline `exists (select 1 from profiles ...)` inside a policy *on*
-- profiles would recurse; this is the standard way out.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and 'admin' = any(p.roles)
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and (p.roles && array['admin','receptionist']::public.user_role[])
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- ------------------------------------------------------- applications table --
do $$ begin
  create type public.application_status as enum ('pending','approved','rejected','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provider_kind as enum ('specialist','trainer');
exception when duplicate_object then null; end $$;

create table if not exists public.provider_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.provider_kind not null,
  display_name text not null,
  title text not null,
  bio text,
  specialties text[] not null default '{}',
  languages text[] not null default array['العربية'],
  years_experience integer not null default 0 check (years_experience >= 0 and years_experience <= 70),
  license_number text,
  credentials_note text,
  contact_email text,
  contact_phone text,
  status public.application_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open application per person per role: re-applying edits the existing one
-- rather than flooding the review queue.
create unique index if not exists provider_applications_open_unique
  on public.provider_applications(user_id, kind)
  where status = 'pending';

create index if not exists provider_applications_status_idx
  on public.provider_applications(status, created_at desc);

alter table public.provider_applications enable row level security;
grant select on public.provider_applications to authenticated;

drop policy if exists "provider_applications_own_read" on public.provider_applications;
create policy "provider_applications_own_read" on public.provider_applications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "provider_applications_admin_read" on public.provider_applications;
create policy "provider_applications_admin_read" on public.provider_applications
  for select to authenticated
  using (public.is_admin());

-- Writes go through the functions below, never straight from the browser.

-- --------------------------------------------------------------- apply ------
create or replace function public.submit_provider_application(
  p_kind public.provider_kind,
  p_display_name text,
  p_title text,
  p_bio text default null,
  p_specialties text[] default '{}',
  p_languages text[] default array['العربية'],
  p_years_experience integer default 0,
  p_license_number text default null,
  p_credentials_note text default null,
  p_contact_email text default null,
  p_contact_phone text default null
)
returns public.provider_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_display_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_row public.provider_applications;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then
    raise exception 'NAME_INVALID';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 160 then
    raise exception 'TITLE_INVALID';
  end if;

  -- Already holds the role: nothing to apply for.
  if exists (
    select 1 from public.profiles p
     where p.id = v_user and p_kind::text::public.user_role = any(p.roles)
  ) then
    raise exception 'ALREADY_PROVIDER';
  end if;

  insert into public.provider_applications as a (
    user_id, kind, display_name, title, bio, specialties, languages,
    years_experience, license_number, credentials_note, contact_email, contact_phone
  ) values (
    v_user, p_kind, v_name, v_title, nullif(btrim(coalesce(p_bio, '')), ''),
    coalesce(p_specialties, '{}'), coalesce(p_languages, array['العربية']),
    greatest(0, least(70, coalesce(p_years_experience, 0))),
    nullif(btrim(coalesce(p_license_number, '')), ''),
    nullif(btrim(coalesce(p_credentials_note, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), ''),
    nullif(btrim(coalesce(p_contact_phone, '')), '')
  )
  on conflict (user_id, kind) where status = 'pending'
  do update set
    display_name = excluded.display_name,
    title = excluded.title,
    bio = excluded.bio,
    specialties = excluded.specialties,
    languages = excluded.languages,
    years_experience = excluded.years_experience,
    license_number = excluded.license_number,
    credentials_note = excluded.credentials_note,
    contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone,
    updated_at = now()
  returning a.* into v_row;

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (
    v_user, 'in_app', 'application_submitted', 'تم استلام طلب الانضمام',
    'طلبك قيد المراجعة من الإدارة، وسنعلمك فور صدور القرار.',
    jsonb_build_object('application_id', v_row.id, 'kind', p_kind)
  );

  return v_row;
end;
$$;

create or replace function public.withdraw_provider_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.provider_applications
     set status = 'withdrawn', updated_at = now()
   where id = p_application_id
     and user_id = (select auth.uid())
     and status = 'pending';
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
end;
$$;

-- -------------------------------------------------------------- review ------
-- Approval is the only path that grants a provider role, and it provisions
-- everything the new provider needs in one transaction.
create or replace function public.review_provider_application(
  p_application_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.provider_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_app public.provider_applications;
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_app from public.provider_applications
   where id = p_application_id for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'ALREADY_REVIEWED';
  end if;

  update public.provider_applications
     -- Explicit cast: a CASE expression yields text, and PostgreSQL will not
     -- coerce that into the enum column on its own.
     set status = (case when p_approve then 'approved' else 'rejected' end)::public.application_status,
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = v_admin,
         reviewed_at = now(),
         updated_at = now()
   where id = p_application_id
  returning * into v_app;

  if p_approve then
    v_role := v_app.kind::text::public.user_role;

    -- Grant the role. `roles` is not writable by `authenticated`, so this
    -- function is the only way it can change.
    update public.profiles
       set roles = (
             select array_agg(distinct r)
               from unnest(roles || array[v_role]) r
           ),
           updated_at = now()
     where id = v_app.user_id;

    -- A specialist needs a public profile before they can be booked. Reuse an
    -- existing row if one was created before this flow existed.
    if v_app.kind = 'specialist' then
      if exists (select 1 from public.specialists s where s.profile_id = v_app.user_id) then
        update public.specialists
           set display_name = v_app.display_name,
               title = v_app.title,
               bio = coalesce(v_app.bio, bio),
               specialties = v_app.specialties,
               languages = v_app.languages,
               years_experience = v_app.years_experience,
               is_verified = true,
               is_demo = false
         where profile_id = v_app.user_id;
      else
        insert into public.specialists (
          profile_id, display_name, title, bio, specialties, languages,
          years_experience, is_verified, is_demo
        ) values (
          v_app.user_id, v_app.display_name, v_app.title, v_app.bio,
          v_app.specialties, v_app.languages, v_app.years_experience, true, false
        );
      end if;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_admin,
    case when p_approve then 'provider_application_approved' else 'provider_application_rejected' end,
    'provider_application', v_app.id,
    jsonb_build_object('kind', v_app.kind, 'user_id', v_app.user_id, 'note', v_app.review_note)
  );

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (
    v_app.user_id, 'in_app',
    case when p_approve then 'application_approved' else 'application_rejected' end,
    case when p_approve then 'تمت الموافقة على طلبك' else 'لم تتم الموافقة على طلبك' end,
    case when p_approve
         then 'يمكنك الآن الدخول إلى لوحتك وإدارة أعمالك على المنصة.'
         else coalesce(v_app.review_note, 'يمكنك التواصل مع الإدارة لمعرفة التفاصيل.') end,
    jsonb_build_object('application_id', v_app.id, 'kind', v_app.kind)
  );

  return v_app;
end;
$$;

-- --------------------------------------------------------- role management --
create or replace function public.admin_set_user_roles(
  p_user_id uuid,
  p_roles public.user_role[]
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_before public.user_role[];
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_roles is null or array_length(p_roles, 1) is null then
    raise exception 'ROLES_REQUIRED';
  end if;

  -- Removing your own admin role would lock you out of the only interface that
  -- can grant it back.
  if p_user_id = v_admin and not ('admin' = any(p_roles)) then
    raise exception 'CANNOT_DEMOTE_SELF';
  end if;

  select roles into v_before from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles set roles = p_roles, updated_at = now()
   where id = p_user_id
  returning * into v_row;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'user_roles_updated', 'profile', p_user_id,
          jsonb_build_object('roles', v_before), jsonb_build_object('roles', p_roles));

  return v_row;
end;
$$;

-- Verification can be withdrawn without deleting the provider.
create or replace function public.admin_set_specialist_verified(
  p_specialist_id uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.specialists set is_verified = p_verified where id = p_specialist_id;
  if not found then
    raise exception 'SPECIALIST_NOT_FOUND';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_admin, 'specialist_verification_changed', 'specialist', p_specialist_id,
          jsonb_build_object('is_verified', p_verified));
end;
$$;

revoke all on function public.submit_provider_application(public.provider_kind, text, text, text, text[], text[], integer, text, text, text, text) from public, anon;
revoke all on function public.withdraw_provider_application(uuid) from public, anon;
revoke all on function public.review_provider_application(uuid, boolean, text) from public, anon;
revoke all on function public.admin_set_user_roles(uuid, public.user_role[]) from public, anon;
revoke all on function public.admin_set_specialist_verified(uuid, boolean) from public, anon;

grant execute on function public.submit_provider_application(public.provider_kind, text, text, text, text[], text[], integer, text, text, text, text) to authenticated;
grant execute on function public.withdraw_provider_application(uuid) to authenticated;
grant execute on function public.review_provider_application(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_user_roles(uuid, public.user_role[]) to authenticated;
grant execute on function public.admin_set_specialist_verified(uuid, boolean) to authenticated;

-- --------------------------------------------------------- admin visibility --
-- Operational data only. `session_notes`, `treatment_plans`,
-- `patient_health_profiles` and `medical_files` are deliberately NOT opened to
-- administrators: running the business needs bookings, money and accounts, not
-- the contents of a patient's clinical record. Widen this only against a stated
-- requirement, and expect to justify it under PRD §23.
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists "bookings_staff_read" on public.bookings;
create policy "bookings_staff_read" on public.bookings
  for select to authenticated using (public.is_staff());

drop policy if exists "payments_admin_read" on public.payments;
create policy "payments_admin_read" on public.payments
  for select to authenticated using (public.is_admin());

drop policy if exists "enrollments_staff_read" on public.enrollments;
create policy "enrollments_staff_read" on public.enrollments
  for select to authenticated using (public.is_staff());

drop policy if exists "specialists_admin_all" on public.specialists;
create policy "specialists_admin_all" on public.specialists
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "courses_admin_all" on public.courses;
create policy "courses_admin_all" on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "availability_staff_read" on public.availability_slots;
create policy "availability_staff_read" on public.availability_slots
  for select to authenticated using (public.is_staff());

-- --------------------------------------------------- specialist self-service --
-- A specialist could not edit their own public profile — only an administrator
-- could, through the database.
drop policy if exists "specialists_update_own" on public.specialists;
create policy "specialists_update_own" on public.specialists
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Verification is not self-service.
revoke update on table public.specialists from authenticated;
grant update (display_name, title, bio, specialties, languages, years_experience)
  on table public.specialists to authenticated;

-- ------------------------------------------------------------ trainer side --
-- Course instructors own their courses and can see who enrolled.
drop policy if exists "courses_trainer_all" on public.courses;
create policy "courses_trainer_all" on public.courses
  for all to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

drop policy if exists "enrollments_trainer_read" on public.enrollments;
create policy "enrollments_trainer_read" on public.enrollments
  for select to authenticated
  using (exists (
    select 1 from public.courses c
     where c.id = enrollments.course_id and c.trainer_id = (select auth.uid())
  ));

drop policy if exists "profiles_trainer_read_students" on public.profiles;
create policy "profiles_trainer_read_students" on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
     where e.student_id = profiles.id and c.trainer_id = (select auth.uid())
  ));

drop policy if exists "course_modules_trainer_all" on public.course_modules;
create policy "course_modules_trainer_all" on public.course_modules
  for all to authenticated
  using (exists (select 1 from public.courses c where c.id = course_modules.course_id and c.trainer_id = (select auth.uid())))
  with check (exists (select 1 from public.courses c where c.id = course_modules.course_id and c.trainer_id = (select auth.uid())));

drop policy if exists "course_lessons_trainer_all" on public.course_lessons;
create policy "course_lessons_trainer_all" on public.course_lessons
  for all to authenticated
  using (exists (
    select 1 from public.course_modules m join public.courses c on c.id = m.course_id
     where m.id = course_lessons.module_id and c.trainer_id = (select auth.uid())))
  with check (exists (
    select 1 from public.course_modules m join public.courses c on c.id = m.course_id
     where m.id = course_lessons.module_id and c.trainer_id = (select auth.uid())));

drop policy if exists "attendance_trainer_all" on public.attendance_records;
create policy "attendance_trainer_all" on public.attendance_records
  for all to authenticated
  using (exists (
    select 1 from public.enrollments e join public.courses c on c.id = e.course_id
     where e.id = attendance_records.enrollment_id and c.trainer_id = (select auth.uid())))
  with check (exists (
    select 1 from public.enrollments e join public.courses c on c.id = e.course_id
     where e.id = attendance_records.enrollment_id and c.trainer_id = (select auth.uid())));

grant insert, update on public.course_modules, public.course_lessons, public.attendance_records to authenticated;
grant insert, update on public.courses to authenticated;
grant select on public.audit_logs to authenticated;

-- Enrollment progress is the trainer's to record.
drop policy if exists "enrollments_trainer_update" on public.enrollments;
create policy "enrollments_trainer_update" on public.enrollments
  for update to authenticated
  using (exists (select 1 from public.courses c where c.id = enrollments.course_id and c.trainer_id = (select auth.uid())))
  with check (exists (select 1 from public.courses c where c.id = enrollments.course_id and c.trainer_id = (select auth.uid())));

grant update (progress, completed_at, status) on public.enrollments to authenticated;
