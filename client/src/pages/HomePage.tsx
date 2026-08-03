import { ArrowLeft, BookOpenCheck, CalendarDays, CheckCircle2, Clock3, HeartHandshake, MapPin, MessageCircle, ShieldCheck, Stethoscope, Video } from "lucide-react";
import { HomeCatalog } from "../components/CatalogSections";
import PageShell from "../components/PageShell";

const careReasons = [
  { icon: CalendarDays, title: "موعد يناسب يومك", text: "اختر الموعد وطريقة الجلسة دون اتصالات متكررة." },
  { icon: HeartHandshake, title: "خطة مفهومة", text: "تعرف على هدف كل تمرين وما الذي تتابعه بين الجلسات." },
  { icon: MessageCircle, title: "متابعة مستمرة", text: "سجل تقدمك وملاحظاتك ليتمكن الأخصائي من مراجعتها." },
];

export default function HomePage() {
  return <PageShell>
    <section className="care-hero">
      <div className="container care-hero-grid">
        <div className="care-hero-copy">
          <span className="care-label">علاج طبيعي وتأهيل رياضي</span>
          <h1>نساعدك على العودة إلى الحركة بثقة.</h1>
          <p>جلسات علاج طبيعي منظمة، وخطة منزلية واضحة، ومتابعة تساعدك على معرفة ما الذي يتحسن وما الذي يحتاج إلى مراجعة.</p>
          <div className="care-actions">
            <a className="button care-primary" href="/booking">احجز موعدًا <ArrowLeft /></a>
            <a className="care-link" href="/services">تعرف على الخدمات</a>
          </div>
          <div className="care-meta">
            <span><MapPin /> جلسات في المركز</span>
            <span><Video /> متابعة عن بُعد</span>
            <span><ShieldCheck /> بيانات محمية</span>
          </div>
        </div>
        <div className="rehab-photo-hero" role="img" aria-label="صالة تدريب وتأهيل حديثة ومنظمة وخالية من الأشخاص">
          <div className="rehab-photo-shade" aria-hidden="true" />
          <div className="appointment-note"><Clock3 /><span><small>الحجز يستغرق دقائق</small><strong>اختر الخدمة والموعد المناسب</strong></span></div>
        </div>
      </div>
    </section>

    <section className="care-intro"><div className="container care-intro-grid"><div><span className="care-label">رعاية تبدأ بالاستماع</span><h2>ليست كل حالة متشابهة</h2></div><div><p>نبدأ بفهم الأثر الذي يسببه الألم أو الإصابة على يومك، ثم تُبنى الخطة حول هدف واضح: المشي براحة، العودة للنشاط، أو استعادة القدرة على أداء مهامك اليومية.</p></div></div></section>

    <section className="care-reasons"><div className="container care-reason-grid">{careReasons.map(({ icon: Icon, title, text }) => <article key={title}><Icon /><h3>{title}</h3><p>{text}</p></article>)}</div></section>

    <section className="care-services"><div className="container care-services-grid"><div className="care-service-photo" role="img" aria-label="جلسة علاج طبيعي داخل عيادة" /><div className="care-services-copy"><span className="care-label">ماذا نقدم؟</span><h2>من التقييم الأول إلى متابعة التقدم</h2><p>اختر المسار المناسب، وسيظهر لك ما تحتاج معرفته قبل الجلسة وما الذي يحدث بعدها.</p><div className="care-service-list"><a href="/booking"><Stethoscope /><span><strong>التقييم الأولي</strong><small>فهم الحالة، تحديد الهدف، واقتراح الخطوة التالية.</small></span><ArrowLeft /></a><a href="/booking"><HeartHandshake /><span><strong>جلسات العلاج والمتابعة</strong><small>تدخل علاجي وخطة منزلية قابلة للمراجعة.</small></span><ArrowLeft /></a><a href="/booking"><Video /><span><strong>متابعة عن بُعد</strong><small>للحالات المناسبة وبعد تقييم احتياجها.</small></span><ArrowLeft /></a></div></div></div></section>

    <section className="care-steps"><div className="container"><header className="care-section-head"><span className="care-label">كيف تبدأ؟</span><h2>ثلاث خطوات واضحة</h2></header><div className="care-step-grid"><article><b>1</b><h3>اختر الخدمة</h3><p>حدد نوع الجلسة وطريقة تقديمها.</p></article><article><b>2</b><h3>اختر الموعد</h3><p>راجع الأوقات المتاحة واختر الأنسب.</p></article><article><b>3</b><h3>أكمل بياناتك</h3><p>سجّل الدخول وأرسل ملخص الحالة بأمان.</p></article></div><div className="care-center-action"><a className="button care-primary" href="/booking">ابدأ الحجز الآن</a></div></div></section>

    <section className="care-learning"><div className="container"><header className="care-learning-head"><div><span className="care-label">للطلبة والممارسين</span><h2>تعلم مهني مرتبط بالممارسة</h2><p>دورات توضّح النتائج والمتطلبات وطريقة الحضور قبل التسجيل.</p></div><a className="care-link" href="/courses">عرض جميع الدورات <ArrowLeft /></a></header><HomeCatalog /></div></section>

    <section className="care-trust"><div className="container care-trust-grid"><div><span className="care-label light">خصوصيتك جزء من الرعاية</span><h2>لا نطلب بيانات أكثر مما نحتاجه.</h2><p>تُفصل الملفات الصحية عن بيانات التدريب، وتخضع السجلات والصلاحيات لسياسات وصول واضحة.</p></div><div className="care-trust-points"><span><CheckCircle2 /> تخزين خاص للملفات الطبية</span><span><CheckCircle2 /> صلاحيات حسب دور المستخدم</span><span><CheckCircle2 /> سجل للعمليات الحساسة</span><span><CheckCircle2 /> لا تُحفظ بيانات البطاقات</span></div></div></section>

    <section className="care-final"><div className="container care-final-box"><div><BookOpenCheck /><span><h2>لست متأكدًا من الخدمة المناسبة؟</h2><p>ابدأ بالتقييم الأولي، ويمكن للأخصائي توجيهك إلى المسار الأنسب.</p></span></div><a className="button care-primary" href="/booking">احجز تقييمًا أوليًا</a></div></section>
  </PageShell>;
}
