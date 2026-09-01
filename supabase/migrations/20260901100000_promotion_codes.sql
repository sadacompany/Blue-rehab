-- Discount codes and marketer codes, with a promotion URL behind each one.
--
-- Two things the platform could not do: run a campaign («خصم ٢٠٪ هذا الأسبوع»)
-- and tell a marketer what their link actually brought in. Both need the same
-- object — a named code with a window, a ceiling and a ledger — so it is one
-- table distinguished by `kind`, rather than two that would drift apart.
--
-- The security position is the one 20260807110000_pay_before_booking.sql set
-- for pricing, and it does not soften here: the browser never sends a discount,
-- a percentage or an amount. It sends a code — a string — and the database
-- decides what that string is worth against a price it read itself. Every
-- function below that touches money is `security definer` and re-derives the
-- gross from `services`/`courses`. A tampered client can ask for a code that
-- does not exist; it cannot invent what one is worth.
--
-- What is deliberately NOT here: commission. A marketer code records the gross,
-- the discount and the net of every sale it makes, which is everything a
-- commission would later be computed from — but no rate is stored and no
-- payable is calculated, because the rate has not been decided. Adding it is
-- then a column and a multiplication over data this file already keeps.
-- Showing a commission column full of zeroes today would be the kind of claim
-- 5907500 ("a section with nothing behind it does not render at all") took the
-- trouble to stop making elsewhere.

-- --------------------------------------------------------------- the codes --

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),

  -- Stored upper-case and matched upper-case, so «sara20» typed at checkout is
  -- the same code as «SARA20» printed on a poster. The pattern keeps a code to
  -- what survives being read aloud, written in a story, and typed on a phone
  -- keyboard: no spaces, no punctuation beyond - and _.
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),

  kind text not null check (kind in ('discount', 'marketer')),

  -- Zero is legitimate, which is why this is not `check (> 0)`: a marketer code
  -- may be pure attribution — the customer pays full price and the code exists
  -- only to say who sent them.
  discount_percent numeric(5, 2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),

  -- Who the code belongs to. Required on a marketer code, meaningless on a
  -- discount code; stated as a constraint rather than left to the interface.
  marketer_name text check (marketer_name is null or btrim(marketer_name) <> ''),

  -- null = no ceiling. A ceiling counts settled redemptions, never attempts: an
  -- abandoned checkout must not burn a place on the campaign.
  usage_limit integer check (usage_limit is null or usage_limit > 0),

  -- Both optional and independent: a code can open on a date with no closing
  -- date, or close on one having been open since it was made.
  starts_at timestamptz,
  ends_at timestamptz,

  -- Suspension is separate from the window on purpose — pausing a campaign and
  -- reopening it must not require rewriting the dates it was scheduled for.
  is_paused boolean not null default false,

  -- Never shown to a customer. This is the "why does this code exist" that
  -- makes a list of thirty codes readable a month later.
  internal_note text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint promo_codes_marketer_named
    check (kind <> 'marketer' or marketer_name is not null),
  constraint promo_codes_window_ordered
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

comment on table public.promo_codes is
  'Discount and marketer codes. Worth is decided server-side; the client only ever names a code.';

-- -------------------------------------------------------------- the ledger --
--
-- One row per code actually used, written by convert_paid_intent() once the
-- money has cleared — not when the code was typed. `unique (payment_id)` is the
-- idempotence guarantee: convert_paid_intent() is already safe to call twice on
-- one order (it returns 'already'), and this makes double-counting impossible
-- even if that ever changed.

create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
  payment_id uuid unique references public.payments(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_number text,
  kind text not null check (kind in ('booking', 'enrollment')),

  -- The three figures a campaign report is built from, frozen at the moment of
  -- sale. Recomputing them later from `promo_codes.discount_percent` would
  -- misreport every past sale the day somebody edits the percentage.
  gross_amount numeric(10, 2) not null check (gross_amount >= 0),
  discount_amount numeric(10, 2) not null check (discount_amount >= 0),
  net_amount numeric(10, 2) not null check (net_amount >= 0),

  redeemed_at timestamptz not null default now(),

  constraint promo_redemption_arithmetic
    check (round(gross_amount - discount_amount, 2) = net_amount)
);

create index if not exists promo_code_redemptions_code_idx
  on public.promo_code_redemptions(promo_code_id, redeemed_at desc);

-- One redemption per person per code. Without this a single customer can drain
-- a hundred-use campaign alone, which is the failure mode every public discount
-- link has. It is a unique index rather than a check in the function so that
-- the rule holds even against a race between two of that customer's own tabs.
create unique index if not exists promo_code_redemptions_once_per_user
  on public.promo_code_redemptions(promo_code_id, user_id);

-- ---------------------------------------------------------------- the link --
--
-- A promotion URL is any page with ?ref=CODE on it. This counts the arrivals so
-- a code's entry can read «412 زيارة · 9 مبيعات» rather than only the sales —
-- the gap between those two numbers is the only evidence of whether a campaign
-- is failing to reach people or failing to convince them.
--
-- `visitor_key` is a random per-browser value, not an address and not a
-- fingerprint: it exists so that one person refreshing twenty times is one
-- visit. Nothing here identifies anybody, which is why it needs no entry in the
-- personal-data inventory on PrivacyPage.

create table if not exists public.promo_code_visits (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  visitor_key text not null check (length(visitor_key) between 8 and 64),
  first_seen_at timestamptz not null default now(),
  unique (promo_code_id, visitor_key)
);

-- --------------------------------------------------------------- lifecycle --
--
-- The five states an administrator filters by, derived rather than stored. A
-- stored status is one that goes stale the minute a window closes with nobody
-- looking, and would need a scheduled job to stay honest.
--
-- The order is the whole of the logic. Suspension outranks everything because
-- it is a deliberate act; expiry outranks scheduling so that a code whose whole
-- window is in the past reads «منتهي» and not «مجدول»; exhaustion comes last
-- because it only matters while the code is otherwise usable.
create or replace function public.promo_code_state(
  p_is_paused boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_usage_limit integer,
  p_uses integer
)
returns text
language sql
stable
as $$
  select case
    when p_is_paused then 'paused'
    when p_ends_at is not null and p_ends_at <= now() then 'expired'
    when p_starts_at is not null and p_starts_at > now() then 'scheduled'
    when p_usage_limit is not null and p_uses >= p_usage_limit then 'exhausted'
    else 'active'
  end;
$$;

-- Normalise on the way in, so that every reader — the unique index, the
-- lookup in promo_apply(), the administrator's list — is comparing the same
-- spelling. Trusting callers to upper-case a code is how «Sara20» becomes a
-- second, invisible code that nobody can redeem.
create or replace function public.touch_promo_code()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.code := upper(btrim(new.code));
  new.marketer_name := nullif(btrim(coalesce(new.marketer_name, '')), '');
  new.internal_note := nullif(btrim(coalesce(new.internal_note, '')), '');
  return new;
end;
$$;

drop trigger if exists promo_codes_touch on public.promo_codes;
create trigger promo_codes_touch
  before insert or update on public.promo_codes
  for each row execute function public.touch_promo_code();

-- --------------------------------------------------------------------- RLS --
--
-- None of this is readable by a customer. A code's percentage, its ceiling and
-- its remaining uses are campaign information; a visitor learns what a code is
-- worth by applying it to their own order, through promo_apply() in the next
-- migration, and in no other way.
--
-- There is no insert or update policy at all, for anybody. Writes go
-- exclusively through the security-definer functions below, so that an
-- administrator holding a PostgREST client still cannot create a code without
-- the audit entry that goes with it.

alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;
alter table public.promo_code_visits enable row level security;

drop policy if exists promo_codes_admin_read on public.promo_codes;
create policy promo_codes_admin_read on public.promo_codes
  for select to authenticated using (public.is_admin());

drop policy if exists promo_redemptions_admin_read on public.promo_code_redemptions;
create policy promo_redemptions_admin_read on public.promo_code_redemptions
  for select to authenticated using (public.is_admin());

-- A customer may see that their own order carried a discount — it is their
-- receipt — without seeing anybody else's.
drop policy if exists promo_redemptions_own_read on public.promo_code_redemptions;
create policy promo_redemptions_own_read on public.promo_code_redemptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists promo_visits_admin_read on public.promo_code_visits;
create policy promo_visits_admin_read on public.promo_code_visits
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------- administrative writes --

-- Create a code. Everything the interface can set, and nothing it cannot: the
-- percentage is bounded by the column, the marketer name is required by a
-- constraint, and the code itself is normalised by the trigger. What this adds
-- on top of a plain insert is the refusal, the friendly duplicate error, and
-- the audit entry — the same three reasons admin_update_course() exists rather
-- than an `.update()`.
create or replace function public.admin_create_promo_code(
  p_code text,
  p_kind text,
  p_discount_percent numeric default 0,
  p_marketer_name text default null,
  p_usage_limit integer default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_internal_note text default null
)
returns public.promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_row public.promo_codes%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception 'CODE_INVALID';
  end if;
  if p_kind not in ('discount', 'marketer') then
    raise exception 'KIND_INVALID';
  end if;
  if p_kind = 'marketer' and nullif(btrim(coalesce(p_marketer_name, '')), '') is null then
    raise exception 'MARKETER_NAME_REQUIRED';
  end if;
  if coalesce(p_discount_percent, 0) < 0 or coalesce(p_discount_percent, 0) > 100 then
    raise exception 'DISCOUNT_INVALID';
  end if;
  -- A discount code that discounts nothing is a code that does nothing. A
  -- marketer code is allowed to, because attribution is its other purpose.
  if p_kind = 'discount' and coalesce(p_discount_percent, 0) <= 0 then
    raise exception 'DISCOUNT_REQUIRED';
  end if;
  if p_usage_limit is not null and p_usage_limit <= 0 then
    raise exception 'USAGE_LIMIT_INVALID';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'WINDOW_INVALID';
  end if;
  -- Creating something already over is a typo every time, not an intention.
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'ENDS_IN_PAST';
  end if;

  if exists (select 1 from public.promo_codes where code = v_code) then
    raise exception 'CODE_TAKEN';
  end if;

  insert into public.promo_codes (
    code, kind, discount_percent, marketer_name, usage_limit,
    starts_at, ends_at, internal_note, created_by
  ) values (
    v_code, p_kind, coalesce(p_discount_percent, 0), p_marketer_name, p_usage_limit,
    p_starts_at, p_ends_at, p_internal_note, v_admin
  )
  returning * into v_row;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'promo_code_created', 'promo_code', v_row.id, null,
          to_jsonb(v_row) - 'created_by');

  return v_row;
end;
$$;

-- Edit a code.
--
-- The percentage, the window and the ceiling are all editable; the code itself
-- is not. A code that has been printed, sent and shared cannot be renamed —
-- and every redemption already recorded against it names it by id, so a rename
-- would silently re-attribute history. Retire it and make another.
--
-- Every argument defaults to null and null means "leave alone", so the
-- interface can send one changed field. The exceptions are the two that are
-- legitimately null-valued — `p_usage_limit` and the dates — where "unlimited"
-- and "no date" have to be expressible; `p_clear` names which of those to blank.
create or replace function public.admin_update_promo_code(
  p_id uuid,
  p_discount_percent numeric default null,
  p_marketer_name text default null,
  p_usage_limit integer default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_internal_note text default null,
  p_is_paused boolean default null,
  p_clear text[] default '{}'
)
returns public.promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_before public.promo_codes%rowtype;
  v_after public.promo_codes%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
  v_limit integer;
  v_percent numeric;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_before from public.promo_codes where id = p_id for update;
  if not found then raise exception 'CODE_NOT_FOUND'; end if;

  v_percent := coalesce(p_discount_percent, v_before.discount_percent);
  v_limit   := case when 'usage_limit' = any (p_clear) then null
                    else coalesce(p_usage_limit, v_before.usage_limit) end;
  v_starts  := case when 'starts_at' = any (p_clear) then null
                    else coalesce(p_starts_at, v_before.starts_at) end;
  v_ends    := case when 'ends_at' = any (p_clear) then null
                    else coalesce(p_ends_at, v_before.ends_at) end;

  if v_percent < 0 or v_percent > 100 then raise exception 'DISCOUNT_INVALID'; end if;
  if v_before.kind = 'discount' and v_percent <= 0 then raise exception 'DISCOUNT_REQUIRED'; end if;
  if v_limit is not null and v_limit <= 0 then raise exception 'USAGE_LIMIT_INVALID'; end if;
  if v_ends is not null and v_starts is not null and v_ends <= v_starts then
    raise exception 'WINDOW_INVALID';
  end if;

  -- Lowering a ceiling below what has already been sold would make the code
  -- read «مكتمل الاستخدام» over redemptions it never authorised. Refuse, and
  -- say what the floor is.
  if v_limit is not null and v_limit < (
    select count(*) from public.promo_code_redemptions r where r.promo_code_id = p_id
  ) then
    raise exception 'USAGE_LIMIT_BELOW_USED';
  end if;

  update public.promo_codes
     set discount_percent = v_percent,
         marketer_name    = coalesce(nullif(btrim(coalesce(p_marketer_name, '')), ''), marketer_name),
         usage_limit      = v_limit,
         starts_at        = v_starts,
         ends_at          = v_ends,
         internal_note    = case when 'internal_note' = any (p_clear) then null
                                 else coalesce(p_internal_note, internal_note) end,
         is_paused        = coalesce(p_is_paused, is_paused)
   where id = p_id
  returning * into v_after;

  if v_before.kind = 'marketer' and v_after.marketer_name is null then
    raise exception 'MARKETER_NAME_REQUIRED';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'promo_code_updated', 'promo_code', p_id,
          to_jsonb(v_before) - 'created_by', to_jsonb(v_after) - 'created_by');

  return v_after;
end;
$$;

-- Retiring a code is pausing it. There is no delete on purpose: a code with
-- redemptions behind it is the only record of why those orders were discounted,
-- and `on delete restrict` on the ledger would refuse anyway. An unused code
-- can be paused and forgotten at no cost.

-- --------------------------------------------------------- the admin list --
--
-- Codes with their sales attached, in one round trip. The counts are computed
-- here rather than in the browser because the browser cannot read
-- `promo_code_redemptions` for other users, and because `status` has to be
-- derived from the same `now()` that the filter tabs are counting against.
create or replace function public.admin_promo_codes()
returns table (
  id uuid,
  code text,
  kind text,
  discount_percent numeric,
  marketer_name text,
  usage_limit integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_paused boolean,
  internal_note text,
  created_at timestamptz,
  uses integer,
  visits integer,
  gross_total numeric,
  discount_total numeric,
  net_total numeric,
  last_used_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with sales as (
    select r.promo_code_id,
           count(*)::integer                       as uses,
           coalesce(sum(r.gross_amount), 0)        as gross_total,
           coalesce(sum(r.discount_amount), 0)     as discount_total,
           coalesce(sum(r.net_amount), 0)          as net_total,
           max(r.redeemed_at)                      as last_used_at
      from public.promo_code_redemptions r
     group by r.promo_code_id
  ), clicks as (
    select v.promo_code_id, count(*)::integer as visits
      from public.promo_code_visits v
     group by v.promo_code_id
  )
  select c.id, c.code, c.kind, c.discount_percent, c.marketer_name, c.usage_limit,
         c.starts_at, c.ends_at, c.is_paused, c.internal_note, c.created_at,
         coalesce(s.uses, 0), coalesce(k.visits, 0),
         coalesce(s.gross_total, 0), coalesce(s.discount_total, 0), coalesce(s.net_total, 0),
         s.last_used_at,
         public.promo_code_state(c.is_paused, c.starts_at, c.ends_at, c.usage_limit, coalesce(s.uses, 0))
    from public.promo_codes c
    left join sales  s on s.promo_code_id = c.id
    left join clicks k on k.promo_code_id = c.id
   order by c.created_at desc;
end;
$$;

-- Who used one code, for the drawer behind a row. Capped, because a successful
-- campaign has thousands and the panel shows the most recent.
create or replace function public.admin_promo_code_redemptions(p_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  order_number text,
  kind text,
  user_name text,
  gross_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select r.id, r.order_number, r.kind, p.full_name,
         r.gross_amount, r.discount_amount, r.net_amount, r.redeemed_at
    from public.promo_code_redemptions r
    join public.profiles p on p.id = r.user_id
   where r.promo_code_id = p_id
   order by r.redeemed_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ------------------------------------------------------------ the counter --
--
-- Called by any page opened with ?ref=CODE, signed in or not. It answers
-- nothing: not whether the code exists, not whether it is live, not what it is
-- worth. A visitor counter that reported "no such code" would be a code oracle
-- open to the whole internet, and the landing page has no use for the answer
-- anyway — applying the code at checkout is where a real answer is given.
--
-- `on conflict do nothing` is what makes a refresh idempotent.
create or replace function public.record_promo_visit(p_code text, p_visitor_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_code is null or p_visitor_key is null then return; end if;
  if length(p_visitor_key) not between 8 and 64 then return; end if;

  select id into v_id from public.promo_codes where code = upper(btrim(p_code));
  if v_id is null then return; end if;

  insert into public.promo_code_visits (promo_code_id, visitor_key)
  values (v_id, p_visitor_key)
  on conflict (promo_code_id, visitor_key) do nothing;
end;
$$;

-- ------------------------------------------------------------------ grants --

revoke all on function public.admin_create_promo_code(text, text, numeric, text, integer, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.admin_update_promo_code(uuid, numeric, text, integer, timestamptz, timestamptz, text, boolean, text[]) from public, anon;
revoke all on function public.admin_promo_codes() from public, anon;
revoke all on function public.admin_promo_code_redemptions(uuid, integer) from public, anon;
revoke all on function public.record_promo_visit(text, text) from public;

grant execute on function public.admin_create_promo_code(text, text, numeric, text, integer, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.admin_update_promo_code(uuid, numeric, text, integer, timestamptz, timestamptz, text, boolean, text[]) to authenticated;
grant execute on function public.admin_promo_codes() to authenticated;
grant execute on function public.admin_promo_code_redemptions(uuid, integer) to authenticated;

-- The visit counter is the one function here an anonymous visitor may call —
-- a promotion link is shared publicly and most arrivals are not signed in.
grant execute on function public.record_promo_visit(text, text) to anon, authenticated;
