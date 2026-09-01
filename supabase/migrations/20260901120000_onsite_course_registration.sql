-- Registering for a course you attend in person.
--
-- Enrolling in a recorded course is a button: press it, pay, the seat is
-- yours. An in-person course is not that, and the client has been running the
-- difference on a Google Form — five pages of it — precisely because the
-- platform had nowhere to put the questions. This is that form, brought inside.
--
-- What the form asks, and therefore what this stores: who is attending and how
-- to reach them; where they work and what they do; how they rate their own
-- knowledge of the subject and whether they have attended anything like it;
-- what they want out of the day and which parts of it interest them; and one
-- open question about what they hope will be answered. None of it is decoration
-- — an instructor with twenty seats and these answers can pitch the day at the
-- room that is actually coming.
--
-- Two things the form does that this deliberately does NOT copy:
--
--   1. **Bank transfer and a photographed receipt.** The form asks the attendee
--      to transfer to an IBAN and upload the slip, and an administrator then
--      matches slips to names by hand. The platform has a payment gateway and
--      a settlement path that has been load-bearing since 20260807110000, so
--      registration ends at Moyasar like everything else. The seat is created
--      by convert_paid_intent() on a verified payment, which is the same
--      guarantee the receipt was a manual approximation of.
--
--   2. **Self-declared membership.** The form takes «نعم» for the 30% member
--      discount and promises «سيتم التحقق من العضوية قبل تأكيد التسجيل». The
--      promise is kept here rather than implied: the discount applies at once
--      so the attendee is not made to wait to pay, the membership number is
--      recorded, and the registration carries an unverified flag that an
--      administrator clears. What is checked is visible, and what is not
--      checked yet says so.
--
-- The question set is fixed, not author-configurable. A form builder is a
-- different and much larger feature, and every question above is general to a
-- clinical course rather than specific to the shoulder one that prompted this.

-- ------------------------------------------------------------- the course --

alter table public.courses
  -- «📍 المكان: مركز الطبابة بجدة». Free text because a venue is an address and
  -- a room, not an entity the platform has any other use for.
  add column if not exists venue text,
  -- «خصم حصري لحاملي عضوية تأهيل بلو 30%». null means this course has no member
  -- rate, which is the correct default for every course that is not this one.
  add column if not exists membership_discount_percent numeric(5, 2)
    check (membership_discount_percent is null
           or (membership_discount_percent > 0 and membership_discount_percent <= 100));

-- ----------------------------------------------------------- price tiers --
--
-- «300 ريال للمختصّين / 250 لطلبة الامتياز». The form never asks which one you
-- are — it prints both figures and trusts you to transfer the right amount,
-- which is a reconciliation problem disguised as a pricing model. Here the tier
-- is a question with an answer, and the answer selects a row in this table.
--
-- The price charged is `course_price_tiers.price`, read by the intent function
-- from the tier the attendee named. The attendee names a *key*; they never send
-- a number. That is the same rule as `services.price`, and it is why this is a
-- table rather than a couple of numbers on `courses`.
--
-- A course with no tiers falls back to `courses.price`, so nothing about the
-- existing online courses changes.

create table if not exists public.course_price_tiers (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  label text not null check (btrim(label) <> ''),
  price numeric(10, 2) not null check (price >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (course_id, key)
);

create index if not exists course_price_tiers_course_idx
  on public.course_price_tiers(course_id, position);

alter table public.course_price_tiers enable row level security;

-- A price is public where the course is. Nothing about a tier is sensitive —
-- it is printed on the poster — and the registration form has to render them.
drop policy if exists course_price_tiers_public_read on public.course_price_tiers;
create policy course_price_tiers_public_read on public.course_price_tiers
  for select to anon, authenticated
  using (exists (select 1 from public.courses c
                  where c.id = course_id and c.is_published));

drop policy if exists course_price_tiers_admin_all on public.course_price_tiers;
create policy course_price_tiers_admin_all on public.course_price_tiers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --------------------------------------------------------- registrations --

create table if not exists public.course_registrations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Page 2 — المعلومات الشخصية.
  --
  -- Name, phone and email are captured onto the registration rather than read
  -- off the profile, and that is deliberate: the platform authenticates by
  -- phone and knows almost nobody's email (see the note on setContactEmail in
  -- platform.ts), an attendee's employer is not their account, and the name on
  -- a certificate has to be the name they gave for this course. The profile is
  -- also updated where it is empty — see the intent function — so the answer is
  -- not merely filed away.
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  phone text not null check (phone ~ '^[0-9+][0-9 +()-]{6,19}$'),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  organization text,
  job_title text,
  years_experience text,

  -- «كيف تقيم مستوى معرفتك الحالي بموضوع الدورة؟» — 1 مبتدئ .. 5 متقدم.
  knowledge_level smallint not null check (knowledge_level between 1 and 5),
  -- «هل سبق لك حضور دورة مشابهة؟»
  attended_similar boolean not null,
  -- «ما الهدف الرئيسي من حضورك للدورة؟» — multiple choice, at least one.
  goals text[] not null default '{}' check (cardinality(goals) > 0),
  -- The «أخرى» box that goes with it, kept apart from the fixed options so a
  -- report can count the options without a free-text answer polluting them.
  goal_other text,
  -- «أي المحاور التالية يهمك أكثر؟»
  topics text[] not null default '{}' check (cardinality(topics) > 0),
  -- «ما أكثر سؤال أو موضوع تتمنى أن تجد إجابته خلال الدورة؟»
  question text,

  -- Page 3 — العضوية, and pages 4/5, which the form splits only because a
  -- Google Form cannot compute a price. Here they are one branch of one field.
  tier_key text not null,
  is_member boolean not null default false,
  membership_number text,
  -- null while unverified. An administrator clearing this is the «سيتم التحقق
  -- من العضوية قبل تأكيد التسجيل» the form promises, made into a record.
  membership_verified_at timestamptz,
  membership_verified_by uuid references public.profiles(id) on delete set null,

  -- What was charged, frozen. `gross` is the tier price; `discount` is whatever
  -- the membership rate or a promotion code took off. Kept here as well as on
  -- `payments` because this row is what an administrator reads when an attendee
  -- asks why they paid what they paid.
  gross_amount numeric(10, 2) not null check (gross_amount >= 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(10, 2) not null check (net_amount >= 0),

  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'cancelled')),

  payment_id uuid references public.payments(id) on delete set null,
  enrollment_id uuid references public.enrollments(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint course_registration_member_numbered
    check (not is_member or membership_number is not null),
  constraint course_registration_arithmetic
    check (round(gross_amount - discount_amount, 2) = net_amount)
);

create index if not exists course_registrations_course_idx
  on public.course_registrations(course_id, created_at desc);
create index if not exists course_registrations_user_idx
  on public.course_registrations(user_id, created_at desc);

-- One live registration per person per course. A second attempt reuses the
-- first (see the intent function) rather than filling the register with
-- abandoned duplicates; a cancelled one does not block trying again.
create unique index if not exists course_registrations_one_live
  on public.course_registrations(course_id, user_id)
  where status <> 'cancelled';

alter table public.course_registrations enable row level security;

drop policy if exists course_registrations_own_read on public.course_registrations;
create policy course_registrations_own_read on public.course_registrations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists course_registrations_admin_read on public.course_registrations;
create policy course_registrations_admin_read on public.course_registrations
  for select to authenticated using (public.is_admin());

-- The trainer teaching the course sees who is coming. They do not see the
-- money: `gross/discount/net` are the administration's business, and a column
-- policy cannot be expressed here, so the trainer reads the register through
-- `course_registration_roster()` below rather than through this table.

-- No insert or update policy for anyone. Registrations are created by
-- create_onsite_registration_intent() and only ever change status through
-- settlement or an administrator, both of which run as security definer.

create or replace function public.touch_course_registration()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists course_registrations_touch on public.course_registrations;
create trigger course_registrations_touch
  before update on public.course_registrations
  for each row execute function public.touch_course_registration();

-- ------------------------------------------------------------- the price --
--
-- What a given attendee would pay, resolved entirely server-side from a tier
-- key and, optionally, a membership claim or a promotion code.
--
-- Split out from the intent function because the registration form has to show
-- the figure *before* anyone commits to it — «رسوم الدورة بعد الخصم: 210» is on
-- page 5 of the original form — and the only safe way to show a price is to ask
-- the same code that will charge it. A second implementation in TypeScript
-- would be a second pricing authority, which is the thing 20260807110000 was
-- written to abolish.
--
-- Membership and a promotion code do not stack. Refused rather than silently
-- resolved: an attendee told «تم تطبيق خصمين» and charged for one, or charged
-- 51% off when both were 30% and they expected 60%, has been misled either way.
create or replace function public.onsite_registration_quote(
  p_course_id uuid,
  p_tier_key text,
  p_is_member boolean default false,
  p_promo_code text default null
)
returns table (
  gross_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  discount_label text,
  promo_code_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_gross numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_net numeric(10, 2);
  v_label text := null;
  v_promo_id uuid := null;
  v_has_code boolean := nullif(btrim(coalesce(p_promo_code, '')), '') is not null;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select * into v_course from public.courses c where c.id = p_course_id and c.is_published;
  if not found then raise exception 'COURSE_UNAVAILABLE'; end if;

  -- The tier price, or the course price where the course defines no tiers.
  if p_tier_key is null then
    v_gross := v_course.price;
    if exists (select 1 from public.course_price_tiers t where t.course_id = p_course_id) then
      raise exception 'TIER_REQUIRED';
    end if;
  else
    select t.price into v_gross from public.course_price_tiers t
     where t.course_id = p_course_id and t.key = p_tier_key;
    if not found then raise exception 'TIER_UNKNOWN'; end if;
  end if;

  if coalesce(p_is_member, false) and v_has_code then
    raise exception 'DISCOUNTS_DO_NOT_STACK';
  end if;

  if coalesce(p_is_member, false) then
    if v_course.membership_discount_percent is null then
      raise exception 'MEMBERSHIP_NOT_OFFERED';
    end if;
    v_discount := round(v_gross * v_course.membership_discount_percent / 100, 2);
    v_label := 'عضوية';
  elsif v_has_code then
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'enrollment', v_gross, v_user) pa;
    v_label := 'كود خصم';
  end if;

  v_net := round(v_gross - v_discount, 2);
  return query select v_gross, v_discount, v_net, v_label, v_promo_id;
end;
$$;

-- ---------------------------------------------------------------- intent --
--
-- The whole registration, in one call, ending in an order number to pay.
--
-- It follows create_enrollment_intent() rather than inventing a second path:
-- the row it writes into `payments` is an ordinary enrolment intent
-- (`intent_kind = 'enrollment'`, `intent_course_id` set), so checkout,
-- verification, settlement, refund and the reservation sweep all treat it as
-- what it is. The registration row is bound to that payment and confirmed by
-- the same settlement, through the after_intent_settled() seam.
create or replace function public.create_onsite_registration_intent(
  p_course_id uuid,
  p_tier_key text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_knowledge_level smallint,
  p_attended_similar boolean,
  p_goals text[],
  p_topics text[],
  p_organization text default null,
  p_job_title text default null,
  p_years_experience text default null,
  p_goal_other text default null,
  p_question text default null,
  p_is_member boolean default false,
  p_membership_number text default null,
  p_promo_code text default null
)
returns table (
  registration_id uuid,
  order_number text,
  gross_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  currency text,
  course_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_quote record;
  v_taken integer;
  v_reg public.course_registrations%rowtype;
  v_order text;
  v_payment_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select * into v_course from public.courses c where c.id = p_course_id and c.is_published;
  if not found then raise exception 'COURSE_UNAVAILABLE'; end if;

  -- This path exists for courses that happen in a room. Sending a recorded
  -- course through it would collect a venue's worth of answers for nothing.
  if v_course.mode not in ('onsite', 'hybrid') then raise exception 'COURSE_NOT_ONSITE'; end if;

  if exists (select 1 from public.enrollments e
              where e.student_id = v_user and e.course_id = p_course_id and e.status <> 'cancelled') then
    raise exception 'ALREADY_ENROLLED';
  end if;

  -- «عدد المقاعد: 20 مقعدًا فقط» — and «تُمنح المقاعد حسب أولوية إكمال إجراءات
  -- التسجيل». Seats already taken, plus registrations still inside their
  -- payment window: without the second term twenty people can be at the
  -- gateway at once for the last seat. Older unpaid registrations do not count,
  -- which is what makes an abandoned form give the seat back with no sweep.
  if v_course.capacity is not null then
    select count(*) into v_taken from (
      select e.id from public.enrollments e
       where e.course_id = p_course_id and e.status <> 'cancelled'
      union all
      select r.id from public.course_registrations r
       where r.course_id = p_course_id and r.status = 'pending_payment'
         and r.created_at > now() - public.reservation_window()
         and r.user_id <> v_user
    ) seats;
    if v_taken >= v_course.capacity then raise exception 'COURSE_FULL'; end if;
  end if;

  if p_knowledge_level is null or p_knowledge_level not between 1 and 5 then
    raise exception 'KNOWLEDGE_LEVEL_REQUIRED';
  end if;
  if p_attended_similar is null then raise exception 'ATTENDED_SIMILAR_REQUIRED'; end if;
  if coalesce(cardinality(p_goals), 0) = 0 then raise exception 'GOALS_REQUIRED'; end if;
  if coalesce(cardinality(p_topics), 0) = 0 then raise exception 'TOPICS_REQUIRED'; end if;
  if coalesce(p_is_member, false)
     and nullif(btrim(coalesce(p_membership_number, '')), '') is null then
    raise exception 'MEMBERSHIP_NUMBER_REQUIRED';
  end if;

  -- The price. Every figure below comes from here and none from the caller.
  select * into v_quote from public.onsite_registration_quote(
    p_course_id, p_tier_key, coalesce(p_is_member, false), p_promo_code);

  -- A free seat still needs the answers, so this path is not the one
  -- create_enrollment_intent() takes for a price of zero — but it is equally
  -- true that there is nothing to send to a gateway. Refuse rather than create
  -- a zero-riyal order the gateway will reject; a free in-person course should
  -- be enrolled in through the ordinary path.
  if v_quote.net_amount <= 0 then raise exception 'NOTHING_TO_PAY'; end if;

  -- Reuse the live registration if there is one — somebody who filled the form,
  -- left the gateway and came back should find their answers, not a blank page
  -- and a unique-index violation. Superseded answers are overwritten, because
  -- the second pass is the one they meant.
  select * into v_reg from public.course_registrations r
   where r.course_id = p_course_id and r.user_id = v_user and r.status <> 'cancelled'
   for update;

  if found then
    if v_reg.status = 'confirmed' then raise exception 'ALREADY_REGISTERED'; end if;
    -- The order number is reusable only while it is priced the same; otherwise
    -- a re-run that changed tier or dropped the code would pay the old figure.
    select p.order_number, p.id into v_order, v_payment_id from public.payments p
     where p.id = v_reg.payment_id and p.status in ('pending', 'processing')
       and p.amount = v_quote.net_amount;
  end if;

  if v_order is null then
    v_order := 'BR-R-' || to_char(now(), 'YYYYMMDD') || '-'
               || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.payments (
      order_number, user_id, amount, discount, promo_code_id,
      status, currency, provider, intent_kind, intent_course_id
    ) values (
      v_order, v_user, v_quote.net_amount, v_quote.discount_amount, v_quote.promo_code_id,
      'pending', 'SAR', 'moyasar', 'enrollment', p_course_id
    )
    returning id into v_payment_id;
  end if;

  insert into public.course_registrations (
    course_id, user_id, full_name, phone, email, organization, job_title, years_experience,
    knowledge_level, attended_similar, goals, goal_other, topics, question,
    tier_key, is_member, membership_number,
    gross_amount, discount_amount, net_amount, payment_id
  ) values (
    p_course_id, v_user, btrim(p_full_name), btrim(p_phone), lower(btrim(p_email)),
    nullif(btrim(coalesce(p_organization, '')), ''),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    nullif(btrim(coalesce(p_years_experience, '')), ''),
    p_knowledge_level, p_attended_similar, p_goals,
    nullif(btrim(coalesce(p_goal_other, '')), ''), p_topics,
    nullif(btrim(coalesce(p_question, '')), ''),
    coalesce(p_tier_key, ''), coalesce(p_is_member, false),
    nullif(btrim(coalesce(p_membership_number, '')), ''),
    v_quote.gross_amount, v_quote.discount_amount, v_quote.net_amount, v_payment_id
  )
  on conflict (course_id, user_id) where status <> 'cancelled'
  do update set
    full_name = excluded.full_name, phone = excluded.phone, email = excluded.email,
    organization = excluded.organization, job_title = excluded.job_title,
    years_experience = excluded.years_experience, knowledge_level = excluded.knowledge_level,
    attended_similar = excluded.attended_similar, goals = excluded.goals,
    goal_other = excluded.goal_other, topics = excluded.topics, question = excluded.question,
    tier_key = excluded.tier_key, is_member = excluded.is_member,
    membership_number = excluded.membership_number,
    gross_amount = excluded.gross_amount, discount_amount = excluded.discount_amount,
    net_amount = excluded.net_amount, payment_id = excluded.payment_id
  returning * into v_reg;

  -- Fill the gaps on the profile, never overwrite it. The account's own name
  -- and phone were chosen by its owner; an email is usually absent entirely,
  -- and having one is what lets a remote follow-up or a certificate reach them.
  update public.profiles p
     set email     = coalesce(p.email, lower(btrim(p_email))),
         full_name = case when btrim(coalesce(p.full_name, '')) = ''
                          then btrim(p_full_name) else p.full_name end
   where p.id = v_user;

  return query select v_reg.id, v_order, v_quote.gross_amount, v_quote.discount_amount,
                      v_quote.net_amount, 'SAR'::text, v_course.title;
end;
$$;

-- ------------------------------------------------------------ settlement --
--
-- Extends the seam 20260901110000 opened rather than restating
-- convert_paid_intent(). Everything that file did here still happens; a paid
-- registration is additionally marked confirmed and tied to the enrolment that
-- was just created for it.
create or replace function public.after_intent_settled(
  p_pay public.payments,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pay.promo_code_id is not null then
    insert into public.promo_code_redemptions (
      promo_code_id, payment_id, user_id, order_number, kind,
      gross_amount, discount_amount, net_amount
    ) values (
      p_pay.promo_code_id, p_pay.id, p_pay.user_id, p_pay.order_number, p_kind,
      round(p_pay.amount + coalesce(p_pay.discount, 0), 2), coalesce(p_pay.discount, 0), p_pay.amount
    )
    on conflict do nothing;
  end if;

  -- The enrolment id is read back from `payments` rather than passed in:
  -- convert_paid_intent() sets it immediately before calling this, and reading
  -- it here keeps the seam's signature from growing a parameter per feature.
  update public.course_registrations r
     set status = 'confirmed',
         enrollment_id = (select p.enrollment_id from public.payments p where p.id = p_pay.id)
   where r.payment_id = p_pay.id
     and r.status = 'pending_payment';
end;
$$;

-- ------------------------------------------------------- administration --

-- Confirm — or withdraw — a membership claim. This is the promise on page 3 of
-- the original form («سيتم التحقق من العضوية قبل تأكيد التسجيل») kept as a
-- record with a name and a time against it.
--
-- Withdrawing does not reprice anything, and deliberately so: the attendee has
-- already paid and a database function is not the place to decide between
-- charging the difference, honouring the rate and cancelling the seat. It
-- clears the verification and leaves the registration visibly unverified for a
-- person to act on.
create or replace function public.admin_verify_membership(
  p_registration_id uuid,
  p_verified boolean
)
returns public.course_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_before public.course_registrations%rowtype;
  v_after public.course_registrations%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_verified is null then raise exception 'VERIFICATION_STATE_REQUIRED'; end if;

  select * into v_before from public.course_registrations where id = p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if not v_before.is_member then raise exception 'NOT_A_MEMBERSHIP_CLAIM'; end if;

  update public.course_registrations
     set membership_verified_at = case when p_verified then now() else null end,
         membership_verified_by = case when p_verified then v_admin else null end
   where id = p_registration_id
  returning * into v_after;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin,
          case when p_verified then 'membership_verified' else 'membership_unverified' end,
          'course_registration', p_registration_id,
          jsonb_build_object('membership_verified_at', v_before.membership_verified_at),
          jsonb_build_object('membership_verified_at', v_after.membership_verified_at));

  return v_after;
end;
$$;

-- The register for one course, for whoever is entitled to see it: an
-- administrator, or the trainer teaching it. The trainer's copy carries the
-- answers and not the money — that is the column split the table's RLS could
-- not express, made explicit here.
create or replace function public.course_registration_roster(p_course_id uuid)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  organization text,
  job_title text,
  years_experience text,
  knowledge_level smallint,
  attended_similar boolean,
  goals text[],
  goal_other text,
  topics text[],
  question text,
  tier_key text,
  is_member boolean,
  membership_number text,
  membership_verified_at timestamptz,
  status text,
  gross_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
  v_is_trainer boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select (c.trainer_id = v_user) into v_is_trainer
    from public.courses c where c.id = p_course_id;

  if not (v_is_admin or coalesce(v_is_trainer, false)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select r.id, r.full_name,
         -- Contact details reach the trainer too: they are running the day and
         -- may need to reach the room. The money does not.
         r.phone, r.email, r.organization, r.job_title, r.years_experience,
         r.knowledge_level, r.attended_similar, r.goals, r.goal_other, r.topics, r.question,
         r.tier_key, r.is_member,
         case when v_is_admin then r.membership_number else null end,
         r.membership_verified_at, r.status,
         case when v_is_admin then r.gross_amount else null end,
         case when v_is_admin then r.discount_amount else null end,
         case when v_is_admin then r.net_amount else null end,
         r.created_at
    from public.course_registrations r
   where r.course_id = p_course_id
     and r.status <> 'cancelled'
   order by r.created_at;
end;
$$;

-- Manage the tiers on a course. A plain upsert would do under
-- `course_price_tiers_admin_all`, but a course's prices are exactly the kind of
-- change that should leave a trace, and replacing the set in one statement is
-- what the editor actually does.
create or replace function public.admin_set_course_price_tiers(
  p_course_id uuid,
  p_tiers jsonb
)
returns setof public.course_price_tiers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_before jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if jsonb_typeof(p_tiers) <> 'array' then raise exception 'TIERS_INVALID'; end if;

  select coalesce(jsonb_agg(to_jsonb(t) - 'id' - 'course_id' - 'created_at'), '[]'::jsonb)
    into v_before from public.course_price_tiers t where t.course_id = p_course_id;

  -- A tier that has been registered against cannot simply vanish: the
  -- registration names it by key and the roster would stop being able to say
  -- what anybody signed up as.
  if exists (
    select 1 from public.course_registrations r
     where r.course_id = p_course_id
       and r.status <> 'cancelled'
       and r.tier_key not in (
         select item ->> 'key' from jsonb_array_elements(p_tiers) as item
       )
  ) then
    raise exception 'TIER_IN_USE';
  end if;

  delete from public.course_price_tiers where course_id = p_course_id;

  insert into public.course_price_tiers (course_id, key, label, price, position)
  select p_course_id,
         item ->> 'key',
         item ->> 'label',
         (item ->> 'price')::numeric,
         coalesce((item ->> 'position')::integer, ordinality::integer)
    from jsonb_array_elements(p_tiers) with ordinality as t(item, ordinality);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'course_price_tiers_set', 'course', p_course_id,
          jsonb_build_object('tiers', v_before), jsonb_build_object('tiers', p_tiers));

  return query select * from public.course_price_tiers t
                where t.course_id = p_course_id order by t.position;
end;
$$;

-- ------------------------------------------------------------------ grants --

revoke all on function public.after_intent_settled(public.payments, text) from public, anon, authenticated;

revoke all on function public.onsite_registration_quote(uuid, text, boolean, text) from public, anon;
revoke all on function public.create_onsite_registration_intent(uuid, text, text, text, text, smallint, boolean, text[], text[], text, text, text, text, text, boolean, text, text) from public, anon;
revoke all on function public.admin_verify_membership(uuid, boolean) from public, anon;
revoke all on function public.course_registration_roster(uuid) from public, anon;
revoke all on function public.admin_set_course_price_tiers(uuid, jsonb) from public, anon;

grant execute on function public.onsite_registration_quote(uuid, text, boolean, text) to authenticated;
grant execute on function public.create_onsite_registration_intent(uuid, text, text, text, text, smallint, boolean, text[], text[], text, text, text, text, text, boolean, text, text) to authenticated;
grant execute on function public.admin_verify_membership(uuid, boolean) to authenticated;
grant execute on function public.course_registration_roster(uuid) to authenticated;
grant execute on function public.admin_set_course_price_tiers(uuid, jsonb) to authenticated;
