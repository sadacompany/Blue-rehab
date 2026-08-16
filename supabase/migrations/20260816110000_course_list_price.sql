-- An optional list price, so a course can show what it usually costs.
--
-- The online-course layout the client asked for puts the current price beside
-- the original with a line through it. That needs somewhere to keep the original;
-- deriving it from a discount percentage would make the struck-through figure a
-- calculation rather than a fact, and it is a claim about price, so it should be
-- typed in and stored.
--
-- Null means there is no former price and nothing is struck through. A value at
-- or below `price` is meaningless, so the constraint refuses it rather than
-- letting the page advertise a saving that is not there.

alter table public.courses
  add column if not exists compare_at_price numeric(10, 2);

alter table public.rehab_programs
  add column if not exists compare_at_price numeric(10, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_compare_at_price_above_price') then
    alter table public.courses
      add constraint courses_compare_at_price_above_price
      check (compare_at_price is null or compare_at_price > price);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'programs_compare_at_price_above_price') then
    alter table public.rehab_programs
      add constraint programs_compare_at_price_above_price
      check (compare_at_price is null or compare_at_price > price);
  end if;
end $$;

comment on column public.courses.compare_at_price is
  'Former price, struck through beside the current one. Null shows no comparison.';
comment on column public.rehab_programs.compare_at_price is
  'Former price, struck through beside the current one. Null shows no comparison.';
