import { useEffect, useState } from "react";
import { loadResearch, type ResearchReview } from "../lib/content";
import HomePosterSection from "./HomePosterSection";

/** أبحاثنا — the research reviews, presented as pictures like the other two. */
export default function HomeResearch() {
  const [reviews, setReviews] = useState<ResearchReview[]>([]);

  useEffect(() => {
    let alive = true;
    loadResearch()
      .then((rows) => { if (alive) setReviews(rows); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  return <HomePosterSection
    heading="أبحاثنا" headingId="research-heading"
    items={reviews} hrefBase="/research"
  />;
}
