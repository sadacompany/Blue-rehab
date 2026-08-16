-- Cover artwork for the three kinds of content.
--
-- The landing page presents دوراتنا, مقالاتنا and أبحاثنا as pictures — the
-- artwork *is* the card, as the design file has it. Until now none of these
-- tables could hold one, so the home page could only show three images that were
-- bundled into the build and paired by position, which meant the artwork could
-- not be changed without a deployment and did not belong to the item it
-- illustrated.
--
-- One public bucket for all of them: these are published covers, meant to be
-- seen. Writing is administration-only, the same gate that decides what is
-- published in the first place.

alter table public.articles          add column if not exists cover_url text;
alter table public.research_reviews  add column if not exists cover_url text;
alter table public.courses           add column if not exists cover_url text;
alter table public.rehab_programs    add column if not exists cover_url text;

comment on column public.articles.cover_url is
  'Public URL of the cover artwork shown on the landing page and in the reading list.';
comment on column public.research_reviews.cover_url is
  'Public URL of the cover artwork shown on the landing page and in the reading list.';
comment on column public.courses.cover_url is
  'Public URL of the course poster shown on the landing page and the course page.';
comment on column public.rehab_programs.cover_url is
  'Public URL of the programme poster shown on the landing page and the programme page.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-covers', 'content-covers', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look at a published cover; only administration may put one there.
drop policy if exists "content_covers_public_read" on storage.objects;
create policy "content_covers_public_read" on storage.objects
  for select to public
  using (bucket_id = 'content-covers');

drop policy if exists "content_covers_admin_write" on storage.objects;
create policy "content_covers_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content-covers' and public.is_admin());

drop policy if exists "content_covers_admin_update" on storage.objects;
create policy "content_covers_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'content-covers' and public.is_admin());

drop policy if exists "content_covers_admin_delete" on storage.objects;
create policy "content_covers_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'content-covers' and public.is_admin());
