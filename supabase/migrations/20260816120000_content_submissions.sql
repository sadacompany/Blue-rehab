-- Let specialists put forward the three kinds of content.
--
-- The clinic's flow: an الأخصائي raises a request for a مقال, a بحث or a دورة;
-- administration checks the accuracy of the information, whether it matches the
-- platform's scientific methodology, and whether it suits the platform at all —
-- and only then does it appear publicly.
--
-- A course already had that path: the trainer builds it and calls
-- submit_course_for_review, and only an administrator can set is_published.
-- Articles and research reviews had no path at all; they could only be created
-- directly in the database. This adds the same shape for both.
--
-- Nothing here can publish. The function writes `in_review` and the status enum
-- is not otherwise reachable by `authenticated`, so the decision stays with
-- administration exactly as it does for courses.

-- A submitter may read their own work back whatever state it is in, which is
-- what makes "قيد المراجعة" visible to the person waiting on it. The public
-- policies already restrict everyone else to `published`.
drop policy if exists "articles_author_reads_own" on public.articles;
create policy "articles_author_reads_own" on public.articles
  for select to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists "research_author_reads_own" on public.research_reviews;
create policy "research_author_reads_own" on public.research_reviews
  for select to authenticated
  using (reviewer_id = (select auth.uid()));

/**
 * Slug from a title, in a form Postgres and a URL both accept.
 *
 * Arabic titles survive: only whitespace and punctuation are folded, letters are
 * left alone, so «الألم لا يعني ضرراً» becomes «الألم-لا-يعني-ضررا» rather than
 * an empty string. A short random suffix keeps two similar titles apart without
 * a lookup loop.
 */
create or replace function public.content_slug(p_title text)
returns text language sql immutable as $$
  select left(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_title, '')), '[^[:alnum:]؀-ۿ]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ), 60
  ) || '-' || substr(md5(random()::text), 1, 6);
$$;

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
  p_practical_takeaway text default null
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
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_kind not in ('article', 'research') then raise exception 'KIND_INVALID'; end if;
  if char_length(v_title) < 6 or char_length(v_title) > 200 then raise exception 'TITLE_INVALID'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 40 then raise exception 'BODY_TOO_SHORT'; end if;

  select roles, full_name into v_roles, v_name from public.profiles where id = v_user;

  -- Putting content forward is a clinical act, so it is limited to the people
  -- administration has already verified.
  if not ('specialist' = any(v_roles) or 'trainer' = any(v_roles) or 'admin' = any(v_roles)) then
    raise exception 'NOT_A_PROVIDER';
  end if;

  v_slug := public.content_slug(v_title);

  if p_kind = 'article' then
    insert into public.articles (slug, title, excerpt, body, category, tags,
                                 author_id, author_name, status)
    values (v_slug, v_title, nullif(btrim(coalesce(p_excerpt, '')), ''),
            p_body, nullif(btrim(coalesce(p_category, '')), ''), coalesce(p_tags, '{}'),
            v_user, v_name, 'in_review')
    returning id into v_id;
  else
    insert into public.research_reviews (slug, title, excerpt, body, tags,
                                         source_title, source_authors, source_journal,
                                         source_year, source_url, practical_takeaway,
                                         reviewer_id, reviewer_name, status)
    values (v_slug, v_title, nullif(btrim(coalesce(p_excerpt, '')), ''),
            p_body, coalesce(p_tags, '{}'),
            nullif(btrim(coalesce(p_source_title, '')), ''),
            nullif(btrim(coalesce(p_source_authors, '')), ''),
            nullif(btrim(coalesce(p_source_journal, '')), ''),
            p_source_year,
            nullif(btrim(coalesce(p_source_url, '')), ''),
            nullif(btrim(coalesce(p_practical_takeaway, '')), ''),
            v_user, v_name, 'in_review')
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

revoke all on function public.submit_content_for_review(
  text, text, text, text, text, text[], text, text, text, integer, text, text
) from public, anon;
grant execute on function public.submit_content_for_review(
  text, text, text, text, text, text[], text, text, text, integer, text, text
) to authenticated;
