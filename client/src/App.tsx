import { Route, Routes, useParams, useSearchParams } from "react-router-dom";
import BookingFlowConnected from "./components/BookingFlowConnected";
import ConnectedPortal from "./components/ConnectedPortal";
import CourseDetailConnected from "./components/CourseDetailConnected";
import PageShell from "./components/PageShell";
import AboutPage from "./pages/AboutPage";
import AuthPage from "./pages/AuthPage";
import ContactPage from "./pages/ContactPage";
import CoursesPage from "./pages/CoursesPage";
import FaqPage from "./pages/FaqPage";
import HomePage from "./pages/HomePage";
import PrivacyPage from "./pages/PrivacyPage";
import RefundPolicyPage from "./pages/RefundPolicyPage";
import ServicesPage from "./pages/ServicesPage";
import SpecialistsPage from "./pages/SpecialistsPage";
import TermsPage from "./pages/TermsPage";

function BookingPage() {
  const [params] = useSearchParams();
  return <PageShell><section className="booking-page"><div className="container"><header className="booking-page-head"><span className="eyebrow">حجز متصل بقاعدة البيانات</span><h1>حجز جلسة علاج طبيعي</h1><p>اختر الخدمة والمختص والموعد، ثم سجّل الدخول لإنشاء الحجز وحفظه في حسابك.</p></header><BookingFlowConnected initialService={params.get("service") ?? undefined} initialSpecialist={params.get("specialist") ?? undefined} /></div></section></PageShell>;
}

function CoursePage() {
  const { slug = "advanced-knee-rehab" } = useParams();
  return <PageShell><CourseDetailConnected slug={slug} /></PageShell>;
}

function NotFoundPage() {
  return <PageShell><section className="section"><div className="container catalog-message"><strong>الصفحة غير موجودة.</strong><p>تحقق من الرابط أو عد إلى الصفحة الرئيسية.</p><a className="button" href="/">العودة للرئيسية</a></div></section></PageShell>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/services" element={<ServicesPage />} />
    <Route path="/specialists" element={<SpecialistsPage />} />
    <Route path="/courses" element={<CoursesPage />} />
    <Route path="/courses/:slug" element={<CoursePage />} />
    <Route path="/booking" element={<BookingPage />} />
    <Route path="/portal" element={<ConnectedPortal />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/faq" element={<FaqPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/refund-policy" element={<RefundPolicyPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
