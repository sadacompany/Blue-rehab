import { Clock3 } from "lucide-react";

/**
 * «قريباً» — an admin has closed this service to new bookings without
 * deleting it, so visitors still know it exists. Same shape as DemoBadge and
 * OfferBadge on purpose: all three are qualifiers on the thing beside them,
 * and only the colour (in the stylesheet) says which kind.
 */
export default function ComingSoonBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`coming-soon-badge ${compact ? "compact" : ""}`}><Clock3 /> قريباً</span>;
}
