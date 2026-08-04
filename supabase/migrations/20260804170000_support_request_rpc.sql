-- Let anonymous visitors submit the contact form and receive a ticket number.
--
-- `support_requests_public_insert` allows the INSERT, but the client asks for the
-- new row back (`.select("id,status,created_at")`) to show the reference number,
-- and PostgREST implements that with RETURNING — which is subject to the SELECT
-- policy. Anonymous rows have no owner, so no SELECT policy can match them and
-- the whole submission fails for signed-out visitors, who are most of them.
--
-- Widening SELECT to `anon` would expose every stranger's message. Instead the
-- insert runs in a SECURITY DEFINER function that returns only the caller's own
-- new row, with the same validation the RLS policy enforces.

create or replace function public.submit_support_request(
  p_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text
)
returns table (id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_id uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'NAME_INVALID';
  end if;
  if char_length(v_subject) < 2 or char_length(v_subject) > 160 then
    raise exception 'SUBJECT_INVALID';
  end if;
  if char_length(v_message) < 20 or char_length(v_message) > 1000 then
    raise exception 'MESSAGE_INVALID';
  end if;
  if v_email is not null and char_length(v_email) > 254 then
    raise exception 'EMAIL_INVALID';
  end if;
  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'PHONE_INVALID';
  end if;

  insert into public.support_requests (user_id, name, email, phone, subject, message)
  values ((select auth.uid()), v_name, v_email, v_phone, v_subject, v_message)
  returning support_requests.id into v_id;

  return query
    select s.id, s.status, s.created_at
      from public.support_requests s
     where s.id = v_id;
end;
$$;

revoke all on function public.submit_support_request(text, text, text, text, text) from public;
grant execute on function public.submit_support_request(text, text, text, text, text) to anon, authenticated;
