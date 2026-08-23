-- Give a specialist (and optionally a patient) an email, so a remote
-- session's calendar invite can actually name them as a guest.
--
-- The root cause of "both people just sit in the waiting room": Google Meet
-- links minted via the Calendar API (server/src/google-meet.ts) are organized
-- by the clinic's own Gmail — a personal account, not Google Workspace.
-- Nobody who joins is signed into that account, so the only way Meet
-- recognises a joiner and lets them in without a knock is if their signed-in
-- Google account matches an email on the event's guest list. Both call sites
-- that create these events (`issueMeetingLinkIfRemote` and
-- `createBookingMeeting` in runtime-api.ts) have always sent an **empty**
-- attendee list — one hardcodes `attendeeEmail: null`, the other reads
-- `auth.users.email`, which is always null under this platform's phone/OTP
-- auth. So every remote session's Meet link has, in practice, invited no one:
-- both patient and specialist show up as anonymous, unrecognised guests, each
-- has to "ask to join", and there is no one already inside — signed into the
-- organising account or otherwise recognised as a guest — able to let
-- either of them in. That is the deadlock.
--
-- This does not solve the whole thing by itself — server/src/runtime-api.ts
-- and meetings.ts still need to read these columns and pass them as
-- attendees — but it is the missing data the fix needs, and specialists is
-- the side we have real emails for right now.

alter table public.specialists add column if not exists email text;
comment on column public.specialists.email is
  'Contact email for calendar invites (Google Meet attendee list). Not a login credential — this platform authenticates by phone.';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'specialists_email_shape') then
    alter table public.specialists
      add constraint specialists_email_shape check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end $$;

-- `specialists` has a public row-level SELECT policy
-- (002_comprehensive_platform.sql:326, `is_verified or is_demo`) backed by a
-- blanket table-level grant to anon AND authenticated
-- (002_comprehensive_platform.sql:390) — no column scoping at all. Every
-- column on a verified specialist's row is fetchable today by anyone,
-- including a signed-out visitor, via a plain PostgREST request; the app's
-- own `select("id,display_name,...")` in runtime-api.ts limits what *it*
-- asks for, but does not limit what the table allows. Adding `email` without
-- also scoping the grant would hand six specialists' personal Gmail
-- addresses to the public internet the moment this migration runs.
--
-- The server never needs the client-facing grant to read this column: Meet
-- invites are created via `adminClient()` (service role, server/src/supabase.ts),
-- which bypasses grants and RLS entirely. So `email` needs no grant to
-- `anon`/`authenticated` at all — same shape as every other "server-only,
-- never the browser" column already protected this way in this schema
-- (e.g. `profiles.roles`, `payments.amount` on write).
-- Every column here except `email` — confirmed against
-- information_schema.columns (15 existing columns) and against every
-- client-side `.select()`/`.order()`/`.not()` reference to this table
-- (server/src/runtime-api.ts:130, client/src/lib/team.ts:32-33,71-72) so
-- nothing that currently works — including the homepage team ordering, which
-- reads and filters on `team_order` directly from the browser — silently
-- breaks.
revoke select on public.specialists from anon, authenticated;
grant select (
  id, profile_id, title, bio, years_experience, is_verified, rating,
  created_at, display_name, specialties, languages, review_count, is_demo,
  photo_url, team_order
) on public.specialists to anon, authenticated;

-- Optional, patient-supplied, same purpose. Nullable and never required: most
-- patients only ever have a phone number, and a booking must not be blocked
-- on this. When present, the booking flow can offer it as a Meet attendee
-- too, so patients get the same "join without knocking" behaviour.
alter table public.profiles add column if not exists email text;
comment on column public.profiles.email is
  'Optional contact email, supplied by the patient at booking time, used only to invite them to a remote session''s calendar event. Never used for sign-in.';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_shape') then
    alter table public.profiles
      add constraint profiles_email_shape check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end $$;

-- profiles' own-row UPDATE grant (002_comprehensive_platform.sql:395-396) is
-- column-scoped to (full_name, phone, avatar_url, updated_at) specifically so
-- a user cannot rewrite privileged columns on their own row. `email` is
-- exactly as sensitive as those four — the same revoke-then-scoped-grant
-- pattern applies, adding this one column rather than reopening the whole row.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, email, updated_at) on public.profiles to authenticated;

-- Populate the six specialists' emails, supplied directly by the clinic.
-- Matched by exact display_name; the final check asserts every one of the
-- six rows was actually found and updated, so a future rename silently
-- breaking this seed fails loudly instead of leaving someone uninvited.
do $$
declare
  v_updated int;
begin
  update public.specialists set email = 'Jamal.s.abualnja@gmail.com' where display_name = 'جمال سمير أبو النجا';
  update public.specialists set email = 'Pt.abdusab@gmail.com' where display_name = 'عبد الرحمن صالح البخاري';
  update public.specialists set email = 'Abdullah.Albukhari.8@gmail.com' where display_name = 'عبد الله صالح البخاري';
  update public.specialists set email = 'abdullah.f.alahmadi.pt@gmail.com' where display_name = 'عبد الله فيصل الأحمدي';
  update public.specialists set email = 'H.a.banoon@gmail.com' where display_name = 'حسان عبد الإله بنون';
  update public.specialists set email = 'albaraa.alq@gmail.com' where display_name = 'البراء القرشي';

  select count(*) into v_updated from public.specialists where email is not null;
  if v_updated < 6 then
    raise warning 'specialist email seed: only % of 6 expected rows matched by display_name — check for a rename', v_updated;
  end if;
end $$;
