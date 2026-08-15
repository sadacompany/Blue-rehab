import { useEffect, useState } from "react";
import { loadCatalog } from "../lib/platform";
import type { Course } from "../lib/catalog-types";
import PosterCarousel, { type Poster } from "./PosterCarousel";
import { SectionHeading } from "./BrandMarks";
import shoulderCourse from "../assets/brand/course-shoulder.webp";

/**
 * دوراتنا, as the artboard lays it out: the course banner is the card, with the
 * featured one at 801×452 in the centre and its neighbours peeking in at
 * 498×317 either side.
 *
 * The section renders itself — heading, carousel and closing rule — so that it
 * can disappear entirely when the catalogue is empty. It used to fall back to
 * the bundled shoulder banner whenever nothing loaded, which meant that once the
 * demo courses were removed the page advertised a course that did not exist and
 * led nowhere. A section with nothing behind it is worse than no section.
 */
export default function HomeCourses() {
  const [courses, setCourses] = useState<Course[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((data) => { if (alive) setCourses(data.courses ?? []); })
      .catch(() => { if (alive) setCourses([]); });
    return () => { alive = false; };
  }, []);

  if (!courses?.length) return null;

  const items: Poster[] = courses.slice(0, 3).map((course, index) => ({
    key: course.id,
    // The one banner in the brand kit belongs to the shoulder course; the rest
    // are titled slots until artwork is supplied for them.
    image: index === 0 ? shoulderCourse : undefined,
    alt: index === 0 ? `دورة: ${course.title}` : course.title,
    href: `/courses/${course.slug}`,
    featured: index === 0,
    title: course.title,
    note: course.summary,
  }));

  return <>
    <section className="section" aria-labelledby="courses-heading">
      <div className="container">
        <SectionHeading id="courses-heading">دوراتنا</SectionHeading>
        <PosterCarousel items={items} label="دوراتنا" />
      </div>
    </section>
    <hr className="section-rule" />
  </>;
}
