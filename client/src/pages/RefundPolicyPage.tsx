import { BadgeDollarSign, CheckCircle2 } from "lucide-react";
import PageShell from "../components/PageShell";


export default function RefundPolicyPage() {
  return <PageShell><section className="legal-hero"><div className="container narrow"><span className="eyebrow"><BadgeDollarSign /> الإلغاء والاسترداد</span><h1>سياسة تشغيلية واضحة قبل الدفع</h1><p>المصفوفة أدناه مقترح إعداد للنسخة الأولى، وليست عرضاً تجارياً نافذاً. تعتمد الإدارة القيم النهائية بعد مراجعة الأنظمة ورسوم بوابة الدفع.</p></div></section><section className="section"><div className="container policy-layout"><article className="legal-content">
    <section><h2>1. القاعدة العامة</h2><p>تظهر السياسة والمبلغ المتوقع استرداده قبل تأكيد الإلغاء. يسجل النظام وقت الطلب والسبب والحالة والمبلغ المرجعي وقرار المعالجة.</p></section>
    <section><h2>2. الجلسات العلاجية — إعداد مقترح</h2><div className="policy-table"><div><strong>قبل الموعد بأكثر من 24 ساعة</strong><span>استرداد كامل لقيمة الخدمة، مع بيان أي رسوم غير قابلة للاسترداد قانوناً.</span></div><div><strong>بين 6 و24 ساعة</strong><span>استرداد 50% أو إعادة جدولة واحدة دون فرق، بحسب الخيار المنشور.</span></div><div><strong>أقل من 6 ساعات أو عدم الحضور</strong><span>لا استرداد، مع مسار استثناء للحالات الموثقة التي تعتمدها الإدارة.</span></div></div></section>
    <section><h2>3. الدورات — إعداد مقترح</h2><div className="policy-table"><div><strong>قبل البداية بسبعة أيام أو أكثر</strong><span>استرداد كامل وفق رسوم البوابة المعلنة.</span></div><div><strong>من يومين إلى أقل من سبعة أيام</strong><span>استرداد 50% إذا لم يفتح محتوى مدفوع مقيّد.</span></div><div><strong>أقل من 48 ساعة أو بعد فتح المحتوى</strong><span>لا استرداد اعتيادي؛ تراجع الحالات الاستثنائية وفق النظام.</span></div></div></section>
    <section><h2>4. الإلغاء من المنصة</h2><p>إذا ألغت المنصة الجلسة أو الدورة ولم توفر بديلاً يقبله المستخدم، يعاد المبلغ المدفوع للخدمة الملغاة كاملاً. لا تطبق عقوبة على المستخدم.</p></section>
    <section><h2>5. فرق السعر وإعادة الجدولة</h2><p>إذا كان الموعد البديل أعلى سعراً، يظهر الفرق قبل التأكيد. وإذا كان أقل، يسجل فرق الاسترداد. لا ينفذ أي تعديل مالي بصمت.</p></section>
    <section><h2>6. مدة المعالجة</h2><p>تبدأ المعالجة بعد اعتماد القرار، ويعتمد زمن وصول المبلغ على بوابة الدفع والبنك. ينشر الحد المتوقع والقناة الرسمية للاستفسار قبل الإطلاق.</p></section>
    <section><h2>7. منع التكرار والنزاعات</h2><p>يرتبط كل استرداد بمرجع دفع واحد ومبلغ متبقٍ قابل للاسترداد، لمنع التكرار أو تجاوز المبلغ الأصلي. تحفظ القرارات في سجل العمليات.</p></section>
  </article><aside className="policy-side"><h2>ما الذي يراه المستخدم؟</h2>{["السياسة قبل الدفع.","المبلغ المتوقع قبل الإلغاء.","حالة الطلب وتاريخ آخر تحديث.","مرجع العملية بعد التنفيذ.","سبب الرفض أو المبلغ الجزئي."].map((item) => <span key={item}><CheckCircle2 /> {item}</span>)}</aside></div></section></PageShell>;
}



