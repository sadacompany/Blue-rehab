import { RefreshCcw, ShieldCheck } from "lucide-react";
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
import AdminPayments from "./AdminPayments";
import AdminSupport from "./AdminSupport";
import AdminTeam from "./AdminTeam";
import AdminTraining from "./AdminTraining";
import AdminUsers from "./AdminUsers";
import PageShell from "./PageShell";
import { SkeletonLine, SkeletonMetrics } from "./Skeleton";
import { useAsync } from "../lib/use-async";

export type Tab = "overview" | "applications" | "users" | "catalogue" | "content" | "bookings" | "payments" | "support" | "training" | "team" | "meetTest";

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
  const actions = { busy, run, onError: setActionError };

  return <PageShell><section className="admin-page"><div className="container">
    <header className="specialist-head">
      <div>
        <span className="eyebrow"><ShieldCheck /> لوحة الإدارة</span>
        <h1>إدارة المنصة</h1>
        <p>المستخدمون والطلبات والحجوزات والمدفوعات والدعم في مكان واحد.</p>
      </div>
      <button className="button button-secondary" onClick={() => void reload()}><RefreshCcw /> تحديث</button>
    </header>

    {error && <div className="form-error" role="alert">{error}</div>}

    <div className="specialist-tabs" role="tablist">
      {([
        ["overview", "نظرة عامة"],
        ["applications", `طلبات الانضمام${pendingApps.length ? ` (${pendingApps.length})` : ""}`],
        ["users", `المستخدمون (${data.users.length})`],
        ["catalogue", `الخدمات والدورات${inReviewCourses.length ? ` (${inReviewCourses.length})` : ""}`],
        ["content", `المحتوى (${data.content.length})`],
        ["bookings", `الحجوزات (${data.bookings.length})`],
        ["payments", `المدفوعات (${data.payments.length})`],
        ["support", `الدعم${overview.support.open ? ` (${overview.support.open})` : ""}`],
        ["training", `التدريب الصيفي${training.filter((t) => t.status === "new").length ? ` (${training.filter((t) => t.status === "new").length})` : ""}`],
        ["team", "الفريق الطبي"],
        ["meetTest", "اختبار الاجتماع المرئي"],
      ] as [Tab, string][]).map(([key, label]) => <button
        key={key} role="tab" aria-selected={tab === key}
        className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}
      >{label}</button>)}
    </div>

    {tab === "overview" && <AdminOverview overview={overview} inReviewCourseCount={inReviewCourses.length} onSelectTab={setTab} />}

    {tab === "applications" && <AdminApplications applications={data.applications} note={note} setNote={setNote} {...actions} />}

    {tab === "users" && <AdminUsers users={data.users} {...actions} />}

    {tab === "catalogue" && <AdminCatalogue
      services={data.services} courses={data.courses} trainers={data.trainers}
      note={note} setNote={setNote} reload={reload} {...actions}
    />}

    {tab === "content" && <AdminContent content={data.content} reload={reload} {...actions} />}

    {tab === "bookings" && <AdminBookings bookings={data.bookings} />}

    {tab === "payments" && <AdminPayments payments={data.payments} />}

    {tab === "support" && <AdminSupport support={data.support} {...actions} />}

    {tab === "training" && <AdminTraining training={training} note={note} setNote={setNote} {...actions} />}

    {tab === "team" && <AdminTeam />}

    {tab === "meetTest" && <AdminMeetTest />}
  </div></section></PageShell>;
}
