import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, Check, CheckCircle2, Copy, CreditCard, HeartPulse, LoaderCircle, MapPin, MessageCircle, RefreshCcw, ShieldCheck, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogResponse, DeliveryMode } from "../lib/catalog-types";
import { deliveryLabel, formatCurrency, formatDateTime, formatDayLabel, formatTime } from "../lib/format";
import { downloadIcs, whatsappShareUrl, type SessionInvite } from "../lib/invites";
import { AuthenticationRequiredError, createBooking, loadCatalog, loadPaymentConfig, startCheckout, type BookingResult, type PaymentConfig } from "../lib/platform";
import DemoBadge from "./DemoBadge";

type Details = { region: string; complaint: string; onset: string; pain: number; previousSurgery: string; goal: string };

/**
 * Booking is gated on sign-in, and signing in is a full page navigation, so all
 * wizard state used to be destroyed on the way to /login — the patient came back
 * to an empty form and had to describe their condition a second time. The draft
 * is parked in sessionStorage so they return to the review step ready to submit.
 *
 * sessionStorage, not localStorage: it dies with the tab, which is the right
 * lifetime for a half-written health complaint.
 */
const DRAFT_KEY = "blue-rehab:booking-draft";

type BookingDraft = {
  step: number;
  serviceId: string;
  mode: DeliveryMode;
  specialistId: string;
  slotId: string;
  details: Details;
  accepted: boolean;
};

function readDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as BookingDraft) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
}

export default function BookingFlowConnected({ initialService, initialSpecialist }: { initialService?: string; initialSpecialist?: string }) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [mode, setMode] = useState<DeliveryMode>("clinic");
  const [specialistId, setSpecialistId] = useState(initialSpecialist ?? "");
  const [slotId, setSlotId] = useState("");
  const [details, setDetails] = useState<Details>({ region: "الركبة", complaint: "", onset: "", pain: 4, previousSurgery: "لا", goal: "" });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [payment, setPayment] = useState<PaymentConfig | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  async function copyMeetingLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — the link is
      // still reachable through the button next to this one.
      window.prompt("انسخ رابط الجلسة:", url);
    }
  }

  /** Draft as it stood when this page opened. Read once, before any save runs. */
  const pendingDraft = useRef<BookingDraft | null>(readDraft());

  async function reload() {
    setLoading(true);
    setLoadError("");
    try {
      const data = await loadCatalog();
      setCatalog(data);
      const selectedService = data.services.find((item) => item.id === initialService) ?? data.services[0];
      const selectedSpecialist = data.specialists.find((item) => item.id === initialSpecialist) ?? data.specialists[0];
      if (selectedService) { setServiceId(selectedService.id); setMode(selectedService.modes[0]); }
      if (selectedSpecialist) setSpecialistId(selectedSpecialist.id);

      // Re-apply anything the patient had already filled in before being sent to
      // sign in. Each reference is re-validated against the catalogue that just
      // loaded, so a slot taken in the meantime is dropped rather than restored.
      //
      // Read from the snapshot taken at mount, not from storage: React's
      // StrictMode runs this twice in development, and a second read could pick
      // up whatever the save effect had written in between.
      const draft = pendingDraft.current;
      if (draft) {
        if (data.services.some((item) => item.id === draft.serviceId)) {
          setServiceId(draft.serviceId);
          setMode(draft.mode);
        }
        if (data.specialists.some((item) => item.id === draft.specialistId)) {
          setSpecialistId(draft.specialistId);
        }
        const slotStillFree = data.availability.some((item) => item.id === draft.slotId);
        setSlotId(slotStillFree ? draft.slotId : "");
        setDetails(draft.details);
        setAccepted(draft.accepted);
        // Without a slot they must revisit step 2; otherwise resume where they left off.
        setStep(slotStillFree ? draft.step : 1);
      }
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "تعذر تحميل الحجز");
    } finally {
      // Set even on failure, so a retry still persists what the patient types.
      restored.current = true;
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [initialService, initialSpecialist]);
  useEffect(() => { loadPaymentConfig().then(setPayment).catch(() => setPayment(null)); }, []);

  const service = catalog?.services.find((item) => item.id === serviceId);
  const specialist = catalog?.specialists.find((item) => item.id === specialistId);
  const availableSlots = useMemo(() => catalog?.availability.filter((item) => item.specialistId === specialistId && item.mode === mode) ?? [], [catalog, specialistId, mode]);
  const slot = availableSlots.find((item) => item.id === slotId);

  useEffect(() => {
    if (service && !service.modes.includes(mode)) setMode(service.modes[0]);
  }, [service, mode]);
  // Changing specialist or mode invalidates the chosen slot — but only when the
  // patient actually changes it. A plain [specialistId, mode] effect also fires
  // on the initial render, which would wipe a slot restored from the draft.
  //
  // The `!specialistId` guard matters: on the first render the wizard still
  // holds its empty defaults, and recording that as the baseline would make the
  // first real population look like a change and clear the restored slot.
  const lastSelection = useRef("");
  /** True once reload() has had its chance to restore a saved draft. */
  const restored = useRef(false);
  useEffect(() => {
    if (!specialistId) return;
    const key = `${specialistId}|${mode}`;
    if (lastSelection.current && lastSelection.current !== key) setSlotId("");
    lastSelection.current = key;
  }, [specialistId, mode]);

  // Keep the draft current so a sign-in redirect loses nothing.
  //
  // Gated on `restored`: this effect also runs on the very first render, when
  // the wizard still holds its empty initial state. Without the gate it would
  // overwrite the saved draft with blanks before reload() had a chance to read
  // it back — destroying exactly what it is meant to protect.
  useEffect(() => {
    if (!restored.current || booking) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, serviceId, mode, specialistId, slotId, details, accepted }));
    } catch { /* storage unavailable — the wizard still works, it just will not survive login */ }
  }, [booking, step, serviceId, mode, specialistId, slotId, details, accepted]);

  /**
   * What is still missing on the current step.
   *
   * Previously this was a single boolean and the "next" button simply went grey.
   * Three fields on the case step are mandatory and none of them looked it, so
   * the journey dead-ended with nothing on screen explaining why.
   */
  const missing = useMemo(() => {
    if (step === 0) return serviceId && mode ? [] : ["اختر الخدمة وطريقة الجلسة"];
    if (step === 1) return [
      !specialistId && "اختر المختص",
      !slotId && "اختر الموعد",
    ].filter(Boolean) as string[];
    if (step === 2) return [
      !details.onset && "بداية الأعراض",
      !details.complaint.trim() && "الأثر على الحركة أو النشاط",
      !details.goal.trim() && "هدفك من الجلسة",
    ].filter(Boolean) as string[];
    return accepted ? [] : ["الموافقة على الشروط وسياسة الإلغاء"];
  }, [step, serviceId, mode, specialistId, slotId, details, accepted]);

  const canContinue = missing.length === 0;

  /**
   * Appointments grouped by day. A flat list repeated the full date on every
   * row, so choosing a time meant reading the same words over and over.
   */
  const slotsByDay = useMemo(() => {
    const groups = new Map<string, typeof availableSlots>();
    for (const item of availableSlots) {
      const key = new Date(item.startsAt).toDateString();
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.values()];
  }, [availableSlots]);

  async function submitBooking() {
    if (!service || !specialist || !slot) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const notes = [`المنطقة: ${details.region}`, `بداية الأعراض: ${details.onset}`, `الألم: ${details.pain}/10`, `عملية سابقة: ${details.previousSurgery}`, `الأثر الوظيفي: ${details.complaint}`, `الهدف: ${details.goal}`].join("\n");
      // The server prices the booking, locks the slot, opens the payment record
      // and (for remote sessions) issues the video link.
      setBooking(await createBooking({ service, specialist, slot, notes }));
      clearDraft();
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
        window.location.href = `/login?returnTo=${returnTo}`;
        return;
      }
      const message = reason instanceof Error ? reason.message : "تعذر إنشاء الحجز";
      setSubmitError(message.includes("SLOT_UNAVAILABLE") ? "هذا الموعد حُجز للتو. اختر موعدًا آخر." : message);
    } finally {
      setSubmitting(false);
    }
  }

  /** Hand off to the Moyasar-hosted payment page. */
  async function payNow() {
    if (!booking) return;
    setPayBusy(true);
    setPayError("");
    try {
      const { paymentUrl } = await startCheckout(booking.orderNumber);
      window.location.href = paymentUrl;
    } catch (reason) {
      setPayError(reason instanceof Error ? reason.message : "تعذر فتح صفحة الدفع.");
      setPayBusy(false);
    }
  }

  if (loading) return <div className="booking-loader"><LoaderCircle className="spin" /><p>جار تحميل الخدمات والمواعيد…</p></div>;
  if (loadError || !catalog) return <div className="catalog-message"><strong>تعذر فتح مسار الحجز.</strong><p>لم نتمكن من قراءة المواعيد الآن.</p><button className="button button-secondary" type="button" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button></div>;
  if (booking) {
    const invite: SessionInvite = {
      bookingId: booking.id,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      serviceName: service?.name ?? "جلسة علاج طبيعي",
      specialistName: specialist?.name ?? "المختص",
      meetingUrl: booking.meetingUrl,
      isRemote: booking.mode === "remote",
      branchName: catalog.branches.find((item) => item.id === slot?.branchId)?.name ?? null,
    };
    return <div className="booking-success-live"><CheckCircle2 /><span>
      <small>تم إنشاء الحجز</small>
      <h2>طلبك مسجل في المنصة</h2>
      <p>رقم الطلب: <b dir="ltr">{booking.orderNumber}</b></p>
      <p>الموعد: {formatDateTime(booking.starts_at)} · المبلغ: {formatCurrency(booking.total)}</p>

      {/* No provider name and no claim that anything was emailed: the link is a
          Jitsi room unless Google is configured, and only the Google path ever
          sends a calendar invitation. Showing the raw URL — fragment options and
          all — was noise; the actions do the job. */}
      {booking.mode === "remote" && (booking.meetingUrl
        ? <div className="booking-meet-link">
            <Video />
            <div>
              <strong>رابط الجلسة جاهز</strong>
              <small>احتفظ بالرابط، وستجده أيضاً في حسابك قبل الموعد.</small>
              <div className="booking-meet-actions">
                <a className="button button-small" href={booking.meetingUrl} target="_blank" rel="noreferrer"><Video /> دخول الجلسة</a>
                <button type="button" className="button button-small button-secondary" onClick={() => void copyMeetingLink(booking.meetingUrl!)}>
                  {copiedLink ? <><Check /> تم النسخ</> : <><Copy /> نسخ الرابط</>}
                </button>
              </div>
            </div>
          </div>
        : <p className="booking-meet-note"><Video /> {payment?.meetEnabled === false
            ? "سيتواصل معك الفريق قبل الموعد لتزويدك برابط الجلسة."
            : "سيصلك رابط الجلسة قبل الموعد."}</p>)}

      <div className="booking-invite-actions">
        <a className="button button-secondary" href={whatsappShareUrl(invite)} target="_blank" rel="noreferrer"><MessageCircle /> إرسال التفاصيل عبر واتساب</a>
        <button type="button" className="button button-secondary" onClick={() => downloadIcs(invite)}><CalendarPlus /> إضافة إلى التقويم</button>
      </div>

      <div className="booking-payment-box">
        {payment?.configured
          ? <>
              <p><strong>الخطوة الأخيرة: إتمام الدفع</strong><br /><small>يتم الدفع عبر صفحة آمنة من مُيسّر، ولا تمر بيانات البطاقة عبر المنصة.</small></p>
              {payment.testMode && <p className="payment-test-note">وضع اختبار — لن يتم خصم مبلغ حقيقي.</p>}
              {payError && <div className="form-error" role="alert">{payError}</div>}
              <button type="button" className="button" disabled={payBusy} onClick={() => void payNow()}>
                {payBusy ? <LoaderCircle className="spin" /> : <CreditCard />} ادفع {formatCurrency(booking.total)}
              </button>
            </>
          : <p className="booking-meet-note"><ShieldCheck /> الحجز محفوظ بحالة «بانتظار الدفع». بوابة الدفع غير مهيأة بعد على هذه البيئة.</p>}
      </div>

      <div><a className="button button-secondary" href="/portal">فتح حسابي</a><a className="button button-secondary" href="/">العودة للرئيسية</a></div>
    </span></div>;
  }

  const steps = ["الخدمة", "المختص والموعد", "الحالة", "المراجعة"];
  return <div className="booking-shell">
    <div className="booking-progress" aria-label="تقدم الحجز">{steps.map((label, index) => <button type="button" key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index < step && setStep(index)}><i>{index < step ? <Check /> : index + 1}</i><span>{label}</span></button>)}</div>
    <div className="booking-card">
      {step === 0 && <section><header><span className="kicker">الخطوة الأولى</span><h2>اختر الخدمة وطريقة الجلسة</h2><p>الأسعار والخدمات مقروءة مباشرة من قاعدة البيانات.</p></header><div className="selection-grid services-selection">{catalog.services.map((item) => <button type="button" className={serviceId === item.id ? "selected" : ""} onClick={() => { setServiceId(item.id); setMode(item.modes[0]); }} key={item.id}><span className="selection-check"><Check /></span><HeartPulse /><div><h3>{item.name}</h3><p>{item.description}</p><small>{item.durationMinutes} دقيقة · {formatCurrency(item.price)}</small>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><fieldset className="mode-fieldset"><legend>طريقة الجلسة</legend>{service?.modes.map((item) => <label key={item}><input type="radio" checked={mode === item} onChange={() => setMode(item)} /><span>{item === "remote" ? <Video /> : <MapPin />}{deliveryLabel(item)}</span></label>)}</fieldset></section>}
      {step === 1 && <section><header><span className="kicker">الخطوة الثانية</span><h2>اختر المختص والموعد</h2><p>اختر المختص ثم الوقت المناسب لك.</p></header><div className="selection-grid specialist-selection">{catalog.specialists.map((item) => <button type="button" className={specialistId === item.id ? "selected" : ""} onClick={() => setSpecialistId(item.id)} key={item.id}><span className="selection-check"><Check /></span><span className="small-avatar"><UserRound /></span><div><h3>{item.name}</h3><p>{item.title}</p>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><div className="slots"><h3><CalendarDays /> المواعيد المتاحة</h3>{slotsByDay.length ? <div className="slot-days">{slotsByDay.map((day) => <div className="slot-day" key={day[0].id}><h4>{formatDayLabel(day[0].startsAt)}</h4><div className="slot-times">{day.map((item) => <button type="button" className={slotId === item.id ? "selected" : ""} onClick={() => setSlotId(item.id)} key={item.id} aria-pressed={slotId === item.id}><span className="slot-time">{formatTime(item.startsAt)}</span>{slotId === item.id && <Check aria-hidden="true" />}</button>)}</div></div>)}</div> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد مواعيد مطابقة.</strong><small>جرّب طريقة جلسة أخرى أو مختصًا آخر.</small></span></div>}</div></section>}
      {step === 2 && <section><header><span className="kicker">الخطوة الثالثة</span><h2>اكتب ملخصًا وظيفيًا للحالة</h2><p>لا تضف رقم الهوية أو ملفات صحية حساسة هنا.</p></header><div className="form-grid"><label><span>المنطقة المتأثرة</span><select value={details.region} onChange={(event) => setDetails({ ...details, region: event.target.value })}><option>الركبة</option><option>الكتف</option><option>أسفل الظهر</option><option>الكاحل والقدم</option><option>الرقبة</option><option>منطقة أخرى</option></select></label><label><span>بداية الأعراض <b className="req">*</b></span><select value={details.onset} onChange={(event) => setDetails({ ...details, onset: event.target.value })}><option value="">اختر المدة</option><option>أقل من أسبوع</option><option>من أسبوع إلى شهر</option><option>من شهر إلى ثلاثة أشهر</option><option>أكثر من ثلاثة أشهر</option></select></label><label className="wide"><span>الأثر على الحركة أو النشاط <b className="req">*</b></span><textarea required maxLength={300} placeholder="مثال: صعوبة صعود الدرج بعد النشاط" value={details.complaint} onChange={(event) => setDetails({ ...details, complaint: event.target.value })} /></label><label className="wide range-field"><span>شدة الألم: <strong>{details.pain}/10</strong></span><input type="range" min="0" max="10" value={details.pain} onChange={(event) => setDetails({ ...details, pain: Number(event.target.value) })} /></label><label><span>عملية سابقة</span><select value={details.previousSurgery} onChange={(event) => setDetails({ ...details, previousSurgery: event.target.value })}><option>لا</option><option>نعم</option></select></label><label><span>هدفك من الجلسة <b className="req">*</b></span><input placeholder="مثال: العودة للمشي دون ألم" value={details.goal} onChange={(event) => setDetails({ ...details, goal: event.target.value })} /></label></div></section>}
      {step === 3 && <section><header><span className="kicker">الخطوة الرابعة</span><h2>راجع الحجز</h2><p>تأكد من التفاصيل قبل تأكيد الطلب.</p></header><div className="summary-card"><div><span>الخدمة</span><strong>{service?.name}</strong><small>{service && formatCurrency(service.price)}</small></div><div><span>طريقة الجلسة</span><strong>{deliveryLabel(mode)}</strong></div><div><span>المختص</span><strong>{specialist?.name}</strong></div><div><span>الموعد</span><strong>{slot ? formatDateTime(slot.startsAt) : "لم يحدد"}</strong></div><div><span>الحالة</span><strong>{details.region} · ألم {details.pain}/10</strong></div></div><label className="policy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>قرأت <a href="/terms" target="_blank">الشروط</a> و<a href="/privacy" target="_blank">الخصوصية</a> و<a href="/refund-policy" target="_blank">سياسة الإلغاء</a>.</span></label><div className="payment-note"><ShieldCheck /><span><strong>حجز محمي</strong><small>تُنشئ المنصة سجل دفع بانتظار ربط بوابة الدفع.</small></span></div>{submitError && <div className="form-error" role="alert">{submitError}</div>}</section>}
      {/* Say what is still needed rather than leaving a dead grey button. */}
      {missing.length > 0 && <p className="booking-missing" role="status"><AlertCircle /> يتبقى: {missing.join(" · ")}</p>}
      <footer className="booking-footer"><button type="button" className="button button-secondary" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowRight /> السابق</button>{step < 3 ? <button type="button" className="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>التالي <ArrowLeft /></button> : <button type="button" className="button" disabled={!canContinue || submitting} onClick={() => void submitBooking()}>{submitting ? <LoaderCircle className="spin" /> : <CheckCircle2 />} إنشاء الحجز</button>}</footer>
    </div>
  </div>;
}
