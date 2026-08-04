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

export const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE ?? "mock") as "mock" | "sms";
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
export async function startPhoneSignIn(rawPhone: string): Promise<StartResult> {
  const phone = normalizeSaudiPhone(rawPhone);
  if (isMockAuth()) return { mode: "mock", code: MOCK_OTP_CODE };

  const { error } = await supabase.auth.signInWithOtp({ phone, options: { data: { account_type: "patient" } } });
  if (error) throw new Error(error.message);
  return { mode: "sms" };
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
