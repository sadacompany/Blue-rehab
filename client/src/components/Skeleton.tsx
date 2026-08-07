/**
 * Loading placeholders.
 *
 * A centred spinner tells the visitor only that something is happening. A
 * skeleton tells them what is about to arrive and how much of it, so the page
 * does not jump when it does — which matters most on the account and dashboard
 * screens, where several panels resolve at different moments.
 *
 * Every block is `aria-hidden`; the surrounding region carries `aria-busy`, so a
 * screen reader hears "loading" once rather than reading out empty boxes.
 */

export function SkeletonLine({ width = "100%", height = 14 }: { width?: string; height?: number }) {
  return <span className="skeleton-line" style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return <div className="skeleton-card" aria-hidden="true">
    <SkeletonLine width="45%" height={18} />
    {Array.from({ length: lines }, (_, index) => (
      <SkeletonLine key={index} width={index === lines - 1 ? "60%" : "100%"} />
    ))}
  </div>;
}

/** Four figures across the top of a dashboard. */
export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return <div className="portal-live-metrics" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <article key={index} className="skeleton-metric">
      <span className="skeleton-badge" />
      <span><SkeletonLine width="70%" height={11} /><SkeletonLine width="40%" height={22} /></span>
    </article>)}
  </div>;
}

/** Rows inside a panel — bookings, payments, notifications. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return <div className="portal-record-list" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div key={index} className="skeleton-row">
      <span className="skeleton-badge" />
      <span className="skeleton-row-body"><SkeletonLine width="55%" height={15} /><SkeletonLine width="35%" height={12} /></span>
      <SkeletonLine width="58px" height={24} />
    </div>)}
  </div>;
}

export function SkeletonGrid({ count = 3, lines = 3 }: { count?: number; lines?: number }) {
  return <div className="skeleton-grid" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <SkeletonCard key={index} lines={lines} />)}
  </div>;
}

/** The whole account page, panel for panel. */
export function PortalSkeleton() {
  return <div aria-busy="true" aria-label="جارٍ تحميل حسابك">
    <div className="portal-live-head skeleton-head">
      <div><SkeletonLine width="120px" height={13} /><SkeletonLine width="260px" height={34} /><SkeletonLine width="330px" height={14} /></div>
    </div>
    <SkeletonMetrics />
    <div className="portal-live-grid">
      {Array.from({ length: 4 }, (_, index) => <section key={index} className="portal-live-panel">
        <header><span className="skeleton-badge" /><div><SkeletonLine width="60px" height={11} /><SkeletonLine width="110px" height={19} /></div></header>
        <SkeletonRows count={2} />
      </section>)}
    </div>
  </div>;
}
