import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { capturePromoRef } from "../lib/promotions";

/**
 * What a full page reload used to do for free.
 *
 * Internal links were plain anchors, so every click tore the application down
 * and rebuilt it — 2.3s on the live site, and a blank flash each time. They are
 * `<Link>` now, which leaves three things to do by hand that the browser had
 * been doing: reset the scroll position, move focus into the new page, and name
 * the document. Without the last one every tab, bookmark and history entry in
 * the app reads "بلو ريهاب | علاج طبيعي وتأهيل".
 */

const SITE = "بلو ريهاب";

const TITLES: Record<string, string> = {
  "/": "علاج طبيعي وتأهيل",
  "/consultations": "عيادة بلو",
  "/academy": "أكاديمية بلو",
  "/programs": "البرامج العلاجية",
  "/articles": "المقالات",
  "/research": "مراجعة الأبحاث",
  "/services": "استشر مختص",
  "/specialists": "الأخصائيون",
  "/courses": "الدورات التدريبية",
  "/training": "التدريب الصيفي الإكلينيكي",
  "/booking": "حجز موعد",
  "/portal": "لوحة حسابي",
  "/specialist": "لوحة الأخصائي",
  "/trainer": "لوحة المدرب",
  "/admin": "لوحة الإدارة",
  "/join": "الانضمام كمقدم خدمة",
  "/login": "تسجيل الدخول",
  "/payment/callback": "تأكيد الدفع",
  "/about": "عن المنصة",
  "/faq": "الأسئلة الشائعة",
  "/contact": "تواصل معنا",
  "/privacy": "سياسة الخصوصية",
  "/terms": "الشروط والأحكام",
  "/refund-policy": "سياسة الإلغاء والاسترداد",
};

export default function RouteChange() {
  const { pathname, search } = useLocation();

  /*
   * A promotion link is `?ref=CODE` on whatever page the campaign points at,
   * so the place that already watches every navigation is the place to notice
   * it. Kept apart from the effect below because it is keyed by the query
   * string, not the path — the same page arrived at through two different
   * campaign links is two arrivals.
   */
  useEffect(() => { capturePromoRef(search); }, [search]);

  useEffect(() => {
    // A hash means the author is pointing at a section; leave that alone.
    if (!window.location.hash) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }

    // Never leave the previous page's name on the tab: a route with no entry
    // and no heading yet would otherwise keep announcing where the visitor was.
    const known = TITLES[pathname];
    document.title = known ? `${known} | ${SITE}` : SITE;

    // Detail pages (an article, a course, a programme) are named by their
    // content, which arrives after the route does. The heading is the title, so
    // watch for it rather than duplicating the fetch — and take focus at the
    // same time, so the next Tab starts at the top of the new page and a screen
    // reader hears the heading instead of silence.
    let settled = false;
    const apply = () => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return false;
      if (!settled) {
        settled = true;
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      if (!known) document.title = `${heading.textContent?.trim()} | ${SITE}`;
      return true;
    };

    if (apply() && known) return;
    const observer = new MutationObserver(() => { if (apply() && known) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 5000);
    return () => { observer.disconnect(); window.clearTimeout(stop); };
  }, [pathname]);

  return null;
}
