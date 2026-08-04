"use client";

import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, FileLock2, HeartPulse, LoaderCircle, MapPin, ShieldCheck, UserRound, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import type { CatalogResponse, DeliveryMode } from "../lib/catalog-types";
import { deliveryLabel, formatCurrency, formatDateTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import DemoBadge from "./DemoBadge";

type Details = { region: string; complaint: string; onset: string; pain: number; previousSurgery: string; goal: string };
type BookingResult = { data?: { id: string; status: string; starts_at: string; total: number }; next?: string; error?: string };

export default function BookingFlow({ initialService, initialSpecialist }: { initialService?: string; initialSpecialist?: string }) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [mode, setMode] = useState<DeliveryMode>("clinic");
  const [specialistId, setSpecialistId] = useState(initialSpecialist ?? "");
  const [slotId, setSlotId] = useState("");
  const [details, setDetails] = useState<Details>({ region: "الركبة", complaint: "", onset: "", pain: 4, previousSurgery: "لا", goal: "" });
  const [accepted, setAccepted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [booking, setBooking] = useState<BookingResult["data"]>();

  useEffect(() => {
    fetch(apiUrl("/catalog")).then((response) => {
      if (!response.ok) throw new Error("catalog unavailable");
      return response.json() as Promise<CatalogResponse>;
    }).then((data) => {
      setCatalog(data);
      const selected = data.services.find((item) => item.id === (initialService ?? "")) ?? data.services[0];
      if (selected) {
        setServiceId(selected.id);
        setMode(selected.modes[0]);
      }
      if (!initialSpecialist && data.specialists[0]) setSpecialistId(data.specialists[0].id);
    }).catch(() => setLoadError(true));
  }, [initialService, initialSpecialist]);

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
    setSubmitError("");
    if (!supabase) {
      setSubmitError("تعذر الاتصال بالخدمة. أعد تحميل الصفحة.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?returnTo=${returnTo}`;
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(apiUrl("/bookings/drafts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          serviceId,
          specialistId,
          slotId,
          mode,
          notes: [
            `المنطقة: ${details.region}`,
            `بداية الأعراض: ${details.onset}`,
            `الألم: ${details.pain}/10`,
            `عملية سابقة: ${details.previousSurgery}`,
            `الأثر الوظيفي: ${details.complaint}`,
            `الهدف: ${details.goal}`,
          ].join("\n"),
        }),
      });
      const result = await response.json() as BookingResult;
      if (!response.ok || !result.data) throw new Error(result.error || "تعذر إنشاء الحجز");
      setBooking(result.data);
      setComplete(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "تعذر إنشاء الحجز");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <div className="catalog-message"><strong>تعذر فتح مسار الحجز.</strong><p>لم نتمكن من تحميل الخدمات والمواعيد. أعد المحاولة لاحقاً.</p></div>;
  if (!catalog) return <div className="booking-loader"><LoaderCircle /><p>جار تحميل الخدمات والمواعيد…</p></div>;

  const steps = ["الخدمة", "المختص والموعد", "ملخص الحالة", "المراجعة"];
  return (
    <div className="booking-shell">
      <div className="booking-progress" aria-label="تقدم الحجز">{steps.map((label, index) => <button type="button" key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index < step && setStep(index)}><i>{index < step ? <Check /> : index + 1}</i><span>{label}</span></button>)}</div>

      <div className="booking-card">
        {step === 0 && <section><header><span className="kicker">الخطوة الأولى</span><h2>ما الخدمة المناسبة وطريقة تقديمها؟</h2><p>يمكن تعديل الاختيار قبل الإرسال. الأسعار الحالية موسومة كتوضيحية.</p></header><div className="selection-grid services-selection">{catalog.services.map((item) => <button type="button" className={serviceId === item.id ? "selected" : ""} onClick={() => { setServiceId(item.id); setMode(item.modes[0]); }} key={item.id}><span className="selection-check"><Check /></span><HeartPulse /><div><h3>{item.name}</h3><p>{item.description}</p><small>{item.durationMinutes} دقيقة · {formatCurrency(item.price)}</small>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><fieldset className="mode-fieldset"><legend>طريقة الجلسة</legend>{service?.modes.map((item) => <label key={item}><input type="radio" name="mode" checked={mode === item} onChange={() => setMode(item)} /><span>{item === "remote" ? <Video /> : <MapPin />}{deliveryLabel(item)}<small>{item === "remote" ? "يحدد الأخصائي ملاءمتها للحالة" : "الفرع يثبت قبل التأكيد"}</small></span></label>)}</fieldset></section>}

        {step === 1 && <section><header><span className="kicker">الخطوة الثانية</span><h2>اختر الملف والموعد المتاح</h2><p>الملفات والمواعيد الظاهرة في النسخة الحالية بيانات توضيحية.</p></header><div className="selection-grid specialist-selection">{catalog.specialists.map((item) => <button type="button" className={specialistId === item.id ? "selected" : ""} onClick={() => setSpecialistId(item.id)} key={item.id}><span className="selection-check"><Check /></span><span className="small-avatar"><UserRound /></span><div><h3>{item.name}</h3><p>{item.title}</p><div className="chip-row">{item.specialties.map((entry) => <span key={entry}>{entry}</span>)}</div>{item.isDemo && <DemoBadge compact />}</div></button>)}</div><div className="slots"><h3><CalendarDays /> المواعيد المتاحة</h3>{availableSlots.length ? <div>{availableSlots.map((item) => <button type="button" className={slotId === item.id ? "selected" : ""} onClick={() => setSlotId(item.id)} key={item.id}><Clock3 /><span>{formatDateTime(item.startsAt)}<small>{deliveryLabel(item.mode)}</small></span><i><Check /></i></button>)}</div> : <div className="empty-slots"><AlertCircle /><span><strong>لا توجد مواعيد مطابقة حالياً.</strong><small>جرّب طريقة جلسة أو ملفاً آخر.</small></span></div>}</div></section>}

        {step === 2 && <section><header><span className="kicker">الخطوة الثالثة</span><h2>ملخص وظيفي للحالة</h2><p>يُرسل هذا الملخص بشكل محمي إلى الخادم عند إنشاء الحجز بعد تسجيل الدخول.</p></header><div className="privacy-inline"><FileLock2 /><span><strong>لا تكتب رقم الهوية أو تفاصيل غير لازمة.</strong><small>يقتصر الاستخدام على تجهيز طلب الجلسة ومراجعته من مقدم الخدمة.</small></span></div><div className="form-grid"><label><span>المنطقة المتأثرة</span><select value={details.region} onChange={(event) => setDetails({ ...details, region: event.target.value })}><option>الركبة</option><option>الكتف</option><option>أسفل الظهر</option><option>الكاحل والقدم</option><option>الرقبة</option><option>منطقة أخرى</option></select></label><label><span>بداية الأعراض</span><select value={details.onset} onChange={(event) => setDetails({ ...details, onset: event.target.value })}><option value="">اختر المدة</option><option>أقل من أسبوع</option><option>من أسبوع إلى شهر</option><option>من شهر إلى ثلاثة أشهر</option><option>أكثر من ثلاثة أشهر</option></select></label><label className="wide"><span>وصف مختصر للأثر الوظيفي</span><textarea value={details.complaint} onChange={(event) => setDetails({ ...details, complaint: event.target.value })} placeholder="مثال: صعوبة صعود الدرج بعد النشاط" maxLength={300} /><small>{details.complaint.length}/300</small></label><label className="wide range-field"><span>شدة الألم الحالية: <strong>{details.pain} من 10</strong></span><input type="range" min="0" max="10" value={details.pain} onChange={(event) => setDetails({ ...details, pain: Number(event.target.value) })} /></label><label><span>عملية سابقة في المنطقة</span><select value={details.previousSurgery} onChange={(event) => setDetails({ ...details, previousSurgery: event.target.value })}><option>لا</option><option>نعم</option></select></label><label><span>الهدف من الجلسة</span><input value={details.goal} onChange={(event) => setDetails({ ...details, goal: event.target.value })} placeholder="مثال: العودة للمشي دون ألم" /></label><label className="wide disabled-upload"><span>التقارير أو الأشعة</span><button type="button" disabled><FileLock2 /> يتاح الرفع من الحساب بعد التحقق</button></label></div></section>}

        {step === 3 && <section><header><span className="kicker">الخطوة الرابعة</span><h2>راجع الطلب قبل إنشاء الحجز</h2><p>بعد تسجيل الدخول ينشئ الخادم حجزًا بحالة انتظار الدفع، ويحجز الموعد آليًا.</p></header><div className="summary-card"><div><span>الخدمة</span><strong>{service?.name}</strong><small>{service?.durationMinutes} دقيقة · {service && formatCurrency(service.price)}</small></div><div><span>طريقة الجلسة</span><strong>{deliveryLabel(mode)}</strong><small>{mode === "clinic" ? "الفرع يثبت عند الاعتماد" : "تخضع لملاءمة الحالة"}</small></div><div><span>ملف مقدم الخدمة</span><strong>{specialist?.name}</strong><small>{specialist?.isDemo ? "ملف توضيحي غير موثق" : "ملف موثق"}</small></div><div><span>الموعد</span><strong>{slot ? formatDateTime(slot.startsAt) : "لم يحدد"}</strong><small>يعرض بالتوقيت المحلي</small></div><div><span>ملخص الحالة</span><strong>{details.region} · ألم {details.pain}/10</strong><small>{details.onset}</small></div><div><span>الإجمالي</span><strong>{service && formatCurrency(service.price)}</strong><small>قيمة توضيحية قبل الضريبة أو الرسوم</small></div></div><label className="policy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>قرأت <a href="/terms" target="_blank">الشروط</a> و<a href="/privacy" target="_blank">الخصوصية</a> و<a href="/refund-policy" target="_blank">سياسة الإلغاء</a>، وأوافق على إنشاء طلب الحجز.</span></label><div className="payment-note"><ShieldCheck /><span><strong>إنشاء آمن</strong><small>يُتحقق الخادم من الجلسة والخدمة والمختص والموعد والسعر قبل الحفظ، ثم ينشئ سجل الدفع تلقائيًا.</small></span></div>{submitError && <div className="catalog-message"><strong>تعذر إنشاء الحجز.</strong><p>{submitError}</p></div>}</section>}

        <footer className="booking-footer"><button type="button" className="button button-secondary" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}><ArrowRight /> السابق</button>{step < 3 ? <button type="button" className="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>التالي <ArrowLeft /></button> : <button type="button" className="button" disabled={!canContinue || submitting} onClick={submitBooking}>{submitting ? <LoaderCircle className="spin" /> : <CheckCircle2 />}{submitting ? "جار إنشاء الحجز" : "إنشاء الحجز"}</button>}</footer>
      </div>

      {complete && booking && <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="booking-complete"><span className="modal-icon"><CheckCircle2 /></span><h2 id="booking-complete">تم إنشاء طلب الحجز</h2><p>رقم الحجز: <b dir="ltr">{booking.id}</b></p><p>الحالة الحالية: {booking.status === "pending_payment" ? "بانتظار الدفع" : booking.status}</p><div><a className="button" href="/portal?view=patient">فتح لوحة المصاب</a><button className="button button-secondary" onClick={() => { setComplete(false); setBooking(undefined); setStep(0); }}>حجز موعد آخر</button></div></div></div>}
    </div>
  );
}
