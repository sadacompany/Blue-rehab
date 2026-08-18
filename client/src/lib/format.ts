import type { Course, DeliveryMode } from "./catalog-types";

export const formatCurrency = (value: number) =>
  `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(value)} ر.س`;

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

export const courseModeLabel = (mode: Course["mode"]) =>
  ({
    onsite: "حضوري",
    remote: "عن بُعد",
    recorded: "مسجل",
    hybrid: "هجين",
  })[mode];

