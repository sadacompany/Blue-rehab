import type { Course, DeliveryMode } from "./catalog-types";

export const formatCurrency = (value: number) =>
  `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(value)} ر.س`;

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

export const deliveryLabel = (mode: DeliveryMode) =>
  mode === "remote" ? "عن بُعد" : "في المركز";

export const courseModeLabel = (mode: Course["mode"]) =>
  ({
    onsite: "حضوري",
    remote: "عن بُعد",
    recorded: "مسجل",
    hybrid: "هجين",
  })[mode];

