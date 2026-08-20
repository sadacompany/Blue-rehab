/**
 * The informed-consent form for a remote (telehealth) session.
 *
 * NHIC "Governing Rules of Telehealth" §3.1.17 requires an informed patient
 * consent to be recorded, preferably online, *before* any telehealth activity.
 * §3.1.18 gives the patient the right to refuse or cancel at any time without
 * justification — which is why that right is written into the form itself
 * rather than buried in the terms page.
 *
 * The wording lives here, in one place, for a reason that matters more than
 * tidiness: `consent_records.consent_text` stores the exact text the patient
 * saw, and the only way to guarantee that the stored copy and the displayed
 * copy are the same words is to render both from this object. Never inline
 * consent wording into JSX — the screen and the record would drift apart, and
 * the record is only evidence for as long as they do not.
 *
 * Changing any string below is a material change to what patients are agreeing
 * to. Bump TELEHEALTH_CONSENT_VERSION when you do, so existing records stay
 * attributable to the wording they were actually given, and so the clinic can
 * tell who consented to which revision.
 */

/** Raise on every material change to the wording below. */
export const TELEHEALTH_CONSENT_VERSION = "1.0";

/** Matches `consent_records.purpose`. */
export const TELEHEALTH_CONSENT_PURPOSE = "telehealth_session";

export const TELEHEALTH_CONSENT = {
  title: "الموافقة المستنيرة على الجلسة عن بُعد",
  intro:
    "قبل تأكيد جلسة عن بُعد، يلزم أن تقرأ ما يلي وتوافق عليه صراحةً. اقرأه على مهل — الموافقة اختيارية، ورفضها لا يمنعك من حجز جلسة حضورية في المركز.",
  clauses: [
    "تُقدَّم هذه الجلسة عن بُعد عبر اتصال مرئي ومسموع مع الأخصائي، ولا تتضمن فحصاً سريرياً مباشراً ولا تدخلاً علاجياً يدوياً.",
    "يُنشأ لهذه الجلسة رابط اجتماع مرئي خاص بك. وعند استخدام Google Meet يُنشأ موعد في تقويم Google وتُرسل دعوة إلى بريدك الإلكتروني تحمل وقت الجلسة ورابطها، فيصل بريدك وعنوان الجلسة ووقتها إلى Google بوصفه مُعالِجاً للبيانات نيابة عن المركز خارج المملكة.",
    "التقييم عن بُعد محدود بطبيعته: يعتمد على ما تصفه أنت وما يمكن ملاحظته عبر الكاميرا فقط. قد لا يكفي للوصول إلى رأي نهائي، وقد يوقف الأخصائي الجلسة أو يحوّلك إلى فحص حضوري أو إلى جهة مختصة متى رأى أن التقييم عن بُعد غير كافٍ لحالتك.",
    "أُقرّ بأن ما أزوّد به الأخصائي عن حالتي وأدويتي وعملياتي السابقة صحيح وكامل بقدر علمي، لأن سلامة التوصية تعتمد عليه مباشرة.",
    "هذه الجلسة ليست قناة طوارئ. إذا كانت حالتك طارئة — ألم في الصدر، ضيق تنفس، إصابة حادة، فقدان وعي، نزيف، أو تدهور مفاجئ — فلا تنتظر الجلسة: اتصل بالهلال الأحمر السعودي على الرقم 997 أو توجّه فوراً إلى أقرب قسم طوارئ.",
    "يحق لك رفض الجلسة عن بُعد أو إلغاؤها في أي وقت ودون إبداء أي سبب، ودون أن يؤثر ذلك في حقك في الحصول على الخدمة حضورياً. ويسري على استرداد المبلغ ما تنص عليه سياسة الإلغاء المعروضة قبل الدفع.",
    "تُعالَج بياناتك وفق سياسة الخصوصية، ومنها ما تفصح عنه السياسة من معالجة بعض البيانات وتخزينها خارج المملكة العربية السعودية.",
    "تُسجَّل هذه الموافقة باسمك مقترنةً بتاريخها وساعتها وبنص الموافقة كما هو معروض أمامك الآن، ويُحفظ السجل دليلاً على ما وافقت عليه بالضبط. ولك أن تسحب موافقتك لاحقاً بالتواصل مع المركز، ولا يؤثر السحب فيما تم قبله.",
  ],
  checkboxLabel:
    "قرأت ما سبق وأوافق موافقة صريحة على تقديم هذه الجلسة عن بُعد بالشروط والحدود الموضحة أعلاه.",
} as const;

/**
 * The consent form flattened to the exact plain text that gets stored.
 *
 * Kept deterministic — no dates, no names, no locale-dependent formatting — so
 * that two records carrying the same `template_version` carry byte-identical
 * text, and a reviewer can diff a stored record against the current form to see
 * at a glance whether the wording has moved on. The *when* and *who* belong to
 * the row's own columns, not to this string.
 */
export function telehealthConsentText(): string {
  const clauses = TELEHEALTH_CONSENT.clauses.map((clause, index) => `${index + 1}. ${clause}`);
  return [
    `${TELEHEALTH_CONSENT.title} — الإصدار ${TELEHEALTH_CONSENT_VERSION}`,
    "",
    TELEHEALTH_CONSENT.intro,
    "",
    ...clauses,
    "",
    TELEHEALTH_CONSENT.checkboxLabel,
  ].join("\n");
}
