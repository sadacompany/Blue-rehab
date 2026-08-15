import { useEffect, useState } from "react";
import { loadCatalog } from "../lib/platform";
import type { Course } from "../lib/catalog-types";
import PosterCarousel, { type Poster } from "./PosterCarousel";
import shoulderCourse from "../assets/brand/course-shoulder.webp";

/**
 * دوراتنا, as the artboard lays it out: the course banner is the card, with the
 * featured one at 801×452 in the centre and its neighbours peeking in at
 * 498×317 either side.
 *
 * Only the first banner exists in the design file — the two beside it are plain
 * gradient slots waiting for artwork. Rather than render gradients pretending to
 * be courses, an empty slot carries the real course's title, and fills itself in
 * the moment a banner is supplied.
 */
export default function HomeCourses() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((data) => { if (alive) setCourses(data.courses ?? []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // The design shows three slots. Until the catalogue answers, the one banner
  // that does exist still stands on its own.
  const shown = courses.slice(0, 3);
  const items: Poster[] = shown.length
    ? shown.map((course, index) => ({
        key: course.id,
        // The single banner in the kit belongs to the shoulder course; the rest
        // are titled slots.
        image: index === 0 ? shoulderCourse : undefined,
        alt: index === 0 ? `دورة: ${course.title}` : course.title,
        href: `/courses/${course.slug}`,
        featured: index === 0,
        title: course.title,
        note: course.summary,
      }))
    : [{ key: "featured", image: shoulderCourse, alt: "دورة تدريبية: الكتف المؤلم", featured: true }];

  return <PosterCarousel items={items} label="دوراتنا" />;
}
