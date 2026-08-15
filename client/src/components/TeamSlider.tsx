import { ArrowLeft, ArrowRight, CalendarDays, Languages } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { countLabel } from "../lib/format";
import { initials, loadTeam, type TeamMember } from "../lib/team";
import { SkeletonGrid } from "./Skeleton";

/**
 * فريقنا الطبي.
 *
 * A slider rather than a grid because the team is longer than a row and will
 * keep growing — the design shows three, the clinic has more.
 *
 * Built on scroll-snap rather than a carousel library: the browser already does
 * momentum, snapping and touch, and doing it natively means the list stays a
 * list. Everything is reachable by swiping, by the arrows, by Tab, and by the
 * scrollbar — there is no state that hides a card from any of them.
 */
export default function TeamSlider() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  /** Autoplay yields whenever the reader is engaged with the list. */
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    loadTeam()
      .then((rows) => { if (alive) setTeam(rows); })
      .catch(() => { if (alive) { setFailed(true); setTeam([]); } });
    return () => { alive = false; };
  }, []);

  /**
   * Which arrows are useful right now.
   *
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
  }, [measure, team]);

  const nudge = useCallback((direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 18 : el.clientWidth * 0.8;
    // Negative in RTL: the inline axis runs the other way.
    el.scrollBy({ left: direction * step * (document.dir === "rtl" ? -1 : 1), behavior: "smooth" });
  }, []);

  /**
   * Advance every four seconds so the whole team is seen without anyone having
   * to swipe, and wrap round at the end.
   *
   * It stops the moment it would be in the way: while the pointer is over the
   * list, while focus is inside it, while a touch is in progress, and while the
   * tab is in the background. It never starts at all for a reader who has asked
   * for reduced motion — an animation that moves on its own is exactly what that
   * setting is about — and not when everything already fits on screen.
   */
  useEffect(() => {
    const el = track.current;
    if (!el || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.scrollWidth <= el.clientWidth + 4) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const max = el.scrollWidth - el.clientWidth;
      const atEnd = Math.abs(el.scrollLeft) >= max - 4;
      if (atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
      else nudge(1);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [paused, nudge, team]);

  if (!team) return <SkeletonGrid count={3} lines={4} />;
  if (!team.length) {
    // Nothing published yet is not an error worth shouting about on a landing page.
    return failed ? null : null;
  }

  return <div className="team-slider"
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setPaused(false);
    }}
    onTouchStart={() => setPaused(true)}
  >
    <ul className="team-track" ref={track} tabIndex={0} aria-label="فريقنا الطبي">
      {team.map((member, index) => <li key={member.id} className="team-card">
        <div className="team-photo">
          {member.photoUrl
            ? <img
                src={member.photoUrl} alt="" decoding="async" width={320} height={380}
                // The first row is on screen as soon as the section is, and each
                // portrait is under 20KB — deferring them only buys a pop-in.
                loading={index < 3 ? "eager" : "lazy"}
              />
            : <span className="team-initials" aria-hidden="true">{initials(member.name)}</span>}
        </div>
        <div className="team-body">
          <h3>{member.name}</h3>
          {member.title && <small>{member.title}</small>}
          {member.bio && <small>{member.bio}</small>}
          {member.specialties.length > 0 && <ul className="team-tags">
            {member.specialties.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>}
          {member.languages.length > 0 && <small><Languages /> {member.languages.join("، ")}</small>}
          <em>سنين الخبرة: {countLabel(member.yearsExperience, ["سنة واحدة", "سنتان", "سنوات", "سنة"])}</em>
          {/* Only the booking action. «عرض الملف» pointed at the specialists
              index rather than the person, so it promised a profile that does
              not exist yet; a card with no open time simply carries no action. */}
          {member.bookable && <Link className="button button-small" to={`/booking?specialist=${member.id}`}>
            <CalendarDays /> حجز موعد
          </Link>}
        </div>
      </li>)}
    </ul>

    {/* Hidden from assistive technology: the list itself is already reachable
        and the arrows only duplicate what scrolling and Tab already do. */}
    <div className="team-arrows" aria-hidden="true">
      <button type="button" className="icon-button" disabled={edges.start}
        onClick={() => nudge(-1)} tabIndex={-1}><ArrowRight /></button>
      <button type="button" className="icon-button" disabled={edges.end}
        onClick={() => nudge(1)} tabIndex={-1}><ArrowLeft /></button>
    </div>
  </div>;
}
