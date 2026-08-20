import { ImagePlus, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { clearContentCover, uploadContentCover } from "../lib/admin";

/**
 * Plumbing shared by more than one admin tab.
 *
 * `AdminDashboard.tsx` owns the single `busy`/`run` pair and the single
 * `reload()` from its `useAsync` call — every domain tab acts through that
 * same pair rather than inventing its own, so a save on one tab cannot race a
 * save on another and `reload()` always refreshes the one snapshot every tab
 * reads from. This is the shape that plumbing takes crossing a component
 * boundary.
 */
export type AdminTabActions = {
  busy: string;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
  onError: (message: string) => void;
};

/**
 * The cover artwork for one piece of content.
 *
 * دوراتنا, مقالاتنا and أبحاثنا are picture sections — the artwork *is* the
 * card — so this control is what puts an item on the landing page at all. That
 * is stated on the empty slot rather than left to be discovered.
 *
 * Used by both the catalogue tab (course covers) and the content tab
 * (article/research/program covers), which is why it lives here rather than
 * with either.
 */
export function CoverField({ table, id, coverUrl, onDone, onError }: {
  table: "articles" | "research_reviews" | "rehab_programs" | "courses";
  id: string;
  coverUrl: string | null;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { await uploadContentCover(table, id, file); onDone(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "تعذر رفع الصورة"); }
    finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true);
    try { await clearContentCover(table, id); onDone(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "تعذر حذف الصورة"); }
    finally { setBusy(false); }
  }

  return (
    <div className="cover-field">
      <button type="button" className={`cover-thumb${coverUrl ? "" : " is-empty"}`} disabled={busy}
        onClick={() => input.current?.click()}
        aria-label={coverUrl ? "استبدال صورة الغلاف" : "إضافة صورة غلاف"}>
        {busy ? <LoaderCircle className="spin" />
          : coverUrl ? <img src={coverUrl} alt="" />
            : <><ImagePlus /><small>غلاف</small></>}
      </button>
      {coverUrl
        ? <button type="button" className="cover-clear" disabled={busy} onClick={() => void clear()}>إزالة</button>
        : <small className="cover-hint" title="بدون صورة غلاف لا يظهر هذا العنصر في الصفحة الرئيسية">بدون غلاف — لا يظهر بالرئيسية</small>}
      <input ref={input} type="file" className="file-field-input" accept="image/jpeg,image/png,image/webp,image/avif"
        tabIndex={-1} aria-hidden="true"
        onChange={(event) => { void take(event.target.files?.[0]); event.target.value = ""; }} />
    </div>
  );
}
