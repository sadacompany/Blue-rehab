import type { Course, DeliveryMode } from "./catalog-types";

export const formatCurrency = (value: number) =>
  `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(value)} ر.س`;

/**
 * Money, exactly as stored. Never rounded.
 *
 * `formatCurrency` above sets `maximumFractionDigits: 0`, which is right for a
 * price on a card — «٣٠٠ ر.س» reads better than «٣٠٠٫٠٠ ر.س» — and wrong for
 * anything that is a record of a transaction. It rounds: 0.99 renders as ١,
 * 1.5 as ٢, and 99.50 as ١٠٠. On a refund button that is not a cosmetic
 * difference, it is a figure that disagrees with what was actually taken.
 *
 * So every screen that shows what somebody paid, was refunded, or is about to
 * be refunded uses this instead: two decimal places always, and Latin digits.
 * The digits are deliberate — an amount being checked against a bank statement
 * or a Moyasar dashboard should be readable in the same numerals those use,
 * and «100.00» cannot be misread the way «١٠٠» beside «١٫٠٠» can.
 */
export const formatMoney = (value: number) =>
  `${new Intl.NumberFormat("ar-SA-u-nu-latn", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)} ر.س`;

/**
 * A price a visitor decides by — a course, a programme — rather than a figure
 * on a receipt or an admin table. "٠ ر.س" reads as a broken field; a course
 * that is genuinely free should say so.
 */
export const formatPrice = (value: number) => (value <= 0 ? "مجاني" : formatCurrency(value));

export const formatDate = (value: string | null) => {
  if (!value) return "يحدد عند اعتماد الجدول";
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

/** "الخميس، ٦ أغسطس" — heading for a day's group of appointment times. */
export const formatDayLabel = (value: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));

/** "٩:٠٠ ص" — the time alone, once the day is already established. */
export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

/**
 * A counted noun in Arabic changes shape with the number, and the dashboards
 * were reading «3 طلب انضمام» and «3 دورة منشورة» — the count is right and the
 * sentence is wrong, which in an Arabic-first product reads as carelessness.
 *
 *   1        مفرد            طلب
 *   2        مثنى            طلبان
 *   3–10     جمع             ٣ طلبات
 *   0, 11+   مفرد منصوب      ١١ طلباً   ·   ٠ طلبات
 *
 * `forms` is [مفرد, مثنى, جمع, مفرد منصوب]. Zero takes the plural, which is how
 * an empty count is normally read aloud.
 */
export type CountForms = [one: string, two: string, few: string, many: string];

export const arabicNumber = (value: number) => new Intl.NumberFormat("ar-SA").format(value);

export function countLabel(value: number, forms: CountForms): string {
  const [one, two, few, many] = forms;
  if (value === 1) return one;
  if (value === 2) return two;
  const n = arabicNumber(value);
  if (value === 0) return `${n} ${few}`;
  return value % 100 >= 3 && value % 100 <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

export const deliveryLabel = (mode: DeliveryMode) =>
  mode === "remote" ? "عن بُعد" : "في المركز";

/**
 * Arabic label for a `bookings.status` value.
 *
 * Was three separate copies of the same object — AdminDashboard's
 * `BOOKING_STATUS` and SpecialistDashboard's `STATUS_LABELS` were byte-for-byte
 * identical, so a status-copy change meant remembering to edit both in lockstep.
 * Merged here.
 *
 * ConnectedPortal's own `statusLabel` looked like a third copy but is not one:
 * it mixes in enrollment/payment states (`active`, `paid`, `failed` with the
 * Arabic "متعذر" rather than "فشل") that do not belong to `bookings.status` at
 * all. Folding it into this one would either drop those cases or relabel a real
 * booking status underneath it, so it stays separate on purpose.
 */
const BOOKING_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة", pending_payment: "بانتظار الدفع", confirmed: "مؤكد",
  rescheduled: "أُعيد جدولته", cancelled: "ملغي", completed: "مكتمل",
  no_show: "لم يحضر", refunded: "مسترد",
};
export const bookingStatusLabel = (status: string) => BOOKING_STATUS_LABELS[status] ?? status;

/**
 * Is this course on a special offer?
 *
 * There is no `is_on_offer` column, and that is on purpose — see the comment on
 * `admin_set_course_offer` in 20260820120000. An offer *is* a former price
 * standing above the current one, so the flag is read off the two figures the
 * page is about to draw and cannot disagree with them. The `> price` half is
 * belt and braces: the database CHECK already refuses anything else, but a
 * preview payload does not go through the database.
 */
export const isOnOffer = (course: Pick<Course, "price" | "compareAtPrice">) =>
  course.compareAtPrice !== null && course.compareAtPrice > course.price;

export const courseModeLabel = (mode: Course["mode"]) =>
  ({
    onsite: "حضوري",
    remote: "عن بُعد",
    recorded: "مسجل",
    hybrid: "هجين",
  })[mode];

