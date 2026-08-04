-- Google Meet links for remote sessions.
-- The server (or the patient's authenticated session) records the generated
-- Meet URL on the booking so the portal and confirmations can surface it.

alter table public.bookings
  add column if not exists meeting_url text;

-- Allow a patient to attach a meeting link to their own booking. Ownership is
-- enforced on both sides of the update so a row can never be reassigned.
drop policy if exists "bookings_patient_update" on public.bookings;
create policy "bookings_patient_update" on public.bookings
  for update to authenticated
  using ((select auth.uid()) = patient_id)
  with check ((select auth.uid()) = patient_id);
