-- The two-section platform: استشارة بلو and أكاديمية بلو.
--
--   استشارة بلو   حجز موعد (استشارة/حضوري)  +  برامج علمية للتأهيل
--   أكاديمية بلو  دورات  +  مقالات  +  مراجعة الأبحاث
--
-- Bookings, services and courses already existed. This adds the three content
-- types that did not: rehabilitation programmes, articles, and research reviews.
--
-- Authorship vs publication is deliberately split. A specialist or instructor
-- may write and edit their own drafts, but only an administrator can publish —
-- enforced by column grant rather than by policy, the same way specialist
-- verification is handled. Clinical content carrying the clinic's name should
-- not go live on the author's say-so alone.

do $$ begin
  create type public.content_status as enum ('draft','in_review','published','archived');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------- برامج علمية للتأهيل ----
create table if not exists public.rehab_programs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  description text,
  goals text[] not null default '{}',
  suitable_for text[] not null default '{}',
  duration_weeks integer check (duration_weeks > 0),
  sessions_per_week integer check (sessions_per_week > 0),
  level text not null default 'مبتدئ',
  price numeric(10,2) not null default 0 check (price >= 0),
  cover_url text,
  status public.content_status not null default 'draft',
  position integer not null default 0,
  created_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- مقالات ----
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  cover_url text,
  category text,
  tags text[] not null default '{}',
  reading_minutes integer check (reading_minutes > 0),
  author_id uuid references public.profiles(id),
  author_name text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------ مراجعة الأبحاث ----
create table if not exists public.research_reviews (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body text,
  cover_url text,
  -- What was reviewed, and what it means in practice.
  source_title text,
  source_authors text,
  source_journal text,
  source_year integer check (source_year between 1900 and 2100),
  source_url text,
  key_findings text[] not null default '{}',
  practical_takeaway text,
  evidence_level text,
  tags text[] not null default '{}',
  reviewer_id uuid references public.profiles(id),
  reviewer_name text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rehab_programs_status_idx on public.rehab_programs(status, position);
create index if not exists articles_status_idx on public.articles(status, published_at desc);
create index if not exists research_status_idx on public.research_reviews(status, published_at desc);

alter table public.rehab_programs enable row level security;
alter table public.articles enable row level security;
alter table public.research_reviews enable row level security;

grant select on public.rehab_programs, public.articles, public.research_reviews to anon, authenticated;
grant insert on public.articles, public.research_reviews to authenticated;
grant insert, delete on public.rehab_programs to authenticated;
grant delete on public.articles, public.research_reviews to authenticated;

-- Everyone sees what is published.
drop policy if exists "programs_public_read" on public.rehab_programs;
create policy "programs_public_read" on public.rehab_programs
  for select to anon, authenticated using (status = 'published');

drop policy if exists "articles_public_read" on public.articles;
create policy "articles_public_read" on public.articles
  for select to anon, authenticated using (status = 'published');

drop policy if exists "research_public_read" on public.research_reviews;
create policy "research_public_read" on public.research_reviews
  for select to anon, authenticated using (status = 'published');

-- Administration owns the whole lifecycle.
drop policy if exists "programs_admin_all" on public.rehab_programs;
create policy "programs_admin_all" on public.rehab_programs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "articles_admin_all" on public.articles;
create policy "articles_admin_all" on public.articles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "research_admin_all" on public.research_reviews;
create policy "research_admin_all" on public.research_reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Providers write and read back their own drafts.
drop policy if exists "articles_author_write" on public.articles;
create policy "articles_author_write" on public.articles
  for all to authenticated
  using (author_id = (select auth.uid())
         and (public.has_role('specialist') or public.has_role('trainer')))
  with check (author_id = (select auth.uid())
              and (public.has_role('specialist') or public.has_role('trainer')));

drop policy if exists "research_reviewer_write" on public.research_reviews;
create policy "research_reviewer_write" on public.research_reviews
  for all to authenticated
  using (reviewer_id = (select auth.uid())
         and (public.has_role('specialist') or public.has_role('trainer')))
  with check (reviewer_id = (select auth.uid())
              and (public.has_role('specialist') or public.has_role('trainer')));

-- Publication is administrative: the column grant excludes `status` and
-- `published_at`, so an author can edit their draft but cannot put it live.
revoke update on public.articles from authenticated;
grant update (title, excerpt, body, cover_url, category, tags, reading_minutes, author_name, updated_at)
  on public.articles to authenticated;

revoke update on public.research_reviews from authenticated;
grant update (title, excerpt, body, cover_url, source_title, source_authors, source_journal,
              source_year, source_url, key_findings, practical_takeaway, evidence_level,
              tags, reviewer_name, updated_at)
  on public.research_reviews to authenticated;

revoke update on public.rehab_programs from authenticated;
grant update (title, summary, description, goals, suitable_for, duration_weeks,
              sessions_per_week, level, price, cover_url, position, updated_at)
  on public.rehab_programs to authenticated;

-- Administrators need `status` back; their policy already restricts who they are.
grant update (status, published_at) on public.articles to authenticated;
grant update (status, published_at) on public.research_reviews to authenticated;
grant update (status, published_at) on public.rehab_programs to authenticated;

-- ---------------------------------------------------------------- publish --
-- One checked path for going live, so the timestamp is always set with the
-- status and an administrator is always the one doing it.
create or replace function public.publish_content(
  p_table text,
  p_id uuid,
  p_status public.content_status
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
  if p_table not in ('articles', 'research_reviews', 'rehab_programs') then
    raise exception 'TABLE_NOT_ALLOWED';
  end if;

  execute format(
    'update public.%I set status = $1, published_at = case when $1 = ''published'' '
    || 'then coalesce(published_at, now()) else published_at end, updated_at = now() where id = $2',
    p_table
  ) using p_status, p_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values ((select auth.uid()), 'content_status_changed', p_table, p_id,
          jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.publish_content(text, uuid, public.content_status) from public, anon;
grant execute on function public.publish_content(text, uuid, public.content_status) to authenticated;
