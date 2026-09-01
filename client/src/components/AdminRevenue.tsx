import { BookOpen, RefreshCcw, Stethoscope, TrendingUp, Wallet } from "lucide-react";
import { useMemo } from "react";
import { loadRevenueBreakdown, type RevenueRow } from "../lib/admin";
import { formatMoney } from "../lib/format";
import { useAsync } from "../lib/use-async";
import { SkeletonLine } from "./Skeleton";

/**
 * Where the money came from.
 *
 * `admin_overview` reports one revenue figure for the whole platform, which
 * answers «how are we doing» and nothing else. It cannot say which course paid
 * for itself or which service people actually want — the two questions that
 * decide what to run next term and what to staff for.
 *
 * Courses and services are shown as two separate tables rather than one merged
 * ranking. They are not comparable: a course is sold once to many people over
 * weeks, a service is sold repeatedly to the same person. Putting them in one
 * league table would invite exactly the comparison that means nothing.
 */

/** One ranked table. Courses and services share the shape, not the ranking. */
function RevenueTable({ title, icon, rows, emptyNote }: {
  title: string;
  icon: React.ReactNode;
  rows: RevenueRow[];
  emptyNote: string;
}) {
  if (rows.length === 0) {
    return <section className="revenue-block">
      <h4>{icon} {title}</h4>
      <p className="application-hint">{emptyNote}</p>
    </section>;
  }

  // The leader sets the bar width for the rest, so the column reads as a
  // comparison at a glance rather than as eight numbers to be held in memory.
  const top = Math.max(...rows.map((row) => row.net), 1);

  return <section className="revenue-block">
    <h4>{icon} {title}</h4>
    <table className="data-table revenue-table">
      <thead><tr>
        <th>الاسم</th><th>الصافي</th><th>المحصّل</th><th>المسترد</th><th>العمليات</th><th>الأشخاص</th>
      </tr></thead>
      <tbody>
        {rows.map((row, index) => <tr key={row.itemId} className={index === 0 ? "is-top" : ""}>
          <td>
            <b>{row.itemName}</b>
            {/* The bar is the ranking made visible; the number beside it is the
                ranking made exact. Both, because they are read differently. */}
            <span className="revenue-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(2, Math.round((row.net / top) * 100))}%` }} />
            </span>
          </td>
          <td><b>{formatMoney(row.net)}</b></td>
          <td>{formatMoney(row.collected)}</td>
          <td>{row.refunded > 0 ? <span className="is-refunded">−{formatMoney(row.refunded)}</span> : "—"}</td>
          <td>{row.orders}</td>
          <td>{row.buyers}</td>
        </tr>)}
      </tbody>
    </table>
  </section>;
}

export default function AdminRevenue() {
  const { data, loading, error, reload } = useAsync(loadRevenueBreakdown, []);

  const { courses, services, totals } = useMemo(() => {
    const rows = data ?? [];
    const courseRows = rows.filter((row) => row.kind === "course");
    const serviceRows = rows.filter((row) => row.kind === "service");
    return {
      courses: courseRows,
      services: serviceRows,
      totals: {
        collected: rows.reduce((sum, row) => sum + row.collected, 0),
        refunded: rows.reduce((sum, row) => sum + row.refunded, 0),
        net: rows.reduce((sum, row) => sum + row.net, 0),
      },
    };
  }, [data]);

  const bestService = services[0];
  const bestCourse = courses[0];

  return <section className="specialist-panel">
    <h3 className="trainer-section-title">الإيرادات — من أين يأتي الدخل</h3>
    <p className="application-hint">
      من المدفوعات المحصّلة فقط. المحاولات المعلّقة ليست إيراداً ولا تُحتسب هنا.
      الترتيب بالصافي — أي بعد خصم ما أُعيد — لأن خدمة تُحصّل كثيراً وتُعيد أكثره ليست الأجدر بالتوسع.
    </p>

    {error && <div className="form-error" role="alert">{error}</div>}
    {loading && <SkeletonLine width="100%" height={120} />}

    {!loading && data && <>
      <dl className="promo-stats revenue-totals">
        <div><dt><Wallet /> المحصّل</dt><dd>{formatMoney(totals.collected)}</dd></div>
        <div><dt>المسترد</dt><dd>{formatMoney(totals.refunded)}</dd></div>
        <div><dt>الصافي</dt><dd>{formatMoney(totals.net)}</dd></div>
      </dl>

      {/* The headline answer, stated rather than left to be read off a table. */}
      {(bestCourse || bestService) && <p className="revenue-headline">
        <TrendingUp />
        <span>
          {bestService && <>الأكثر دخلاً بين الخدمات: <b>{bestService.itemName}</b> بصافي {formatMoney(bestService.net)}. </>}
          {bestCourse && <>وأعلى الدورات: <b>{bestCourse.itemName}</b> بصافي {formatMoney(bestCourse.net)}.</>}
        </span>
      </p>}

      <RevenueTable title="الخدمات" icon={<Stethoscope />} rows={services}
        emptyNote="لا توجد جلسات مدفوعة بعد." />
      <RevenueTable title="الدورات" icon={<BookOpen />} rows={courses}
        emptyNote="لا توجد دورات مدفوعة بعد." />
    </>}

    <button className="button button-secondary" onClick={() => void reload()}>
      <RefreshCcw /> تحديث
    </button>
  </section>;
}
