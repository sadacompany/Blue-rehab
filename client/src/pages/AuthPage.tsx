import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, LogIn, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { MOCK_OTP_CODE, isMockAuth, normalizeSaudiPhone, signOut, startPhoneSignIn, verifyPhoneSignIn } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function AuthPage() {
  const [params] = useSearchParams();
  const returnTo = useMemo(() => {
    const requested = params.get("returnTo");
    return requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/portal";
  }, [params]);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"phone" | "verify" | "done">("phone");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const mock = isMockAuth();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) setStep("done"); });
  }, []);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await startPhoneSignIn(phone, fullName);
      setPhone(normalizeSaudiPhone(phone));
      setStep("verify");
      if (result.code) {
        setIssuedCode(result.code);
        setToken(result.code);
        setMessage("");
      } else {
        setMessage("أُرسل رمز التحقق إلى رقم الجوال.");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر إرسال الرمز.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await verifyPhoneSignIn(phone, token, fullName);
      window.location.replace(returnTo);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر التحقق من الرمز.");
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setToken("");
    setIssuedCode("");
    setStep("phone");
  }

  return <PageShell><section className="auth-page"><div className="container auth-grid">
    <div className="auth-copy">
      <span className="eyebrow"><ShieldCheck /> دخول آمن</span>
      <h1>سجّل الدخول برقم الجوال</h1>
      <p>تستخدم المنصة رمز تحقق لمرة واحدة. لا توجد كلمة مرور محفوظة، وتُربط الحجوزات والدورات بحسابك بعد نجاح التحقق.</p>
      <div className="auth-assurance"><ShieldCheck /><span><strong>صلاحيات حسب المستخدم</strong><small>لا يصل أي مستخدم إلى سجلات غيره: ملفك وحجوزاتك ودوراتك مرتبطة بحسابك وحده.</small></span></div>
      {mock && <div className="auth-assurance auth-mock-note"><Sparkles /><span><strong>وضع تجريبي للتحقق</strong><small>لم تُربط بوابة الرسائل النصية بعد، لذلك الرمز ثابت ويظهر أمامك لتجربة المسار كاملاً. يُستبدل برمز حقيقي عند تفعيل مزود الرسائل.</small></span></div>}
    </div>

    <div className="auth-card">
      {step === "phone" && <form onSubmit={requestOtp}>
        <Phone /><h2>رقم الجوال</h2><p>{mock ? "أدخل رقمًا سعوديًا بصيغة 05xxxxxxxx." : "سنرسل لك رمز تحقق برسالة نصية. أدخل رقمًا سعوديًا بصيغة 05xxxxxxxx."}</p>
        <label><span>رقم الجوال</span><input dir="ltr" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" /></label>
        <label><span>الاسم الكامل <small>(للحسابات الجديدة)</small></span><input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="اكتب اسمك" /></label>
        <button className="button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <LogIn />} إرسال رمز التحقق</button>
      </form>}

      {step === "verify" && <form onSubmit={submitOtp}>
        <Phone /><h2>تحقق من الرمز</h2>
        <p>{mock ? <>الوضع التجريبي فعّال — استخدم الرمز الظاهر أدناه للرقم <b dir="ltr">{phone}</b>.</> : <>أدخل الرمز المرسل برسالة نصية إلى <b dir="ltr">{phone}</b>. قد يستغرق وصوله بضع ثوانٍ.</>}</p>
        {mock && issuedCode && <div className="otp-mock-panel" role="status">
          <span>رمز التحقق التجريبي</span>
          <strong dir="ltr">{issuedCode}</strong>
          <button type="button" className="text-button" onClick={() => void navigator.clipboard?.writeText(issuedCode)}><Copy /> نسخ الرمز</button>
        </div>}
        <label><span>رمز التحقق</span><input dir="ltr" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
        <button className="button" disabled={busy || token.length !== 6}>{busy ? <LoaderCircle className="spin" /> : <CheckCircle2 />} تأكيد الدخول</button>
        <button className="text-button" type="button" onClick={() => { setStep("phone"); setIssuedCode(""); setToken(""); }}>تغيير الرقم</button>
      </form>}

      {step === "done" && <div className="auth-success">
        <CheckCircle2 /><h2>أنت مسجل الدخول</h2><p>يمكنك متابعة الإجراء المطلوب أو فتح لوحة حسابك.</p>
        <Link className="button" to={returnTo}>متابعة</Link>
        <button className="button button-secondary" type="button" onClick={() => void handleSignOut()}>تسجيل الخروج</button>
      </div>}

      {message && <div className="auth-message" role="status">{message}</div>}
    </div>
  </div></section></PageShell>;
}

export { MOCK_OTP_CODE };
