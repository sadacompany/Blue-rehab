-- فريقنا الطبي — the team section on the landing page.
--
-- The design puts the clinical team on the home page: a photograph, a name, a
-- title, years of experience, and a button that books that person. Everything
-- but the photograph already exists on `specialists`, and the client says the
-- team is larger than the three the design shows — so this is data the
-- administration adds, not a list in the source.
--
-- `team_order` is what decides who appears and in what sequence. Null means the
-- specialist is in the catalogue but not on the landing page, which keeps the
-- two decisions separate: being bookable and being introduced are not the same
-- thing.

alter table public.specialists
  add column if not exists photo_url text,
  add column if not exists team_order integer;

create index if not exists specialists_team_order_idx
  on public.specialists(team_order) where team_order is not null;

comment on column public.specialists.photo_url is
  'Public URL of the team photograph. Null renders the initials placeholder.';
comment on column public.specialists.team_order is
  'Position in فريقنا الطبي on the landing page. Null keeps them off it.';

-- A specialist maintains their own photograph; administration maintains anyone's
-- and decides who is introduced on the landing page.
--
-- `team_order` is deliberately outside the specialist's grant: appearing on the
-- home page is an editorial decision, and the existing specialists_update_own
-- policy would otherwise let anyone verified put themselves at the top.
revoke update on public.specialists from authenticated;
grant update (display_name, title, bio, specialties, languages, years_experience, photo_url)
  on public.specialists to authenticated;

-- --------------------------------------------------------------- storage ----
-- Public, unlike every other bucket here: these are photographs chosen to be
-- shown to visitors on the front page. Nothing private is stored in it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('specialist-photos', 'specialist-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "specialist_photos_public_read" on storage.objects;
create policy "specialist_photos_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'specialist-photos');

-- Objects are addressed <specialist-id>/<file>, so the first segment is the
-- subject and a specialist may write only their own.
drop policy if exists "specialist_photos_own_write" on storage.objects;
create policy "specialist_photos_own_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'specialist-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.specialists s
         where s.id::text = (storage.foldername(name))[1]
           and s.profile_id = (select auth.uid())
      )
    )
  );

drop policy if exists "specialist_photos_own_update" on storage.objects;
create policy "specialist_photos_own_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'specialist-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.specialists s
         where s.id::text = (storage.foldername(name))[1]
           and s.profile_id = (select auth.uid())
      )
    )
  );

drop policy if exists "specialist_photos_own_delete" on storage.objects;
create policy "specialist_photos_own_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'specialist-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.specialists s
         where s.id::text = (storage.foldername(name))[1]
           and s.profile_id = (select auth.uid())
      )
    )
  );

-- ------------------------------------------------------------ team editing ---
-- Administration sets who is on the landing page and in what order. A function
-- rather than a column grant, because a grant applies to every member of the
-- role and the specialist's own-row policy would then reach it.
create or replace function public.set_team_position(p_specialist_id uuid, p_position integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.specialists set team_order = p_position where id = p_specialist_id;
  if not found then raise exception 'SPECIALIST_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.set_team_position(uuid, integer) from public, anon;
grant execute on function public.set_team_position(uuid, integer) to authenticated;
