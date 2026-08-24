import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CreditCard, HeartPulse, LoaderCircle, MapPin, RefreshCcw, ShieldCheck, UserRound, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeliveryMode } from "../lib/catalog-types";
import { deliveryLabel, formatCurrency, formatDateTime, formatDayLabel, formatTime } from "../lib/format";
import { AuthenticationRequiredError, createBooking, loadCatalog, loadPaymentConfig, recordTelehealthConsent, setContactEmail, startCheckout, type BookingResult, type PaymentConfig } from "../lib/platform";
import { TELEHEALTH_CONSENT, TELEHEALTH_CONSENT_VERSION, telehealthConsentText } from "../lib/telehealth-consent";
import { useAsync } from "../lib/use-async";
import ComingSoonBadge from "./ComingSoonBadge";
import DemoBadge from "./DemoBadge";
import { Link } from "react-router-dom";

type Details = {
  region: string;
  /** Free text shown only when "منطقة أخرى" is chosen. */
  regionOther: string;
  complaint: string;
  onset: string;
  pain: number;
  previousSurgery: string;
  chronicConditions: string;
  chronicDetail: string;
  /** Free text shown only when a previous operation is reported. */
  surgeryDetail: string;
  currentSymptoms: string;
  goal: string;
};

/**
 * Booking is gated on sign-in, and signing in is a full page navigation, so all
 * wizard state used to be destroyed on the way to /login — the patient came back
 * to an empty form and had to describe their condition a second time. The draft
 * is parked in sessionStorage so they return to the review step ready to submit.
 *
 * sessionStorage, not localStorage: it dies with the tab, which is the right
 * lifetime for a half-written health complaint.
 */
// Bumped whenever the draft shape changes, so a stale one is discarded rather
// than restored into a form that no longer matches it.
const DRAFT_KEY = "blue-rehab:booking-draft:v2";

type BookingDraft = {
  step: number;
  serviceId: string;
  mode: DeliveryMode;
  specialistId: string;
  slotId: string;
  details: Details;
  accepted: boolean;
  contactEmail: string;
};

/** Good enough to catch typos before they reach the server; the server re-validates. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Starting values, and the shape every restored draft is merged onto.
 *
 * A draft saved before a field existed comes back without it, and the first
 * `.trim()` on the missing value throws — which is what the client saw when they
 * chose «منطقة أخرى» on a session that had an older draft in storage.
 */
const EMPTY_DETAILS: Details = {
  region: "الركبة",
  regionOther: "",
  complaint: "",
  onset: "",
  pain: 4,
  previousSurgery: "لا",
  chronicConditions: "لا",
  chronicDetail: "",
  surgeryDetail: "",
  currentSymptoms: "",
  goal: "",
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
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [mode, setMode] = useState<DeliveryMode>("clinic");
  const [specialistId, setSpecialistId] = useState(initialSpecialist ?? "");
  const [slotId, setSlotId] = useState("");
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [accepted, setAccepted] = useState(false);
  /**
   * Contact email for a *remote* session — the only reason this exists is
   * that Google Meet, on the clinic's personal (non-Workspace) account, only
   * lets an *invited* guest in without knocking, and only an invited guest
   * already inside is positioned to admit anyone else. This platform
   * otherwise never asks for an email (phone/OTP only), so without this
   * field a patient's `profiles.email` stays null forever and every remote
   * session leaves them stuck asking to join with nobody able to let them
   * in — confirmed in real testing, not theoretical.
   *
   * Unlike the consent tick below, this is ordinary contact info, not a
   * one-time attestation, so it *is* restored from the draft (and, once
   * saved, from a returning patient's profile) rather than starting blank
   * every time.
   */
  const [contactEmail, setContactEmailField] = useState("");
  /**
   * Informed consent to a *remote* session, kept separate from the terms
   * checkbox above on purpose.
   *
   * NHIC §3.1.17 wants a consent to the telehealth activity itself, not a
   * consent to the site's legal pages, and PDPL wants consent to health-data
   * processing to be explicit and freely given. Folding it into `accepted`
   * would mean a patient booking a clinic visit ticks a telehealth consent they
   * were never offered, and a patient booking remotely gives one tick for two
   * unrelated things.
   *
   * Deliberately NOT persisted in the sessionStorage draft. Everything else in
   * the wizard is restored after the sign-in redirect so nobody retypes their
   * complaint, but a restored tick is a tick nobody watched them make. The box
   * starts empty on every load of the review step, which is the whole meaning
   * of "no pre-ticked consent".
   */
  const [remoteConsent, setRemoteConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [payment, setPayment] = useState<PaymentConfig | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  /** Draft as it stood when this page opened. Read once, before any save runs. */
  const pendingDraft = useRef<BookingDraft | null>(readDraft());

  /**
   * Fetching the catalogue also drives a batch of state that is not "data" in
   * the `useAsync` sense — the selected service, specialist, slot and the
   * restored draft all depend on what just loaded. That work stays here,
   * inside the fetcher, rather than in a `.then()` off the hook's `data`: it
   * has to run exactly once per fetch, in the same pass that decides whether
   * the fetch succeeded, and `restored.current` has to flip to `true` even on
   * failure — see the comment on that ref below — which only a `finally`
   * wrapped around the fetch itself can guarantee.
   */
  const reloadCatalog = useCallback(async () => {
    try {
      const data = await loadCatalog();
      // The default pick when nothing was requested explicitly should be one
      // a visitor can actually book — falling through to a closed service
      // just because it happens to sort first would silently start the
      // wizard on a dead end. A service named explicitly in the URL is still
      // honoured even if it is coming soon: the missing-check below is what
      // stops that case from proceeding, not this fallback.
      const selectedService = data.services.find((item) => item.id === initialService)
        ?? data.services.find((item) => !item.isComingSoon)
        ?? data.services[0];
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
        // A specialist or service named explicitly in the URL — the patient
        // followed a "حجز موعد" link for *that* card — means exactly that,
        // not whatever a draft left over from an earlier, possibly abandoned
        // pass through this same browser tab happens to say. Without this
        // check, any stale draft silently swapped the pick straight back and
        // dropped the patient into whatever step (2, 3…) it was saved at —
        // they never saw either happen. A plain `/booking` link (no
        // specialist/service in the URL) carries no such request, so it still
        // resumes the draft untouched — this is also what the post-login
        // redirect back to the same URL relies on.
        const explicitConflict = Boolean(
          (initialSpecialist && initialSpecialist !== draft.specialistId) ||
          (initialService && initialService !== draft.serviceId),
        );

        if (!explicitConflict) {
          if (data.services.some((item) => item.id === draft.serviceId)) {
            setServiceId(draft.serviceId);
            setMode(draft.mode);
          }
          if (data.specialists.some((item) => item.id === draft.specialistId)) {
            setSpecialistId(draft.specialistId);
          }
        }
        const slotStillFree = !explicitConflict && data.availability.some((item) => item.id === draft.slotId);
        setSlotId(slotStillFree ? draft.slotId : "");
        // Merge, never replace: an older draft is missing the newer fields.
        // Kept even on an explicit conflict — the case description and
        // consent aren't tied to which specialist was picked, so there is no
        // reason to make the patient retype them just for choosing someone else.
        setDetails({ ...EMPTY_DETAILS, ...(draft.details ?? {}) });
        setAccepted(draft.accepted);
        setContactEmailField(draft.contactEmail ?? "");
        // An explicit new pick always starts at the top. Otherwise: without a
        // slot they must revisit step 2; with one, resume where they left off.
        setStep(explicitConflict ? 0 : slotStillFree ? draft.step : 1);
      }
      return data;
    } finally {
      // Set even on failure, so a retry still persists what the patient types.
      restored.current = true;
    }
  }, [initialService, initialSpecialist]);

  const { data: catalog, error: loadError, loading, reload } = useAsync(reloadCatalog, [reloadCatalog]);

  useEffect(() => { loadPaymentConfig().then(setPayment).catch(() => setPayment(null)); }, []);

  const service = catalog?.services.find((item) => item.id === serviceId);
  const specialist = catalog?.specialists.find((item) => item.id === specialistId);
  const availableSlots = useMemo(() => catalog?.availability.filter((item) => item.specialistId === specialistId && item.mode === mode) ?? [], [catalog, specialistId, mode]);
  const slot = availableSlots.find((item) => item.id === slotId);

  useEffect(() => {
    if (service && !service.modes.includes(mode)) setMode(service.modes[0]);
  }, [service, mode]);
  /** True once reload() has had its chance to restore a saved draft. */
  const restored = useRef(false);

  // A consent given for a remote session says nothing about a clinic visit, and
  // vice versa. Switching away from «عن بُعد» drops it, so coming back offers a
  // fresh, empty box rather than a tick inherited from an earlier choice.
  useEffect(() => {
    if (mode !== "remote") setRemoteConsent(false);
  }, [mode]);

  // Keep the draft current so a sign-in redirect loses nothing.
  //
  // Gated on `restored`: this effect also runs on the very first render, when
  // the wizard still holds its empty initial state. Without the gate it would
  // overwrite the saved draft with blanks before reload() had a chance to read
  // it back — destroying exactly what it is meant to protect.
  useEffect(() => {
    if (!restored.current || booking) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, serviceId, mode, specialistId, slotId, details, accepted, contactEmail }));
    } catch { /* storage unavailable — the wizard still works, it just will not survive login */ }
  }, [booking, step, serviceId, mode, specialistId, slotId, details, accepted, contactEmail]);

  /**
   * What is still missing on the current step.
   *
   * Previously this was a single boolean and the "next" button simply went grey.
   * Three fields on the case step are mandatory and none of them looked it, so
   * the journey dead-ended with nothing on screen explaining why.
   */
  const missing = useMemo(() => {
    if (step === 0) return [
      !mode && "طريقة الجلسة",
      !serviceId && "نوع الجلسة",
      // The selection buttons already disable a coming-soon service, but a
      // direct link naming one explicitly (`?service=`) still sets it —
      // this is what stops *that* path from reaching the payment step.
      service?.isComingSoon && "هذه الخدمة غير متاحة للحجز حالياً",
    ].filter(Boolean) as string[];
    if (step === 1) return [
      !specialistId && "اختر المختص",
      !slotId && "اختر الموعد",
    ].filter(Boolean) as string[];
    if (step === 2) {
      const text = (value: string | undefined) => (value ?? "").trim();
      return [
        !details.onset && "بداية الأعراض",
        details.region === "منطقة أخرى" && !text(details.regionOther) && "تحديد المنطقة",
        details.previousSurgery === "نعم" && !text(details.surgeryDetail) && "تفاصيل العملية",
        details.chronicConditions === "نعم" && !text(details.chronicDetail) && "تفاصيل الأمراض المزمنة",
        !text(details.complaint) && "الأثر على الحركة أو النشاط",
        !text(details.goal) && "هدفك من الجلسة",
      ].filter(Boolean) as string[];
    }
    // The telehealth consent — and now the contact email — block the confirm
    // button for a remote session and only for a remote session; a clinic
    // booking never sees either.
    return [
      !accepted && "الموافقة على الشروط وسياسة الإلغاء",
      mode === "remote" && !remoteConsent && "الموافقة المستنيرة على الجلسة عن بُعد",
      mode === "remote" && !EMAIL_PATTERN.test(contactEmail.trim()) && "بريد إلكتروني صالح لدعوتك لرابط الاجتماع",
    ].filter(Boolean) as string[];
  }, [step, serviceId, mode, specialistId, slotId, details, accepted, remoteConsent, contactEmail, service]);

  /** Only the services that can actually be delivered the way they chose. */
  const modeServices = useMemo(
    () => (catalog?.services ?? []).filter((item) => item.modes.includes(mode)),
    [catalog, mode],
  );

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
      // Consent first, before anything else moves.
      //
      // NHIC §3.1.17 requires the consent to be recorded *before* the telehealth
      // activity, and "before" here has to mean before the reservation and
      // before the gateway too — a consent written only after a successful
      // payment is a consent conditional on the money clearing, which is not
      // what was asked for and not what a patient thinks they are giving.
      //
      // The record carries no booking id: this platform is pay-first
      // (20260807110000), so the appointment row does not exist yet. It is
      // linked to the patient and stamped with the server's clock, which is
      // what the audit question actually needs answering — who agreed to what,
      // and when.
      if (mode === "remote") {
        // Same reasoning as the consent write below it: this has to land
        // before the meeting is created, not after, or the invite is issued
        // to nobody. Order between the two doesn't matter to Meet, but doing
        // the email first means a failure here never leaves an undisclosed
        // consent on record for a booking that didn't go through.
        await setContactEmail(contactEmail.trim());
        await recordTelehealthConsent({
          templateVersion: TELEHEALTH_CONSENT_VERSION,
          consentText: telehealthConsentText(),
        });
      }

      const notes = [
        `المنطقة: ${details.region === "منطقة أخرى" && (details.regionOther ?? "").trim() ? details.regionOther.trim() : details.region}`,
        `بداية الأعراض: ${details.onset}`,
        `الألم: ${details.pain}/10`,
        `عملية سابقة: ${details.previousSurgery}${details.previousSurgery === "نعم" && (details.surgeryDetail ?? "").trim() ? ` — ${details.surgeryDetail.trim()}` : ""}`,
        `أمراض مزمنة: ${details.chronicConditions}${details.chronicConditions === "نعم" && (details.chronicDetail ?? "").trim() ? ` — ${details.chronicDetail.trim()}` : ""}`,
        `الأعراض الحالية: ${(details.currentSymptoms ?? "").trim() || "غير محددة"}`,
        `الأثر الوظيفي: ${details.complaint}`,
        `الهدف: ${details.goal}`,
      ].join("\n");

      // Pay first: this only reserves the time and freezes the price. Send the
      // patient straight to the gateway — no screen should claim a booking
      // exists before the money has moved.
      const created = await createBooking({ service, specialist, slot, notes });
      setBooking(created);
      clearDraft();

      const { paymentUrl } = await startCheckout(created.orderNumber);
      window.location.href = paymentUrl;
      return;
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
        window.location.href = `/login?returnTo=${returnTo}`;
        return;
      }
      const message = reason instanceof Error ? reason.message : "تعذر إنشاء الحجز";
      if (message.includes("SLOT_UNAVAILABLE")) setSubmitError("هذا الموعد حُجز للتو. اختر موعدًا آخر.");
      // Nothing was reserved and nothing was charged: the email save and the
      // consent write are the first things that run, so a failure at either
      // one leaves the wizard exactly as the patient left it.
      else if (message.includes("EMAIL_NOT_SAVED")) setSubmitError("تعذر حفظ بريدك الإلكتروني، ولم يُنشأ أي حجز ولم يُخصم أي مبلغ. تحقق من اتصالك وحاول مرة أخرى.");
      else if (message.includes("CONSENT_NOT_RECORDED")) setSubmitError("تعذر تسجيل موافقتك على الجلسة عن بُعد، ولم يُنشأ أي حجز ولم يُخصم أي مبلغ. تحقق من اتصالك وحاول مرة أخرى.");
      else setSubmitError(message);
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
  // Nothing is booked yet, so there is no confirmation to show here. The patient
  // is on their way to the gateway; the appointment and its meeting link appear
  // on /payment/callback once the money is verified. The only case that lingers
  // on this screen is a gateway that is not configured at all.
  if (booking) {
    return <div className="booking-success-live"><CreditCard /><span>
      <small>الخطوة الأخيرة</small>
      <h2>{payment?.configured ? "جارٍ تحويلك إلى صفحة الدفع…" : "تعذر فتح صفحة الدفع"}</h2>
      <p>رقم الطلب: <b dir="ltr">{booking.orderNumber}</b></p>
      <p>الموعد: {formatDateTime(booking.starts_at)} · المبلغ: {formatCurrency(booking.total)}</p>
      {booking.reservedUntil && payment?.configured && <p className="booking-meet-note">
        <ShieldCheck /> الموعد محجوز لك مؤقتاً حتى {formatTime(booking.reservedUntil)} لإتمام الدفع.
      </p>}

      {!payment?.configured && <p className="booking-meet-note">
        <ShieldCheck /> بوابة الدفع غير مهيأة على هذه البيئة، ولم يُنشأ أي حجز.
      </p>}

      {payError && <div className="form-error" role="alert">{payError}</div>}

      <div className="booking-invite-actions">
        <button type="button" className="button" disabled={payBusy || !payment?.configured} onClick={() => void payNow()}>
          {payBusy ? <LoaderCircle className="spin" /> : <CreditCard />} إتمام الدفع {formatCurrency(booking.total)}
        </button>
        <Link className="button button-secondary" to="/portal">حسابي</Link>
      </div>
    </span></div>;
  }

  const steps = ["طريقة الجلسة", "المختص والموعد", "الحالة", "المراجعة"];

  return <div className="booking-shell">
    <div className="booking-progress" aria-label="تقدم الحجز">{steps.map((label, index) => <button type="button" key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index < step && setStep(index)}><i>{index < step ? <Check /> : index + 1}</i><span>{label}</span></button>)}</div>
    <div className="booking-card">
      {/* Mode first, then the service.
          The step used to open on the service list with the delivery choice
          tucked underneath it and the clinic addresses printed right there — so
          the first thing a visitor saw when booking a consultation was where the
          clinic is, before anyone had asked whether they wanted to come in at
          all. The two things a person actually decides between are حضوري and
          أونلاين, so those are the opening question, and the service list is
          filtered to what that choice supports. */}
      {step === 0 && <section><header><span className="kicker">الخطوة الأولى</span><h2>كيف تريد الجلسة؟</h2><p>اختر الحضور إلى المركز أو الجلسة عن بُعد، ثم حدد نوع الجلسة.</p></header>
        {/* A clinic slot means nothing once the mode is remote (and vice versa),
            so changing it here drops whatever slot was chosen — but only on an
            actual click. An earlier version watched [specialistId, mode] with a
            useEffect instead, and that effect could not tell a genuine click
            apart from mode settling into its final value while a draft was
            still being restored — proven live: reloading straight back into a
            restored remote booking silently dropped its slot, because the
            restore itself touches mode before specialistId in a separate
            commit. Doing the drop only inside the click handler removes the
            ambiguity entirely — restoring a draft never fires this code. */}
        <div className="mode-choice" role="group" aria-label="طريقة الجلسة">
          {(["clinic", "remote"] as DeliveryMode[]).map((item) => <button
            type="button" key={item}
            className={mode === item ? "selected" : ""}
            aria-pressed={mode === item}
            onClick={() => { if (item !== mode) setSlotId(""); setMode(item); if (service && !service.modes.includes(item)) setServiceId(""); }}
          >
            <span className="selection-check"><Check /></span>
            {item === "remote" ? <Video /> : <MapPin />}
            <span><strong>{item === "remote" ? "جلسة عن بُعد" : "الحضور إلى المركز"}</strong>
              <small>{item === "remote" ? "عبر رابط اجتماع يصلك قبل الموعد." : "جلسة مباشرة داخل المركز مع الأخصائي."}</small>
            </span>
          </button>)}
        </div>

        {modeServices.length > 0 ? <>
          <h3 className="booking-subhead">نوع الجلسة</h3>
          <div className="selection-grid services-selection">{modeServices.map((item) => <button type="button" disabled={item.isComingSoon} className={serviceId === item.id ? "selected" : ""} onClick={() => setServiceId(item.id)} key={item.id}><span className="selection-check"><Check /></span><HeartPulse /><div><h3>{item.name}</h3><p>{item.description}</p><div className="service-meta"><span>{item.durationMinutes} دقيقة</span><strong className="booking-service-price">{formatCurrency(item.price)}</strong></div>{item.isDemo && <DemoBadge compact />}{item.isComingSoon && <ComingSoonBadge compact />}</div></button>)}</div>
        </> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد خدمات متاحة بهذه الطريقة.</strong><small>جرّب الطريقة الأخرى، أو تواصل معنا.</small></span></div>}

        {/* The address belongs after the decision to come in, not before it. */}
        {mode === "clinic" && serviceId && <div className="branch-note"><MapPin /><div><strong>موقع المركز</strong>{catalog.branches.length ? <ul>{catalog.branches.map((branch) => <li key={branch.id}><b>{branch.name}</b><small>{[branch.city, branch.address].filter(Boolean).join(" — ")}</small></li>)}</ul> : <small>سيتم تزويدك بموقع المركز عند تأكيد الموعد.</small>}<small>يُثبَّت الفرع النهائي مع الموعد الذي تختاره في الخطوة التالية.</small></div></div>}
      </section>}

      {step === 1 && <section><header><span className="kicker">الخطوة الثانية</span><h2>اختر المختص والموعد</h2><p>اختر المختص ثم الوقت المناسب لك.</p></header><div className="selection-grid specialist-selection">{catalog.specialists.map((item) => <button type="button" className={specialistId === item.id ? "selected" : ""} onClick={() => { if (item.id !== specialistId) setSlotId(""); setSpecialistId(item.id); }} key={item.id}><span className="selection-check"><Check /></span><span className="small-avatar"><UserRound /></span><div><h3>{item.name}</h3><p>{item.title}</p>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><div className="slots"><h3><CalendarDays /> المواعيد المتاحة</h3>{slotsByDay.length ? <div className="slot-days">{slotsByDay.map((day) => <div className="slot-day" key={day[0].id}><h4>{formatDayLabel(day[0].startsAt)}</h4><div className="slot-times">{day.map((item) => <button type="button" className={slotId === item.id ? "selected" : ""} onClick={() => setSlotId(item.id)} key={item.id} aria-pressed={slotId === item.id}><span className="slot-time">{formatTime(item.startsAt)}</span>{slotId === item.id && <Check aria-hidden="true" />}</button>)}</div></div>)}</div> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد مواعيد مطابقة.</strong><small>جرّب طريقة جلسة أخرى أو مختصًا آخر.</small></span></div>}</div></section>}
      {step === 2 && <section><header><span className="kicker">الخطوة الثالثة</span><h2>اكتب ملخصًا وظيفيًا للحالة</h2><p>لا تضف رقم الهوية أو ملفات صحية حساسة هنا.</p></header><div className="form-grid"><label><span>المنطقة المتأثرة</span><select value={details.region} onChange={(event) => setDetails({ ...details, region: event.target.value })}><option>الركبة</option><option>الكتف</option><option>أسفل الظهر</option><option>الكاحل والقدم</option><option>الرقبة</option><option>منطقة أخرى</option></select></label>{details.region === "منطقة أخرى" && <label><span>حدد المنطقة <b className="req">*</b></span><input placeholder="اكتب المنطقة المتأثرة" value={details.regionOther ?? ""} onChange={(event) => setDetails({ ...details, regionOther: event.target.value })} /></label>}<label><span>بداية الأعراض <b className="req">*</b></span><select value={details.onset} onChange={(event) => setDetails({ ...details, onset: event.target.value })}><option value="">اختر المدة</option><option>أقل من أسبوع</option><option>من أسبوع إلى شهر</option><option>من شهر إلى ثلاثة أشهر</option><option>أكثر من ثلاثة أشهر</option></select></label><label className="wide"><span>الأثر على الحركة أو النشاط <b className="req">*</b></span><textarea required maxLength={300} placeholder="مثال: صعوبة صعود الدرج بعد النشاط" value={details.complaint} onChange={(event) => setDetails({ ...details, complaint: event.target.value })} /></label><label className="wide"><span>الأعراض الحالية</span><textarea rows={2} placeholder="مثال: تورم خفيف وتيبس صباحي" value={details.currentSymptoms ?? ""} onChange={(event) => setDetails({ ...details, currentSymptoms: event.target.value })} /></label><label className="wide range-field"><span>شدة الألم: <strong>{details.pain}/10</strong></span><input type="range" min="0" max="10" value={details.pain} onChange={(event) => setDetails({ ...details, pain: Number(event.target.value) })} /></label><label><span>عملية سابقة</span><select value={details.previousSurgery} onChange={(event) => setDetails({ ...details, previousSurgery: event.target.value })}><option>لا</option><option>نعم</option></select></label>{details.previousSurgery === "نعم" && <label><span>تفاصيل العملية <b className="req">*</b></span><input placeholder="نوع العملية وتاريخها التقريبي" value={details.surgeryDetail ?? ""} onChange={(event) => setDetails({ ...details, surgeryDetail: event.target.value })} /></label>}<label><span>أمراض مزمنة</span><select value={details.chronicConditions} onChange={(event) => setDetails({ ...details, chronicConditions: event.target.value })}><option>لا</option><option>نعم</option></select></label>{details.chronicConditions === "نعم" && <label><span>حدد الأمراض المزمنة <b className="req">*</b></span><input placeholder="مثال: سكري، ضغط، ربو" value={details.chronicDetail ?? ""} onChange={(event) => setDetails({ ...details, chronicDetail: event.target.value })} /></label>}<label><span>هدفك من الجلسة <b className="req">*</b></span><input placeholder="مثال: العودة للمشي دون ألم" value={details.goal} onChange={(event) => setDetails({ ...details, goal: event.target.value })} /></label></div></section>}
      {step === 3 && <section><header><span className="kicker">الخطوة الرابعة</span><h2>راجع الحجز</h2><p>تأكد من التفاصيل قبل تأكيد الطلب.</p></header><div className="summary-card"><div className="summary-price-cell"><span>الخدمة</span><strong>{service?.name}</strong>{service && <strong className="summary-price">{formatCurrency(service.price)}</strong>}</div><div><span>طريقة الجلسة</span><strong>{deliveryLabel(mode)}</strong>{mode === "clinic" && <small>{catalog.branches.find((item) => item.id === slot?.branchId)?.name ?? "يحدد الفرع عند التأكيد"}</small>}</div><div><span>المختص</span><strong>{specialist?.name}</strong></div><div><span>الموعد</span><strong>{slot ? formatDateTime(slot.startsAt) : "لم يحدد"}</strong></div><div><span>الحالة</span><strong>{details.region} · ألم {details.pain}/10</strong></div></div>
        {/* Telehealth informed consent — remote sessions only.
            Rendered from lib/telehealth-consent.ts, which is also what gets
            stored, so the record and the screen cannot drift apart. A clinic
            booking never reaches this branch and is never blocked by it. */}
        {mode === "remote" && <><h3 className="booking-subhead" id="telehealth-consent-title">{TELEHEALTH_CONSENT.title}</h3>
          <div className="branch-note" role="group" aria-labelledby="telehealth-consent-title"><Video aria-hidden="true" /><div>
            <strong>{TELEHEALTH_CONSENT.intro}</strong>
            <ul id="telehealth-consent-clauses">{TELEHEALTH_CONSENT.clauses.map((clause) => <li key={clause}>{clause}</li>)}</ul>
            <small>إصدار نموذج الموافقة: <b dir="ltr">{TELEHEALTH_CONSENT_VERSION}</b> · يُحفظ نص الموافقة كما هو أعلاه مقترناً بتاريخ وساعة موافقتك.</small>
          </div></div>
          <label className="policy-check"><input type="checkbox" checked={remoteConsent} onChange={(event) => setRemoteConsent(event.target.checked)} aria-describedby="telehealth-consent-clauses" /><span>{TELEHEALTH_CONSENT.checkboxLabel}</span></label>
          <div className="form-grid" style={{ marginTop: 17 }}><label className="wide"><span>البريد الإلكتروني <b className="req">*</b></span><input type="email" dir="ltr" required placeholder="name@example.com" value={contactEmail} onChange={(event) => setContactEmailField(event.target.value)} /></label></div>
          <small className="file-field-hint">لدعوتك مباشرة إلى رابط Google Meet — بدونه لن تتمكن من الدخول إلى الجلسة.</small>
        </>}
        <label className="policy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>قرأت <a href="/terms" target="_blank">الشروط</a> و<a href="/privacy" target="_blank">الخصوصية</a> و<a href="/refund-policy" target="_blank">سياسة الإلغاء</a>.</span></label><div className="payment-note"><ShieldCheck /><span><strong>دفع آمن</strong><small>ننقلك إلى بوابة الدفع لإتمام العملية، ويُحجز موعدك فور نجاح الدفع. لا تمر بيانات بطاقتك عبر المنصة.</small></span></div>{submitError && <div className="form-error" role="alert">{submitError}</div>}</section>}
      {/* Say what is still needed rather than leaving a dead grey button. */}
      {missing.length > 0 && <p className="booking-missing" role="status"><AlertCircle /> يتبقى: {missing.join(" · ")}</p>}
      <footer className="booking-footer"><button type="button" className="button button-secondary" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowRight /> السابق</button>{step < 3 ? <button type="button" className="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>التالي <ArrowLeft /></button> : <button type="button" className="button" disabled={!canContinue || submitting} onClick={() => void submitBooking()}>{submitting ? <LoaderCircle className="spin" /> : <CreditCard />} المتابعة إلى الدفع</button>}</footer>
    </div>
  </div>;
}
