-- What each course and each service actually earned.
--
-- `admin_overview` reports one revenue figure for the whole platform —
-- collected, outstanding, refunded — which answers «how are we doing» and
-- nothing else. It cannot say which course paid for itself, or which service
-- people actually want, and those are the two questions that decide what to run
-- next term and what to staff for.
--
-- Money is attributed the same way the payment itself was made. A payment
-- carries `intent_course_id` / `intent_service_id` from the moment the intent
-- is created (20260807110000), so attribution does not depend on the booking or
-- enrolment surviving — which matters, because a refunded-and-deleted course
-- nulls exactly those links (20260901170000). Where an older row predates the
-- intent columns, it is attributed through the booking or enrolment it settled
-- into instead. Both paths are in the coalesce below.
--
-- Three figures per row, not one, because they answer different questions:
--
--   collected  what was charged and cleared — the demand signal
--   refunded   what went back
--   net        what the platform actually kept
--
-- Sorting by `net` is what «most needed in terms of money» means: a service
-- that takes a lot and refunds most of it is not the one to staff for.

create or replace function public.admin_revenue_breakdown()
returns table (
  kind text,
  item_id uuid,
  item_name text,
  orders integer,
  buyers integer,
  collected numeric,
  refunded numeric,
  net numeric
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
  with settled as (
    -- Only money that actually arrived. A pending intent is not revenue, and
    -- counting it is how a dashboard starts lying.
    select p.user_id,
           p.amount + p.tax + p.fees      as charged,
           p.refunded_amount              as given_back,
           coalesce(p.intent_course_id, e.course_id)   as course_id,
           coalesce(p.intent_service_id, b.service_id) as service_id
      from public.payments p
      left join public.enrollments e on e.id = p.enrollment_id
      left join public.bookings    b on b.id = p.booking_id
     where p.status in ('succeeded', 'partially_refunded', 'refunded')
  )
  select 'course'::text, c.id, c.title,
         count(*)::integer,
         count(distinct s.user_id)::integer,
         coalesce(sum(s.charged), 0),
         coalesce(sum(s.given_back), 0),
         coalesce(sum(s.charged - s.given_back), 0)
    from settled s
    join public.courses c on c.id = s.course_id
   group by c.id, c.title

  union all

  select 'service'::text, sv.id, sv.name,
         count(*)::integer,
         count(distinct s.user_id)::integer,
         coalesce(sum(s.charged), 0),
         coalesce(sum(s.given_back), 0),
         coalesce(sum(s.charged - s.given_back), 0)
    from settled s
    join public.services sv on sv.id = s.service_id
   group by sv.id, sv.name

  order by 8 desc, 3;
end;
$$;

comment on function public.admin_revenue_breakdown() is
  'Collected, refunded and net revenue per course and per service, from settled payments only.';

revoke all on function public.admin_revenue_breakdown() from public, anon;
grant execute on function public.admin_revenue_breakdown() to authenticated;
