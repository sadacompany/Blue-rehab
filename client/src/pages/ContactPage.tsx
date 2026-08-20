import { Clock3, FileLock2, LifeBuoy, Share2 } from "lucide-react";
import ContactFormConnected from "../components/ContactFormConnected";
import PageShell from "../components/PageShell";
import SocialLinks from "../components/SocialLinks";

export default function ContactPage() {
  return <PageShell><section className="page-hero compact-hero"><div className="container narrow"><span className="eyebrow"><LifeBuoy /> الدعم والتواصل</span><h1>أرسل طلب دعم مباشر إلى فريق المنصة</h1><p>يُحفظ الطلب في نظام الدعم لدينا. تجنب إرسال أي بيانات صحية أو مستندات حساسة عبر هذا النموذج.</p></div></section><section className="section"><div className="container contact-grid"><div><ContactFormConnected /></div><aside><section><FileLock2 /><h2>ما الذي لا ترسله هنا؟</h2><p>التقارير الطبية، صور الأشعة، أرقام الهوية، بيانات البطاقة أو أي ملف يتضمن معلومات صحية شخصية.</p></section><section><Clock3 /><h2>متابعة الطلب</h2><p>بعد الإرسال يظهر رقم طلب حقيقي يمكنك الاحتفاظ به للرجوع إليه عند التواصل.</p></section><section><Share2 /><h2>تابعنا</h2><p>محتوى تأهيلي ومستجدات المنصة أولًا بأول. للاستفسارات العامة انضم إلى مجموعة واتساب؛ وللطلبات التي تخص حالتك استخدم النموذج المجاور.</p><SocialLinks /></section></aside></div></section></PageShell>;
}
