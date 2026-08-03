drop policy if exists support_requests_public_insert on public.support_requests;

create policy support_requests_public_insert
on public.support_requests
for insert
to anon, authenticated
with check (
  (user_id is null or user_id = (select auth.uid()))
  and char_length(btrim(name)) between 2 and 120
  and char_length(btrim(subject)) between 2 and 160
  and char_length(btrim(message)) between 20 and 1000
  and (email is null or char_length(email) <= 254)
  and (phone is null or char_length(phone) <= 30)
);
