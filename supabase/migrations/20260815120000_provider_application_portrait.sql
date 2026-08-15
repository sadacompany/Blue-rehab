-- Require a portrait on the join request.
--
-- An approved specialist or trainer is introduced on the front page and on their
-- own card, and until now the only picture in the system arrived later, uploaded
-- by an administrator on the team screen. Asking the applicant for it at the
-- point they apply means an approved provider is publishable immediately, and it
-- gives the reviewer a face to check against the credentials.
--
-- The file lands in the same private `provider-credentials` bucket, under the
-- applicant's own folder, so the existing owner-and-admin policies already cover
-- it. It is deliberately not public at application time: nothing about a pending
-- request should be visible until the request is approved.

alter table public.provider_applications
  add column if not exists photo_path text;

comment on column public.provider_applications.photo_path is
  'Key in the provider-credentials bucket, <user-id>/portrait-<ts>.<ext>. Becomes the specialist photo on approval.';

-- Accept the portrait alongside the rest of the application.
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
  p_contact_phone text default null,
  p_credential_files text[] default '{}',
  p_photo_path text default null
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
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_row public.provider_applications;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'NAME_INVALID'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 160 then raise exception 'TITLE_INVALID'; end if;
  if v_photo is null then raise exception 'PHOTO_REQUIRED'; end if;

  if exists (
    select 1 from public.profiles p
     where p.id = v_user and p_kind::text::public.user_role = any(p.roles)
  ) then
    raise exception 'ALREADY_PROVIDER';
  end if;

  -- Only the applicant's own uploads may be attached, so a crafted path cannot
  -- pull somebody else's documents into this request. The portrait is checked
  -- the same way as the credentials.
  if exists (
    select 1 from unnest(coalesce(p_credential_files, '{}')) f
     where split_part(f, '/', 1) <> v_user::text
  ) then
    raise exception 'CREDENTIAL_PATH_INVALID';
  end if;

  if split_part(v_photo, '/', 1) <> v_user::text then
    raise exception 'CREDENTIAL_PATH_INVALID';
  end if;

  insert into public.provider_applications as a (
    user_id, kind, display_name, title, bio, specialties, languages,
    years_experience, license_number, credentials_note, contact_email, contact_phone,
    credential_files, photo_path
  ) values (
    v_user, p_kind, v_name, v_title, nullif(btrim(coalesce(p_bio, '')), ''),
    coalesce(p_specialties, '{}'), coalesce(p_languages, array['العربية']),
    greatest(0, least(70, coalesce(p_years_experience, 0))),
    nullif(btrim(coalesce(p_license_number, '')), ''),
    nullif(btrim(coalesce(p_credentials_note, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), ''),
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    coalesce(p_credential_files, '{}'), v_photo
  )
  on conflict (user_id, kind) where status = 'pending'
  do update set
    display_name = excluded.display_name, title = excluded.title, bio = excluded.bio,
    specialties = excluded.specialties, languages = excluded.languages,
    years_experience = excluded.years_experience, license_number = excluded.license_number,
    credentials_note = excluded.credentials_note, contact_email = excluded.contact_email,
    contact_phone = excluded.contact_phone, credential_files = excluded.credential_files,
    photo_path = excluded.photo_path,
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

revoke all on function public.submit_provider_application(
  public.provider_kind, text, text, text, text[], text[], integer, text, text, text, text, text[], text
) from public, anon;
grant execute on function public.submit_provider_application(
  public.provider_kind, text, text, text, text[], text[], integer, text, text, text, text, text[], text
) to authenticated;

-- Remove the signature without the portrait. Leaving both in place makes the
-- call ambiguous to PostgREST (PGRST203) and neither can be invoked, which takes
-- the whole application form down rather than degrading it.
drop function if exists public.submit_provider_application(
  public.provider_kind, text, text, text, text[], text[], integer, text, text, text, text, text[]
);
