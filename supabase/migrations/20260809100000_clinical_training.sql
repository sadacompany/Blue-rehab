-- Clinical summer training — التدريب الصيفي الإكلينيكي
--
-- Students apply to train in the clinics. They are not patients and have no
-- reason to hold an account, so the form is open: anyone may submit, nobody may
-- read. The applications sit until the clinics need trainees, which is the point
-- — this is a register to draw from later, not a queue anyone must work.
--
-- The CV is the one part that cannot be a text field. An anonymous write to
-- storage is a spam surface, so it is bounded three ways: the folder must be
-- named after an application row that already exists and is less than an hour
-- old, the bucket is private with a size and type limit, and only an
-- administrator can read back what was uploaded.

create table if not exists public.training_applications (
  id uuid primary key default gen_random_uuid(),

  full_name text not null,
  phone text not null,
  email text,

  university text not null,
  college text,
  specialty text not null,
  academic_level text,
  student_number text,

  available_from date,
  available_to date,
  required_hours text,

  note text,
  cv_path text,

  status text not null default 'new'
    check (status in ('new', 'reviewing', 'shortlisted', 'placed', 'declined', 'archived')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists training_applications_status_idx
  on public.training_applications(status, created_at desc);

alter table public.training_applications enable row level security;

-- Nobody reads this table except administration. There is deliberately no
-- self-service read: an applicant has no account to be recognised by.
drop policy if exists "training_applications_admin_all" on public.training_applications;
create policy "training_applications_admin_all" on public.training_applications
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------ submit --
-- Writes go through a function rather than a policy: an anonymous INSERT with
-- `returning` cannot be read back under RLS, and the row shape should not be
-- the applicant's to choose — status and the review columns are ours.
create or replace function public.submit_training_application(
  p_full_name text,
  p_phone text,
  p_university text,
  p_specialty text,
  p_email text default null,
  p_college text default null,
  p_academic_level text default null,
  p_student_number text default null,
  p_available_from date default null,
  p_available_to date default null,
  p_required_hours text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  if coalesce(btrim(p_phone), '') = '' then raise exception 'PHONE_REQUIRED'; end if;
  if coalesce(btrim(p_university), '') = '' then raise exception 'UNIVERSITY_REQUIRED'; end if;
  if coalesce(btrim(p_specialty), '') = '' then raise exception 'SPECIALTY_REQUIRED'; end if;

  -- One open application per phone number. A student who applies twice is
  -- updating their details, not queueing twice.
  if exists (
    select 1 from public.training_applications t
     where t.phone = btrim(p_phone)
       and t.status in ('new', 'reviewing', 'shortlisted')
  ) then
    raise exception 'ALREADY_APPLIED';
  end if;

  insert into public.training_applications (
    full_name, phone, email, university, college, specialty, academic_level,
    student_number, available_from, available_to, required_hours, note
  ) values (
    btrim(p_full_name), btrim(p_phone), nullif(btrim(coalesce(p_email, '')), ''),
    btrim(p_university), nullif(btrim(coalesce(p_college, '')), ''), btrim(p_specialty),
    nullif(btrim(coalesce(p_academic_level, '')), ''), nullif(btrim(coalesce(p_student_number, '')), ''),
    p_available_from, p_available_to, nullif(btrim(coalesce(p_required_hours, '')), ''),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  select p.id, 'in_app', 'training_application_submitted', 'طلب تدريب صيفي جديد',
         'قدّم طالب طلباً للتدريب الإكلينيكي.',
         jsonb_build_object('application_id', v_id, 'name', btrim(p_full_name))
    from public.profiles p
   where 'admin' = any(p.roles);

  return v_id;
end;
$$;

-- ------------------------------------------------------------------ attach --
-- Record the uploaded CV against the application. Only while the application is
-- fresh and only once, so this cannot be used to rewrite an old submission.
create or replace function public.attach_training_cv(p_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.training_applications
     set cv_path = p_path
   where id = p_id
     and cv_path is null
     and created_at > now() - interval '1 hour';
  if not found then raise exception 'ATTACH_NOT_ALLOWED'; end if;
end;
$$;

-- ------------------------------------------------------------------ review --
create or replace function public.review_training_application(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('new', 'reviewing', 'shortlisted', 'placed', 'declined', 'archived') then
    raise exception 'STATUS_INVALID';
  end if;

  update public.training_applications
     set status = p_status,
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where id = p_id;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values ((select auth.uid()), 'training_application_reviewed', 'training_application', p_id,
          jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.submit_training_application(text, text, text, text, text, text, text, text, date, date, text, text) from public;
revoke all on function public.attach_training_cv(uuid, text) from public;
revoke all on function public.review_training_application(uuid, text, text) from public, anon;
grant execute on function public.submit_training_application(text, text, text, text, text, text, text, text, date, date, text, text) to anon, authenticated;
grant execute on function public.attach_training_cv(uuid, text) to anon, authenticated;
grant execute on function public.review_training_application(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------- storage --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-cv', 'training-cv', false, 5242880,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

-- The folder must name an application that exists and was made in the last hour.
-- Without that an open bucket would accept anything from anyone.
drop policy if exists "training_cv_insert" on storage.objects;
create policy "training_cv_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'training-cv'
    and exists (
      select 1 from public.training_applications t
       where t.id::text = (storage.foldername(name))[1]
         and t.created_at > now() - interval '1 hour'
    )
  );

-- Reading a CV is reviewing an application, which is administrative.
drop policy if exists "training_cv_admin_read" on storage.objects;
create policy "training_cv_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'training-cv' and public.is_admin());
