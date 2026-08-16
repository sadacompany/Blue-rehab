import { BookOpenCheck, CalendarDays, CheckCircle2, FlaskConical, Target } from "lucide-react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import HomeArticles from "../components/HomeArticles";
import HomeCourses from "../components/HomeCourses";
import HomeResearch from "../components/HomeResearch";
import TeamSlider from "../components/TeamSlider";
import { BrandStar, SectionHeading } from "../components/BrandMarks";
import heroClinic from "../assets/brand/hero-clinic.webp";

/**
 * The landing page, following the «استشارة بلو» artboard band for band:
 * hero, خدماتنا, فريقنا الطبي, دوراتنا, مقالاتنا, the privacy band, footer —
 * each separated by the full-bleed rule the design draws between them.
 *
 * The artboard puts no call to action in the hero; the booking button lives in
 * the sticky header, which is on screen the whole way down.
 */
export default function HomePage() {
  return <PageShell>
    {/* The brand photograph runs full-bleed behind right-aligned white type.
        Object position is set from the design's crop: the artboard places a
        2833×4013 portrait at 1780×2521 and shows the band a third of the way
        down it. */}
    <section className="hero">
      <img className="hero-photo" src={heroClinic} alt="" fetchPriority="high" decoding="async" />
      <div className="hero-shade" aria-hidden="true" />
      <div className="hero-inner">
        <h1>
          <span>لا ننتظر مستقبل العلاج الطبيعي،</span>
          <span className="hero-line">نحن من نصنعه <BrandStar className="star hero-star" /></span>
        </h1>
        <p className="hero-sub">علمٌ يعلم، ورعاية تحدث فرق.</p>
      </div>
    </section>
    <hr className="section-rule section-rule-strong" />

    {/* The first real decision a visitor makes: care, or learning. */}
    <section className="section" aria-labelledby="services-heading">
      <div className="container">
        <SectionHeading id="services-heading">خدماتنا</SectionHeading>
        <div className="card-grid card-grid-2">
          <article className="feature-card">
            <div className="feature-card-head"><BrandStar className="star star-lg" /><h3>استشارة بلو</h3></div>
            <p>الاستشارات والبرامج العلاجية — احجز موعداً مع أخصائي أو ابدأ برنامجاً متدرجاً يناسب حالتك.</p>
            <ul className="bullet-list">
              <li><CalendarDays /> حجز موعد عن بُعد أو حضوري</li>
              <li><Target /> برامج علاجية ممتدة</li>
            </ul>
            <Link className="button" to="/consultations">أدخل القسم</Link>
          </article>

          <article className="feature-card">
            <div className="feature-card-head"><BrandStar className="star star-lg" /><h3>أكاديمية بلو</h3></div>
            <p>الأكاديمية والأبحاث العلمية — دورات تدريبية، مقالات مبنية على أدلة، ومراجعات لأحدث الأبحاث.</p>
            <ul className="bullet-list">
              <li><BookOpenCheck /> دورات حضورية ومسجلة</li>
              <li><FlaskConical /> مقالات ومراجعات بحثية</li>
            </ul>
            <Link className="button" to="/academy">أدخل القسم</Link>
          </article>
        </div>
      </div>
    </section>
    <hr className="section-rule" />

    {/* فريقنا الطبي — read from the specialists administration publishes, so the
        clinic adds people without anyone touching this file. */}
    <section className="section" aria-labelledby="team-heading">
      <div className="container">
        <SectionHeading id="team-heading">فريقنا الطبي</SectionHeading>
        <TeamSlider />
      </div>
    </section>
    <hr className="section-rule section-rule-strong" />

    {/* دوراتنا · مقالاتنا · أبحاثنا — the three picture sections. Each renders
        its own heading and closing rule, so it disappears entirely while there
        is nothing with cover artwork behind it. */}
    <HomeCourses />
    <HomeArticles />
    <HomeResearch />

    <section className="care-trust">
      <div className="container care-trust-grid">
        <div>
          <span className="care-label light">خصوصيتك جزء من الرعاية</span>
          <h2>لا نطلب بيانات أكثر مما نحتاجه.</h2>
          <p>تُفصل الملفات الصحية عن بيانات التدريب، وتخضع السجلات والصلاحيات لسياسات وصول واضحة.</p>
        </div>
        <div className="care-trust-points">
          <span><CheckCircle2 /> ملفك الصحي مفصول عن بيانات التدريب</span>
          <span><CheckCircle2 /> صلاحيات حسب دور المستخدم</span>
          <span><CheckCircle2 /> سجل للقرارات الإدارية</span>
          <span><CheckCircle2 /> لا تُحفظ بيانات البطاقات</span>
        </div>
      </div>
    </section>
  </PageShell>;
}
