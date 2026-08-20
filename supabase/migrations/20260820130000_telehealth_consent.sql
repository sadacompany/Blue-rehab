-- Recorded informed consent for telehealth sessions.
--
-- NHIC "Governing Rules of Telehealth" §3.1.17 requires that an informed
-- patient consent be RECORDED — preferably online — BEFORE any telehealth
-- activity takes place, and §3.1.18 gives the patient the right to refuse or
-- cancel at any time WITHOUT justification. The platform had nowhere to put
-- either fact: the booking wizard showed a terms checkbox and threw the answer
-- away. Nothing could prove, after the fact, that a patient consented, what
-- they were shown when they did, or when they withdrew.
--
-- This table is that proof, and it is deliberately an *audit record* rather
-- than ordinary application state:
--
--   * `consent_text` stores the exact wording that was on the patient's screen,
--     not a pointer to a template that will be edited next month. Evidence of
--     consent is worthless if the thing consented to can be rewritten later.
--   * `template_version` lets the clinic group records by wording revision and
--     re-consent everyone when the wording changes materially.
--   * Once a row is granted, nothing about it can be changed by anybody. The
--     single permitted mutation is setting `withdrawn_at`, which is the
--     patient's §3.1.18 right and PDPL's right to withdraw consent.
--
-- Note on `booking_id`: it is nullable, and in the current flow it is normally
-- NULL at the moment of writing. Blue Rehab is pay-first — 20260807110000
-- moved appointment creation to *after* the payment is verified — so at the
-- point the patient consents there is no `bookings` row to reference yet.
-- Consent must still be recorded before the telehealth activity, so it is
-- written first and linked by patient and timestamp. The column exists for the
-- flows that do have a booking in hand (rescheduling, re-consent on a changed
-- template, a specialist re-confirming before a session).

-- ------------------------------------------------------------------ table --
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- `set null`, not `cascade`: cancelling an appointment must not erase the
  -- evidence that consent was given for it.
  booking_id uuid references public.bookings(id) on delete set null,
  -- Plain text with a shape check rather than an enum: a new consent purpose
  -- (privacy policy re-acceptance, research participation, recording a session)
  -- should not need an `alter type` and the migration ordering that comes with
  -- one. The check still stops free-form junk landing in an audit column.
  purpose text not null default 'telehealth_session'
    check (purpose ~ '^[a-z][a-z0-9_]{2,63}$'),
  template_version text not null check (char_length(btrim(template_version)) between 1 and 32),
  -- The exact text shown. Long, because it is the whole consent form.
  consent_text text not null check (char_length(btrim(consent_text)) >= 40),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  -- A withdrawal that predates the grant is a clock or tampering problem, and
  -- either way it must not be storable.
  check (withdrawn_at is null or withdrawn_at >= granted_at)
);

comment on table public.consent_records is
  'Immutable record of a patient consent: the exact text shown, its version, when it was granted and when (if ever) it was withdrawn. NHIC Governing Rules of Telehealth §3.1.17/§3.1.18.';
comment on column public.consent_records.consent_text is
  'Verbatim copy of the wording displayed to the patient. Never a reference to editable content.';
comment on column public.consent_records.booking_id is
  'Usually NULL: consent is recorded before payment, and the booking row is only created after payment is verified.';
comment on column public.consent_records.withdrawn_at is
  'The only column any role may ever change on an existing row, and only from NULL to a value.';

-- The portal asks one question of this table — "has this patient a live consent
-- for a telehealth session?" — so the index answers exactly that.
create index if not exists consent_records_user_purpose_idx
  on public.consent_records(user_id, purpose, granted_at desc);

create index if not exists consent_records_booking_idx
  on public.consent_records(booking_id)
  where booking_id is not null;

-- ------------------------------------------------------ server-side stamps --
-- Everything an audit record must not let the client choose is set here rather
-- than accepted from the request body. The browser sends only what it actually
-- knows: who it is, what it showed, and which version of it.
--
-- `granted_at` in particular: if the client supplied it, a patient (or anyone
-- holding their token) could backdate a consent to cover a session that had
-- already happened, which is precisely the fraud this record exists to rule
-- out. Same for the IP and user agent — self-reported provenance proves
-- nothing, so they are read from the PostgREST request headers instead.
create or replace function public.consent_records_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_headers json;
  v_forwarded text;
begin
  -- Parsed defensively. `request.headers` is absent outside PostgREST (psql, a
  -- migration, a service-role script) and there is no promise it is well-formed
  -- JSON in every future runtime. A cast that throws here would abort the
  -- INSERT, and refusing to record a consent because the provenance metadata
  -- would not parse is exactly the wrong trade.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  new.granted_at := now();
  new.created_at := now();
  -- A row is never born withdrawn; withdrawal is a later, separate act.
  new.withdrawn_at := null;

  -- X-Forwarded-For is a list, client-to-proxy order, and the client end of it
  -- is attacker-controlled — but it is still the best available signal and it
  -- is recorded as such. A malformed value must never fail the insert: losing
  -- the IP is survivable, losing the consent record is not.
  v_forwarded := coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip');
  begin
    new.ip_address := btrim(split_part(v_forwarded, ',', 1))::inet;
  exception when others then
    new.ip_address := null;
  end;

  new.user_agent := nullif(left(btrim(coalesce(v_headers ->> 'user-agent', '')), 500), '');

  return new;
end;
$$;

drop trigger if exists consent_records_stamp on public.consent_records;
create trigger consent_records_stamp
  before insert on public.consent_records
  for each row execute function public.consent_records_stamp();

-- ------------------------------------------------------------ immutability --
-- Immutability is enforced twice, on purpose, because the two mechanisms fail
-- in different directions:
--
--   1. Column-level privileges (below). `authenticated` holds INSERT on only
--      the five columns the browser legitimately supplies and UPDATE on only
--      `withdrawn_at`. An UPDATE naming any other column is refused by
--      PostgreSQL before RLS is even consulted. This is the tight boundary —
--      but it is a GRANT, and a future migration that says
--      `grant all on public.consent_records to authenticated` would silently
--      dissolve it.
--   2. This trigger. It compares every field of NEW against OLD and refuses
--      the statement if anything other than `withdrawn_at` moved. It runs for
--      EVERY role — including `service_role`, which bypasses RLS entirely —
--      so no key, no policy mistake and no future over-broad grant can turn
--      this into an editable table. That is the whole point: an audit record
--      an operator can quietly correct proves nothing about what the patient
--      actually agreed to. Correcting a mistake means withdrawing the row and
--      recording a new consent, which is what an audit trail is supposed to
--      look like.
--
-- Withdrawal is also one-way and server-timed: a withdrawn consent cannot be
-- un-withdrawn (that would be a *new* consent, and must be recorded as one),
-- and `withdrawn_at` is overwritten with the server clock so the moment of
-- withdrawal cannot be shifted.
--
-- DELETE is deliberately NOT blocked by a trigger. `authenticated` has no
-- DELETE privilege and no DELETE policy, so no patient and no staff member can
-- remove a row. But the FK from `profiles` cascades, and it must: PDPL Art. 4
-- gives the data subject the right to request destruction of their personal
-- data, and a trigger that refused every delete would wedge account erasure
-- against the very law this table helps comply with.
create or replace function public.consent_records_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.booking_id is distinct from old.booking_id
     or new.purpose is distinct from old.purpose
     or new.template_version is distinct from old.template_version
     or new.consent_text is distinct from old.consent_text
     or new.granted_at is distinct from old.granted_at
     or new.ip_address is distinct from old.ip_address
     or new.user_agent is distinct from old.user_agent
     or new.created_at is distinct from old.created_at
  then
    raise exception 'CONSENT_RECORD_IMMUTABLE' using errcode = '42501';
  end if;

  if old.withdrawn_at is not null then
    raise exception 'CONSENT_ALREADY_WITHDRAWN' using errcode = '42501';
  end if;

  if new.withdrawn_at is null then
    raise exception 'CONSENT_WITHDRAWAL_ONLY' using errcode = '42501';
  end if;

  new.withdrawn_at := now();
  return new;
end;
$$;

drop trigger if exists consent_records_immutable on public.consent_records;
create trigger consent_records_immutable
  before update on public.consent_records
  for each row execute function public.consent_records_immutable();

-- -------------------------------------------------------------------- RLS --
alter table public.consent_records enable row level security;

-- Supabase's default privileges hand `anon` and `authenticated` ALL on every
-- new table in `public`, so the grant list has to start from nothing — the same
-- reason 002 revokes UPDATE on `profiles` before re-granting named columns.
revoke all on table public.consent_records from public, anon, authenticated;

grant select on table public.consent_records to authenticated;
grant insert (user_id, booking_id, purpose, template_version, consent_text)
  on table public.consent_records to authenticated;
grant update (withdrawn_at) on table public.consent_records to authenticated;
-- No DELETE, to anyone. Not granted, not policied.

drop policy if exists "consent_records_own_read" on public.consent_records;
create policy "consent_records_own_read" on public.consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Administrators can read consent records but not clinical content — the same
-- line 20260805100000 draws. A consent record holds no assessment, no
-- diagnosis and no session note; it holds the wording the patient was shown and
-- the timestamp. The controller has to be able to produce exactly that on
-- demand for SDAIA or a MOH inspector, so withholding it from administration
-- would make the record unusable for the purpose it exists for.
drop policy if exists "consent_records_admin_read" on public.consent_records;
create policy "consent_records_admin_read" on public.consent_records
  for select to authenticated
  using (public.is_admin());

-- A patient may only record consent for themselves, only as un-withdrawn, and
-- only against a booking that is actually theirs. The `bookings` sub-select
-- runs under that table's own RLS, so `bookings_patient_read` already limits it
-- to the caller's appointments — a fabricated booking id simply finds nothing.
drop policy if exists "consent_records_own_insert" on public.consent_records;
create policy "consent_records_own_insert" on public.consent_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and withdrawn_at is null
    and (
      booking_id is null
      or exists (
        select 1 from public.bookings b
         where b.id = consent_records.booking_id
           and b.patient_id = (select auth.uid())
      )
    )
  );

-- The withdrawal right, expressed as the narrowest possible policy: the row
-- must be yours, it must not already be withdrawn (USING), and the row that
-- comes out the other side must be withdrawn (WITH CHECK). Combined with the
-- column grant, an UPDATE that touches anything else cannot even be parsed
-- into a permitted statement; combined with the trigger, one that somehow is
-- still raises.
drop policy if exists "consent_records_own_withdraw" on public.consent_records;
create policy "consent_records_own_withdraw" on public.consent_records
  for update to authenticated
  using (user_id = (select auth.uid()) and withdrawn_at is null)
  with check (user_id = (select auth.uid()) and withdrawn_at is not null);
