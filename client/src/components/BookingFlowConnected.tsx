import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, HeartPulse, LoaderCircle, MapPin, RefreshCcw, ShieldCheck, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CatalogResponse, DeliveryMode } from "../lib/catalog-types";
import { deliveryLabel, formatCurrency, formatDateTime } from "../lib/format";
import { AuthenticationRequiredError, createBooking, loadCatalog } from "../lib/platform";
import DemoBadge from "./DemoBadge";

type Details = { region: string; complaint: string; onset: string; pain: number; previousSurgery: string; goal: string };
type BookingRecord = { id: string; status: string; starts_at: string; total: number | null };

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
  const [booking, setBooking] = useState<BookingRecord | null>(null);

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
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "تعذر تحميل الحجز");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [initialService, initialSpecialist]);

  const service = catalog?.services.find((item) => item.id === serviceId);
  const specialist = catalog?.specialists.find((item) => item.id === specialistId);
  const availableSlots = useMemo(() => catalog?.availability.filter((item) => item.specialistId === specialistId && item.mode === mode) ?? [], [catalog, specialistId, mode]);
  const slot = availableSlots.find((item) => item.id === slotId);

  useEffect(() => {
    if (service && !service.modes.includes(mode)) setMode(service.modes[0]);
  }, [service, mode]);
  useEffect(() => setSlotId(""), [specialistId, mode]);

  const canContinue = step === 0 ? Boolean(serviceId && mode) : step === 1 ? Boolean(specialistId && slotId) : step === 2 ? Boolean(details.complaint.trim() && details.onset && details.goal.trim()) : accepted;

  async function submitBooking() {
    if (!service || !specialist || !slot) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const notes = [`المنطقة: ${details.region}`, `بداية الأعراض: ${details.onset}`, `الألم: ${details.pain}/10`, `عملية سابقة: ${details.previousSurgery}`, `الأثر الوظيفي: ${details.complaint}`, `الهدف: ${details.goal}`].join("\n");
      const result = await createBooking({ service, specialist, slot, notes });
      setBooking({ ...result, total: result.total === null ? null : Number(result.total) });
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

  if (loading) return <div className="booking-loader"><LoaderCircle className="spin" /><p>جار تحميل الخدمات والمواعيد…</p></div>;
  if (loadError || !catalog) return <div className="catalog-message"><strong>تعذر فتح مسار الحجز.</strong><p>لم نتمكن من قراءة المواعيد الآن.</p><button className="button button-secondary" type="button" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button></div>;
  if (booking) return <div className="booking-success-live"><CheckCircle2 /><span><small>تم إنشاء الحجز</small><h2>طلبك مسجل في المنصة</h2><p>رقم الحجز: <b dir="ltr">{booking.id}</b></p><p>الحالة الحالية: انتظار الدفع · {formatDateTime(booking.starts_at)}</p><div><a className="button" href="/portal">فتح حسابي</a><a className="button button-secondary" href="/">العودة للرئيسية</a></div></span></div>;

  const steps = ["الخدمة", "المختص والموعد", "الحالة", "المراجعة"];
  return <div className="booking-shell">
    <div className="booking-progress" aria-label="تقدم الحجز">{steps.map((label, index) => <button type="button" key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index < step && setStep(index)}><i>{index < step ? <Check /> : index + 1}</i><span>{label}</span></button>)}</div>
    <div className="booking-card">
      {step === 0 && <section><header><span className="kicker">الخطوة الأولى</span><h2>اختر الخدمة وطريقة الجلسة</h2><p>الأسعار والخدمات مقروءة مباشرة من قاعدة البيانات.</p></header><div className="selection-grid services-selection">{catalog.services.map((item) => <button type="button" className={serviceId === item.id ? "selected" : ""} onClick={() => { setServiceId(item.id); setMode(item.modes[0]); }} key={item.id}><span className="selection-check"><Check /></span><HeartPulse /><div><h3>{item.name}</h3><p>{item.description}</p><small>{item.durationMinutes} دقيقة · {formatCurrency(item.price)}</small>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><fieldset className="mode-fieldset"><legend>طريقة الجلسة</legend>{service?.modes.map((item) => <label key={item}><input type="radio" checked={mode === item} onChange={() => setMode(item)} /><span>{item === "remote" ? <Video /> : <MapPin />}{deliveryLabel(item)}</span></label>)}</fieldset></section>}
      {step === 1 && <section><header><span className="kicker">الخطوة الثانية</span><h2>اختر المختص والموعد</h2><p>لا تظهر إلا المواعيد المتاحة مستقبلًا.</p></header><div className="selection-grid specialist-selection">{catalog.specialists.map((item) => <button type="button" className={specialistId === item.id ? "selected" : ""} onClick={() => setSpecialistId(item.id)} key={item.id}><span className="selection-check"><Check /></span><span className="small-avatar"><UserRound /></span><div><h3>{item.name}</h3><p>{item.title}</p>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><div className="slots"><h3><CalendarDays /> المواعيد المتاحة</h3>{availableSlots.length ? <div>{availableSlots.map((item) => <button type="button" className={slotId === item.id ? "selected" : ""} onClick={() => setSlotId(item.id)} key={item.id}><Clock3 /><span>{formatDateTime(item.startsAt)}<small>{deliveryLabel(item.mode)}</small></span><i><Check /></i></button>)}</div> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد مواعيد مطابقة.</strong><small>اختر طريقة جلسة أو مختصًا آخر.</small></span></div>}</div></section>}
      {step === 2 && <section><header><span className="kicker">الخطوة الثالثة</span><h2>اكتب ملخصًا وظيفيًا للحالة</h2><p>لا تضف رقم الهوية أو ملفات صحية حساسة هنا.</p></header><div className="form-grid"><label><span>المنطقة المتأثرة</span><select value={details.region} onChange={(event) => setDetails({ ...details, region: event.target.value })}><option>الركبة</option><option>الكتف</option><option>أسفل الظهر</option><option>الكاحل والقدم</option><option>الرقبة</option><option>منطقة أخرى</option></select></label><label><span>بداية الأعراض</span><select value={details.onset} onChange={(event) => setDetails({ ...details, onset: event.target.value })}><option value="">اختر المدة</option><option>أقل من أسبوع</option><option>من أسبوع إلى شهر</option><option>من شهر إلى ثلاثة أشهر</option><option>أكثر من ثلاثة أشهر</option></select></label><label className="wide"><span>الأثر على الحركة أو النشاط</span><textarea required maxLength={300} value={details.complaint} onChange={(event) => setDetails({ ...details, complaint: event.target.value })} /></label><label className="wide range-field"><span>شدة الألم: <strong>{details.pain}/10</strong></span><input type="range" min="0" max="10" value={details.pain} onChange={(event) => setDetails({ ...details, pain: Number(event.target.value) })} /></label><label><span>عملية سابقة</span><select value={details.previousSurgery} onChange={(event) => setDetails({ ...details, previousSurgery: event.target.value })}><option>لا</option><option>نعم</option></select></label><label><span>هدفك من الجلسة</span><input value={details.goal} onChange={(event) => setDetails({ ...details, goal: event.target.value })} /></label></div></section>}
      {step === 3 && <section><header><span className="kicker">الخطوة الرابعة</span><h2>راجع الحجز</h2><p>تتحقق قاعدة البيانات من الخدمة والموعد والسعر قبل الحفظ.</p></header><div className="summary-card"><div><span>الخدمة</span><strong>{service?.name}</strong><small>{service && formatCurrency(service.price)}</small></div><div><span>طريقة الجلسة</span><strong>{deliveryLabel(mode)}</strong></div><div><span>المختص</span><strong>{specialist?.name}</strong></div><div><span>الموعد</span><strong>{slot ? formatDateTime(slot.startsAt) : "لم يحدد"}</strong></div><div><span>الحالة</span><strong>{details.region} · ألم {details.pain}/10</strong></div></div><label className="policy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>قرأت <a href="/terms" target="_blank">الشروط</a> و<a href="/privacy" target="_blank">الخصوصية</a> و<a href="/refund-policy" target="_blank">سياسة الإلغاء</a>.</span></label><div className="payment-note"><ShieldCheck /><span><strong>حجز محمي</strong><small>تُنشئ المنصة سجل دفع بانتظار ربط بوابة الدفع.</small></span></div>{submitError && <div className="form-error" role="alert">{submitError}</div>}</section>}
      <footer className="booking-footer"><button type="button" className="button button-secondary" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowRight /> السابق</button>{step < 3 ? <button type="button" className="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>التالي <ArrowLeft /></button> : <button type="button" className="button" disabled={!canContinue || submitting} onClick={() => void submitBooking()}>{submitting ? <LoaderCircle className="spin" /> : <CheckCircle2 />} إنشاء الحجز</button>}</footer>
    </div>
  </div>;
}
