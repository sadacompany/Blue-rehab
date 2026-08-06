import { lazy, Suspense } from "react";
import { Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import PageShell from "./components/PageShell";
import HomePage from "./pages/HomePage";

/**
 * Everything but the landing page is loaded on demand.
 *
 * The whole application used to ship as one 577 KB chunk, so a first-time
 * visitor downloaded the specialist dashboard, the payment callback and the
 * legal pages before they could read the home page — on a phone, over mobile
 * data, that is the slowest moment of the entire journey.
 */
const AboutPage = lazy(() => import("./pages/AboutPage"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const BookingFlowConnected = lazy(() => import("./components/BookingFlowConnected"));
const ConnectedPortal = lazy(() => import("./components/ConnectedPortal"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const CourseDetailConnected = lazy(() => import("./components/CourseDetailConnected"));
const CoursesPage = lazy(() => import("./pages/CoursesPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const JoinProviderPage = lazy(() => import("./pages/JoinProviderPage"));
const PaymentCallbackPage = lazy(() => import("./pages/PaymentCallbackPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const RefundPolicyPage = lazy(() => import("./pages/RefundPolicyPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const SpecialistDashboard = lazy(() => import("./components/SpecialistDashboard"));
const SpecialistsPage = lazy(() => import("./pages/SpecialistsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const TrainerDashboard = lazy(() => import("./components/TrainerDashboard"));

function RouteFallback() {
  return <PageShell><section className="section"><div className="container"><div className="booking-loader"><LoaderCircle className="spin" /><p>جارٍ التحميل…</p></div></div></section></PageShell>;
}

function BookingPage() {
  const [params] = useSearchParams();
  return <PageShell><section className="booking-page"><div className="container"><header className="booking-page-head"><span className="eyebrow">حجز جلسة</span><h1>حجز جلسة علاج طبيعي</h1><p>اختر الخدمة والمختص والموعد، ثم سجّل الدخول لتأكيد الحجز.</p></header><BookingFlowConnected initialService={params.get("service") ?? undefined} initialSpecialist={params.get("specialist") ?? undefined} /></div></section></PageShell>;
}

function CoursePage() {
  const { slug = "advanced-knee-rehab" } = useParams();
  return <PageShell><CourseDetailConnected slug={slug} /></PageShell>;
}

function NotFoundPage() {
  return <PageShell><section className="section"><div className="container catalog-message"><strong>الصفحة غير موجودة.</strong><p>تحقق من الرابط أو عد إلى الصفحة الرئيسية.</p><a className="button" href="/">العودة للرئيسية</a></div></section></PageShell>;
}

export default function App() {
  return <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/specialists" element={<SpecialistsPage />} />
      <Route path="/courses" element={<CoursesPage />} />
      <Route path="/courses/:slug" element={<CoursePage />} />
      <Route path="/booking" element={<BookingPage />} />
      <Route path="/portal" element={<ConnectedPortal />} />
      <Route path="/specialist" element={<SpecialistDashboard />} />
      <Route path="/trainer" element={<TrainerDashboard />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/join" element={<JoinProviderPage />} />
      <Route path="/payment/callback" element={<PaymentCallbackPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/refund-policy" element={<RefundPolicyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>;
}
