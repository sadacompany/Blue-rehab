-- Aggregate figures for the administration dashboard.
--
-- One round trip instead of a dozen `count(*)` queries from the browser, and it
-- keeps the arithmetic (revenue, today's schedule) in one reviewable place
-- rather than spread across the client.
--
-- SECURITY DEFINER with an explicit admin check: aggregates would otherwise be
-- shaped by the caller's own RLS and quietly report a fraction of the business.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'patients', (select count(*) from public.profiles where 'patient' = any(roles)),
      'specialists', (select count(*) from public.profiles where 'specialist' = any(roles)),
      'trainers', (select count(*) from public.profiles where 'trainer' = any(roles)),
      'admins', (select count(*) from public.profiles where 'admin' = any(roles))
    ),
    'applications', jsonb_build_object(
      'pending', (select count(*) from public.provider_applications where status = 'pending'),
      'approved', (select count(*) from public.provider_applications where status = 'approved'),
      'rejected', (select count(*) from public.provider_applications where status = 'rejected')
    ),
    'bookings', jsonb_build_object(
      'total', (select count(*) from public.bookings),
      'confirmed', (select count(*) from public.bookings where status = 'confirmed'),
      'pending_payment', (select count(*) from public.bookings where status = 'pending_payment'),
      'completed', (select count(*) from public.bookings where status = 'completed'),
      'cancelled', (select count(*) from public.bookings where status = 'cancelled'),
      'today', (select count(*) from public.bookings
                 where starts_at >= date_trunc('day', now())
                   and starts_at < date_trunc('day', now()) + interval '1 day'
                   and status not in ('cancelled','draft')),
      'upcoming', (select count(*) from public.bookings where starts_at > now() and status = 'confirmed')
    ),
    'courses', jsonb_build_object(
      'published', (select count(*) from public.courses where is_published),
      'enrollments', (select count(*) from public.enrollments),
      'active_enrollments', (select count(*) from public.enrollments where status = 'active')
    ),
    'revenue', jsonb_build_object(
      'currency', 'SAR',
      'collected', (select coalesce(sum(amount), 0) from public.payments where status = 'succeeded'),
      'collected_30d', (select coalesce(sum(amount), 0) from public.payments
                         where status = 'succeeded' and paid_at > now() - interval '30 days'),
      'outstanding', (select coalesce(sum(amount), 0) from public.payments
                       where status in ('pending','processing')),
      'refunded', (select coalesce(sum(amount), 0) from public.payments
                    where status in ('refunded','partially_refunded')),
      'failed_count', (select count(*) from public.payments where status = 'failed')
    ),
    'support', jsonb_build_object(
      'open', (select count(*) from public.support_requests where status in ('new','in_progress')),
      'total', (select count(*) from public.support_requests)
    ),
    'capacity', jsonb_build_object(
      'free_slots', (select count(*) from public.availability_slots
                      where is_available and starts_at > now()),
      'verified_specialists', (select count(*) from public.specialists where is_verified)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Support request triage. Status is staff-owned, so it moves through a checked
-- function rather than a table grant.
create or replace function public.admin_set_support_status(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('new','in_progress','resolved','closed') then
    raise exception 'STATUS_INVALID';
  end if;

  update public.support_requests
     set status = p_status, updated_at = now()
   where id = p_request_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_admin, 'support_request_status_changed', 'support_request', p_request_id,
          jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.admin_set_support_status(uuid, text) from public, anon;
grant execute on function public.admin_set_support_status(uuid, text) to authenticated;
