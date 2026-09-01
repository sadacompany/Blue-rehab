import { supabase } from "./supabase";

/**
 * Discount codes, marketer codes, and the promotion links behind them.
 *
 * This file is a thin layer over the functions in
 * `supabase/migrations/20260901100000_promotion_codes.sql` and it is thin on
 * purpose: nothing here decides what a code is worth, whether it is live, or
 * whether the person holding it may use it. Those are all server answers. What
 * the browser owns is the wording of the refusal and the shape of the link.
 *
 * It imports the plain `supabase` client rather than `typedSupabase` for the
 * reason set out in supabase.ts — every call here is an `.rpc()`, and the
 * generated types do not carry nullability for function arguments, so typing
 * this file would mean fighting the generator over arguments that are
 * legitimately optional. Regenerate `database.types.ts` after applying the
 * migration and the tables become typed for anything that reads them directly.
 */

export type PromoKind = "discount" | "marketer";

/** The five states `promo_code_state()` derives. Never stored, never guessed here. */
export type PromoStatus = "active" | "scheduled" | "paused" | "expired" | "exhausted";

export type PromoCode = {
  id: string;
  code: string;
  kind: PromoKind;
  discountPercent: number;
  marketerName: string | null;
  usageLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isPaused: boolean;
  internalNote: string | null;
  createdAt: string;
  /** Settled sales, not attempts — an abandoned checkout is not counted. */
  uses: number;
  /** Distinct arrivals on the promotion link. */
  visits: number;
  grossTotal: number;
  discountTotal: number;
  /** What actually reached the account after the discount. */
  netTotal: number;
  lastUsedAt: string | null;
  status: PromoStatus;
};

export type PromoRedemption = {
  id: string;
  orderNumber: string | null;
  kind: "booking" | "enrollment";
  userName: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  redeemedAt: string;
};

export const PROMO_STATUS_LABEL: Record<PromoStatus, string> = {
  active: "نشط",
  scheduled: "مجدول",
  paused: "متوقف",
  expired: "منتهي",
  exhausted: "مكتمل الاستخدام",
};

/**
 * Why a code was refused, in words the person reading them can act on.
 *
 * The database raises five distinct errors rather than one because the five
 * situations ask for five different things — wait, come back later, stop
 * trying, check the spelling, or use a different code. Collapsing them into
 * «الكود غير صالح» would be less work here and worse for everyone using it.
 */
const PROMO_ERRORS: Record<string, string> = {
  PROMO_NOT_FOUND: "لا يوجد كود بهذا الاسم. تأكد من كتابته كما وصلك.",
  PROMO_PAUSED: "هذا الكود متوقف مؤقتاً.",
  PROMO_EXPIRED: "انتهت صلاحية هذا الكود.",
  PROMO_SCHEDULED: "لم يبدأ العمل بهذا الكود بعد.",
  PROMO_EXHAUSTED: "اكتمل عدد مرات استخدام هذا الكود.",
  PROMO_ALREADY_USED: "سبق أن استخدمت هذا الكود.",
  PROMO_ON_FREE_COURSE: "هذه الدورة مجانية أصلاً، ولا حاجة لكود خصم.",
  PROMO_COVERS_WHOLE_SESSION: "هذا الكود يغطي قيمة الجلسة بالكامل ولا يمكن إتمام الحجز به. تواصل معنا.",
  DISCOUNTS_DO_NOT_STACK: "لا يمكن الجمع بين خصم العضوية وكود الخصم. اختر واحداً منهما.",

  // Administrative — raised by the create/update functions.
  FORBIDDEN: "هذه العملية تتطلب صلاحية إدارية.",
  CODE_INVALID: "الكود يجب أن يكون من ٣ إلى ٣٢ خانة، حروفاً إنجليزية وأرقاماً بلا مسافات.",
  CODE_TAKEN: "هذا الكود مستخدم بالفعل.",
  CODE_NOT_FOUND: "لم نجد هذا الكود.",
  KIND_INVALID: "نوع الكود غير صالح.",
  MARKETER_NAME_REQUIRED: "اسم المسوّق مطلوب لكود المسوّق.",
  DISCOUNT_REQUIRED: "كود الخصم يجب أن يحمل نسبة خصم أكبر من صفر.",
  DISCOUNT_INVALID: "نسبة الخصم يجب أن تكون بين ٠ و١٠٠.",
  USAGE_LIMIT_INVALID: "حد الاستخدام يجب أن يكون أكبر من صفر، أو يُترك فارغاً.",
  USAGE_LIMIT_BELOW_USED: "لا يمكن خفض حد الاستخدام إلى أقل مما استُخدم فعلاً.",
  WINDOW_INVALID: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.",
  ENDS_IN_PAST: "تاريخ الانتهاء في الماضي.",
};

export function translatePromoError(message: string): string {
  const code = Object.keys(PROMO_ERRORS).find((key) => message.includes(key));
  return code ? PROMO_ERRORS[code] : message;
}

function fail(message: string): never {
  throw new Error(translatePromoError(message));
}

const num = (value: unknown): number => Number(value ?? 0);

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped from the plain client; each is mapped field by field immediately below. */

export async function loadPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await supabase.rpc("admin_promo_codes");
  if (error) fail(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind as PromoKind,
    discountPercent: num(row.discount_percent),
    marketerName: row.marketer_name ?? null,
    usageLimit: row.usage_limit === null || row.usage_limit === undefined ? null : Number(row.usage_limit),
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    isPaused: Boolean(row.is_paused),
    internalNote: row.internal_note ?? null,
    createdAt: row.created_at,
    uses: num(row.uses),
    visits: num(row.visits),
    grossTotal: num(row.gross_total),
    discountTotal: num(row.discount_total),
    netTotal: num(row.net_total),
    lastUsedAt: row.last_used_at ?? null,
    status: row.status as PromoStatus,
  }));
}

export async function loadPromoRedemptions(promoCodeId: string): Promise<PromoRedemption[]> {
  const { data, error } = await supabase.rpc("admin_promo_code_redemptions", { p_id: promoCodeId });
  if (error) fail(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    orderNumber: row.order_number ?? null,
    kind: row.kind,
    userName: row.user_name ?? "—",
    grossAmount: num(row.gross_amount),
    discountAmount: num(row.discount_amount),
    netAmount: num(row.net_amount),
    redeemedAt: row.redeemed_at,
  }));
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export type NewPromoCode = {
  code: string;
  kind: PromoKind;
  discountPercent: number;
  marketerName?: string | null;
  usageLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  internalNote?: string | null;
};

export async function createPromoCode(input: NewPromoCode): Promise<void> {
  const { error } = await supabase.rpc("admin_create_promo_code", {
    p_code: input.code,
    p_kind: input.kind,
    p_discount_percent: input.discountPercent,
    // Every argument, every time, and `null` rather than `undefined` for the
    // absent ones: `JSON.stringify` drops `undefined` keys, and omitting a
    // defaulted argument resolves for some signatures and fails with PGRST202
    // for others. The evidence is written up in lib/registration.ts.
    p_marketer_name: input.marketerName || null,
    p_usage_limit: input.usageLimit ?? null,
    p_starts_at: input.startsAt || null,
    p_ends_at: input.endsAt || null,
    p_internal_note: input.internalNote || null,
  });
  if (error) fail(error.message);
}

/**
 * Edit a code.
 *
 * `clear` is what makes "unlimited" and "no end date" sayable at all: every
 * argument on the server defaults to null and null means "leave alone", so
 * blanking a field needs to be named rather than sent as an absence.
 */
export type PromoCodePatch = {
  discountPercent?: number;
  marketerName?: string;
  usageLimit?: number;
  startsAt?: string;
  endsAt?: string;
  internalNote?: string;
  isPaused?: boolean;
  clear?: Array<"usage_limit" | "starts_at" | "ends_at" | "internal_note">;
};

export async function updatePromoCode(id: string, patch: PromoCodePatch): Promise<void> {
  const { error } = await supabase.rpc("admin_update_promo_code", {
    p_id: id,
    // Explicit nulls, never omissions — see createPromoCode() above. Null also
    // carries the server's own meaning of "leave this field alone", so the two
    // agree: an argument the caller did not set changes nothing.
    p_discount_percent: patch.discountPercent ?? null,
    p_marketer_name: patch.marketerName || null,
    p_usage_limit: patch.usageLimit ?? null,
    p_starts_at: patch.startsAt || null,
    p_ends_at: patch.endsAt || null,
    p_internal_note: patch.internalNote || null,
    p_is_paused: patch.isPaused ?? null,
    p_clear: patch.clear ?? [],
  });
  if (error) fail(error.message);
}

// ------------------------------------------------------------ the link --

/**
 * The promotion URL for a code.
 *
 * `?ref=CODE` on any page rather than a dedicated `/promo/CODE` route, so a
 * campaign can point at whatever it is actually promoting — a course, the
 * specialist directory, the landing page — and still be attributed. `path`
 * defaults to the site root because that is what most campaigns want.
 */
export function promotionUrl(code: string, path = "/"): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = new URL(path, origin || "https://bluerehab.sa");
  url.searchParams.set("ref", code);
  return url.toString();
}

const REF_STORAGE_KEY = "blue-rehab.promo-ref";
const VISITOR_STORAGE_KEY = "blue-rehab.visitor-key";

/**
 * A stable random identifier for this browser.
 *
 * Its only job is to stop one person refreshing a promotion link twenty times
 * from reading as twenty people. It is generated locally, never derived from
 * anything about the device or the person, and is meaningless outside the
 * visit counter — which is why it does not appear in the personal-data
 * inventory on the privacy page.
 */
function visitorKey(): string | null {
  try {
    const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(VISITOR_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing with storage denied. The visit goes uncounted, which is
    // the correct outcome — the alternative is counting every page view as new.
    return null;
  }
}

/** The code this visitor arrived with, if any, for prefilling checkout. */
export function storedPromoCode(): string {
  try {
    return sessionStorage.getItem(REF_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function forgetPromoCode(): void {
  try { sessionStorage.removeItem(REF_STORAGE_KEY); } catch { /* nothing to clear */ }
}

/**
 * Notice `?ref=CODE` in the address bar: remember it for checkout, and count
 * the arrival.
 *
 * Deliberately silent about whether the code is real. The counter answers
 * nothing (see `record_promo_visit`), and a landing page that announced «كود
 * غير صالح» to every mistyped link would be both noise and a way to test codes
 * without ever reaching a checkout. A wrong code is discovered where it is
 * applied, against a real order.
 *
 * Stored in `sessionStorage`, not `localStorage`: a campaign should follow the
 * visit it arrived on, not haunt the browser for a month.
 */
export function capturePromoRef(search: string): void {
  const code = new URLSearchParams(search).get("ref");
  if (!code) return;

  const normalised = code.trim().toUpperCase().slice(0, 32);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalised)) return;

  try { sessionStorage.setItem(REF_STORAGE_KEY, normalised); } catch { /* prefill only */ }

  const key = visitorKey();
  if (!key) return;
  // Best effort by design: a failed count must never interrupt a page load.
  void supabase.rpc("record_promo_visit", { p_code: normalised, p_visitor_key: key })
    .then(() => undefined, () => undefined);
}
