-- The exact figure a refund would return, read from the payment itself.
--
-- The refund control worked this out in the browser, from the amount it had
-- been handed in a list loaded some time earlier:
--
--     const refundable = payment.amount - payment.refundedAmount
--
-- Arithmetic in the right place would still be arithmetic in the wrong place.
-- That figure is what an administrator reads before pressing a button that
-- moves real money, so it should not be derived from a cached copy, rounded by
-- a formatter, or capable of disagreeing with the row it claims to describe.
-- It comes from the row now, at the moment of asking.
--
-- The API already computed the same value independently before calling the
-- gateway and still does — that is the authority, and this does not replace it.
-- What this adds is that the number shown and the number charged are read from
-- the same place, so they cannot differ.

create or replace function public.admin_payment_refund_preview(p_order_number text)
returns table (
  order_number text,
  charged numeric,
  refunded numeric,
  refundable numeric,
  currency text,
  status text,
  can_refund boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_charged numeric(10, 2);
  v_refundable numeric(10, 2);
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_pay from public.payments p where p.order_number = p_order_number;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  -- The same expression the API uses, and the same one record_payment_refund
  -- validates against. Three readers, one definition of "what is left".
  v_charged := v_pay.amount + v_pay.tax + v_pay.fees;
  v_refundable := v_charged - v_pay.refunded_amount;

  return query select
    v_pay.order_number,
    v_charged,
    v_pay.refunded_amount,
    greatest(v_refundable, 0),
    v_pay.currency,
    v_pay.status::text,
    (v_pay.status in ('succeeded', 'partially_refunded') and v_refundable > 0),
    case
      when v_pay.status not in ('succeeded', 'partially_refunded')
        then 'لم يُحصَّل هذا المبلغ بعد.'
      when v_refundable <= 0 then 'تم استرداد كامل المبلغ مسبقاً.'
      when v_pay.provider_payment_id is null
        then 'لا يوجد مرجع دفع لدى البوابة لهذه العملية.'
      else null
    end;
end;
$$;

revoke all on function public.admin_payment_refund_preview(text) from public, anon;
grant execute on function public.admin_payment_refund_preview(text) to authenticated;
