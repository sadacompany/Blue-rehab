import { AlertCircle, ArrowLeft, Building2, Camera, CheckCircle2, ClipboardList, FileUp, MonitorCheck, ShieldAlert, Video } from "lucide-react";
import { ServicesCatalog } from "../components/CatalogSections";
import PageShell from "../components/PageShell";


export default function ServicesPage() {
  return (
    <PageShell>
      <section className="page-hero">
        <div className="container narrow"><span className="eyebrow">مسار العلاج الطبيعي</span><h1>جلسة واضحة الغرض، وخطة يمكن متابعتها بعد الموعد</h1><p>ابدأ بتقييم أولي أو جلسة علاجية أو متابعة. تظهر طريقة التقديم والمدة والسعر والسياسة قبل تأكيد الطلب.</p><div className="page-actions"><a className="button" href="/booking">ابدأ الحجز</a><a className="button button-secondary" href="#service-list">قارن الخدمات</a></div></div>
      </section>

      <section className="section" id="service-list">
        <div className="container"><header className="section-heading"><span className="kicker">الخدمات المتاحة في قاعدة البيانات</span><h2>اختر بحسب المرحلة السريرية، لا بحسب اسم تسويقي</h2><p>القيم الحالية توضيحية إلى أن تعتمد الإدارة قائمة مقدمي الخدمة والأسعار.</p></header><ServicesCatalog /></div>
      </section>

      <section className="section surface-section">
        <div className="container compare-grid">
          <article><span className="large-icon"><Building2 /></span><small>في المركز</small><h2>عندما يتطلب التقييم فحصاً مباشراً</h2><ul className="check-list"><li><CheckCircle2 /> اختيار الفرع والموعد المتاح.</li><li><CheckCircle2 /> تعليمات الوصول والاستعداد قبل الزيارة.</li><li><CheckCircle2 /> تسجيل الحضور والغرفة عند الحاجة.</li><li><CheckCircle2 /> منع تعارض الموعد مع حجوزات أخرى.</li></ul></article>
          <article><span className="large-icon"><Video /></span><small>عن بُعد</small><h2>للمتابعة أو التقييم الذي تسمح به طبيعة الحالة</h2><ul className="check-list"><li><CheckCircle2 /> رابط آمن محدود الصلاحية.</li><li><CheckCircle2 /> الموعد حسب توقيت المستخدم المحلي.</li><li><CheckCircle2 /> إرشادات للكاميرا والإضاءة ومساحة الحركة.</li><li><CheckCircle2 /> لا تستخدم عن بُعد إذا استلزم الأمر فحصاً مباشراً.</li></ul></article>
        </div>
      </section>

      <section className="section">
        <div className="container timeline-section">
          <header className="section-heading"><span className="kicker">قبل الجلسة وبعدها</span><h2>المعلومات المطلوبة مرتبطة بقرار أو إجراء</h2></header>
          <div className="timeline-grid">
            <article><span>1</span><FileUp /><h3>ملخص الحالة والملفات</h3><p>الشكوى، المنطقة المتأثرة، بداية الأعراض، شدة الألم، التاريخ الصحي والتقارير ذات الصلة.</p></article>
            <article><span>2</span><ClipboardList /><h3>التقييم والتوثيق</h3><p>يسجل الأخصائي الملاحظات والانطباع السريري والأهداف وعدد الجلسات المقترح والاحتياطات.</p></article>
            <article><span>3</span><MonitorCheck /><h3>الخطة المنزلية</h3><p>تمارين موضحة بوسائط وتعليمات سلامة وجدول تنفيذ ومؤشرات تستدعي التواصل.</p></article>
            <article><span>4</span><Camera /><h3>التقدم والمراجعة</h3><p>يسجل المستفيد الإنجاز والألم والملاحظات، ويراجع الأخصائي السجل قبل تعديل الخطة.</p></article>
          </div>
        </div>
      </section>

      <section className="section safety-panel-section">
        <div className="container safety-panel"><ShieldAlert /><div><span className="kicker light">حدود السلامة</span><h2>لا وعود بنتائج علاجية، ولا تشخيص إسعافي عبر المنصة</h2><p>النتائج تختلف باختلاف الحالة والالتزام والاستجابة. أي ألم حاد مفاجئ، ضعف جديد، صعوبة تنفس، فقدان وعي أو أعراض مقلقة يستدعي التواصل مع جهة صحية عاجلة.</p></div><a className="button button-light" href="/faq">الأسئلة الصحية الشائعة <ArrowLeft /></a></div>
      </section>

      <section className="section compact-section"><div className="container info-callout"><AlertCircle /><div><strong>رفع الملفات غير مفعل للزائر.</strong><p>لا تُرفع التقارير أو الأشعة إلا داخل حساب موثق وبعد الموافقة على مشاركة البيانات مع الأخصائي المعالج.</p></div></div></section>
    </PageShell>
  );
}



