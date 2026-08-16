import { useEffect, useState } from "react";
import { loadArticles, type Article } from "../lib/content";
import HomePosterSection from "./HomePosterSection";

/** مقالاتنا — three 4:5 cards with the middle one larger. */
export default function HomeArticles() {
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    let alive = true;
    loadArticles()
      .then((rows) => { if (alive) setArticles(rows); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  return <HomePosterSection
    heading="مقالاتنا" headingId="articles-heading"
    items={articles} hrefBase="/articles"
  />;
}
