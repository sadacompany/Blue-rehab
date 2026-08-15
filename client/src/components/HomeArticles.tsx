import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadArticles, type Article } from "../lib/content";
import childMovement from "../assets/brand/article-child-movement.webp";
import painScience from "../assets/brand/article-pain-science.webp";
import loadManagement from "../assets/brand/article-3.webp";

/**
 * مقالاتنا, as the design lays it out.
 *
 * Three cards across with the middle one larger — 434×542 flanked by 345×431 on
 * the artboard, all 4:5 — and the artwork *is* the card: the design carries no
 * text in this section at all.
 *
 * The artwork has its wording burned in, so each card gets a real alt text and
 * links through to the article it illustrates. That keeps the design intact
 * while leaving the section navigable and readable aloud rather than three
 * unlabelled pictures.
 */

const CARDS = [
  { image: loadManagement, alt: "تكنيكك دائماً صحيح لكن مازالت تجيك إصابات؟ — إدارة الحمل التدريبي", size: "side" },
  { image: painScience, alt: "كيف تتعامل مع الألم — الخوف والمعتقدات والتصورات والحالة النفسية", size: "centre" },
  { image: childMovement, alt: "كيف يتعلم الطفل الحركة؟ — تطور المهارات الحركية عند الأطفال", size: "side" },
] as const;

export default function HomeArticles() {
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    let alive = true;
    loadArticles()
      .then((rows) => { if (alive) setArticles(rows); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  return <div className="poster-row poster-row-articles">
    {CARDS.map((card, index) => {
      const article = articles[index];
      const body = <img src={card.image} alt={card.alt} loading="lazy" decoding="async" />;
      return article
        ? <Link className={`poster poster-${card.size}`} key={card.alt} to={`/articles/${article.slug}`}>{body}</Link>
        : <div className={`poster poster-${card.size}`} key={card.alt}>{body}</div>;
    })}
  </div>;
}
