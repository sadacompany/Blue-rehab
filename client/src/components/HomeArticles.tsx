import { ArrowLeft, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import { loadArticles, type Article } from "../lib/content";
import { SkeletonGrid } from "./Skeleton";

/**
 * مقالاتنا on the landing page.
 *
 * Rendered from the `articles` table in the site's own card design rather than
 * from the square social-media exports in the design file: those carry their
 * text baked into the image, at an aspect ratio meant for a phone feed, so they
 * cannot reflow, cannot be read by a screen reader and cannot be edited without
 * a designer. The illustrations belong on the article itself, as its cover.
 */
export default function HomeArticles() {
  const [articles, setArticles] = useState<Article[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadArticles()
      .then((rows) => { if (alive) setArticles(rows.slice(0, 3)); })
      .catch(() => { if (alive) setArticles([]); });
    return () => { alive = false; };
  }, []);

  if (!articles) return <SkeletonGrid count={3} lines={3} />;
  if (!articles.length) return null;

  return <>
    <div className="program-grid">
      {articles.map((article) => <Link className="program-card" key={article.id} to={`/articles/${article.slug}`}>
        <span className="program-level"><FileText /> مقال</span>
        <h3>{article.title}</h3>
        <p>{article.excerpt}</p>
        <div className="program-meta">
          {article.readingMinutes && <span>{article.readingMinutes} دقائق قراءة</span>}
          {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
        </div>
      </Link>)}
    </div>
    <div className="care-center-action">
      <Link className="care-link" to="/articles">كل المقالات <ArrowLeft /></Link>
    </div>
  </>;
}
