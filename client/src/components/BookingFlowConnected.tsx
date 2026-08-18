import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CreditCard, HeartPulse, LoaderCircle, MapPin, RefreshCcw, ShieldCheck, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogResponse, DeliveryMode } from "../lib/catalog-types";
import { deliveryLabel, formatCurrency, formatDateTime, formatDayLabel, formatTime } from "../lib/format";
import { AuthenticationRequiredError, createBooking, loadCatalog, loadPaymentConfig, startCheckout, type BookingResult, type PaymentConfig } from "../lib/platform";
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
};

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
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [mode, setMode] = useState<DeliveryMode>("clinic");
  const [specialistId, setSpecialistId] = useState(initialSpecialist ?? "");
  const [slotId, setSlotId] = useState("");
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [payment, setPayment] = useState<PaymentConfig | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
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
        // Merge, never replace: an older draft is missing the newer fields.
        setDetails({ ...EMPTY_DETAILS, ...(draft.details ?? {}) });
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
    if (step === 0) return [!mode && "طريقة الجلسة", !serviceId && "نوع الجلسة"].filter(Boolean) as string[];
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
    return accepted ? [] : ["الموافقة على الشروط وسياسة الإلغاء"];
  }, [step, serviceId, mode, specialistId, slotId, details, accepted]);

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
        <div className="mode-choice" role="group" aria-label="طريقة الجلسة">
          {(["clinic", "remote"] as DeliveryMode[]).map((item) => <button
            type="button" key={item}
            className={mode === item ? "selected" : ""}
            aria-pressed={mode === item}
            onClick={() => { setMode(item); if (service && !service.modes.includes(item)) setServiceId(""); }}
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
          <div className="selection-grid services-selection">{modeServices.map((item) => <button type="button" className={serviceId === item.id ? "selected" : ""} onClick={() => setServiceId(item.id)} key={item.id}><span className="selection-check"><Check /></span><HeartPulse /><div><h3>{item.name}</h3><p>{item.description}</p><div className="service-meta"><span>{item.durationMinutes} دقيقة</span><strong className="booking-service-price">{formatCurrency(item.price)}</strong></div>{item.isDemo && <DemoBadge compact />}</div></button>)}</div>
        </> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد خدمات متاحة بهذه الطريقة.</strong><small>جرّب الطريقة الأخرى، أو تواصل معنا.</small></span></div>}

        {/* The address belongs after the decision to come in, not before it. */}
        {mode === "clinic" && serviceId && <div className="branch-note"><MapPin /><div><strong>موقع المركز</strong>{catalog.branches.length ? <ul>{catalog.branches.map((branch) => <li key={branch.id}><b>{branch.name}</b><small>{[branch.city, branch.address].filter(Boolean).join(" — ")}</small></li>)}</ul> : <small>سيتم تزويدك بموقع المركز عند تأكيد الموعد.</small>}<small>يُثبَّت الفرع النهائي مع الموعد الذي تختاره في الخطوة التالية.</small></div></div>}
      </section>}

      {step === 1 && <section><header><span className="kicker">الخطوة الثانية</span><h2>اختر المختص والموعد</h2><p>اختر المختص ثم الوقت المناسب لك.</p></header><div className="selection-grid specialist-selection">{catalog.specialists.map((item) => <button type="button" className={specialistId === item.id ? "selected" : ""} onClick={() => setSpecialistId(item.id)} key={item.id}><span className="selection-check"><Check /></span><span className="small-avatar"><UserRound /></span><div><h3>{item.name}</h3><p>{item.title}</p>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><div className="slots"><h3><CalendarDays /> المواعيد المتاحة</h3>{slotsByDay.length ? <div className="slot-days">{slotsByDay.map((day) => <div className="slot-day" key={day[0].id}><h4>{formatDayLabel(day[0].startsAt)}</h4><div className="slot-times">{day.map((item) => <button type="button" className={slotId === item.id ? "selected" : ""} onClick={() => setSlotId(item.id)} key={item.id} aria-pressed={slotId === item.id}><span className="slot-time">{formatTime(item.startsAt)}</span>{slotId === item.id && <Check aria-hidden="true" />}</button>)}</div></div>)}</div> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد مواعيد مطابقة.</strong><small>جرّب طريقة جلسة أخرى أو مختصًا آخر.</small></span></div>}</div></section>}
      {step === 2 && <section><header><span className="kicker">الخطوة الثالثة</span><h2>اكتب ملخصًا وظيفيًا للحالة</h2><p>لا تضف رقم الهوية أو ملفات صحية حساسة هنا.</p></header><div className="form-grid"><label><span>المنطقة المتأثرة</span><select value={details.region} onChange={(event) => setDetails({ ...details, region: event.target.value })}><option>الركبة</option><option>الكتف</option><option>أسفل الظهر</option><option>الكاحل والقدم</option><option>الرقبة</option><option>منطقة أخرى</option></select></label>{details.region === "منطقة أخرى" && <label><span>حدد المنطقة <b className="req">*</b></span><input placeholder="اكتب المنطقة المتأثرة" value={details.regionOther ?? ""} onChange={(event) => setDetails({ ...details, regionOther: event.target.value })} /></label>}<label><span>بداية الأعراض <b className="req">*</b></span><select value={details.onset} onChange={(event) => setDetails({ ...details, onset: event.target.value })}><option value="">اختر المدة</option><option>أقل من أسبوع</option><option>من أسبوع إلى شهر</option><option>من شهر إلى ثلاثة أشهر</option><option>أكثر من ثلاثة أشهر</option></select></label><label className="wide"><span>الأثر على الحركة أو النشاط <b className="req">*</b></span><textarea required maxLength={300} placeholder="مثال: صعوبة صعود الدرج بعد النشاط" value={details.complaint} onChange={(event) => setDetails({ ...details, complaint: event.target.value })} /></label><label className="wide"><span>الأعراض الحالية</span><textarea rows={2} placeholder="مثال: تورم خفيف وتيبس صباحي" value={details.currentSymptoms ?? ""} onChange={(event) => setDetails({ ...details, currentSymptoms: event.target.value })} /></label><label className="wide range-field"><span>شدة الألم: <strong>{details.pain}/10</strong></span><input type="range" min="0" max="10" value={details.pain} onChange={(event) => setDetails({ ...details, pain: Number(event.target.value) })} /></label><label><span>عملية سابقة</span><select value={details.previousSurgery} onChange={(event) => setDetails({ ...details, previousSurgery: event.target.value })}><option>لا</option><option>نعم</option></select></label>{details.previousSurgery === "نعم" && <label><span>تفاصيل العملية <b className="req">*</b></span><input placeholder="نوع العملية وتاريخها التقريبي" value={details.surgeryDetail ?? ""} onChange={(event) => setDetails({ ...details, surgeryDetail: event.target.value })} /></label>}<label><span>أمراض مزمنة</span><select value={details.chronicConditions} onChange={(event) => setDetails({ ...details, chronicConditions: event.target.value })}><option>لا</option><option>نعم</option></select></label>{details.chronicConditions === "نعم" && <label><span>حدد الأمراض المزمنة <b className="req">*</b></span><input placeholder="مثال: سكري، ضغط، ربو" value={details.chronicDetail ?? ""} onChange={(event) => setDetails({ ...details, chronicDetail: event.target.value })} /></label>}<label><span>هدفك من الجلسة <b className="req">*</b></span><input placeholder="مثال: العودة للمشي دون ألم" value={details.goal} onChange={(event) => setDetails({ ...details, goal: event.target.value })} /></label></div></section>}
      {step === 3 && <section><header><span className="kicker">الخطوة الرابعة</span><h2>راجع الحجز</h2><p>تأكد من التفاصيل قبل تأكيد الطلب.</p></header><div className="summary-card"><div className="summary-price-cell"><span>الخدمة</span><strong>{service?.name}</strong>{service && <strong className="summary-price">{formatCurrency(service.price)}</strong>}</div><div><span>طريقة الجلسة</span><strong>{deliveryLabel(mode)}</strong>{mode === "clinic" && <small>{catalog.branches.find((item) => item.id === slot?.branchId)?.name ?? "يحدد الفرع عند التأكيد"}</small>}</div><div><span>المختص</span><strong>{specialist?.name}</strong></div><div><span>الموعد</span><strong>{slot ? formatDateTime(slot.startsAt) : "لم يحدد"}</strong></div><div><span>الحالة</span><strong>{details.region} · ألم {details.pain}/10</strong></div></div><label className="policy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>قرأت <a href="/terms" target="_blank">الشروط</a> و<a href="/privacy" target="_blank">الخصوصية</a> و<a href="/refund-policy" target="_blank">سياسة الإلغاء</a>.</span></label><div className="payment-note"><ShieldCheck /><span><strong>دفع آمن</strong><small>ننقلك إلى بوابة الدفع لإتمام العملية، ويُحجز موعدك فور نجاح الدفع. لا تمر بيانات بطاقتك عبر المنصة.</small></span></div>{submitError && <div className="form-error" role="alert">{submitError}</div>}</section>}
      {/* Say what is still needed rather than leaving a dead grey button. */}
      {missing.length > 0 && <p className="booking-missing" role="status"><AlertCircle /> يتبقى: {missing.join(" · ")}</p>}
      <footer className="booking-footer"><button type="button" className="button button-secondary" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowRight /> السابق</button>{step < 3 ? <button type="button" className="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>التالي <ArrowLeft /></button> : <button type="button" className="button" disabled={!canContinue || submitting} onClick={() => void submitBooking()}>{submitting ? <LoaderCircle className="spin" /> : <CreditCard />} المتابعة إلى الدفع</button>}</footer>
    </div>
  </div>;
}
