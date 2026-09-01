-- Refunding a payment that should not have been taken.
--
-- Everything for this has been half-present since the beginning and never
-- joined up: `payment_status` has carried 'refunded' and 'partially_refunded'
-- since 002, `payments.refunded_amount` has existed just as long, and
-- `refundPayment()` has sat unused in server/src/moyasar.ts since the gateway
-- was integrated — docs/HANDOFF.md §9 lists wiring it as outstanding work. What
-- was missing is the part that decides whether a refund is allowed, records it,
-- and undoes what the payment bought.
--
-- The trust boundary is the same one every other money path here uses, in the
-- same direction: the browser names an order and an amount to give back, and
-- the server decides whether that is possible. The refund itself is executed by
-- the API against Moyasar with the secret key, and only then recorded here —
-- so this function is never the thing that moves money, it is the thing that
-- records money already moved. It is granted to nobody for that reason: like
-- `convert_paid_intent`, its only caller is the service-role client, after the
-- gateway has confirmed.

-- ------------------------------------------------- a constraint that was wrong --
--
-- `check (refunded_amount <= amount + tax + fees - discount)`.
--
-- That was harmless while `discount` was always zero, which it was until
-- promotion codes landed in 20260901110000. It is wrong now, and would have
-- rejected the first full refund of any discounted order.
--
-- `amount` is what the customer was actually charged — the net, after the
-- discount, and the figure `verifyPayment` compares against Moyasar. `discount`
-- sits beside it as a record of what came off, not as a further deduction. So
-- an order of 100 with a 20 discount stores amount = 80, and the old rule
-- allowed refunding at most 80 - 20 = 60 of the 80 that was taken.
--
-- The ceiling is what was charged, plus anything added on top of it.
alter table public.payments drop constraint if exists payments_refunded_amount_check1;

do $$
declare v_name text;
begin
  -- The constraint is unnamed in 002, so Postgres generated its name. Find it
  -- by its definition rather than guessing at the generated suffix.
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.payments'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%refunded_amount%discount%';

  if v_name is not null then
    execute format('alter table public.payments drop constraint %I', v_name);
  end if;
end $$;

alter table public.payments
  add constraint payments_refund_within_charge
  check (refunded_amount <= amount + tax + fees);

-- ------------------------------------------------------------ recording it --
--
-- Called by the API after Moyasar has confirmed the refund. Returns the payment
-- as it now stands.
--
-- A full refund does not only mark the payment: it undoes what the payment
-- bought. An appointment nobody paid for should not stay on a specialist's
-- calendar, and a seat nobody paid for should not stay active — leaving either
-- behind is how a refunded customer still turns up on a Tuesday.
create or replace function public.record_payment_refund(
  p_order_number text,
  p_amount numeric,
  p_reason text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_refundable numeric(10, 2);
  v_amount numeric(10, 2) := round(coalesce(p_amount, 0), 2);
  v_total numeric(10, 2);
  v_full boolean;
  v_slot uuid;
  v_out jsonb;
begin
  select * into v_pay from public.payments where order_number = p_order_number for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  -- Only money that actually arrived can go back.
  if v_pay.status not in ('succeeded', 'partially_refunded') then
    raise exception 'PAYMENT_NOT_REFUNDABLE';
  end if;

  v_refundable := v_pay.amount + v_pay.tax + v_pay.fees - v_pay.refunded_amount;
  if v_amount <= 0 then raise exception 'REFUND_AMOUNT_INVALID'; end if;
  if v_amount > v_refundable then raise exception 'REFUND_EXCEEDS_REMAINING'; end if;

  v_total := v_pay.refunded_amount + v_amount;
  v_full := v_total >= v_pay.amount + v_pay.tax + v_pay.fees;

  update public.payments
     set refunded_amount = v_total,
         status = case when v_full then 'refunded' else 'partially_refunded' end::public.payment_status,
         updated_at = now()
   where id = v_pay.id;

  if v_full then
    -- The appointment goes, and the time goes back on the calendar — but only
    -- if no other live booking has since claimed it, which is the same guard
    -- release_intent() uses.
    if v_pay.booking_id is not null then
      update public.bookings set status = 'cancelled', updated_at = now()
       where id = v_pay.booking_id
      returning slot_id into v_slot;

      if v_slot is not null then
        update public.availability_slots s set is_available = true
         where s.id = v_slot
           and not exists (select 1 from public.bookings b
                            where b.slot_id = s.id and b.status <> 'cancelled');
      end if;
    end if;

    if v_pay.enrollment_id is not null then
      update public.enrollments set status = 'cancelled' where id = v_pay.enrollment_id;
    end if;

    -- An in-person registration follows its enrolment.
    update public.course_registrations set status = 'cancelled'
     where payment_id = v_pay.id and status <> 'cancelled';

    -- A refunded sale is not a sale. Removing the redemption returns the place
    -- to the campaign's ceiling and lets the customer use the code again, which
    -- is the correct outcome for a purchase that has been undone — and keeps
    -- «المبيعات» on the promotions panel meaning what it says. The row's
    -- contents are preserved in the audit entry below before it goes.
    delete from public.promo_code_redemptions where payment_id = v_pay.id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (p_actor,
          case when v_full then 'payment_refunded' else 'payment_partially_refunded' end,
          'payment', v_pay.id,
          jsonb_build_object('status', v_pay.status, 'refunded_amount', v_pay.refunded_amount),
          jsonb_build_object('refunded_amount', v_total, 'refunded_now', v_amount,
                             'reason', nullif(btrim(coalesce(p_reason, '')), ''),
                             'booking_id', v_pay.booking_id, 'enrollment_id', v_pay.enrollment_id));

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (v_pay.user_id, 'in_app', 'payment_refunded',
          case when v_full then 'تم استرداد مبلغ عمليتك' else 'تم استرداد جزء من مبلغ عمليتك' end,
          format('أعدنا %s ر.س من الطلب %s.%s', v_amount, p_order_number,
                 case when v_full then ' أُلغي الحجز أو التسجيل المرتبط به.' else '' end),
          jsonb_build_object('order_number', p_order_number, 'amount', v_amount, 'full', v_full));

  select to_jsonb(p) into v_out from public.payments p where p.id = v_pay.id;
  return v_out;
end;
$$;

-- Granted to nobody: the service-role client is its only caller, after Moyasar
-- has confirmed. An administrator reaching this directly could mark money
-- returned that never left.
revoke all on function public.record_payment_refund(text, numeric, text, uuid)
  from public, anon, authenticated;
