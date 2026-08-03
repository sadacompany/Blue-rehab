import { Award, BookOpenCheck, CheckCircle2, FileCheck2, Gauge, GraduationCap } from "lucide-react";
import { CoursesCatalog } from "../components/CatalogSections";
import PageShell from "../components/PageShell";


export default function CoursesPage() {
  return (
    <PageShell>
      <section className="page-hero courses-hero"><div className="container hero-inline"><div><span className="eyebrow"><GraduationCap /> المسار التدريبي</span><h1>تعلم منظم يبدأ بهدف وينتهي بدليل على الإنجاز</h1><p>الدورة الجيدة لا تختصر في عدد الساعات؛ لذلك نعرض النتائج والمحاور والمتطلبات وسياسة الحضور وشروط الإكمال قبل التسجيل.</p></div><div className="hero-checks"><span><BookOpenCheck /> وحدات ودروس مرتبة</span><span><Gauge /> تقدم قابل للقياس</span><span><FileCheck2 /> حضور ومتطلبات موثقة</span><span><Award /> شهادة وفق شروط معلنة</span></div></div></section>
      <section className="section"><div className="container"><header className="section-heading"><span className="kicker">كتالوج متصل بقاعدة البيانات</span><h2>اختر النمط والمستوى المناسبين</h2><p>جميع العناصر الحالية نماذج تشغيلية، وليست إعلانات تسجيل نهائية.</p></header><CoursesCatalog /></div></section>
      <section className="section surface-section"><div className="container completion-grid"><div><span className="kicker">من التسجيل إلى الشهادة</span><h2>لا تصدر الشهادة لمجرد الدفع</h2><p>يحدد مدير الدورة شروط الإكمال قبل النشر، وتظهر للطالب داخل صفحة الدورة.</p></div><ul className="check-list strong-list"><li><CheckCircle2 /> بلوغ نسبة الحضور المطلوبة.</li><li><CheckCircle2 /> إكمال الوحدات الإلزامية.</li><li><CheckCircle2 /> تسليم المهام أو اجتياز التقييم، عند وجوده.</li><li><CheckCircle2 /> اكتمال الدورة واعتماد النتيجة.</li></ul></div></section>
    </PageShell>
  );
}



