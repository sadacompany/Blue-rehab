import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, CreditCard, LoaderCircle, MapPin, RefreshCcw, ShieldCheck, Ticket, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadCourseDetail } from "../lib/catalog";
import { formatCurrency, formatDate } from "../lib/format";
import { AuthenticationRequiredError, startCheckout } from "../lib/platform";
import { storedPromoCode } from "../lib/promotions";
import {
  GOAL_OTHER, KNOWLEDGE_SCALE, REGISTRATION_GOALS, REGISTRATION_TOPICS,
  loadCoursePriceTiers, loadOnsiteCourseInfo, quoteRegistration, submitOnsiteRegistration,
  type CoursePriceTier, type OnsiteCourseInfo, type RegistrationQuote,
} from "../lib/registration";
import { useAsync } from "../lib/use-async";
import PageShell from "./PageShell";
import { SkeletonLine } from "./Skeleton";

/**
 * Registering for a course you attend in person.
 *
 * An online course is a button; this is a conversation, and it is long enough
 * that presenting it as one page would be its own reason not to finish. So it
 * is four steps, in the order the original form asks them — who you are, what
 * you bring and want, what you are paying as, and then the total — with the
 * price recomputed by the server at every point it can change.
 *
 * The figure on the last step is never calculated here. `quoteRegistration()`
 * asks the same function that will do the charging, which is the only way the
 * summary and the receipt are guaranteed to agree.
 */

const STEPS = ["المعلومات الشخصية", "خبرتك وأهدافك", "الفئة والعضوية", "المراجعة والدفع"] as const;

type Form = {
  fullName: string; phone: string; email: string;
  organization: string; jobTitle: string; yearsExperience: string;
  knowledgeLevel: number; attendedSimilar: boolean | null;
  goals: string[]; goalOther: string; topics: string[]; question: string;
  tierKey: string; isMember: boolean | null; membershipNumber: string; promoCode: string;
};

const BLANK: Form = {
  fullName: "", phone: "", email: "",
  organization: "", jobTitle: "", yearsExperience: "",
  knowledgeLevel: 0, attendedSimilar: null,
  goals: [], goalOther: "", topics: [], question: "",
  tierKey: "", isMember: null, membershipNumber: "", promoCode: "",
};

/** Toggle a value in a multiple-choice answer. */
const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/**
 * What is still missing on the step being shown.
 *
 * Returned as a message rather than a boolean so the button can say why it is
 * disabled. A required field that silently refuses to advance is the single
 * most common way a long form is abandoned.
 */
function whatIsMissing(step: number, form: Form, tiers: CoursePriceTier[]): string {
  if (step === 0) {
    if (form.fullName.trim().split(/\s+/).filter(Boolean).length < 2) return "اكتب اسمك كاملاً.";
    if (!/^[0-9+][0-9 +()-]{6,19}$/.test(form.phone.trim())) return "أدخل رقم جوال صحيحاً.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return "أدخل بريداً إلكترونياً صحيحاً.";
    return "";
  }
  if (step === 1) {
    if (!form.knowledgeLevel) return "حدد مستوى معرفتك الحالي بموضوع الدورة.";
    if (form.attendedSimilar === null) return "أخبرنا إن كنت قد حضرت دورة مشابهة.";
    if (!form.goals.length) return "اختر هدفاً واحداً على الأقل.";
    if (form.goals.includes(GOAL_OTHER) && !form.goalOther.trim()) return "اكتب هدفك في خانة «أخرى».";
    if (!form.topics.length) return "اختر محوراً واحداً على الأقل.";
    return "";
  }
  if (step === 2) {
    if (tiers.length && !form.tierKey) return "اختر فئة التسجيل.";
    if (form.isMember === null) return "أخبرنا إن كنت من حاملي العضوية.";
    if (form.isMember && !form.membershipNumber.trim()) return "أدخل رقم العضوية.";
    return "";
  }
  return "";
}

export default function OnsiteRegistrationFlow({ slug }: { slug: string }) {
  const { data, error: loadError, loading, reload } = useAsync(() => loadCourseDetail(slug), [slug]);
  const [step, setStep] = useState(0);
  // The promotion code the visitor arrived with, if they followed a campaign
  // link. Prefilled rather than applied — it still has to be accepted by the
  // server against this specific order.
  const [form, setForm] = useState<Form>(() => ({ ...BLANK, promoCode: storedPromoCode() }));
  const [tiers, setTiers] = useState<CoursePriceTier[]>([]);
  const [info, setInfo] = useState<OnsiteCourseInfo | null>(null);
  const [quote, setQuote] = useState<RegistrationQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);

  const course = data?.course ?? null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!course?.id) return;
    let alive = true;
    // Started together: neither blocks the other, and the form is usable
    // before either lands — the venue line and the fee bands are additions to
    // a page that already knows what course it is.
    void Promise.all([
      loadCoursePriceTiers(course.id).catch(() => [] as CoursePriceTier[]),
      loadOnsiteCourseInfo(course.id).catch(() => null),
    ]).then(([rows, courseInfo]) => {
      if (!alive) return;
      setTiers(rows);
      setInfo(courseInfo);
      // One band is not a choice. Selecting it silently keeps the question off
      // the screen entirely rather than asking something with one answer.
      if (rows.length === 1) setForm((prev) => ({ ...prev, tierKey: rows[0].key }));
    });
    return () => { alive = false; };
  }, [course?.id]);

  // Re-price whenever anything that decides the price changes. Runs on the
  // membership and review steps only — before that there is nothing to price.
  const priceInputs = `${form.tierKey}|${form.isMember}|${form.promoCode.trim()}`;
  useEffect(() => {
    if (!course?.id || step < 2) return;
    if (tiers.length && !form.tierKey) return;
    if (form.isMember === null) return;

    let alive = true;
    setQuoteError("");
    void quoteRegistration({
      courseId: course.id,
      tierKey: form.tierKey,
      isMember: Boolean(form.isMember),
      promoCode: form.promoCode,
    })
      .then((result) => { if (alive) setQuote(result); })
      .catch((reason: unknown) => {
        if (!alive) return;
        // A refused code must not also blank the price — the attendee should
        // see what they would pay without it, alongside the reason it failed.
        setQuote(null);
        setQuoteError(reason instanceof Error ? reason.message : "تعذر حساب الرسوم.");
      });
    return () => { alive = false; };
    // `priceInputs` is the whole of what this depends on, flattened so a change
    // to any one of the three refetches exactly once.
  }, [course?.id, step, tiers.length, priceInputs, form.tierKey, form.isMember, form.promoCode]);

  const missing = useMemo(() => whatIsMissing(step, form, tiers), [step, form, tiers]);

  async function submit() {
    if (!course) return;
    setBusy(true);
    setSubmitError("");
    try {
      const result = await submitOnsiteRegistration({
        courseId: course.id,
        tierKey: form.tierKey,
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        organization: form.organization,
        jobTitle: form.jobTitle,
        yearsExperience: form.yearsExperience,
        knowledgeLevel: form.knowledgeLevel,
        attendedSimilar: Boolean(form.attendedSimilar),
        goals: form.goals,
        goalOther: form.goalOther,
        topics: form.topics,
        question: form.question,
        isMember: Boolean(form.isMember),
        membershipNumber: form.membershipNumber,
        promoCode: form.promoCode,
      });
      // Straight to the gateway. Nothing is confirmed yet and the screen does
      // not claim otherwise — the seat is created when the payment verifies.
      const { paymentUrl } = await startCheckout(result.orderNumber);
      window.location.href = paymentUrl;
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setSubmitError(reason instanceof Error ? reason.message : "تعذر إتمام التسجيل.");
      setBusy(false);
    }
  }

  if (loading) return <PageShell><section className="section"><div className="container" aria-busy="true">
    <SkeletonLine width="220px" height={30} /><SkeletonLine width="100%" height={220} />
  </div></section></PageShell>;

  if (loadError || !course) return <PageShell><section className="section"><div className="container catalog-message">
    <strong>تعذر تحميل الدورة.</strong><p>قد تكون غير منشورة أو تعذر الاتصال مؤقتاً.</p>
    <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button>
    <Link className="button" to="/courses">العودة إلى الدورات</Link>
  </div></section></PageShell>;

  return <PageShell><section className="section"><div className="container registration-page">
    <header className="registration-head">
      <span className="eyebrow"><Users /> تسجيل حضوري</span>
      <h1>{course.title}</h1>
      <div className="course-keyfacts">
        {course.startsAt && <span><CalendarDays /> {formatDate(course.startsAt)}</span>}
        {info?.venue && <span><MapPin /> {info.venue}</span>}
        {info?.capacity !== null && info?.capacity !== undefined
          && <span><Users /> {info.capacity} مقعداً</span>}
      </div>
    </header>

    {/* A step counter, not a progress bar: the number of questions left is the
        thing being asked about, and four labelled steps say it better. */}
    <ol className="registration-steps">
      {STEPS.map((label, index) => <li key={label}
        className={index === step ? "is-current" : index < step ? "is-done" : ""}
        aria-current={index === step ? "step" : undefined}>
        <i>{index < step ? <Check /> : index + 1}</i><span>{label}</span>
      </li>)}
    </ol>

    <div className="registration-card">
      {step === 0 && <>
        <label><span>الاسم الثلاثي *</span>
          <input value={form.fullName} onChange={(event) => set("fullName", event.target.value)} /></label>
        <div className="specialist-plan-composer-row">
          <label><span>رقم الجوال *</span>
            <input dir="ltr" inputMode="tel" value={form.phone}
              onChange={(event) => set("phone", event.target.value)} /></label>
          <label><span>البريد الإلكتروني *</span>
            <input dir="ltr" inputMode="email" value={form.email}
              onChange={(event) => set("email", event.target.value)} /></label>
        </div>
        <div className="specialist-plan-composer-row">
          <label><span>جهة العمل / الجامعة</span>
            <input value={form.organization} onChange={(event) => set("organization", event.target.value)} /></label>
          <label><span>المسمى الوظيفي</span>
            <input value={form.jobTitle} onChange={(event) => set("jobTitle", event.target.value)} /></label>
          <label><span>سنوات الخبرة</span>
            <input value={form.yearsExperience} onChange={(event) => set("yearsExperience", event.target.value)} /></label>
        </div>
        <p className="application-hint">
          نستخدم بريدك لإرسال تأكيد التسجيل وتفاصيل الحضور. لن يُنشر أي من هذه البيانات.
        </p>
      </>}

      {step === 1 && <>
        <fieldset className="registration-scale">
          <legend>كيف تقيم مستوى معرفتك الحالي بموضوع الدورة؟ *</legend>
          <div className="scale-row">
            <small>{KNOWLEDGE_SCALE.minLabel}</small>
            {Array.from({ length: KNOWLEDGE_SCALE.max }, (_, index) => index + 1).map((value) => <button
              key={value} type="button" aria-pressed={form.knowledgeLevel === value}
              className={form.knowledgeLevel === value ? "is-active" : ""}
              onClick={() => set("knowledgeLevel", value)}
            >{value}</button>)}
            <small>{KNOWLEDGE_SCALE.maxLabel}</small>
          </div>
        </fieldset>

        <fieldset>
          <legend>هل سبق لك حضور دورة مشابهة؟ *</legend>
          <div className="chip-grid">
            {[["نعم", true], ["لا", false]].map(([label, value]) => <button
              key={String(label)} type="button" aria-pressed={form.attendedSimilar === value}
              className={`chip${form.attendedSimilar === value ? " selected" : ""}`}
              onClick={() => set("attendedSimilar", value as boolean)}
            >{label as string}</button>)}
          </div>
        </fieldset>

        <fieldset>
          <legend>ما الهدف الرئيسي من حضورك للدورة؟ *</legend>
          <div className="chip-grid">
            {REGISTRATION_GOALS.map((goal) => <button
              key={goal} type="button" aria-pressed={form.goals.includes(goal)}
              className={`chip${form.goals.includes(goal) ? " selected" : ""}`}
              onClick={() => set("goals", toggle(form.goals, goal))}
            >{goal}</button>)}
          </div>
          {form.goals.includes(GOAL_OTHER) && <label><span>اذكر هدفك</span>
            <input value={form.goalOther} onChange={(event) => set("goalOther", event.target.value)} /></label>}
        </fieldset>

        <fieldset>
          <legend>أي المحاور التالية يهمك أكثر؟ *</legend>
          <div className="chip-grid">
            {REGISTRATION_TOPICS.map((topic) => <button
              key={topic} type="button" aria-pressed={form.topics.includes(topic)}
              className={`chip${form.topics.includes(topic) ? " selected" : ""}`}
              onClick={() => set("topics", toggle(form.topics, topic))}
            >{topic}</button>)}
          </div>
        </fieldset>

        <label><span>ما أكثر سؤال أو موضوع تتمنى أن تجد إجابته خلال الدورة؟</span>
          <textarea rows={3} value={form.question}
            onChange={(event) => set("question", event.target.value)} /></label>
      </>}

      {step === 2 && <>
        {tiers.length > 1 && <fieldset>
          <legend>فئة التسجيل *</legend>
          <div className="tier-grid">
            {tiers.map((tier) => <button
              key={tier.key} type="button" aria-pressed={form.tierKey === tier.key}
              className={`tier-option${form.tierKey === tier.key ? " is-active" : ""}`}
              onClick={() => set("tierKey", tier.key)}
            ><b>{tier.label}</b><span>{formatCurrency(tier.price)}</span></button>)}
          </div>
        </fieldset>}

        <fieldset>
          <legend>
            هل أنت من حاملي العضوية؟ *
            {/* Naming the rate turns the question into an offer. Shown only
                where the course actually has one — an unqualified «خصم
                للأعضاء» over a course with no member rate is a promise. */}
            {info?.membershipDiscountPercent
              ? <small> — خصم {info.membershipDiscountPercent}% لحاملي عضوية تأهيل بلو</small>
              : null}
          </legend>
          <div className="chip-grid">
            {[["نعم", true], ["لا", false]].map(([label, value]) => <button
              key={String(label)} type="button" aria-pressed={form.isMember === value}
              className={`chip${form.isMember === value ? " selected" : ""}`}
              onClick={() => set("isMember", value as boolean)}
            >{label as string}</button>)}
          </div>
          {form.isMember === true && <>
            <label><span>رقم العضوية *</span>
              <input dir="ltr" value={form.membershipNumber}
                onChange={(event) => set("membershipNumber", event.target.value)} /></label>
            {/* The form this replaces promises the same check. Saying it here,
                before payment, is the difference between a condition and a
                surprise. */}
            <p className="application-hint">
              <ShieldCheck /> يُطبَّق خصم العضوية فوراً، ويُتحقق من رقم العضوية قبل تأكيد الحضور.
            </p>
          </>}
        </fieldset>

        {/* Offered only where it can be used. Membership and a code do not
            stack, and the server refuses the combination — so the box is not
            shown at all rather than shown and then rejected. */}
        {form.isMember === false && <label><span>كود خصم (اختياري)</span>
          <span className="suffixed-field">
            <Ticket />
            <input dir="ltr" value={form.promoCode} placeholder="SARA20"
              onChange={(event) => set("promoCode", event.target.value.toUpperCase())} />
          </span></label>}
      </>}

      {step === 3 && <div className="registration-summary">
        <h2>ملخص التسجيل</h2>
        <dl>
          <div><dt>الاسم</dt><dd>{form.fullName}</dd></div>
          <div><dt>الجوال</dt><dd dir="ltr">{form.phone}</dd></div>
          <div><dt>البريد</dt><dd dir="ltr">{form.email}</dd></div>
          {tiers.length > 1 && <div><dt>الفئة</dt>
            <dd>{tiers.find((tier) => tier.key === form.tierKey)?.label ?? "—"}</dd></div>}
          <div><dt>العضوية</dt><dd>{form.isMember ? `نعم — ${form.membershipNumber}` : "لا"}</dd></div>
        </dl>

        {quoteError && <div className="form-error" role="alert">{quoteError}</div>}

        {quote && <div className="registration-total">
          <div><span>رسوم الدورة</span><b>{formatCurrency(quote.grossAmount)}</b></div>
          {quote.discountAmount > 0 && <div className="is-discount">
            <span>الخصم{quote.discountLabel ? ` — ${quote.discountLabel}` : ""}</span>
            <b>−{formatCurrency(quote.discountAmount)}</b>
          </div>}
          <div className="is-total"><span>الإجمالي</span><b>{formatCurrency(quote.netAmount)}</b></div>
        </div>}

        {!quote && !quoteError && <SkeletonLine width="100%" height={72} />}

        <p className="application-hint">
          <BadgeCheck /> لا يُحجز مقعدك إلا بعد اكتمال الدفع. تُمنح المقاعد حسب أولوية إكمال التسجيل.
        </p>
        <p className="application-hint"><ShieldCheck /> لا تُخزن بيانات البطاقة في المنصة.</p>

        {submitError && <div className="form-error" role="alert">{submitError}</div>}
      </div>}
    </div>

    {missing && <p className="registration-missing" role="status">{missing}</p>}

    <div className="registration-actions">
      {step > 0 && <button className="button button-secondary" type="button" disabled={busy}
        onClick={() => setStep((current) => current - 1)}><ArrowRight /> السابق</button>}

      {step < STEPS.length - 1
        ? <button className="button" type="button" disabled={Boolean(missing)}
            onClick={() => setStep((current) => current + 1)}>التالي <ArrowLeft /></button>
        : <button className="button" type="button" disabled={busy || !quote}
            onClick={() => void submit()}>
            {busy ? <LoaderCircle className="spin" /> : <CreditCard />}
            {quote ? `ادفع ${formatCurrency(quote.netAmount)}` : "جارٍ حساب الرسوم"}
          </button>}
    </div>
  </div></section></PageShell>;
}
