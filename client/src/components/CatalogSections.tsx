import { ArrowLeft, BookOpen, Clock3, Languages, MapPin, Monitor, RefreshCcw, ShieldCheck, UserRoundCheck, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogResponse, Course, Specialist } from "../lib/catalog-types";
import { courseModeLabel, formatDate, formatPrice, isOnOffer } from "../lib/format";
import { loadCatalog } from "../lib/catalog";
import ComingSoonBadge from "./ComingSoonBadge";
import DemoBadge from "./DemoBadge";
import OfferBadge from "./OfferBadge";
import { Link } from "react-router-dom";

export function useCatalog() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadCatalog());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

function LoadingCards() {
  return <div className="card-grid" aria-label="جار تحميل البيانات">{[1, 2, 3].map((item) => <div className="skeleton-card" key={item}><i /><i /><i /></div>)}</div>;
}

function CatalogError({ retry }: { retry: () => void }) {
  return <div className="catalog-message"><strong>تعذر تحميل البيانات الآن.</strong><p>تحقق من اتصال الشبكة ثم أعد المحاولة.</p><button className="button button-secondary" type="button" onClick={retry}><RefreshCcw /> إعادة المحاولة</button></div>;
}

export function SpecialistCard({ specialist }: { specialist: Specialist }) {
  // Initials are the fallback, not the default: the portraits exist, and three
  // of the team are «عبد ...», so initials drew the same two letters on three
  // different cards.
  const initials = specialist.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <article className="profile-card"><div className="profile-head"><span className="profile-avatar" aria-hidden="true">{specialist.photoUrl ? <img src={specialist.photoUrl} alt="" loading="lazy" decoding="async" /> : initials}</span>{specialist.isDemo ? <DemoBadge compact /> : <span className="verified-badge"><ShieldCheck /> ملف موثق</span>}</div><div className="profile-body"><p className="overline">{specialist.title}</p><h3>{specialist.name}</h3><p>{specialist.bio}</p><div className="chip-row">{specialist.specialties.map((item) => <span key={item}>{item}</span>)}</div><div className="profile-meta"><Languages /> {specialist.languages.join("، ")}</div><Link className="card-link" to={`/booking?specialist=${specialist.id}`}>عرض المواعيد <ArrowLeft /></Link></div></article>;
}

export function CourseCard({ course }: { course: Course }) {
  const onOffer = isOnOffer(course);
  return <article className="course-card">
    <div className={`course-cover course-${course.mode}`}>
      {/* The poster is the card whenever one exists — the same rule دوراتنا
          follows on the landing page. The gradient-and-icon placeholder is
          the true fallback, for a course that has no artwork yet. */}
      {course.coverUrl
        ? <img src={course.coverUrl} alt="" loading="lazy" decoding="async" />
        : <><span><BookOpen /></span><small>{courseModeLabel(course.mode)}</small></>}
    </div>
    <div className="course-body">
      <div className="course-labels"><span>{course.level}</span>{onOffer && <OfferBadge compact />}{course.isDemo && <DemoBadge compact />}</div>
      <h3>{course.title}</h3>
      {course.presenterName && <p className="course-presenter"><UserRoundCheck /> {course.presenterName}</p>}
      <p>{course.summary}</p>
      <div className="course-facts"><span><Clock3 /> {course.durationHours} ساعة</span><span><Languages /> {course.language}</span></div>
      <div className="course-date">{course.startsAt ? `${course.isDemo ? "موعد توضيحي: " : "تاريخ البدء: "}${formatDate(course.startsAt)}` : "يعلن الموعد عند اعتماد الجدول"}</div>
      {/* The former price is struck through beside the current one, so the
          saving is a fact on the card and not something to work out from the
          badge alone. */}
      <div className="course-footer"><div><small>{course.isDemo ? "سعر توضيحي" : onOffer ? "السعر بعد العرض" : "السعر"}</small><strong className="course-price">{formatPrice(course.price)}{onOffer && <s>{formatPrice(course.compareAtPrice as number)}</s>}</strong></div><Link to={`/courses/${course.slug}`}>التفاصيل <ArrowLeft /></Link></div>
    </div>
  </article>;
}

export function HomeCatalog() {
  const { data, error, loading, reload } = useCatalog();
  if (error) return <CatalogError retry={reload} />;
  if (loading || !data) return <LoadingCards />;
  return <><div className="card-grid">{data.courses.slice(0, 3).map((course) => <CourseCard course={course} key={course.id} />)}</div></>;
}

export function SpecialistsCatalog() {
  const { data, error, loading, reload } = useCatalog();
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("الكل");
  const specialties = useMemo(() => ["الكل", ...new Set(data?.specialists.flatMap((item) => item.specialties) ?? [])], [data]);
  const filtered = useMemo(() => data?.specialists.filter((item) => {
    const matchesText = `${item.name} ${item.title} ${item.specialties.join(" ")}`.includes(query.trim());
    return matchesText && (specialty === "الكل" || item.specialties.includes(specialty));
  }) ?? [], [data, query, specialty]);

  return <><div className="filters" aria-label="تصفية المختصين"><label><span>بحث</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="التخصص أو نوع التأهيل" /></label><label><span>التخصص</span><select value={specialty} onChange={(event) => setSpecialty(event.target.value)}>{specialties.map((item) => <option key={item}>{item}</option>)}</select></label><div className="filter-context"><UserRoundCheck /><span><strong>قاعدة النشر</strong>لا يظهر وسم «موثق» إلا بعد اعتماد المؤهلات.</span></div></div>{error ? <CatalogError retry={reload} /> : loading || !data ? <LoadingCards /> : filtered.length ? <div className="card-grid">{filtered.map((item) => <SpecialistCard specialist={item} key={item.id} />)}</div> : <div className="catalog-message"><strong>لا توجد نتائج مطابقة.</strong><p>غيّر عبارة البحث أو التخصص.</p></div>}</>;
}

export function CoursesCatalog() {
  const { data, error, loading, reload } = useCatalog();
  const [mode, setMode] = useState("all");
  const [level, setLevel] = useState("all");
  const filtered = data?.courses.filter((course) => (mode === "all" || course.mode === mode) && (level === "all" || course.level === level)) ?? [];
  return <><div className="filters compact-filters" aria-label="تصفية الدورات"><label><span>طريقة الحضور</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">جميع الأنماط</option><option value="onsite">حضوري</option><option value="remote">عن بُعد</option><option value="recorded">مسجل</option><option value="hybrid">هجين</option></select></label><label><span>المستوى</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">جميع المستويات</option><option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option></select></label><div className="filter-context"><MapPin /><span><strong>قبل التسجيل</strong>تظهر طريقة الحضور والمتطلبات وشروط الشهادة بوضوح.</span></div></div>{error ? <CatalogError retry={reload} /> : loading || !data ? <LoadingCards /> : filtered.length ? <div className="card-grid">{filtered.map((course) => <CourseCard course={course} key={course.id} />)}</div> : <div className="catalog-message"><strong>لا توجد دورات مطابقة.</strong><p>جرّب نمط حضور أو مستوى مختلفاً.</p></div>}</>;
}

export function CatalogSummary() {
  const { data } = useCatalog();
  if (!data) return null;
  return <span className="live-source"><Video /> {data.services.length} خدمات و{data.courses.length} دورات متاحة الآن</span>;
}

export function ServicesCatalog() {
  const { data, error, loading, reload } = useCatalog();
  if (error) return <CatalogError retry={reload} />;
  if (loading || !data) return <LoadingCards />;
  return <div className="service-catalog">{data.services.map((service) => <article key={service.id}><div className="service-title"><span><Monitor /></span><div><h3>{service.name}</h3>{service.isDemo && <DemoBadge compact />}{service.isComingSoon && <ComingSoonBadge compact />}</div></div><p>{service.description}</p><div className="service-details"><span><Clock3 /> {service.durationMinutes} دقيقة</span><span>{service.modes.map((mode) => mode === "remote" ? "عن بُعد" : "في المركز").join(" أو ")}</span></div><div className="service-price"><small>{service.isDemo ? "سعر توضيحي" : "السعر"}</small><strong>{formatPrice(service.price)}</strong></div>{service.isComingSoon ? <span className="card-link is-disabled" aria-disabled="true">هذه الخدمة قريباً</span> : <Link className="card-link" to={`/booking?service=${service.id}`}>اختيار الخدمة <ArrowLeft /></Link>}</article>)}</div>;
}
