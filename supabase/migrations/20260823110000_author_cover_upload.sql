-- Let the specialist submitting an article attach their own cover image, so
-- admin reviews the picture and the text together instead of publishing text
-- first and hunting for a photo afterward.
--
-- `content-covers` (20260816100000) only ever let *admins* write to it, at
-- `{table}/{id}/cover.ext` — a path that needs a row id, which does not exist
-- yet at submission time. Authors get their own prefix instead,
-- `pending/{their-uid}/...`, following the exact shape
-- 20260807140000_provider_credential_uploads.sql already established for
-- self-scoped uploads: the first path segments are the owner, checked in the
-- storage policy and re-checked inside the SECURITY DEFINER function so a
-- crafted URL can never attach someone else's file to a submission.
--
-- This does not touch who can *publish* — `submit_content_for_review` still
-- only ever writes `status = 'in_review'`, same as before. The image is part
-- of what gets reviewed, not a way around review.

drop policy if exists "content_covers_own_insert" on storage.objects;
create policy "content_covers_own_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-covers'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "content_covers_own_update" on storage.objects;
create policy "content_covers_own_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'content-covers'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "content_covers_own_delete" on storage.objects;
create policy "content_covers_own_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'content-covers'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create or replace function public.submit_content_for_review(
  p_kind text,
  p_title text,
  p_excerpt text default null,
  p_body text default null,
  p_category text default null,
  p_tags text[] default '{}',
  p_source_title text default null,
  p_source_authors text default null,
  p_source_journal text default null,
  p_source_year integer default null,
  p_source_url text default null,
  p_practical_takeaway text default null,
  p_cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_roles public.user_role[];
  v_name text;
  v_title text := btrim(coalesce(p_title, ''));
  v_slug text;
  v_id uuid;
  v_cover text := nullif(btrim(coalesce(p_cover_url, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_kind not in ('article', 'research') then raise exception 'KIND_INVALID'; end if;
  if char_length(v_title) < 6 or char_length(v_title) > 200 then raise exception 'TITLE_INVALID'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 40 then raise exception 'BODY_TOO_SHORT'; end if;

  -- A cover URL must be this caller's own pending upload — the object key the
  -- client actually uploaded to, not merely a URL that looks plausible. This
  -- is the same shape as CREDENTIAL_PATH_INVALID in submit_provider_application:
  -- validated server-side, not trusted because the client sent it.
  if v_cover is not null and v_cover !~ ('/content-covers/pending/' || v_user::text || '/') then
    raise exception 'COVER_PATH_INVALID';
  end if;

  select roles, full_name into v_roles, v_name from public.profiles where id = v_user;

  -- Putting content forward is a clinical act, so it is limited to the people
  -- administration has already verified.
  if not ('specialist' = any(v_roles) or 'trainer' = any(v_roles) or 'admin' = any(v_roles)) then
    raise exception 'NOT_A_PROVIDER';
  end if;

  v_slug := public.content_slug(v_title);

  if p_kind = 'article' then
    insert into public.articles (slug, title, excerpt, body, category, tags,
                                 author_id, author_name, status, cover_url)
    values (v_slug, v_title, nullif(btrim(coalesce(p_excerpt, '')), ''),
            p_body, nullif(btrim(coalesce(p_category, '')), ''), coalesce(p_tags, '{}'),
            v_user, v_name, 'in_review', v_cover)
    returning id into v_id;
  else
    insert into public.research_reviews (slug, title, excerpt, body, tags,
                                         source_title, source_authors, source_journal,
                                         source_year, source_url, practical_takeaway,
                                         reviewer_id, reviewer_name, status, cover_url)
    values (v_slug, v_title, nullif(btrim(coalesce(p_excerpt, '')), ''),
            p_body, coalesce(p_tags, '{}'),
            nullif(btrim(coalesce(p_source_title, '')), ''),
            nullif(btrim(coalesce(p_source_authors, '')), ''),
            nullif(btrim(coalesce(p_source_journal, '')), ''),
            p_source_year,
            nullif(btrim(coalesce(p_source_url, '')), ''),
            nullif(btrim(coalesce(p_practical_takeaway, '')), ''),
            v_user, v_name, 'in_review', v_cover)
    returning id into v_id;
  end if;

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (
    v_user, 'in_app', 'content_submitted', 'تم استلام طلب النشر',
    'سيراجع الفريق العلمي دقة المعلومة ومنهجيتها قبل النشر، وسنعلمك بالنتيجة.',
    jsonb_build_object('content_id', v_id, 'kind', p_kind)
  );

  return jsonb_build_object('id', v_id, 'kind', p_kind, 'slug', v_slug, 'status', 'in_review');
end;
$$;

-- Drop the twelve-argument signature this replaces — leaving both in place
-- makes the call ambiguous to PostgREST (PGRST203) and neither can be
-- invoked, which takes the whole submission form down rather than degrading it.
drop function if exists public.submit_content_for_review(
  text, text, text, text, text, text[], text, text, text, integer, text, text
);

revoke all on function public.submit_content_for_review(
  text, text, text, text, text, text[], text, text, text, integer, text, text, text
) from public, anon;
grant execute on function public.submit_content_for_review(
  text, text, text, text, text, text[], text, text, text, integer, text, text, text
) to authenticated;
