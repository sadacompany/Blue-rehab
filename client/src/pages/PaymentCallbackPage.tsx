import { useEffect, useState } from "react";
import { AlertCircle, BookOpenCheck, CalendarDays, CalendarPlus, CheckCircle2, LoaderCircle, MessageCircle, Video, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { deliveryLabel, formatCurrency, formatDateTime } from "../lib/format";
import { downloadIcs, whatsappShareUrl, type SessionInvite } from "../lib/invites";
import { AuthenticationRequiredError, settlePayments, verifyPayment, type VerifyResult } from "../lib/platform";

/** Seconds on the confirmation before the payer is moved on automatically. */
const REDIRECT_AFTER = 6;

/**
 * Where Moyasar returns the payer after a hosted-invoice attempt.
 *
 * The query string is not trusted: it only supplies an identifier, which the
 * server re-reads from Moyasar with the secret key before anything is confirmed.
 *
 * Which identifier arrives depends on how the payer paid — card flows come back
 * with a payment id, Apple Pay with the invoice id — so every shape Moyasar uses
 * is accepted. If none is present the page falls back to settling whatever is
 * still open on the account, which also covers a payer who wandered back here
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
  const isCourse = result?.kind === "course";
  /** Bookings belong in the portal; a paid course opens where the content is. */
  const destination = isCourse && result?.slug ? `/courses/${result.slug}` : "/portal";
  const destinationLabel = isCourse ? "الانتقال إلى الدورة" : "عرض حجوزاتي";

  useEffect(() => {
    if (state !== "done" || !succeeded) return;
    if (countdown <= 0) { window.location.href = destination; return; }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [state, succeeded, countdown, destination]);

  return <PageShell><section className="section"><div className="container payment-result">
    {state === "checking" && <div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ التحقق من عملية الدفع…</p></div>}

    {state === "error" && <div className="catalog-message">
      <XCircle /><strong>تعذر تأكيد الدفع.</strong><p>{error}</p>
      <p>إن كان المبلغ قد خُصم من حسابك فلا داعي للدفع مرة أخرى — افتح حسابك وسيظهر الطلب مؤكداً خلال لحظات.</p>
      <a className="button" href="/portal">فتح حسابي</a>
    </div>}

    {state === "done" && succeeded && <div className="payment-success">
      <span className="payment-success-mark"><CheckCircle2 /></span>
      <h1>{isCourse ? "تم تأكيد تسجيلك في الدورة" : "تم تأكيد حجزك"}</h1>
      <p className="payment-success-lead">
        {isCourse
          ? "استلمنا الدفع وفُعِّل تسجيلك. يمكنك الآن متابعة محتوى الدورة من حسابك."
          : "استلمنا الدفع وحُجز موعدك. ستجد تفاصيل الجلسة في حسابك، وسنذكّرك قبل الموعد."}
      </p>

      <dl className="payment-receipt">
        {result?.title && <div><dt>{isCourse ? "الدورة" : "الخدمة"}</dt><dd>{result.title}</dd></div>}
        {result?.startsAt && <div><dt>الموعد</dt><dd>{formatDateTime(result.startsAt)}</dd></div>}
        {result?.mode && <div><dt>طريقة الجلسة</dt><dd>{deliveryLabel(result.mode)}</dd></div>}
        {typeof result?.amount === "number" && <div><dt>المبلغ المدفوع</dt><dd>{formatCurrency(result.amount)}</dd></div>}
        {result?.orderNumber && <div><dt>رقم الطلب</dt><dd dir="ltr">{result.orderNumber}</dd></div>}
      </dl>

      {!isCourse && result?.startsAt && <div className="booking-invite-actions">
        <a className="button button-secondary" target="_blank" rel="noreferrer" href={whatsappShareUrl({
          bookingId: result.bookingId ?? "", startsAt: result.startsAt, endsAt: null,
          serviceName: result.title ?? "جلسة علاج طبيعي",
          specialistName: result.specialistName ?? "المختص",
          meetingUrl: result.meetingUrl ?? null,
          isRemote: result.mode === "remote", branchName: null,
        } satisfies SessionInvite)}><MessageCircle /> إرسال التفاصيل عبر واتساب</a>
        <button type="button" className="button button-secondary" onClick={() => downloadIcs({
          bookingId: result.bookingId ?? "", startsAt: result.startsAt!, endsAt: null,
          serviceName: result.title ?? "جلسة علاج طبيعي",
          specialistName: result.specialistName ?? "المختص",
          meetingUrl: result.meetingUrl ?? null,
          isRemote: result.mode === "remote", branchName: null,
        } satisfies SessionInvite)}><CalendarPlus /> إضافة إلى التقويم</button>
      </div>}

      {result?.meetingUrl && <p className="booking-meet-link">
        <Video /> رابط الجلسة: <a href={result.meetingUrl} target="_blank" rel="noreferrer" dir="ltr">{result.meetingUrl}</a>
      </p>}

      <div className="payment-success-actions">
        <a className="button" href={destination}>{isCourse ? <BookOpenCheck /> : <CalendarDays />} {destinationLabel}</a>
        <a className="button button-secondary" href="/">العودة للرئيسية</a>
      </div>
      <p className="payment-redirect-note">سيتم تحويلك تلقائياً خلال {countdown} ثانية…</p>
    </div>}

    {state === "done" && result?.status === "slot_taken" && <div className="catalog-message">
      <AlertCircle /><strong>تعذر تأكيد الموعد — وأُعيد المبلغ إليك.</strong>
      <p>حُجز هذا الموعد قبل اكتمال دفعك مباشرة. أُعيد المبلغ بالكامل إلى وسيلة الدفع نفسها، وقد يستغرق ظهوره أياماً حسب مصرفك.</p>
      <div><a className="button" href="/booking">اختيار موعد آخر</a><a className="button button-secondary" href="/portal">حسابي</a></div>
    </div>}

    {state === "done" && !succeeded && result?.status !== "slot_taken" && <div className="catalog-message">
      <AlertCircle /><strong>لم تكتمل عملية الدفع.</strong>
      <p>لم يُخصم أي مبلغ ولم يُحجز أي موعد. يمكنك إعادة المحاولة.</p>
      <div><a className="button" href="/booking">إعادة المحاولة</a><a className="button button-secondary" href="/portal">حسابي</a></div>
    </div>}
  </div></section></PageShell>;
}
