import { BadgeCheck, ClipboardCheck, Eye, ShieldCheck } from "lucide-react";
import { SpecialistsCatalog } from "../components/CatalogSections";
import PageShell from "../components/PageShell";


export default function SpecialistsPage() {
  return (
    <PageShell>
      <section className="page-hero compact-hero"><div className="container narrow"><span className="eyebrow">دليل مقدمي الخدمة</span><h1>معلومات مهنية قابلة للتحقق قبل أن تصبح قابلة للحجز</h1><p>تعرض النسخة الحالية ملفات توضيحية فقط. يُنشر الاسم الحقيقي والمؤهل والترخيص والتخصص بعد مراجعتها إدارياً.</p></div></section>
      <section className="section"><div className="container"><SpecialistsCatalog /></div></section>
      <section className="section surface-section"><div className="container"><header className="section-heading centered"><span className="kicker">ضوابط النشر</span><h2>ما الذي يعنيه «ملف موثق» في بلو ريهاب؟</h2></header><div className="principles-grid">
        <article><BadgeCheck /><h3>الهوية والمؤهل</h3><p>مطابقة بيانات الهوية بالمؤهلات والتراخيص المهنية السارية وفق المتطلبات المطبقة.</p></article>
        <article><ClipboardCheck /><h3>نطاق الممارسة</h3><p>تحديد الخدمات والتخصصات التي يستطيع مقدم الخدمة تقديمها فعلياً.</p></article>
        <article><Eye /><h3>مراجعة المحتوى</h3><p>منع الادعاءات المطلقة والوعود العلاجية أو عرض بيانات لا يمكن إثباتها.</p></article>
        <article><ShieldCheck /><h3>صلاحيات الحالات</h3><p>لا يفتح الأخصائي إلا الحالات المسندة إليه، ويسجل النظام الوصول والتعديلات الحساسة.</p></article>
      </div></div></section>
    </PageShell>
  );
}



