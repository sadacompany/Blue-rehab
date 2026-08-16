import PosterCarousel, { type Poster } from "./PosterCarousel";
import { SectionHeading } from "./BrandMarks";

export type PosterItem = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
};

/**
 * دوراتنا · مقالاتنا · أبحاثنا — the three picture sections of the landing page.
 *
 * The artwork *is* the card, as the design file has it, so an item without a
 * cover has nothing to show and is left out; a section with no covered items at
 * all does not render, heading and rule included. That is deliberate: the
 * alternative is a heading standing over an empty strip, or a placeholder
 * advertising something that does not exist.
 *
 * The middle item is the featured one, drawn larger and lifted, matching the
 * artboard's 345 · 434 · 345 arrangement.
 */
export default function HomePosterSection({
  heading, headingId, items, hrefBase, variant = "portrait", limit = 3,
}: {
  heading: string;
  headingId: string;
  items: PosterItem[];
  hrefBase: string;
  variant?: "wide" | "portrait";
  limit?: number;
}) {
  const covered = items.filter((item) => item.coverUrl).slice(0, limit);
  if (!covered.length) return null;

  const middle = Math.floor(covered.length / 2);
  const posters: Poster[] = covered.map((item, index) => ({
    key: item.id,
    image: item.coverUrl ?? undefined,
    alt: item.title,
    href: `${hrefBase}/${item.slug}`,
    featured: index === middle,
  }));

  return <>
    <section className="section" aria-labelledby={headingId}>
      <div className="container">
        <SectionHeading id={headingId}>{heading}</SectionHeading>
        <PosterCarousel items={posters} label={heading} variant={variant} />
      </div>
    </section>
    <hr className="section-rule" />
  </>;
}
