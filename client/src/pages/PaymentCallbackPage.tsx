import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { AuthenticationRequiredError, verifyPayment, type VerifyResult } from "../lib/platform";

/**
 * Where Moyasar returns the payer after a hosted-invoice attempt.
 *
 * The query string is not trusted: it only supplies the payment id, which the
 * server re-reads from Moyasar with the secret key before anything is confirmed.
 */
export default function PaymentCallbackPage() {
  const [params] = useSearchParams();
  const paymentId = params.get("id") ?? params.get("payment_id") ?? "";
  const [state, setState] = useState<"checking" | "done" | "error">("checking");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!paymentId) {
      setError("لا يوجد معرف عملية دفع في الرابط.");
      setState("error");
      return;
    }
    verifyPayment(paymentId)
      .then((value) => { setResult(value); setState("done"); })
      .catch((reason) => {
        if (reason instanceof AuthenticationRequiredError) {
          window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        setError(reason instanceof Error ? reason.message : "تعذر التحقق من عملية الدفع.");
        setState("error");
      });
  }, [paymentId]);

  const succeeded = result?.status === "succeeded";

  return <PageShell><section className="section"><div className="container payment-result">
    {state === "checking" && <div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ التحقق من عملية الدفع…</p></div>}

    {state === "error" && <div className="catalog-message">
      <XCircle /><strong>تعذر تأكيد الدفع.</strong><p>{error}</p>
      <a className="button button-secondary" href="/portal">فتح حسابي</a>
    </div>}

    {state === "done" && <div className={succeeded ? "booking-success-live" : "catalog-message"}>
      {succeeded ? <CheckCircle2 /> : <AlertCircle />}
      <span>
        <h2>{succeeded ? "تم استلام الدفع" : "لم تكتمل عملية الدفع"}</h2>
        {succeeded
          ? <p>تم تأكيد حجزك{result?.orderNumber ? <> — رقم الطلب <b dir="ltr">{result.orderNumber}</b></> : null}.</p>
          : <p>حالة العملية: {result?.status ?? "غير معروفة"}. يمكنك إعادة المحاولة من لوحة حسابك.</p>}
        {result && !result.persisted && <p className="payment-test-note">
          تم التحقق من العملية لدى مُيسّر، لكن لم تُحفظ النتيجة بعد (مفتاح الخدمة غير مهيأ على الخادم).
        </p>}
        <div><a className="button" href="/portal">فتح حسابي</a><a className="button button-secondary" href="/">العودة للرئيسية</a></div>
      </span>
    </div>}
  </div></section></PageShell>;
}
