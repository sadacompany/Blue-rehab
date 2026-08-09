import { ArrowLeft, BookOpenCheck, CalendarDays, Clock3, FileText, FlaskConical, GraduationCap, MapPin, Stethoscope, Target, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams  } from "react-router-dom";
import PageShell from "../components/PageShell";
import { SkeletonGrid, SkeletonLine } from "../components/Skeleton";
import { formatDate } from "../lib/format";
import {
  loadArticle, loadArticles, loadProgram, loadPrograms, loadResearch, loadResearchReview,
  type Article, type RehabProgram, type ResearchReview,
} from "../lib/content";

/**
 * The two halves of the platform, and the content inside them.
 *
 *   عيادة بلو   حجز موعد  +  برامج علمية للتأهيل
 *   أكاديمية بلو  دورات  +  مقالات  +  مراجعة الأبحاث
 *
 * The section hubs exist so a visitor decides *why* they came before being asked
 * to choose a service — the previous structure put a booking wizard and a course
 * catalogue side by side with nothing framing the difference.
 */

function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((value) => { if (alive) { setData(value); setError(""); } })
      .catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "تعذر التحميل"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

/** Cards arrive in the shape they will occupy, so nothing shifts on arrival. */
function Loading({ cards = 3 }: { cards?: number }) {
  return <SkeletonGrid count={cards} lines={3} />;
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="portal-empty">{icon}<p>{text}</p></div>;
}

/* ======================================================= عيادة بلو ===== */

export function ConsultationsHub() {
  const { data: programs, loading } = useAsync(loadPrograms);

  return <PageShell>
    <section className="section-hero consult-hero"><div className="container">
      <span className="eyebrow"><Stethoscope /> عيادة بلو</span>
      <h1>الاستشارات والبرامج العلاجية</h1>
      <p>احجز موعداً مع أخصائي، أو ابدأ برنامجاً علمياً متدرجاً يناسب حالتك.</p>
    </div></section>

    <section className="section"><div className="container">
      <div className="section-split">
        <article className="section-card">
          <span className="section-card-mark"><Stethoscope /></span>
          <h2>استشير مختص</h2>
          <p>اختر نوع الاستشارة التي تحتاجها، عن بُعد أو في المركز، مع تحديد الأخصائي والوقت المناسب لك.</p>
          <ul className="section-card-list">
            <li><Video /> استشارة عن بُعد</li>
            <li><MapPin /> استشارة في المركز</li>
            <li><CalendarDays /> اختيار الأخصائي والموعد</li>
          </ul>
          <Link className="button" to="/services">استشير مختص <ArrowLeft /></Link>
        </article>

        <article className="section-card">
          <span className="section-card-mark"><Target /></span>
          <h2>البرامج العلاجية</h2>
          <p>برامج علمية متدرجة تمتد أسابيع، مبنية على معايير واضحة للتقدم والعودة للنشاط.</p>
          <ul className="section-card-list">
            <li><Target /> أهداف محددة لكل مرحلة</li>
            <li><Clock3 /> جدول أسبوعي واضح</li>
            <li><Stethoscope /> متابعة من أخصائي</li>
          </ul>
          <Link className="button button-secondary" to="/programs">استعراض البرامج <ArrowLeft /></Link>
        </article>
      </div>

      <h2 className="section-heading">برامج مختارة</h2>
      {loading ? <Loading /> : <div className="program-grid">
        {(programs ?? []).slice(0, 3).map((program) => <ProgramCard key={program.id} program={program} />)}
      </div>}
    </div></section>
  </PageShell>;
}

function ProgramCard({ program }: { program: RehabProgram }) {
  return <Link className="program-card" to={`/programs/${program.slug}`}>
    <span className="program-level">{program.level}</span>
    <h3>{program.title}</h3>
    <p>{program.summary}</p>
    <div className="program-meta">
      {program.durationWeeks && <span><Clock3 /> {program.durationWeeks} أسبوع</span>}
      {program.sessionsPerWeek && <span><CalendarDays /> {program.sessionsPerWeek} جلسات أسبوعياً</span>}
    </div>
  </Link>;
}

export function ProgramsPage() {
  const { data, loading } = useAsync(loadPrograms);
  return <PageShell>
    <section className="page-hero compact-hero"><div className="container">
      <span className="eyebrow"><Target /> عيادة بلو</span>
      <h1>البرامج العلاجية</h1>
      <p>برامج متدرجة تُبنى على حالتك وتُتابع أسبوعياً حتى تعود لنشاطك.</p>
    </div></section>
    <section className="section"><div className="container">
      {loading ? <Loading /> : (data ?? []).length
        ? <div className="program-grid">{data!.map((program) => <ProgramCard key={program.id} program={program} />)}</div>
        : <Empty icon={<Target />} text="لا توجد برامج منشورة بعد." />}
    </div></section>
  </PageShell>;
}

export function ProgramDetailPage() {
  const { slug = "" } = useParams();
  const { data: program, loading } = useAsync(() => loadProgram(slug), [slug]);

  if (loading) return <PageShell><section className="section"><div className="container narrow" aria-busy="true">
    <div className="skeleton-head"><SkeletonLine width="130px" height={13} /><SkeletonLine width="80%" height={34} /><SkeletonLine width="60%" height={16} /></div>
    <SkeletonLine height={13} /><SkeletonLine height={13} /><SkeletonLine width="85%" height={13} />
    <SkeletonLine height={13} /><SkeletonLine width="70%" height={13} />
  </div></section></PageShell>;
  if (!program) return <PageShell><section className="section"><div className="container catalog-message">
    <strong>لم نجد هذا البرنامج.</strong><Link className="button" to="/programs">كل البرامج</Link>
  </div></section></PageShell>;

  return <PageShell>
    <section className="page-hero compact-hero"><div className="container narrow">
      <span className="eyebrow"><Target /> برنامج علاجي</span>
      <h1>{program.title}</h1>
      <p>{program.summary}</p>
      <div className="program-meta center">
        <span>{program.level}</span>
        {program.durationWeeks && <span><Clock3 /> {program.durationWeeks} أسبوع</span>}
        {program.sessionsPerWeek && <span><CalendarDays /> {program.sessionsPerWeek} جلسات أسبوعياً</span>}
      </div>
    </div></section>

    <section className="section"><div className="container narrow article-body">
      <p>{program.description}</p>

      {program.goals.length > 0 && <>
        <h2>أهداف البرنامج</h2>
        <ul>{program.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul>
      </>}

      {program.suitableFor.length > 0 && <>
        <h2>لمن هذا البرنامج</h2>
        <ul>{program.suitableFor.map((item) => <li key={item}>{item}</li>)}</ul>
      </>}

      <div className="program-cta">
        <div>
          <strong>ابدأ بجلسة تقييم</strong>
          <small>يحدد الأخصائي نقطة البداية المناسبة لك قبل الدخول في البرنامج.</small>
        </div>
        <Link className="button" to="/booking">حجز جلسة تقييم <ArrowLeft /></Link>
      </div>
    </div></section>
  </PageShell>;
}

/* ======================================================= أكاديمية بلو ==== */

export function AcademyHub() {
  const articles = useAsync(loadArticles);
  const research = useAsync(loadResearch);

  return <PageShell>
    <section className="section-hero academy-hero"><div className="container">
      <span className="eyebrow"><GraduationCap /> أكاديمية بلو</span>
      <h1>الأكاديمية والأبحاث العلمية</h1>
      <p>دورات تدريبية، ومقالات مبنية على أدلة، ومراجعات لأحدث الأبحاث، وتدريب إكلينيكي داخل العيادات.</p>
    </div></section>

    <section className="section"><div className="container">
      <div className="section-split four">
        <article className="section-card">
          <span className="section-card-mark"><BookOpenCheck /></span>
          <h2>الدورات</h2>
          <p>دورات حضورية ومسجلة وهجينة للممارسين والطلاب.</p>
          <Link className="button button-secondary" to="/courses">استعراض الدورات <ArrowLeft /></Link>
        </article>
        <article className="section-card">
          <span className="section-card-mark"><FileText /></span>
          <h2>المقالات</h2>
          <p>شرح مبسّط لمفاهيم التأهيل والألم، بلغة يفهمها المصاب والممارس.</p>
          <Link className="button button-secondary" to="/articles">اقرأ المقالات <ArrowLeft /></Link>
        </article>
        <article className="section-card">
          <span className="section-card-mark"><FlaskConical /></span>
          <h2>مراجعة الأبحاث</h2>
          <p>قراءة نقدية لأبحاث منشورة، وما تعنيه عملياً في العيادة.</p>
          <Link className="button button-secondary" to="/research">استعراض المراجعات <ArrowLeft /></Link>
        </article>
        <article className="section-card">
          <span className="section-card-mark"><Stethoscope /></span>
          <h2>التدريب الصيفي الإكلينيكي</h2>
          <p>للطلاب المتدربين داخل العيادات — سجّل بياناتك وسيرتك الذاتية في قائمة المتدربين.</p>
          <Link className="button button-secondary" to="/training">سجّل في القائمة <ArrowLeft /></Link>
        </article>
      </div>

      <h2 className="section-heading">أحدث المقالات</h2>
      {articles.loading ? <Loading /> : (articles.data ?? []).length
        ? <div className="editorial-grid">{articles.data!.slice(0, 3).map((item) => <ArticleCard key={item.id} article={item} />)}</div>
        : <Empty icon={<FileText />} text="لا توجد مقالات منشورة بعد." />}

      <h2 className="section-heading">أحدث المراجعات</h2>
      {research.loading ? <Loading /> : (research.data ?? []).length
        ? <div className="editorial-grid">{research.data!.slice(0, 3).map((item) => <ResearchCard key={item.id} review={item} />)}</div>
        : <Empty icon={<FlaskConical />} text="لا توجد مراجعات منشورة بعد." />}
    </div></section>
  </PageShell>;
}

function ArticleCard({ article }: { article: Article }) {
  return <Link className="editorial-card" to={`/articles/${article.slug}`}>
    <span className="editorial-kicker">{article.category ?? "مقال"}</span>
    <h3>{article.title}</h3>
    <p>{article.excerpt}</p>
    <div className="editorial-meta">
      {article.readingMinutes && <span><Clock3 /> {article.readingMinutes} دقائق قراءة</span>}
      {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
    </div>
  </Link>;
}

function ResearchCard({ review }: { review: ResearchReview }) {
  return <Link className="editorial-card research" to={`/research/${review.slug}`}>
    <span className="editorial-kicker">{review.evidenceLevel ?? "مراجعة"}</span>
    <h3>{review.title}</h3>
    <p>{review.excerpt}</p>
    <div className="editorial-meta">
      {review.sourceJournal && <span>{review.sourceJournal}</span>}
      {review.sourceYear && <span>{review.sourceYear}</span>}
    </div>
  </Link>;
}

export function ArticlesPage() {
  const { data, loading } = useAsync(loadArticles);
  return <PageShell>
    <section className="page-hero compact-hero"><div className="container">
      <span className="eyebrow"><FileText /> أكاديمية بلو</span>
      <h1>المقالات</h1>
      <p>مفاهيم التأهيل والألم بلغة واضحة، مبنية على أدلة.</p>
    </div></section>
    <section className="section"><div className="container">
      {loading ? <Loading /> : (data ?? []).length
        ? <div className="editorial-grid">{data!.map((item) => <ArticleCard key={item.id} article={item} />)}</div>
        : <Empty icon={<FileText />} text="لا توجد مقالات منشورة بعد." />}
    </div></section>
  </PageShell>;
}

export function ArticleDetailPage() {
  const { slug = "" } = useParams();
  const { data: article, loading } = useAsync(() => loadArticle(slug), [slug]);

  if (loading) return <PageShell><section className="section"><div className="container narrow" aria-busy="true">
    <div className="skeleton-head"><SkeletonLine width="130px" height={13} /><SkeletonLine width="80%" height={34} /><SkeletonLine width="60%" height={16} /></div>
    <SkeletonLine height={13} /><SkeletonLine height={13} /><SkeletonLine width="85%" height={13} />
    <SkeletonLine height={13} /><SkeletonLine width="70%" height={13} />
  </div></section></PageShell>;
  if (!article) return <PageShell><section className="section"><div className="container catalog-message">
    <strong>لم نجد هذا المقال.</strong><Link className="button" to="/articles">كل المقالات</Link>
  </div></section></PageShell>;

  return <PageShell>
    <section className="page-hero compact-hero"><div className="container narrow">
      <span className="eyebrow"><FileText /> {article.category ?? "مقال"}</span>
      <h1>{article.title}</h1>
      <p>{article.excerpt}</p>
      <div className="editorial-meta center">
        {article.authorName && <span>{article.authorName}</span>}
        {article.readingMinutes && <span><Clock3 /> {article.readingMinutes} دقائق قراءة</span>}
        {article.publishedAt && <span>{formatDate(article.publishedAt)}</span>}
      </div>
    </div></section>
    <section className="section"><div className="container narrow article-body">
      {article.body.split("\n\n").map((para, index) => <p key={index}>{para}</p>)}
      {article.tags.length > 0 && <div className="tag-row">{article.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
      <div className="program-cta">
        <div><strong>لديك حالة تريد تقييمها؟</strong><small>احجز جلسة مع أخصائي لمناقشة وضعك تحديداً.</small></div>
        <Link className="button" to="/booking">حجز جلسة <ArrowLeft /></Link>
      </div>
    </div></section>
  </PageShell>;
}

export function ResearchPage() {
  const { data, loading } = useAsync(loadResearch);
  return <PageShell>
    <section className="page-hero compact-hero"><div className="container">
      <span className="eyebrow"><FlaskConical /> أكاديمية بلو</span>
      <h1>مراجعة الأبحاث</h1>
      <p>قراءة نقدية لأبحاث منشورة، وما تعنيه عملياً.</p>
    </div></section>
    <section className="section"><div className="container">
      {loading ? <Loading /> : (data ?? []).length
        ? <div className="editorial-grid">{data!.map((item) => <ResearchCard key={item.id} review={item} />)}</div>
        : <Empty icon={<FlaskConical />} text="لا توجد مراجعات منشورة بعد." />}
    </div></section>
  </PageShell>;
}

export function ResearchDetailPage() {
  const { slug = "" } = useParams();
  const { data: review, loading } = useAsync(() => loadResearchReview(slug), [slug]);

  if (loading) return <PageShell><section className="section"><div className="container narrow" aria-busy="true">
    <div className="skeleton-head"><SkeletonLine width="130px" height={13} /><SkeletonLine width="80%" height={34} /><SkeletonLine width="60%" height={16} /></div>
    <SkeletonLine height={13} /><SkeletonLine height={13} /><SkeletonLine width="85%" height={13} />
    <SkeletonLine height={13} /><SkeletonLine width="70%" height={13} />
  </div></section></PageShell>;
  if (!review) return <PageShell><section className="section"><div className="container catalog-message">
    <strong>لم نجد هذه المراجعة.</strong><Link className="button" to="/research">كل المراجعات</Link>
  </div></section></PageShell>;

  return <PageShell>
    <section className="page-hero compact-hero"><div className="container narrow">
      <span className="eyebrow"><FlaskConical /> {review.evidenceLevel ?? "مراجعة بحثية"}</span>
      <h1>{review.title}</h1>
      <p>{review.excerpt}</p>
      <div className="editorial-meta center">
        {review.reviewerName && <span>{review.reviewerName}</span>}
        {review.publishedAt && <span>{formatDate(review.publishedAt)}</span>}
      </div>
    </div></section>

    <section className="section"><div className="container narrow article-body">
      {(review.sourceTitle || review.sourceJournal) && <div className="source-box">
        <strong>الدراسة المراجَعة</strong>
        {review.sourceTitle && <p dir="ltr" className="source-title">{review.sourceTitle}</p>}
        <small>{[review.sourceAuthors, review.sourceJournal, review.sourceYear].filter(Boolean).join(" · ")}</small>
        {review.sourceUrl && <a href={review.sourceUrl} target="_blank" rel="noreferrer">الاطلاع على المصدر</a>}
      </div>}

      {review.body.split("\n\n").map((para, index) => <p key={index}>{para}</p>)}

      {review.keyFindings.length > 0 && <>
        <h2>أبرز النتائج</h2>
        <ul>{review.keyFindings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
      </>}

      {review.practicalTakeaway && <div className="takeaway-box">
        <strong>ماذا يعني هذا عملياً</strong>
        <p>{review.practicalTakeaway}</p>
      </div>}

      {review.tags.length > 0 && <div className="tag-row">{review.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
    </div></section>
  </PageShell>;
}
