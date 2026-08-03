import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, LogIn, Phone, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { supabase } from "../lib/supabase";

const normalizeSaudiPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("05")) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5")) return `+966${digits}`;
  return value.trim();
};

export default function AuthPage() {
  const [params] = useSearchParams();
  const returnTo = useMemo(() => {
    const requested = params.get("returnTo");
    return requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/portal";
  }, [params]);
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"phone" | "verify" | "done">("phone");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) setStep("done"); });
  }, []);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const normalized = normalizeSaudiPhone(phone);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized, options: { data: { account_type: "patient" } } });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setPhone(normalized);
    setStep("verify");
    setMessage("أُرسل رمز التحقق إلى رقم الجوال.");
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    window.location.replace(returnTo);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setToken("");
    setStep("phone");
  }

  return <PageShell><section className="auth-page"><div className="container auth-grid"><div className="auth-copy"><span className="eyebrow"><ShieldCheck /> دخول آمن</span><h1>سجّل الدخول برقم الجوال</h1><p>تستخدم المنصة رمز تحقق لمرة واحدة. لا توجد كلمة مرور محفوظة، وتُربط الحجوزات والدورات بحسابك بعد نجاح التحقق.</p><div className="auth-assurance"><ShieldCheck /><span><strong>صلاحيات حسب المستخدم</strong><small>يرسل المتصفح المفتاح العام فقط، بينما تمنع سياسات RLS أي مستخدم من الوصول إلى سجلات مستخدم آخر.</small></span></div></div><div className="auth-card">
    {step === "phone" && <form onSubmit={requestOtp}><Phone /><h2>رقم الجوال</h2><p>أدخل رقمًا سعوديًا بصيغة 05xxxxxxxx.</p><label><span>رقم الجوال</span><input dir="ltr" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" /></label><button className="button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <LogIn />} إرسال رمز التحقق</button></form>}
    {step === "verify" && <form onSubmit={verifyOtp}><Phone /><h2>تحقق من الرمز</h2><p>أدخل الرمز المرسل إلى <b dir="ltr">{phone}</b>.</p><label><span>رمز التحقق</span><input dir="ltr" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="button" disabled={busy || token.length !== 6}>{busy ? <LoaderCircle className="spin" /> : <CheckCircle2 />} تأكيد الدخول</button><button className="text-button" type="button" onClick={() => setStep("phone")}>تغيير الرقم</button></form>}
    {step === "done" && <div className="auth-success"><CheckCircle2 /><h2>أنت مسجل الدخول</h2><p>يمكنك متابعة الإجراء المطلوب أو فتح لوحة حسابك.</p><a className="button" href={returnTo}>متابعة</a><button className="button button-secondary" type="button" onClick={() => void signOut()}>تسجيل الخروج</button></div>}
    {message && <div className="auth-message" role="status">{message}</div>}
  </div></div></section></PageShell>;
}
