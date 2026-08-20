import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type Poster = {
  key: string;
  image?: string;
  alt: string;
  href?: string;
  /** The centre slide: drawn larger and lifted above its neighbours. */
  featured?: boolean;
  /** Shown instead of artwork when a slot has no banner yet. */
  title?: string;
  note?: string;
  /**
   * A pill laid over the corner of the artwork. The artwork is the card here,
   * so there is no body copy to hang a badge off — anything that has to be said
   * about a poster has to be said on top of it. Only دوراتنا uses this, for the
   * offer tag; a poster without one is drawn exactly as before.
   */
  badge?: ReactNode;
};

/**
 * The curved arrow the artboard draws under دوراتنا and مقالاتنا — a sweep with
 * a solid head, rather than the chevron-in-a-circle the rest of the web uses.
 */
function CurvedArrow() {
  return (
    <svg className="curved-arrow" viewBox="0 0 120 56" aria-hidden="true" focusable="false">
      <path d="M112 47C88 18 50 9 26 21" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M10 26 38 11 35 33Z" fill="currentColor" />
    </svg>
  );
}

/**
 * دوراتنا and مقالاتنا are carousels in the design: a centre card at full size
 * with its neighbours peeking in lower and smaller on either side, and a pair of
 * curved arrows underneath.
 *
 * Built on scroll-snap for the same reason the team slider is — the browser
 * already does momentum, snapping and touch, and keeping it a scrolling list
 * means every slide stays reachable by swipe, by Tab, by the arrows and by the
 * scrollbar. The arrows are hidden from assistive technology because they only
 * repeat what scrolling the list already does.
 */
export default function PosterCarousel(
  { items, label, variant = "wide" }: { items: Poster[]; label: string; variant?: "wide" | "portrait" },
) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  /**
   * This is an RTL document, so scrollLeft counts down from zero as the reader
   * moves forward. Comparing against the extent rather than against zero keeps
   * the same code correct whichever way the page is written.
   */
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const travelled = Math.abs(el.scrollLeft);
    setEdges({ start: travelled <= 4, end: travelled >= max - 4 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [measure, items]);

  const nudge = useCallback((direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 24 : el.clientWidth * 0.7;
    el.scrollBy({ left: direction * step * (document.dir === "rtl" ? -1 : 1), behavior: "smooth" });
  }, []);

  if (!items.length) return null;

  return (
    <div className={`poster-carousel poster-${variant}`}>
      <ul className="poster-track" ref={track} tabIndex={0} aria-label={label}>
        {items.map((item) => {
          const body = item.image
            ? <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
            : <span className="poster-fallback"><b>{item.title}</b>{item.note && <small>{item.note}</small>}</span>;
          const face = <>{body}{item.badge && <span className="poster-badge">{item.badge}</span>}</>;
          return (
            <li className={`poster ${item.featured ? "poster-featured" : "poster-side"}`} key={item.key}>
              {item.href
                ? <Link className="poster-face" to={item.href}>{face}</Link>
                : <div className="poster-face">{face}</div>}
            </li>
          );
        })}
      </ul>

      {/* Nothing to scroll means nothing to point at, so the pair is dropped
          rather than shown greyed out. */}
      {!(edges.start && edges.end) && <div className="poster-arrows" aria-hidden="true">
        <button type="button" className="arrow-button arrow-prev" disabled={edges.start}
          onClick={() => nudge(-1)} tabIndex={-1}><CurvedArrow /></button>
        <button type="button" className="arrow-button arrow-next" disabled={edges.end}
          onClick={() => nudge(1)} tabIndex={-1}><CurvedArrow /></button>
      </div>}
    </div>
  );
}
