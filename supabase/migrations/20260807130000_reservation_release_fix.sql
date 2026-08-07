-- Make reservation release explicit.
--
-- The previous version did the work inside chained data-modifying CTEs, where
-- every branch sees the same snapshot and `get diagnostics` reports only the
-- outermost statement — it freed the slot but reported zero, and whether the
-- payment row was reliably marked cancelled depended on execution order rather
-- than on anything stated. Two plain statements over a collected set of ids say
-- what they do.

create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_slots uuid[];
begin
  select array_agg(id), array_agg(intent_slot_id) filter (where intent_slot_id is not null)
    into v_ids, v_slots
    from public.payments
   where status in ('pending', 'processing')
     and reserved_until is not null
     and reserved_until < now()
     and booking_id is null
     and enrollment_id is null;

  if v_ids is null then return 0; end if;

  -- Only hand back a time nobody actually booked.
  if v_slots is not null then
    update public.availability_slots s
       set is_available = true
     where s.id = any (v_slots)
       and not exists (
         select 1 from public.bookings b
          where b.slot_id = s.id and b.status <> 'cancelled'
       );
  end if;

  update public.payments
     set status = 'cancelled',
         failure_reason = coalesce(failure_reason, 'reservation_expired'),
         reserved_until = null,
         updated_at = now()
   where id = any (v_ids);

  return array_length(v_ids, 1);
end;
$$;

revoke all on function public.release_expired_reservations() from public, anon;
grant execute on function public.release_expired_reservations() to authenticated;
