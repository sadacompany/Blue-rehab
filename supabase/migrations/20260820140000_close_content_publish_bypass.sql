-- Close a self-publish bypass on articles and research reviews.
--
-- The intent in 20260807160000_two_section_content.sql was the one already
-- proven on courses: an author edits their own draft, but only an administrator
-- moves it to `published`. That file even revokes UPDATE and re-grants the safe
-- columns to say so (lines 144-159), with a comment that the grant "excludes
-- `status` and `published_at`".
--
-- Three lines later it grants them straight back:
--
--   grant update (status, published_at) on public.articles         to authenticated;  -- :160
--   grant update (status, published_at) on public.research_reviews to authenticated;  -- :161
--   grant update (status, published_at) on public.rehab_programs   to authenticated;  -- :162
--
-- A column grant applies to every member of `authenticated`, and the author
-- write policy (`for all … using author_id = auth.uid() and has_role(...)`)
-- then lets that author set `status = 'published'` on their own row with a
-- direct PostgREST PATCH — going around `publish_content()`, which is the only
-- place `is_admin()` is checked. The public read policy (`using status =
-- 'published'`) puts the row straight onto the site.
--
-- This is exactly the mistake 20260808100000_course_review_flow.sql:176 fixed
-- for courses with a revoke. The articles/research path never got it.
--
-- rehab_programs has no author-write policy (only `is_admin()` can write it),
-- so its grant was inert — but it is revoked here too, so no member of
-- `authenticated` carries a `status` grant it has no legitimate use for.

revoke update (status, published_at) on public.articles         from authenticated;
revoke update (status, published_at) on public.research_reviews from authenticated;
revoke update (status, published_at) on public.rehab_programs   from authenticated;

-- Second link in the same chain: stop a user from handing themselves the
-- `specialist` tag at signup.
--
-- `handle_new_user` (20260807100000_phone_identity_backfill.sql:49) reads
-- `raw_user_meta_data ->> 'account_type'` and seeds the role array from it.
-- That metadata is set by the caller of Supabase Auth. The app's own auth.ts
-- always sends `patient`, but the anon key is public, so anyone can call GoTrue
-- directly with `data: { account_type: 'specialist' }` and land a `specialist`
-- tag. `has_role('specialist')` is what the content author-write policy checks,
-- so self-assignment is what widened the bypass above from "approved providers"
-- to "anyone who can receive an SMS".
--
-- A provider role must be earned through review, never claimed. The trigger is
-- rewritten to honour only `student` — which grants no authorization anywhere
-- (it gates no RLS policy; it is a UI/enrolment convenience) and is a real
-- self-service signup type — and to seed everyone else as `patient`.
-- `specialist`, `trainer` and `admin` are reachable only through the
-- SECURITY DEFINER admin paths (`review_provider_application`,
-- `admin_set_user_roles`), which check `is_admin()` first.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, roles)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'مستخدم بلو'),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, '')), ''),
    -- `student` is the only self-selectable role, and it grants nothing on its
    -- own. Everything else — including a forged `specialist`/`admin` value — is
    -- seeded as `patient`; provider roles are granted only by an administrator.
    case new.raw_user_meta_data ->> 'account_type'
      when 'student' then array['student']::public.user_role[]
      else                array['patient']::public.user_role[]
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
