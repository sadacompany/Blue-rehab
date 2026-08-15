import { useEffect, useState } from "react";
import { loadArticles, type Article } from "../lib/content";
import PosterCarousel, { type Poster } from "./PosterCarousel";
import { SectionHeading } from "./BrandMarks";
import childMovement from "../assets/brand/article-child-movement.webp";
import painScience from "../assets/brand/article-pain-science.webp";
import loadManagement from "../assets/brand/article-load-management.webp";

/**
 * مقالاتنا, as the artboard lays it out: three cards with the middle one larger
 * — 434×542 flanked by 345×431 — and the artwork *is* the card. The design
 * carries no text in this section at all.
 *
 * The artwork has its wording burned in, so each card gets a real alt text and
 * links through to the article it illustrates. That keeps the design intact
 * while leaving the section navigable and readable aloud rather than three
 * unlabelled pictures.
 *
 * Only as many cards are shown as there are articles to open: a poster that
 * leads nowhere is decoration pretending to be content.
 */

/* Ordered as the artboard reads them right to left: تطور الطفل on the right,
   علم الألم in the middle at full size, إدارة الحمل on the left. */
const CARDS = [
  { image: childMovement, alt: "كيف يتعلم الطفل الحركة؟ — تطور المهارات الحركية عند الأطفال" },
  { image: painScience, alt: "كيف تتعامل مع الألم — الخوف والمعتقدات والتصورات والحالة النفسية", featured: true },
  { image: loadManagement, alt: "تكنيكك دائماً صحيح لكن مازالت تجيك إصابات؟ — إدارة الحمل التدريبي" },
] as const;

export default function HomeArticles() {
  const [articles, setArticles] = useState<Article[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadArticles()
      .then((rows) => { if (alive) setArticles(rows); })
      .catch(() => { if (alive) setArticles([]); });
    return () => { alive = false; };
  }, []);

  if (!articles?.length) return null;

  const items: Poster[] = CARDS.slice(0, articles.length).map((card, index) => ({
    key: card.alt,
    image: card.image,
    alt: card.alt,
    href: `/articles/${articles[index].slug}`,
    featured: "featured" in card && card.featured,
  }));

  return <>
    <section className="section" aria-labelledby="articles-heading">
      <div className="container">
        <SectionHeading id="articles-heading">مقالاتنا</SectionHeading>
        <PosterCarousel items={items} label="مقالاتنا" variant="portrait" />
      </div>
    </section>
    <hr className="section-rule" />
  </>;
}
