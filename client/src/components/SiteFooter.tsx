import { ArrowUpLeft } from "lucide-react";
import { Brand } from "./SiteHeader";
import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-intro">
          <Brand />
          <p>منصة لإدارة رحلة العلاج الطبيعي والتعلم التأهيلي، من الطلب الأول إلى المتابعة والتوثيق.</p>
        </div>
        <div>
          <strong>العلاج</strong>
          <Link to="/services">استشر مختص</Link>
          <Link to="/specialists">ملفات المختصين</Link>
        </div>
        <div>
          <strong>التعلم</strong>
          <Link to="/courses">الدورات التأهيلية</Link><Link to="/training">التدريب الصيفي الإكلينيكي</Link>
          <Link to="/portal?view=student">لوحة الطالب</Link>
          <Link to="/portal?view=trainer">لوحة المدرب</Link>
        </div>
        <div>
          <strong>الحوكمة</strong>
          <Link to="/privacy">سياسة الخصوصية</Link>
          <Link to="/terms">الشروط والأحكام</Link>
          <Link to="/refund-policy">الإلغاء والاسترداد</Link>
          <Link to="/contact">تواصل معنا</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 بلو ريهاب. جميع الحقوق محفوظة.</span>
        <Link to="/about">تعرف على حدود النسخة الحالية <ArrowUpLeft /></Link>
      </div>
    </footer>
  );
}

