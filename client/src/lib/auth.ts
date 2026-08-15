import { supabase } from "./supabase";

/**
 * Phone sign-in.
 *
 * Two modes:
 *
 * - **sms** — the real thing: Supabase sends a one-time code over an SMS
 *   provider (Twilio/MessageBird), which is a paid integration.
 * - **mock** — the interim experience while no SMS provider is configured. The
 *   code is a fixed, on-screen value so the whole journey (login → booking →
 *   payment) can be walked end to end at zero cost.
 *
 * The mock still produces a **real Supabase session**, because every RLS policy
 * in the database keys off `auth.uid()`. It does that by mapping a phone number
 * onto a deterministic credential pair behind the scenes.
 *
 * ⚠️ The mock is NOT a security boundary: anyone who knows a phone number can
 * sign in as that user. It exists for pre-launch demos and must be switched off
 * (VITE_AUTH_MODE=sms) before real patient data enters the platform.
 */

/**
 * Defaults to `sms`, not `mock`.
 *
 * netlify.toml does not set VITE_AUTH_MODE, so with a `mock` default a
 * production build shipped mock authentication whenever the variable was
 * missing from the host — anyone who knew a phone number could sign in as that
 * person. A missing setting now fails closed: real OTP, or nothing.
 */
export const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE ?? "sms") as "mock" | "sms";
export const MOCK_OTP_CODE = (import.meta.env.VITE_MOCK_OTP_CODE ?? "123456").trim();
export const isMockAuth = () => AUTH_MODE === "mock";

/** Domain for the synthetic addresses that back mock phone accounts. */
const MOCK_EMAIL_DOMAIN = "otp.blue-rehab.local";
const MOCK_SECRET = import.meta.env.VITE_MOCK_OTP_SECRET ?? "blue-rehab-demo";

export function normalizeSaudiPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("05")) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5")) return `+966${digits}`;
  return value.trim();
}

function mockCredentials(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return {
    email: `p${digits}@${MOCK_EMAIL_DOMAIN}`,
    // Long enough for Supabase's minimum, deterministic so the same phone always
    // returns to the same account.
    password: `Br!${MOCK_SECRET}#${digits}`,
  };
}

export type StartResult = { mode: "mock" | "sms"; code?: string };

/** Step 1 — ask for a code. In mock mode nothing is sent; the code is returned. */
export async function startPhoneSignIn(rawPhone: string, fullName?: string): Promise<StartResult> {
  const phone = normalizeSaudiPhone(rawPhone);
  if (isMockAuth()) return { mode: "mock", code: MOCK_OTP_CODE };

  // The name travels as signup metadata, which is where `handle_new_user` reads
  // it. Sending it only at verify time would be too late — the profile row is
  // created by a trigger the moment the auth user appears, and a first-time
  // caller would be stored as "مستخدم بلو" for good.
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { data: { account_type: "patient", ...(fullName?.trim() ? { full_name: fullName.trim() } : {}) } },
  });
  if (error) throw new Error(translateAuthError(error.message));
  return { mode: "sms" };
}

/** Supabase surfaces these in English; patients should not see that. */
function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    "Signups not allowed for otp": "هذا الرقم غير مسجل. تأكد من الرقم أو تواصل مع الدعم.",
    "Invalid phone": "رقم الجوال غير صحيح.",
    "Phone logins are disabled": "الدخول برقم الجوال غير مفعّل حالياً.",
    "sms send failed": "تعذر إرسال الرسالة. حاول مرة أخرى بعد قليل.",
    "over_sms_send_rate_limit": "طلبت رمزاً قبل قليل. انتظر دقيقة ثم أعد المحاولة.",
    "Token has expired or is invalid": "الرمز غير صحيح أو انتهت صلاحيته.",
    "otp_expired": "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
  };
  const hit = Object.keys(map).find((key) => message.toLowerCase().includes(key.toLowerCase()));
  return hit ? map[hit] : message;
}

/** Step 2 — verify the code and open a session. */
export async function verifyPhoneSignIn(rawPhone: string, token: string, fullName?: string) {
  const phone = normalizeSaudiPhone(rawPhone);

  if (!isMockAuth()) {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    if (error) throw new Error(error.message);
    return;
  }

  if (token.trim() !== MOCK_OTP_CODE) throw new Error("رمز التحقق غير صحيح.");

  const { email, password } = mockCredentials(phone);
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error) return;

  // First time this phone is used — create the account, then sign in.
  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName?.trim() || "مستخدم بلو", phone, account_type: "patient" } },
  });
  if (signUp.error) throw new Error(signUp.error.message);

  if (!signUp.data.session) {
    const retry = await supabase.auth.signInWithPassword({ email, password });
    if (retry.error) {
      throw new Error(
        "تعذّر إنشاء الجلسة. تأكد من تعطيل تأكيد البريد الإلكتروني في إعدادات Supabase للوضع التجريبي.",
      );
    }
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}
