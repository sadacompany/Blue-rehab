-- Administrative course editing, and the one-click half-price offer.
--
-- Two gaps this closes:
--
--   1. An administrator could assign a trainer, upload a cover and approve or
--      withdraw a course, but could not correct so much as a typo in its title.
--      Everything else — price, dates, outcomes, the syllabus copy — was the
--      instructor's alone, and the instructor may be unreachable, or gone.
--
--   2. Putting a course on offer meant typing the old price into
--      `compare_at_price` and the new one into `price` by hand, in the database,
--      getting the arithmetic right, and not tripping
--      `courses_compare_at_price_above_price` on the way. That is a two-field
--      edit with an invariant between them, which is exactly the kind of thing
--      that should be one button.
--
-- Why a function rather than the RLS policy that already exists
-- -------------------------------------------------------------
-- `courses_admin_all` plus the column grants from 20260808100000 already let an
-- administrator write most of these columns straight from the browser. That is
-- not enough here, for three separate reasons:
--
--   • The trainer must be told. A notification written by the client is a
--     notification the client can skip, reword, or address to someone else.
--     Inside the function it is part of the same transaction as the edit.
--   • The offer arithmetic must be computed from the stored price. A client that
--     sends its own `price` and `compare_at_price` can send any pair it likes —
--     including a "half price" that is not half of anything.
--   • `compare_at_price` is not in the `authenticated` column grant at all, and
--     should not be: see the revoke at the foot of 20260808100000 for why
--     granting a column "for administrators" does not work.
--
-- The caller's claim to be an administrator is never taken on trust: every
-- function below asks `public.is_admin()` first and raises if the answer is no,
-- the same way `admin_set_user_roles` and `review_course` do.

-- ------------------------------------------------------------- editing ------

/**
 * Edit any editable field on a course, and tell the trainer what changed.
 *
 * The patch is jsonb rather than seventeen named parameters, deliberately:
 *
 *   • Seven of the editable columns are nullable, and with named parameters
 *     there is no way to tell "leave `summary` alone" from "clear `summary`" —
 *     both arrive as NULL. A key that is absent from the patch is untouched; a
 *     key present with a JSON null is explicitly cleared. That distinction is
 *     what makes the change detection below honest.
 *   • Change detection is then exact. An administrator who opens the editor,
 *     changes the price and saves sends one key, so the trainer is told the
 *     price changed — not handed a list of seventeen fields "updated" to the
 *     values they already held.
 *   • Adding an eighteenth editable column later does not change this
 *     function's signature, so it does not need a `drop function` and a fresh
 *     round of grants in a later migration.
 *
 * The cost of jsonb is that the column list is no longer checked by the
 * compiler, so it is checked here instead: `v_editable` is an allow-list, not a
 * deny-list, and a key outside it is refused rather than ignored. That is what
 * keeps `is_published`, `review_status`, `trainer_id`, `is_demo` and the review
 * audit columns out of reach — publication is a decision `review_course` takes,
 * and this function must not become a second way to take it.
 */
create or replace function public.admin_update_course(
  p_course_id uuid,
  p_patch jsonb
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_before public.courses%rowtype;
  v_after public.courses%rowtype;
  v_merged public.courses%rowtype;
  v_before_json jsonb;
  v_after_json jsonb;
  v_unknown text[];
  v_changed text[];
  v_labels text;

  -- The seventeen fields an administrator may edit, in the order they are read
  -- on the course page. The order is load-bearing: the changed-field list in
  -- the notification is built from it, so «العنوان والسعر» always reads in the
  -- same order rather than in whatever order the browser serialised the patch.
  v_editable constant text[] := array[
    'title', 'slug', 'summary', 'description', 'duration_hours', 'price',
    'compare_at_price', 'mode', 'level', 'starts_at', 'capacity',
    'learning_outcomes', 'prerequisites', 'language', 'certificate_available',
    'cover_url', 'presenter_name'
  ];
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'PATCH_INVALID';
  end if;

  select array_agg(k order by k) into v_unknown
    from jsonb_object_keys(p_patch) k
   where not (k = any(v_editable));
  if v_unknown is not null then
    raise exception 'FIELD_NOT_EDITABLE: %', array_to_string(v_unknown, ', ');
  end if;

  select * into v_before from public.courses where id = p_course_id for update;
  if not found then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  -- Absent keys fall back to the row as it stands, which is what makes this a
  -- patch rather than a replace. The result is only ever *read* from here on:
  -- the UPDATE below names its columns explicitly, so a key that slipped past
  -- the allow-list still could not reach a column it does not name.
  v_merged := jsonb_populate_record(v_before, p_patch);

  if coalesce(btrim(v_merged.title), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  if char_length(v_merged.title) > 200 then raise exception 'TITLE_TOO_LONG'; end if;

  -- The slug is a URL segment, and slugs here are generated from Arabic titles,
  -- so it is not restricted to ASCII — only to characters that survive being
  -- put in a path.
  if coalesce(btrim(v_merged.slug), '') = '' then raise exception 'SLUG_REQUIRED'; end if;
  if btrim(v_merged.slug) !~ '^[^[:space:]/?#]+$' or char_length(v_merged.slug) > 120 then
    raise exception 'SLUG_INVALID';
  end if;

  -- `mode` is NOT NULL with no default to fall back on at this point, so a patch
  -- that nulls it has to be refused here rather than by the column constraint.
  if v_merged.mode is null then raise exception 'MODE_REQUIRED'; end if;
  if v_merged.duration_hours is null or v_merged.duration_hours <= 0 then raise exception 'DURATION_INVALID'; end if;
  if v_merged.price is null or v_merged.price < 0 then raise exception 'PRICE_INVALID'; end if;
  if v_merged.capacity is not null and v_merged.capacity <= 0 then raise exception 'CAPACITY_INVALID'; end if;
  if coalesce(btrim(v_merged.level), '') = '' then raise exception 'LEVEL_REQUIRED'; end if;
  if coalesce(btrim(v_merged.language), '') = '' then raise exception 'LANGUAGE_REQUIRED'; end if;

  -- Same rule as `courses_compare_at_price_above_price`, stated early so the
  -- administrator gets a sentence instead of a constraint name.
  if v_merged.compare_at_price is not null and v_merged.compare_at_price <= v_merged.price then
    raise exception 'COMPARE_AT_PRICE_INVALID';
  end if;

  begin
    update public.courses set
      title = btrim(v_merged.title),
      slug = btrim(v_merged.slug),
      summary = nullif(btrim(coalesce(v_merged.summary, '')), ''),
      description = nullif(btrim(coalesce(v_merged.description, '')), ''),
      duration_hours = v_merged.duration_hours,
      price = v_merged.price,
      compare_at_price = v_merged.compare_at_price,
      mode = v_merged.mode,
      level = btrim(v_merged.level),
      starts_at = v_merged.starts_at,
      capacity = v_merged.capacity,
      learning_outcomes = coalesce(v_merged.learning_outcomes, '{}'),
      prerequisites = coalesce(v_merged.prerequisites, '{}'),
      language = btrim(v_merged.language),
      certificate_available = coalesce(v_merged.certificate_available, false),
      cover_url = nullif(btrim(coalesce(v_merged.cover_url, '')), ''),
      presenter_name = nullif(btrim(coalesce(v_merged.presenter_name, '')), '')
    where id = p_course_id
    returning * into v_after;
  exception when unique_violation then
    -- `courses.slug` is unique and the slug is the public URL, so a collision is
    -- the one failure here an administrator can actually act on.
    raise exception 'SLUG_TAKEN';
  end;

  v_before_json := to_jsonb(v_before);
  v_after_json := to_jsonb(v_after);

  -- What actually moved. Comparing the stored rows rather than the patch keys
  -- means a patch that re-sends a field's existing value — or one the normalising
  -- above rewrote to what was already there — counts as no change at all.
  select coalesce(array_agg(f order by ord), '{}'::text[])
    into v_changed
    from unnest(v_editable) with ordinality as t(f, ord)
   where (v_before_json -> f) is distinct from (v_after_json -> f);

  if array_length(v_changed, 1) is null then
    -- Nothing moved: no audit entry, and above all no notification. Being told
    -- «حدّثت الإدارة بيانات دورتك» about an edit that changed nothing is how a
    -- notification list stops being read.
    return v_after;
  end if;

  select string_agg(
           case f
             when 'title' then 'العنوان'
             when 'slug' then 'الرابط'
             when 'summary' then 'الوصف المختصر'
             when 'description' then 'الوصف التفصيلي'
             when 'duration_hours' then 'عدد الساعات'
             when 'price' then 'السعر'
             when 'compare_at_price' then 'السعر قبل العرض'
             when 'mode' then 'طريقة التقديم'
             when 'level' then 'المستوى'
             when 'starts_at' then 'تاريخ البدء'
             when 'capacity' then 'السعة'
             when 'learning_outcomes' then 'نتائج التعلم'
             when 'prerequisites' then 'المتطلبات السابقة'
             when 'language' then 'لغة التقديم'
             when 'certificate_available' then 'الشهادة'
             when 'cover_url' then 'صورة الغلاف'
             when 'presenter_name' then 'اسم المقدّم'
             else f
           end, '، ' order by ord)
    into v_labels
    from unnest(v_changed) with ordinality as t(f, ord);

  -- Only the fields that moved, both sides. Logging the whole row would put a
  -- copy of every course description into `audit_logs` on every typo fix.
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin, 'course_updated', 'course', p_course_id,
          (select jsonb_object_agg(f, v_before_json -> f) from unnest(v_changed) f),
          (select jsonb_object_agg(f, v_after_json -> f) from unnest(v_changed) f));

  -- Only a course that has a trainer, and only when that trainer is not the
  -- person who just made the edit. Telling someone about their own change is
  -- noise, and an administrator who is also the course's trainer is a normal
  -- arrangement on a small team.
  if v_after.trainer_id is not null and v_after.trainer_id <> v_admin then
    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (
      v_after.trainer_id, 'in_app', 'course_updated',
      'حدّثت الإدارة بيانات دورتك',
      format('عدّلت الإدارة دورة «%s». الحقول المعدّلة: %s.', v_after.title, v_labels),
      jsonb_build_object('course_id', p_course_id, 'title', v_after.title,
                         'changed', to_jsonb(v_changed))
    );
  end if;

  return v_after;
end;
$$;

-- --------------------------------------------------------------- offers -----

/**
 * Put a course on offer at half price, or take it back off.
 *
 * An offer is «`compare_at_price is not null`» and nothing else. No boolean
 * column was added, and the reason is that a boolean would be a second place to
 * store the same fact, free to disagree with the first. What is struck through
 * on the card is `compare_at_price`; a row with `is_on_offer = true` and a null
 * `compare_at_price` would claim an offer the page cannot draw, and a row with
 * the reverse would draw one the row denies. The existing CHECK constraint
 * already guarantees that a non-null `compare_at_price` is strictly above
 * `price` — that is to say, a non-null value *is* a live saving, by definition —
 * so the derived flag cannot be wrong. It also means nothing new has to reach
 * the browser: `getCatalog()` and `getCourseDetail()` already return
 * `compareAtPrice`, and the client derives the tag from it.
 *
 * Idempotence follows from the same rule. Enabling reads the state first and
 * returns untouched if an offer is already live, so pressing the button twice
 * halves the price once. Disabling on a course with no offer likewise does
 * nothing rather than clearing a price that was never a comparison.
 *
 * A free course is refused. Halving zero is zero, `compare_at_price > price`
 * would then be false, and the constraint would reject the write with a
 * constraint name for an error message. The same is true just above zero: at
 * 0.01 the halved, rounded price is still 0.01. So the guard is not "price > 0",
 * it is "the halved price is genuinely lower" — checked against the value that
 * is about to be written, so it cannot drift away from the constraint.
 */
create or replace function public.admin_set_course_offer(
  p_course_id uuid,
  p_enabled boolean
)
returns public.courses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_after public.courses%rowtype;
  v_new_price numeric(10, 2);
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- `if null then` takes the else branch, so a missing argument would silently
  -- read as "turn the offer off". Say so instead.
  if p_enabled is null then
    raise exception 'OFFER_STATE_REQUIRED';
  end if;

  select * into v_course from public.courses where id = p_course_id for update;
  if not found then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  if p_enabled then
    -- Already on offer: return it as it stands. This is the whole of the
    -- idempotence guarantee — a second press cannot reach the halving below.
    if v_course.compare_at_price is not null then
      return v_course;
    end if;

    if v_course.price is null or v_course.price <= 0 then
      raise exception 'COURSE_IS_FREE';
    end if;

    v_new_price := round(v_course.price / 2, 2);
    if v_new_price >= v_course.price then
      raise exception 'PRICE_TOO_SMALL';
    end if;

    update public.courses
       set compare_at_price = v_course.price,
           price = v_new_price
     where id = p_course_id
    returning * into v_after;
  else
    -- Not on offer: nothing to restore.
    if v_course.compare_at_price is null then
      return v_course;
    end if;

    update public.courses
       set price = v_course.compare_at_price,
           compare_at_price = null
     where id = p_course_id
    returning * into v_after;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_admin,
          case when p_enabled then 'course_offer_enabled' else 'course_offer_disabled' end,
          'course', p_course_id,
          jsonb_build_object('price', v_course.price, 'compare_at_price', v_course.compare_at_price),
          jsonb_build_object('price', v_after.price, 'compare_at_price', v_after.compare_at_price));

  -- The price of their own course changing is at least as much the trainer's
  -- business as a title correction, so it is announced on the same terms as
  -- admin_update_course(): only if there is a trainer, and never to the
  -- administrator who pressed the button.
  if v_after.trainer_id is not null and v_after.trainer_id <> v_admin then
    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (
      v_after.trainer_id, 'in_app',
      case when p_enabled then 'course_offer_enabled' else 'course_offer_disabled' end,
      case when p_enabled then 'دورتك الآن ضمن عرض خاص' else 'انتهى العرض الخاص على دورتك' end,
      case when p_enabled
           then format('خفّضت الإدارة سعر دورة «%s» إلى النصف ضمن عرض خاص.', v_after.title)
           else format('أعادت الإدارة سعر دورة «%s» إلى قيمته قبل العرض.', v_after.title) end,
      jsonb_build_object('course_id', p_course_id, 'title', v_after.title,
                         'price', v_after.price, 'compare_at_price', v_after.compare_at_price)
    );
  end if;

  return v_after;
end;
$$;

comment on function public.admin_update_course(uuid, jsonb) is
  'Administrative edit of a course. Allow-listed fields only; notifies the trainer with the field names that actually changed.';
comment on function public.admin_set_course_offer(uuid, boolean) is
  'Half-price offer on a course. An offer is compare_at_price is not null; enabling twice halves once.';

revoke all on function public.admin_update_course(uuid, jsonb) from public, anon;
revoke all on function public.admin_set_course_offer(uuid, boolean) from public, anon;

grant execute on function public.admin_update_course(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_course_offer(uuid, boolean) to authenticated;

-- No index for «on offer». Nothing queries it: the catalogue selects published
-- courses and the offer is read off `compare_at_price` on rows already fetched,
-- so an index would be maintained on every write and read by nobody.
