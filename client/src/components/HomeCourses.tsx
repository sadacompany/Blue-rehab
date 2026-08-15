import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadCatalog } from "../lib/platform";
import type { Course } from "../lib/catalog-types";
import shoulderCourse from "../assets/brand/course-shoulder.webp";

/**
 * دوراتنا, as the design lays it out.
 *
 * One wide card above — 801×451 on the artboard — and two half-width cards
 * below it. As with مقالاتنا the design carries no text here: the course banner
 * is the card.
 *
 * Only the first banner exists in the design file; the two beneath it are plain
 * blue gradients, i.e. slots waiting for artwork. They are rendered as labelled
 * placeholders rather than as gradients pretending to be courses, and they fill
 * themselves in the moment a banner is supplied.
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

  const featured = courses[0];
  const rest = courses.slice(1, 3);

  return <div className="poster-row poster-row-courses">
    {featured
      ? <Link className="poster poster-wide" to={`/courses/${featured.slug}`}>
          <img src={shoulderCourse} alt={`دورة: ${featured.title}`} decoding="async" />
        </Link>
      : <div className="poster poster-wide">
          <img src={shoulderCourse} alt="دورة تدريبية" decoding="async" />
        </div>}

    <div className="poster-pair">
      {[0, 1].map((slot) => {
        const course = rest[slot];
        return course
          ? <Link className="poster poster-half" key={course.id} to={`/courses/${course.slug}`}>
              <span className="poster-fallback">
                <b>{course.title}</b>
                <small>{course.summary}</small>
              </span>
            </Link>
          : <div className="poster poster-half is-empty" key={slot} aria-hidden="true" />;
      })}
    </div>
  </div>;
}
