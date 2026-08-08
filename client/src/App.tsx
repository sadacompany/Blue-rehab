import { lazy, Suspense } from "react";
import { Link, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import PageShell from "./components/PageShell";
import RouteChange from "./components/RouteChange";
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

// The two sections and their content live in one module: they share layout and
// data shapes, and splitting them further would trade a real gain in cohesion
// for a few kilobytes.
const ConsultationsHub = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ConsultationsHub })));
const AcademyHub = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.AcademyHub })));
const ProgramsPage = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ProgramsPage })));
const ProgramDetailPage = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ProgramDetailPage })));
const ArticlesPage = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ArticlesPage })));
const ArticleDetailPage = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ArticleDetailPage })));
const ResearchPage = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ResearchPage })));
const ResearchDetailPage = lazy(() => import("./pages/SectionPages").then((m) => ({ default: m.ResearchDetailPage })));

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

/**
 * A wrong link is usually a stale one, so the page offers the two halves of the
 * platform rather than only the front door — the visitor was heading somewhere.
 */
function NotFoundPage() {
  return <PageShell><section className="section"><div className="container narrow catalog-message">
    <h1>الصفحة غير موجودة</h1>
    <p>قد يكون الرابط قديماً أو غير مكتمل. اختر وجهتك من هنا:</p>
    <div className="not-found-actions">
      <Link className="button" to="/consultations">استشارة بلو — الحجز والبرامج</Link>
      <Link className="button button-secondary" to="/academy">أكاديمية بلو — الدورات والمقالات</Link>
    </div>
    <p><Link to="/">العودة للصفحة الرئيسية</Link> · <Link to="/contact">تواصل معنا</Link></p>
  </div></section></PageShell>;
}

export default function App() {
  return <><RouteChange /><Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/consultations" element={<ConsultationsHub />} />
      <Route path="/academy" element={<AcademyHub />} />
      <Route path="/programs" element={<ProgramsPage />} />
      <Route path="/programs/:slug" element={<ProgramDetailPage />} />
      <Route path="/articles" element={<ArticlesPage />} />
      <Route path="/articles/:slug" element={<ArticleDetailPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/research/:slug" element={<ResearchDetailPage />} />
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
  </Suspense></>;
}
