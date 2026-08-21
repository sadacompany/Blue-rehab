-- Close the other half of the content self-publish bypass: INSERT.
--
-- 20260820140000_close_content_publish_bypass.sql revoked the UPDATE grant on
-- `status`/`published_at` for `articles`/`research_reviews` — an author could
-- edit their own draft but not flip it live. Verified against the live
-- database at the time; that part is genuinely closed.
--
-- What it missed: `20260807160000_two_section_content.sql:95` grants
-- `authenticated` a blanket, table-level INSERT with no column restriction —
--
--   grant insert on public.articles, public.research_reviews to authenticated;
--
-- — and the author-write RLS policies' `with check` (same file, ~:126-141)
-- validate only `author_id`/`reviewer_id` and role, never `status`. So an
-- author never needed UPDATE at all: `INSERT INTO articles (..., status)
-- VALUES (..., 'published')` landed the row live in one step, fully
-- bypassing `publish_content()` and its `is_admin()` check — the exact bug
-- class 20260820140000 claimed to have closed, just via a different SQL verb.
--
-- Proven against the live database before writing this fix: inside a rolled-
-- back transaction, impersonating a real specialist, `insert into
-- public.articles (..., status) values (..., 'published')` succeeded.
--
-- Fix follows the same shape already used for UPDATE: revoke the blanket
-- grant, re-grant INSERT scoped to every column except `status` and
-- `published_at`. Both default to `draft`/`null` (table definition, same
-- file), so a submission an author makes without naming those columns lands
-- exactly where `submit_content_for_review()` expects to find it — nothing
-- about the normal authoring flow changes, only the ability to name the two
-- columns that matter.
--
-- `rehab_programs` was never affected — it has no author-write policy, only
-- `is_admin()` (20260807160000:115) — but its INSERT grant was also
-- unrestricted, so it is scoped here too for the same reason
-- 20260820140000 scoped its UPDATE grant defensively: no member of
-- `authenticated` should carry a grant on `status`/`published_at` it has no
-- legitimate use for, regardless of whether a policy happens to block it today.

revoke insert on public.articles, public.research_reviews, public.rehab_programs from authenticated;

grant insert (
  id, slug, title, excerpt, body, cover_url, category, tags,
  reading_minutes, author_id, author_name, created_at, updated_at
) on public.articles to authenticated;

grant insert (
  id, slug, title, excerpt, body, cover_url,
  source_title, source_authors, source_journal, source_year, source_url,
  key_findings, practical_takeaway, evidence_level, tags,
  reviewer_id, reviewer_name, created_at, updated_at
) on public.research_reviews to authenticated;

grant insert (
  id, slug, title, summary, description, goals, suitable_for,
  duration_weeks, sessions_per_week, level, price, cover_url,
  position, created_by, created_at, updated_at
) on public.rehab_programs to authenticated;
