import { BadgePercent } from "lucide-react";

/**
 * «عرض خاص» — the tag on a course whose price is currently reduced.
 *
 * Deliberately the same shape as DemoBadge: an icon and two words in a pill,
 * with a `compact` step for the places a card already has chips. Both are
 * qualifiers on the thing beside them, so they should look like siblings; the
 * colour is what separates them, and that lives in the stylesheet rather than
 * here.
 */
export default function OfferBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`offer-badge ${compact ? "compact" : ""}`}><BadgePercent /> عرض خاص</span>;
}
