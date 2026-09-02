-- Attaching a cover to a course (and to the other content tables) from the
-- admin interface.
--
-- The client uploaded the image to the `content-covers` bucket and then wrote
-- the resulting URL back with a direct `update ... set cover_url` on the table.
-- That direct write no longer has a grant: writes to these tables were locked
-- down to SECURITY DEFINER functions when the publish bypass was closed
-- (20260820140000), so `authenticated` has no table-level UPDATE privilege and
-- the write failed with «permission denied for table courses». The upload
-- succeeded, the row was never updated, and the new course showed no artwork.
--
-- This is the missing piece: one admin-only function that records a cover URL
-- (or clears it, when the URL is null) on any of the four content tables. It is
-- SECURITY DEFINER like every other administrative write, checks `is_admin()`
-- itself, and whitelists the table name rather than interpolating it, so there
-- is no dynamic-SQL surface. The bucket policies that already let an admin
-- upload the file are unchanged; only the table write moves behind this door.

create or replace function public.admin_set_content_cover(
  p_table text,
  p_id uuid,
  p_cover_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Explicit per-table statements, not `format('update %I ...')`: the set of
  -- tables a cover can live on is fixed and small, and naming them keeps the
  -- function free of any dynamic SQL.
  if p_table = 'courses' then
    update public.courses set cover_url = p_cover_url where id = p_id;
  elsif p_table = 'articles' then
    update public.articles set cover_url = p_cover_url where id = p_id;
  elsif p_table = 'research_reviews' then
    update public.research_reviews set cover_url = p_cover_url where id = p_id;
  elsif p_table = 'rehab_programs' then
    update public.rehab_programs set cover_url = p_cover_url where id = p_id;
  else
    raise exception 'TABLE_NOT_ALLOWED';
  end if;

  if not found then
    raise exception 'CONTENT_NOT_FOUND';
  end if;
end;
$$;

comment on function public.admin_set_content_cover(text, uuid, text) is
  'Admin-only: record (or clear, when null) a cover URL on a content table. The image itself is uploaded to the content-covers bucket by the caller; this writes the reference the direct table update no longer may.';

revoke all on function public.admin_set_content_cover(text, uuid, text) from public, anon;
grant execute on function public.admin_set_content_cover(text, uuid, text) to authenticated;
