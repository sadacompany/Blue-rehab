import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { AuthenticationRequiredError, settlePayments, verifyPayment, type VerifyResult } from "../lib/platform";

/** Seconds to show the confirmation before moving the payer to their bookings. */
const REDIRECT_AFTER = 4;

/**
 * Where Moyasar returns the payer after a hosted-invoice attempt.
 *
 * The query string is not trusted: it only supplies an identifier, which the
 * server re-reads from Moyasar with the secret key before anything is confirmed.
 *
 * Which identifier arrives depends on how the payer paid — card flows come back
 * with a payment id, Apple Pay with the invoice id — so all the shapes Moyasar
 * uses are accepted. If none is present the page falls back to settling whatever
 * is still open on the account, which also covers a payer who wandered back here
 * without the original query string.
 */
export default function PaymentCallbackPage() {
  const [params] = useSearchParams();
  const paymentId = params.get("id") ?? params.get("payment_id") ?? "";
  const invoiceId = params.get("invoice_id") ?? params.get("invoiceId") ?? "";

  const [state, setState] = useState<"checking" | "done" | "error">("checking");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(REDIRECT_AFTER);

  useEffect(() => {
    const run = async () => {
      if (paymentId || invoiceId) {
        return await verifyPayment(paymentId ? { paymentId } : { invoiceId });
      }
      // No usable identifier — reconcile the account instead of giving up.
      const settled = await settlePayments();
      return {
        status: settled.settled > 0 ? "succeeded" : "unknown",
        persisted: settled.settled > 0,
      } satisfies VerifyResult;
    };

    run()
      .then((value) => { setResult(value); setState("done"); })
      .catch((reason) => {
        if (reason instanceof AuthenticationRequiredError) {
          window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        setError(reason instanceof Error ? reason.message : "تعذر التحقق من عملية الدفع.");
        setState("error");
      });
  }, [paymentId, invoiceId]);

  const succeeded = result?.status === "succeeded";

  // Send the payer back to their bookings once the result is confirmed, rather
  // than leaving them on a dead-end page.
  useEffect(() => {
    if (state !== "done" || !succeeded) return;
    if (countdown <= 0) { window.location.href = "/portal"; return; }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [state, succeeded, countdown]);

  return <PageShell><section className="section"><div className="container payment-result">
    {state === "checking" && <div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ التحقق من عملية الدفع…</p></div>}

    {state === "error" && <div className="catalog-message">
      <XCircle /><strong>تعذر تأكيد الدفع.</strong><p>{error}</p>
      <a className="button button-secondary" href="/portal">فتح حجوزاتي</a>
    </div>}

    {state === "done" && <div className={succeeded ? "booking-success-live" : "catalog-message"}>
      {succeeded ? <CheckCircle2 /> : <AlertCircle />}
      <span>
        <h2>{succeeded ? "تم استلام الدفع" : "لم تكتمل عملية الدفع"}</h2>
        {succeeded
          ? <>
              <p>تم تأكيد حجزك{result?.orderNumber ? <> — رقم الطلب <b dir="ltr">{result.orderNumber}</b></> : null}.</p>
              <p className="payment-redirect-note">سيتم تحويلك إلى حجوزاتك خلال {countdown} ثانية…</p>
            </>
          : <p>لم نتمكن من تأكيد الدفع بعد. إن كان المبلغ قد خُصم فسيظهر الحجز مؤكداً في حسابك خلال لحظات.</p>}
        {result && !result.persisted && succeeded && <p className="payment-test-note">
          تم التحقق من العملية لدى مُيسّر، لكن لم تُحفظ النتيجة بعد.
        </p>}
        <div><a className="button" href="/portal">فتح حجوزاتي الآن</a><a className="button button-secondary" href="/">العودة للرئيسية</a></div>
      </span>
    </div>}
  </div></section></PageShell>;
}
