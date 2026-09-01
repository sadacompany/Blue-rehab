-- Deleting a course that people have paid for.
--
-- 20260901150000 refused this outright: `admin_delete_course` counts
-- enrolments, payments and reviews and raises COURSE_HAS_HISTORY, on the
-- reasoning that money and clinical history must outlive the course. That is
-- still the right default and it stays exactly as it is.
--
-- But the client has a real case it does not cover: a course that should never
-- have been sold. Cancelled, mispriced, published by mistake. The answer there
-- is not «you cannot», it is «you can, once everyone has their money back» —
-- which is a different operation with a different confirmation, not a flag on
-- the old one. So this is a second, explicitly-named function, and the
-- interface reaches it only through a second screen that states the total in
-- riyals and the number of people affected.
--
-- What survives, and why it matters:
--
--   `payments` rows are NOT deleted. Order number, payer, amount charged and
--   amount refunded all remain, so the financial record is intact and
--   reconcilable after the course is gone. Only their links to the course and
--   the enrolment are nulled — both columns are nullable precisely because a
--   payment can exist before the thing it pays for does.
--
--   `reviews` are NOT deleted. `course_id` is nulled; a review may also concern
--   a specialist, and it is somebody's writing either way.
--
--   The whole course, its enrolments and its payments are snapshotted into
--   `audit_logs.old_values` first. That is the record of what was destroyed.
--
-- What does go: enrolments (and the lesson progress and certificates that
-- cascade from them), modules, lessons, price tiers, registrations. That is
-- course structure and participation in a course that no longer exists.
--
-- Refunding is NOT done here. Money is moved by the API against Moyasar, one
-- payment at a time, and each is recorded by `record_payment_refund` as it
-- succeeds. Only when every one of them has come back does the API call this.
-- A database function cannot call a payment gateway, and pretending otherwise
-- would mean marking refunds that never happened.

-- ---------------------------------------------------------------- impact --
--
-- What deleting this course would cost, so the confirmation can state it
-- instead of asking somebody to take it on faith. Read-only.
create or replace function public.admin_course_delete_impact(p_course_id uuid)
returns table (
  course_title text,
  refundable_total numeric,
  payer_count integer,
  paid_payment_count integer,
  active_enrollments integer,
  registration_count integer,
  review_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare v_title text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select c.title into v_title from public.courses c where c.id = p_course_id;
  if v_title is null then raise exception 'COURSE_NOT_FOUND'; end if;

  return query
  with paid as (
    -- Everything still holding money for this course. `amount + tax + fees`
    -- is what was charged; subtracting what has already gone back leaves what
    -- this deletion would actually have to refund.
    select p.user_id,
           (p.amount + p.tax + p.fees - p.refunded_amount) as outstanding
      from public.payments p
     where p.intent_course_id = p_course_id
       and p.status in ('succeeded', 'partially_refunded')
       and (p.amount + p.tax + p.fees - p.refunded_amount) > 0
  )
  select v_title,
         coalesce((select sum(outstanding) from paid), 0)::numeric,
         (select count(distinct user_id) from paid)::integer,
         (select count(*) from paid)::integer,
         (select count(*) from public.enrollments e
           where e.course_id = p_course_id and e.status <> 'cancelled')::integer,
         (select count(*) from public.course_registrations r
           where r.course_id = p_course_id and r.status <> 'cancelled')::integer,
         (select count(*) from public.reviews rv where rv.course_id = p_course_id)::integer;
end;
$$;

-- ---------------------------------------------------------------- delete --
--
-- Called by the API only after every outstanding payment has been refunded at
-- the gateway. It re-checks that: if anything is still holding money it
-- refuses, so a failure half way through the refund loop cannot leave a course
-- deleted and a customer out of pocket.
create or replace function public.admin_delete_course_with_refunds(
  p_course_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course jsonb;
  v_outstanding numeric;
  v_snapshot jsonb;
begin
  select to_jsonb(c) into v_course from public.courses c where c.id = p_course_id;
  if v_course is null then raise exception 'COURSE_NOT_FOUND'; end if;

  -- The guard that makes the whole operation safe to retry. The API refunds
  -- first; if any refund failed, this is still above zero and nothing is
  -- destroyed.
  select coalesce(sum(p.amount + p.tax + p.fees - p.refunded_amount), 0)
    into v_outstanding
    from public.payments p
   where p.intent_course_id = p_course_id
     and p.status in ('succeeded', 'partially_refunded')
     and (p.amount + p.tax + p.fees - p.refunded_amount) > 0;

  if v_outstanding > 0 then
    raise exception 'REFUNDS_INCOMPLETE: % remaining', v_outstanding;
  end if;

  -- Everything that is about to be destroyed, kept.
  select jsonb_build_object(
    'course', v_course,
    'enrollments', coalesce((select jsonb_agg(to_jsonb(e)) from public.enrollments e where e.course_id = p_course_id), '[]'::jsonb),
    'registrations', coalesce((select jsonb_agg(to_jsonb(r)) from public.course_registrations r where r.course_id = p_course_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p where p.intent_course_id = p_course_id), '[]'::jsonb)
  ) into v_snapshot;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (p_actor, 'course_deleted_with_refunds', 'course', p_course_id, v_snapshot, null);

  -- Tell everyone who was on it, before their enrolment disappears.
  insert into public.notifications (user_id, channel, event_type, title, body, data)
  select e.student_id, 'in_app', 'course_cancelled',
         'أُلغيت الدورة وأُعيدت رسومها',
         format('أُلغيت دورة «%s» وأُعيد إليك كامل المبلغ المدفوع.', v_course ->> 'title'),
         jsonb_build_object('course_title', v_course ->> 'title')
    from public.enrollments e
   where e.course_id = p_course_id and e.status <> 'cancelled';

  -- Detach the records that must outlive the course. Both columns are nullable
  -- because a payment legitimately exists before the thing it buys.
  update public.payments
     set enrollment_id = null, intent_course_id = null, updated_at = now()
   where intent_course_id = p_course_id
      or enrollment_id in (select id from public.enrollments where course_id = p_course_id);

  -- A review may also concern a specialist, and is somebody's writing either
  -- way, so it is detached rather than destroyed.
  update public.reviews
     set course_id = null, enrollment_id = null
   where course_id = p_course_id
      or enrollment_id in (select id from public.enrollments where course_id = p_course_id);

  -- Participation goes with the course. Lesson progress, attendance and
  -- certificates cascade from the enrolment.
  delete from public.enrollments where course_id = p_course_id;

  -- Modules, lessons, price tiers and registrations cascade from the course.
  delete from public.courses where id = p_course_id;

  return v_course;
end;
$$;

-- ------------------------------------------------------------------ grants --

revoke all on function public.admin_course_delete_impact(uuid) from public, anon;
grant execute on function public.admin_course_delete_impact(uuid) to authenticated;

-- Service role only, like record_payment_refund: its precondition is that money
-- has already been returned, which only the API can know.
revoke all on function public.admin_delete_course_with_refunds(uuid, uuid)
  from public, anon, authenticated;
