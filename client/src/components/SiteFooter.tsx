import { AlertTriangle, ArrowUpLeft } from "lucide-react";
import { Brand } from "./SiteHeader";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container emergency-note">
        <AlertTriangle />
        <p><strong>تنبيه صحي:</strong> المنصة لا تقدم خدمة إسعافية ولا تستبدل التقييم الطبي العاجل. عند وجود أعراض طارئة تواصل فوراً مع الجهات الصحية المختصة.</p>
      </div>
      <div className="container footer-grid">
        <div className="footer-intro">
          <Brand />
          <p>منصة لإدارة رحلة العلاج الطبيعي والتعلم التأهيلي، من الطلب الأول إلى المتابعة والتوثيق.</p>
        </div>
        <div>
          <strong>العلاج</strong>
          <a href="/services">الجلسات والخدمات</a>
          <a href="/specialists">ملفات المختصين</a>
          <a href="/booking">مسار الحجز</a>
        </div>
        <div>
          <strong>التعلم</strong>
          <a href="/courses">الدورات التأهيلية</a>
          <a href="/portal?view=student">لوحة الطالب</a>
          <a href="/portal?view=trainer">لوحة المدرب</a>
        </div>
        <div>
          <strong>الحوكمة</strong>
          <a href="/privacy">سياسة الخصوصية</a>
          <a href="/terms">الشروط والأحكام</a>
          <a href="/refund-policy">الإلغاء والاسترداد</a>
          <a href="/contact">تواصل معنا</a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 بلو ريهاب. جميع الحقوق محفوظة.</span>
        <a href="/about">تعرف على حدود النسخة الحالية <ArrowUpLeft /></a>
      </div>
    </footer>
  );
}

