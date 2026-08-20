import { AlertCircle, BadgeCheck, BookOpenCheck, CalendarDays, CheckCircle2, CreditCard, LifeBuoy, Users, Wallet } from "lucide-react";
import { countLabel, formatCurrency } from "../lib/format";
import type { AdminOverview as AdminOverviewData } from "../lib/admin";
import type { Tab } from "./AdminDashboard";

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | number; hint?: string }) {
  return <article>{icon}<span><small>{label}</small><strong>{value}</strong>{hint && <i>{hint}</i>}</span></article>;
}

/**
 * The admin dashboard's landing tab — headline metrics plus the two callouts
 * that jump straight to whichever queue actually needs attention.
 */
export default function AdminOverview({ overview, inReviewCourseCount, onSelectTab }: {
  overview: AdminOverviewData;
  inReviewCourseCount: number;
  onSelectTab: (tab: Tab) => void;
}) {
  return <>
    <div className="portal-live-metrics admin-metrics">
      <Metric icon={<Wallet />} label="المحصّل" value={formatCurrency(overview.revenue.collected)} hint={`آخر ٣٠ يوماً: ${formatCurrency(overview.revenue.collected_30d)}`} />
      <Metric icon={<CreditCard />} label="مستحق غير محصّل" value={formatCurrency(overview.revenue.outstanding)} hint={`${countLabel(overview.revenue.failed_count, ["عملية فاشلة واحدة","عمليتان فاشلتان","عمليات فاشلة","عملية فاشلة"])}`} />
      <Metric icon={<CalendarDays />} label="حجوزات اليوم" value={overview.bookings.today} hint={`${countLabel(overview.bookings.upcoming, ["جلسة قادمة مؤكدة","جلستان قادمتان","جلسات قادمة مؤكدة","جلسة قادمة مؤكدة"])}`} />
      <Metric icon={<Users />} label="المستخدمون" value={overview.users.total} hint={`${countLabel(overview.users.specialists, ["أخصائي واحد","أخصائيان","أخصائيين","أخصائياً"])} · ${countLabel(overview.users.trainers, ["مدرب واحد","مدربان","مدربين","مدرباً"])}`} />
    </div>
    <div className="portal-live-metrics admin-metrics">
      <Metric icon={<BadgeCheck />} label="طلبات انضمام معلّقة" value={overview.applications.pending} hint={`${countLabel(overview.applications.approved, ["طلب مقبول واحد","طلبان مقبولان","طلبات مقبولة","طلباً مقبولاً"])}`} />
      <Metric icon={<CheckCircle2 />} label="حجوزات مؤكدة" value={overview.bookings.confirmed} hint={`${countLabel(overview.bookings.pending_payment, ["حجز بانتظار الدفع","حجزان بانتظار الدفع","حجوزات بانتظار الدفع","حجزاً بانتظار الدفع"])}`} />
      <Metric icon={<BookOpenCheck />} label="تسجيلات الدورات" value={overview.courses.enrollments} hint={`${countLabel(overview.courses.published, ["دورة منشورة واحدة","دورتان منشورتان","دورات منشورة","دورة منشورة"])}`} />
      <Metric icon={<LifeBuoy />} label="طلبات دعم مفتوحة" value={overview.support.open} hint={`${countLabel(overview.capacity.free_slots, ["موعد متاح واحد","موعدان متاحان","مواعيد متاحة","موعداً متاحاً"])}`} />
    </div>
    {inReviewCourseCount > 0 && <div className="admin-callout">
      <AlertCircle /><span>{countLabel(inReviewCourseCount, ["دورة واحدة بانتظار الاعتماد.","دورتان بانتظار الاعتماد.","دورات بانتظار الاعتماد.","دورة بانتظار الاعتماد."])}</span>
      <button className="button button-small" onClick={() => onSelectTab("catalogue")}>مراجعتها الآن</button>
    </div>}
    {overview.applications.pending > 0 && <div className="admin-callout">
      <AlertCircle /><span>لديك {countLabel(overview.applications.pending, ["طلب انضمام واحد","طلبا انضمام","طلبات انضمام","طلب انضمام"])} بانتظار المراجعة.</span>
      <button className="button button-small" onClick={() => onSelectTab("applications")}>مراجعتها الآن</button>
    </div>}
  </>;
}
