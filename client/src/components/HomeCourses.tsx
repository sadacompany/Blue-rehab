import { useEffect, useState } from "react";
import { loadCatalog } from "../lib/platform";
import type { Course } from "../lib/catalog-types";
import HomePosterSection from "./HomePosterSection";

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

  return <HomePosterSection
    heading="دوراتنا" headingId="courses-heading"
    items={courses} hrefBase="/courses" variant="wide"
  />;
}
