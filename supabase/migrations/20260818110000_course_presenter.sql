-- Credit the person presenting a course, before there is an account to link.
--
-- `courses.trainer_id` references `profiles`, so a course can only be
-- formally assigned to someone who has signed in and been granted the
-- trainer role — neither of these two courses' presenters has done that yet.
-- Burying their name inside the free-text description was the alternative,
-- but that renders as one run-on paragraph with no visual separation from
-- the rest of the copy, which is not "linked to their specialist" in any
-- way a visitor would notice.
--
-- presenter_name is the interim, honest version of that link: a plain
-- credit shown on the card and the detail page. When the presenter signs in
-- and administration grants them the trainer role, an administrator assigns
-- them as trainer_id from /admin (assignCourseTrainer already does this) and
-- presenter_name stops being the only place their name appears.

alter table public.courses add column if not exists presenter_name text;
comment on column public.courses.presenter_name is
  'Free-text credit for who presents the course, shown until trainer_id can be set for a real account.';
