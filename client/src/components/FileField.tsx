import { FileText, Image as ImageIcon, LoaderCircle, Paperclip, Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";

/**
 * A file picker that belongs to this interface.
 *
 * The native control was being rendered raw: an English "Choose file / No file
 * chosen" button, laid out left-to-right, in the middle of an Arabic form — the
 * one element on the page that ignored the design system entirely. There is no
 * way to style the native button's text or direction, so it is hidden and a real
 * control is drawn over it. The input itself still does the work, which keeps
 * the file dialog, keyboard access and form semantics native.
 *
 * Also accepts a drop, because a CV is usually already sitting on the desktop.
 */

const KIND_ICON = (name: string) =>
  /\.(png|jpe?g|webp|gif|avif)$/i.test(name) ? <ImageIcon /> : <FileText />;

/**
 * A readable label for a stored attachment.
 *
 * Keys are `<owner>/<timestamp>-<name>` and the name is ASCII-only, because
 * Supabase Storage refuses anything else — so an Arabic filename arrives here as
 * `credential.pdf` or worse. The timestamp is plumbing, and a row of identical
 * stems tells a reviewer nothing, so they are numbered instead.
 */
export function attachmentLabel(path: string, index: number): string {
  const base = (path.split("/").pop() ?? path).replace(/^\d{10,}-/, "");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot + 1).toUpperCase() : "";
  const meaningless = !stem || /^(credential|file|[-_.]*)$/i.test(stem);
  return meaningless
    ? `مرفق ${index + 1}${extension ? ` · ${extension}` : ""}`
    : base;
}

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب`
    : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;

export type FileFieldProps = {
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** Called with everything the visitor picked or dropped. */
  onSelect: (files: File[]) => void;
  /** Already-attached items, rendered under the control. */
  attached?: Array<{ id: string; name: string; size?: number }>;
  onRemove?: (id: string) => void;
  /** Chosen but not yet uploaded — the single-file case shows this inline. */
  selected?: File | null;
  onClear?: () => void;
};

export default function FileField({
  label, hint, accept, multiple = false, busy = false, disabled = false,
  onSelect, attached = [], onRemove, selected = null, onClear,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const describedBy = hint ? `${id}-hint` : undefined;

  const open = () => { if (!disabled && !busy) inputRef.current?.click(); };

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onSelect(multiple ? files : files.slice(0, 1));
  };

  return <div className="file-field">
    <span className="file-field-label" id={`${id}-label`}>{label}</span>
    {hint && <small className="file-field-hint" id={describedBy}>{hint}</small>}

    <div
      className={`file-drop${dragging ? " is-dragging" : ""}${disabled || busy ? " is-disabled" : ""}`}
      // A button, not a bare div: it is the thing you press, so it should be
      // reachable by Tab and answer to Enter and Space without extra handlers.
      role="button"
      tabIndex={disabled || busy ? -1 : 0}
      aria-labelledby={`${id}-label`}
      aria-describedby={describedBy}
      aria-disabled={disabled || busy}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      }}
      onDragOver={(event) => { event.preventDefault(); if (!disabled && !busy) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && !busy) take(event.dataTransfer.files);
      }}
    >
      <span className="file-drop-mark" aria-hidden="true">
        {busy ? <LoaderCircle className="spin" /> : <Upload />}
      </span>
      <span className="file-drop-copy">
        <strong>{busy ? "جارٍ الرفع…" : dragging ? "أفلت الملف هنا" : "اسحب الملف هنا أو اضغط للاختيار"}</strong>
        <small>{multiple ? "يمكنك اختيار أكثر من ملف" : "ملف واحد"}</small>
      </span>
    </div>

    {/* The real control. Hidden from view and from the reading order — the
        drop zone above carries the label and does the pressing. */}
    <input
      ref={inputRef}
      type="file"
      className="file-field-input"
      accept={accept}
      multiple={multiple}
      disabled={disabled || busy}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => { take(event.target.files); event.target.value = ""; }}
    />

    {selected && <ul className="file-list">
      <li>
        {KIND_ICON(selected.name)}
        <span><b dir="auto">{selected.name}</b><small>{formatBytes(selected.size)}</small></span>
        {onClear && <button type="button" className="icon-button" aria-label={`إزالة ${selected.name}`} onClick={onClear}>
          <X />
        </button>}
      </li>
    </ul>}

    {attached.length > 0 && <ul className="file-list">
      {attached.map((item) => <li key={item.id}>
        {KIND_ICON(item.name)}
        <span><b dir="auto">{item.name}</b>{item.size !== undefined && <small>{formatBytes(item.size)}</small>}</span>
        {onRemove && <button type="button" className="icon-button" aria-label={`حذف ${item.name}`} onClick={() => onRemove(item.id)}>
          <X />
        </button>}
      </li>)}
    </ul>}

    {!selected && attached.length === 0 && !busy && <p className="file-field-empty">
      <Paperclip /> لم يُختر أي ملف بعد.
    </p>}
  </div>;
}
