import { ArrowDown, ArrowUp, BadgeCheck, LoaderCircle, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  initials, loadAllSpecialists, setTeamPosition, uploadSpecialistPhoto, type TeamAdminRow,
} from "../lib/team";

/**
 * فريقنا الطبي, from the administration side.
 *
 * The landing page shows whoever is here and in this order, so this is where the
 * clinic adds the rest of the team rather than anyone editing a file. Two
 * decisions live on this screen and nothing else does: who is introduced, and
 * what their photograph is.
 *
 * Specialists themselves are created by the existing /join application flow —
 * this screen does not invent people, it arranges the ones that exist.
 */
export default function AdminTeam({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<TeamAdminRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});

  async function reload() {
    try { setRows(await loadAllSpecialists()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل الفريق"); }
  }
  useEffect(() => { void reload(); }, []);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try { await action(); await reload(); onChanged?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية"); }
    finally { setBusy(""); }
  }

  if (!rows) return <p className="application-hint"><LoaderCircle className="spin" /> جارٍ التحميل…</p>;

  const onTeam = rows.filter((r) => r.teamOrder !== null);
  const offTeam = rows.filter((r) => r.teamOrder === null);

  /** Swap with the neighbour, so ordering is two clicks and never a free-text number. */
  const move = (row: TeamAdminRow, direction: -1 | 1) => {
    const index = onTeam.findIndex((r) => r.id === row.id);
    const neighbour = onTeam[index + direction];
    if (!neighbour) return;
    void run(row.id, async () => {
      await setTeamPosition(row.id, neighbour.teamOrder);
      await setTeamPosition(neighbour.id, row.teamOrder);
    });
  };

  const card = (row: TeamAdminRow, position: number | null) => <article className="admin-row" key={row.id}>
    <div className="admin-row-main">
      <span className="team-admin-photo">
        {row.photoUrl
          ? <img src={row.photoUrl} alt="" width={48} height={48} />
          : <b>{initials(row.name)}</b>}
      </span>
      <div>
        <strong>{row.name}{row.isVerified && <BadgeCheck className="inline-badge" />}</strong>
        <small>{row.title}</small>
        <small>
          {row.yearsExperience} سنة
          {row.specialties.length ? ` · ${row.specialties.join("، ")}` : ""}
          {row.isDemo ? " · ملف تجريبي" : ""}
        </small>
      </div>
      {position !== null && <em>#{position}</em>}
    </div>

    <div className="admin-row-actions">
      <input
        type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden
        ref={(el) => { pickers.current[row.id] = el; }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void run(row.id, () => uploadSpecialistPhoto(row.id, file));
        }}
      />
      <button type="button" className="button button-small button-secondary" disabled={busy === row.id}
        onClick={() => pickers.current[row.id]?.click()}>
        {busy === row.id ? <LoaderCircle className="spin" /> : <UserRound />} {row.photoUrl ? "تغيير الصورة" : "رفع صورة"}
      </button>

      {position === null
        ? <button type="button" className="button button-small" disabled={busy === row.id}
            onClick={() => void run(row.id, () => setTeamPosition(row.id, onTeam.length + 1))}>
            إضافة إلى الفريق
          </button>
        : <>
            <button type="button" className="icon-button" aria-label="تقديم" disabled={busy === row.id || position === 1}
              onClick={() => move(row, -1)}><ArrowUp /></button>
            <button type="button" className="icon-button" aria-label="تأخير" disabled={busy === row.id || position === onTeam.length}
              onClick={() => move(row, 1)}><ArrowDown /></button>
            <button type="button" className="icon-button" aria-label="إزالة من الفريق" disabled={busy === row.id}
              onClick={() => void run(row.id, () => setTeamPosition(row.id, null))}><X /></button>
          </>}
    </div>
  </article>;

  return <section className="specialist-panel">
    <p className="application-hint">
      يظهر هؤلاء في «فريقنا الطبي» على الصفحة الرئيسية بالترتيب المعروض. المختصون أنفسهم يُنشأون من طلبات الانضمام.
    </p>
    {error && <div className="form-error" role="alert">{error}</div>}

    <h3 className="trainer-section-title">على الصفحة الرئيسية ({onTeam.length})</h3>
    {onTeam.length
      ? <div className="admin-list">{onTeam.map((row, i) => card(row, i + 1))}</div>
      : <div className="portal-empty"><UserRound /><p>لم يُضف أحد إلى الفريق بعد.</p></div>}

    <h3 className="trainer-section-title">مختصون آخرون ({offTeam.length})</h3>
    {offTeam.length
      ? <div className="admin-list">{offTeam.map((row) => card(row, null))}</div>
      : <div className="portal-empty"><UserRound /><p>كل المختصين معروضون على الصفحة الرئيسية.</p></div>}
  </section>;
}
