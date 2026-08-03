import { FlaskConical } from "lucide-react";

export default function DemoBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`demo-badge ${compact ? "compact" : ""}`}><FlaskConical /> بيانات توضيحية</span>;
}

