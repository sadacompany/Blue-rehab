import { Link } from "react-router-dom";
import mascotIcon from "../assets/brand/mascot-icon.png";
import starMascot from "../assets/brand/star-mascot.png";

/**
 * The four-point star from «النجمة الزرقاء صيغة svg», normalised from the
 * kit's 810×1080 artboard onto a 24×24 box. It is the identity's connective
 * mark: it separates the nav items, leads card bullets and flanks headings.
 *
 * Drawn with `currentColor` so a caller sets the colour by setting `color`.
 */
export function BrandStar({ className = "star" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 0 15.82 8.18 24 12 15.82 15.82 12 24 8.18 15.82 0 12 8.18 8.18Z" />
    </svg>
  );
}

/**
 * The star with the mascot's face inside it — the heavier ornament the artboard
 * places either side of every section heading.
 */
export function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div className="star-heading">
      <img src={starMascot} alt="" width={70} height={70} />
      <h2 id={id}>{children}</h2>
      <img src={starMascot} alt="" width={70} height={70} />
    </div>
  );
}

/**
 * The logotype: «تأهيلــــ . بلو» set in GHAITHSANS-Bold beside the mascot,
 * with the «بناء . لب . وعي» tagline underneath — exactly the lockup in the
 * brand kit, as live text rather than a flattened image so it stays crisp and
 * readable to a screen reader.
 *
 * The elongation in the wordmark is real tatweel (U+0640); it is decorative,
 * so `aria-label` on the link carries the plain name instead.
 */
export function Brand({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link className={`brand brand-${tone}`} to="/" aria-label="تأهيل بلو — الرئيسية">
      {/* The mascot sits outermost on the start (right) edge, with the wordmark
          inboard of it — the order the kit's lockup uses. */}
      <span className="brand-mark" aria-hidden="true"><img src={mascotIcon} alt="" /></span>
      <span className="brand-copy" aria-hidden="true">
        <strong className="wordmark">تأهيلــــ . بلو</strong>
        <small>بناء . لب . وعي</small>
      </span>
    </Link>
  );
}
