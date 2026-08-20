import { formatDateTime } from "../lib/format";
import { setUserRoles, type AdminUser } from "../lib/admin";
import type { AdminTabActions } from "./AdminShared";

const ALL_ROLES = ["patient", "student", "specialist", "trainer", "receptionist", "admin"] as const;

const ROLE_LABEL: Record<string, string> = {
  patient: "مستفيد",
  student: "طالب",
  specialist: "أخصائي",
  trainer: "مدرب",
  receptionist: "موظف استقبال",
  admin: "إدارة",
};

/** Role management — every account, and the roles that grant it access. */
export default function AdminUsers({ users, busy, run }: AdminTabActions & { users: AdminUser[] }) {
  return <section className="specialist-panel">
    <div className="admin-list">
      {users.map((user) => <article key={user.id} className="admin-row">
        <div className="admin-row-main">
          <div>
            <strong>{user.fullName}</strong>
            <small dir="ltr">{user.phone ?? "—"}</small>
            <small>انضم في {formatDateTime(user.createdAt)}</small>
          </div>
          <em>{user.roles.map((role) => ROLE_LABEL[role] ?? role).join("، ") || "—"}</em>
        </div>
        <div className="admin-row-actions role-picker">
          {ALL_ROLES.map((role) => {
            const active = user.roles.includes(role);
            return <button
              key={role} type="button" className={active ? "chip selected" : "chip"} disabled={busy === user.id}
              aria-pressed={active}
              onClick={() => void run(user.id, () => setUserRoles(user.id, active ? user.roles.filter((r) => r !== role) : [...user.roles, role]))}
            >{ROLE_LABEL[role]}</button>;
          })}
        </div>
      </article>)}
    </div>
  </section>;
}
