import {
  BadgePercent, BookOpen, CalendarDays, CreditCard, FileText, GraduationCap,
  LayoutDashboard, LifeBuoy, MapPin, RefreshCcw, ShieldCheck, Stethoscope,
  TrendingUp, TriangleAlert, UserRoundPlus, Users, Video, type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { loadTrainingApplications, type TrainingApplication } from "../lib/training";
import { AuthenticationRequiredError } from "../lib/platform";
import { loadAdminSnapshot, NotAnAdminError, type AdminSnapshot } from "../lib/admin";
import AdminApplications from "./AdminApplications";
import AdminBookings from "./AdminBookings";
import AdminCatalogue from "./AdminCatalogue";
import AdminContent from "./AdminContent";
import AdminMeetTest from "./AdminMeetTest";
import AdminOverview from "./AdminOverview";
import AdminOnsiteCourses from "./AdminOnsiteCourses";
import AdminPayments from "./AdminPayments";
import AdminPromotions from "./AdminPromotions";
import AdminRevenue from "./AdminRevenue";
import AdminSupport from "./AdminSupport";
import AdminTeam from "./AdminTeam";
import AdminTraining from "./AdminTraining";
import AdminUsers from "./AdminUsers";
import PageShell from "./PageShell";
import { SkeletonLine, SkeletonMetrics } from "./Skeleton";
import { useAsync } from "../lib/use-async";

export type Tab = "overview" | "applications" | "users" | "catalogue" | "onsite" | "content" | "bookings" | "payments" | "revenue" | "promotions" | "support" | "training" | "team" | "meetTest";

/**
 * The dashboard's map.
 *
 * Thirteen destinations used to sit in one horizontally scrolling strip, which
 * showed about six of them at a time and hid the rest behind a drag with no
 * scrollbar — so the panel could not answer "where can I go", and the seventh
 * item onward was effectively undiscoverable.
 *
 * Thirteen flat things is too many to scan even once they all fit, so they are
 * grouped by the job rather than by the table behind them: what needs watching,
 * what is queued for a decision, what is published, what moves money, and who
 * is involved. An administrator looking for «الدورات الحضورية» now looks under
 * المحتوى والدورات rather than reading thirteen labels.
 */
const NAV_GROUPS: Array<{ title: string; items: Array<{ key: Tab; label: string; icon: LucideIcon }> }> = [
  {
    title: "المتابعة",
    items: [{ key: "overview", label: "نظرة عامة", icon: LayoutDashboard }],
  },
  {
    title: "الطلبات",
    items: [
      { key: "applications", label: "طلبات الانضمام", icon: UserRoundPlus },
      { key: "training", label: "التدريب الصيفي", icon: GraduationCap },
      { key: "support", label: "الدعم", icon: LifeBuoy },
    ],
  },
  {
    title: "المحتوى والدورات",
    items: [
      { key: "catalogue", label: "الخدمات والدورات", icon: BookOpen },
      { key: "onsite", label: "الدورات الحضورية", icon: MapPin },
      { key: "content", label: "المحتوى", icon: FileText },
    ],
  },
  {
    title: "العمليات",
    items: [
      { key: "bookings", label: "الحجوزات", icon: CalendarDays },
      { key: "payments", label: "المدفوعات", icon: CreditCard },
      { key: "revenue", label: "الإيرادات", icon: TrendingUp },
      { key: "promotions", label: "أكواد الخصم", icon: BadgePercent },
    ],
  },
  {
    title: "الأشخاص وأدوات",
    items: [
      { key: "users", label: "المستخدمون", icon: Users },
      { key: "team", label: "الفريق الطبي", icon: Stethoscope },
      { key: "meetTest", label: "اختبار الاجتماع", icon: Video },
    ],
  },
];

/**
 * Which counts mean "somebody is waiting on you" rather than "this is how many
 * there are". Only these are coloured as work outstanding; a badge on
 * «المستخدمون» is a size, and colouring it the same amber would cry wolf.
 */
const PENDING_TABS = new Set<Tab>(["applications", "training", "support", "catalogue"]);

/**
 * The admin dashboard shell.
 *
 * Every domain — overview, applications, users, catalogue, content, bookings,
 * payments, support, training, team — used to be rendered inline here; each
 * now lives in its own component (mirroring how `team` already delegated to
 * `AdminTeam.tsx`), and this file is left holding only what genuinely crosses
 * tab boundaries: the single `useAsync`-loaded `AdminSnapshot` and its
 * `reload()`, the `busy`/`run()` pair every mutating action shares so two
 * actions can never race each other, and the tab strip itself.
 */
export default function AdminDashboard() {
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [training, setTraining] = useState<TrainingApplication[]>([]);

  const fetchSnapshot = useCallback(async (): Promise<AdminSnapshot | null> => {
    try {
      // Started together, not one after the other: the register is a separate
      // request only because a failure to read it should not take the whole
      // dashboard down, and awaiting it in sequence added a round trip to every
      // load for no reason.
      const [snapshot, applications] = await Promise.all([
        loadAdminSnapshot(),
        loadTrainingApplications().catch(() => []),
      ]);
      setTraining(applications);
      return snapshot;
    } catch (reason) {
      if (reason instanceof AuthenticationRequiredError) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/admin")}`;
        return null;
      }
      if (reason instanceof NotAnAdminError) { setDenied(true); return null; }
      throw reason;
    }
  }, []);

  const { data, loading, error: loadError, reload } = useAsync(fetchSnapshot, [fetchSnapshot]);
  // `run()`'s own failures used to share the load error's state; kept apart
  // for the same reason as AdminTeam's `actionError`, combined again below so
  // the rendered message is unchanged.
  const [actionError, setActionError] = useState("");
  const error = actionError || loadError;

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setActionError("");
    try { await action(); await reload(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  if (loading) return <PageShell><section className="admin-page"><div className="container" aria-busy="true">
    <div className="skeleton-head"><SkeletonLine width="110px" height={13} /><SkeletonLine width="240px" height={34} /></div>
    <SkeletonMetrics /><SkeletonMetrics />
  </div></section></PageShell>;

  if (denied) return <PageShell><section className="section"><div className="container catalog-message">
    <ShieldCheck /><strong>هذه اللوحة مخصصة للإدارة.</strong>
    <p>حسابك لا يملك صلاحية إدارية.</p>
    <Link className="button" to="/portal">الذهاب إلى حسابي</Link>
  </div></section></PageShell>;

  if (!data) return <PageShell><section className="section"><div className="container catalog-message">
    <strong>تعذر تحميل اللوحة.</strong><p>{error}</p>
    <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> إعادة المحاولة</button>
  </div></section></PageShell>;

  const { overview } = data;
  const pendingApps = data.applications.filter((item) => item.status === "pending");
  const inReviewCourses = data.courses.filter((c) => c.reviewStatus === "in_review");
  // The courses that happen in a room, and so have a register, fee bands and
  // membership claims behind them — see AdminOnsiteCourses.
  const onsiteCourses = data.courses.filter((c) => c.mode === "onsite" || c.mode === "hybrid");
  const actions = { busy, run, onError: setActionError };

  /*
   * What each destination is carrying. The review queues report *outstanding*
   * work — applications still pending, courses still in review, unread training
   * requests, open support — because that is the number that decides whether to
   * open them. The rest report a total, and anything at zero reports nothing at
   * all rather than a badge saying «0».
   */
  const counts: Partial<Record<Tab, number>> = {
    applications: pendingApps.length,
    training: training.filter((item) => item.status === "new").length,
    support: overview.support.open,
    catalogue: inReviewCourses.length,
    onsite: onsiteCourses.length,
    content: data.content.length,
    bookings: data.bookings.length,
    payments: data.payments.length,
    users: data.users.length,
  };

  return <PageShell><section className="admin-page"><div className="container">
    <header className="specialist-head">
      <div>
        <span className="eyebrow"><ShieldCheck /> لوحة الإدارة</span>
        <h1>إدارة المنصة</h1>
        <p>المستخدمون والطلبات والحجوزات والمدفوعات والدعم في مكان واحد.</p>
      </div>
      <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> تحديث</button>
    </header>

    {error && <div className="form-error" role="alert"><TriangleAlert />{error}</div>}

    <div className="admin-shell">
      <nav className="admin-nav" aria-label="أقسام لوحة الإدارة">
        {NAV_GROUPS.map((group) => <div className="admin-nav-group" key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map(({ key, label, icon: Icon }) => {
            const count = counts[key];
            return <button
              key={key} type="button" aria-current={tab === key ? "page" : undefined}
              className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}
            >
              <Icon />
              <span>{label}</span>
              {/* Rendered only when there is something in it. Thirteen «(0)»
                  badges would say nothing and cost the eye a stop each. */}
              {count ? <em className={`admin-nav-count${PENDING_TABS.has(key) ? " is-pending" : ""}`}>{count}</em> : null}
            </button>;
          })}
        </div>)}
      </nav>

      <div className="admin-main">
    {tab === "overview" && <AdminOverview overview={overview} inReviewCourseCount={inReviewCourses.length} onSelectTab={setTab} />}

    {tab === "applications" && <AdminApplications applications={data.applications} note={note} setNote={setNote} {...actions} />}

    {tab === "users" && <AdminUsers users={data.users} {...actions} />}

    {tab === "catalogue" && <AdminCatalogue
      services={data.services} courses={data.courses} trainers={data.trainers}
      note={note} setNote={setNote} reload={reload} {...actions}
    />}

    {tab === "onsite" && <AdminOnsiteCourses courses={onsiteCourses} onError={setActionError} />}

    {tab === "content" && <AdminContent content={data.content} reload={reload} {...actions} />}

    {tab === "bookings" && <AdminBookings bookings={data.bookings} />}

    {tab === "payments" && <AdminPayments payments={data.payments} onError={setActionError} reload={reload} />}

    {tab === "revenue" && <AdminRevenue />}

    {tab === "promotions" && <AdminPromotions />}

    {tab === "support" && <AdminSupport support={data.support} {...actions} />}

    {tab === "training" && <AdminTraining training={training} note={note} setNote={setNote} {...actions} />}

    {tab === "team" && <AdminTeam />}

    {tab === "meetTest" && <AdminMeetTest />}
      </div>
    </div>
  </div></section></PageShell>;
}
