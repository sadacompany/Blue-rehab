import { useEffect, useMemo, useState } from "react";
import { loadCatalog } from "../lib/platform";
import type { Course } from "../lib/catalog-types";
import { isOnOffer } from "../lib/format";
import HomePosterSection from "./HomePosterSection";
import OfferBadge from "./OfferBadge";

/** دوراتنا — the course posters, wide on the artboard at 801×452. */
export default function HomeCourses() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((data) => { if (alive) setCourses(data.courses ?? []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // A course on offer says so on the landing page too. This section is artwork
  // only — no price, no chips — so the tag is laid over the corner of the poster
  // rather than set beside a figure, and a course with no offer is untouched.
  const items = useMemo(
    () => courses.map((course) => ({
      ...course,
      badge: isOnOffer(course) ? <OfferBadge compact /> : undefined,
    })),
    [courses],
  );

  return <HomePosterSection
    heading="دوراتنا" headingId="courses-heading"
    items={items} hrefBase="/courses" variant="wide"
  />;
}
