"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brand, BrandStar } from "./BrandMarks";

export { Brand } from "./BrandMarks";

/**
 * Navigation follows the two halves of the platform rather than listing every
 * page flat. A visitor decides which side they are on — care, or learning —
 * before being asked to pick anything specific.
 *
 * The labels and the star separators are the artboard's. The submenus are not
 * in it, but a landing comp does not draw hover states, and without them the
 * programmes, specialists, articles and research pages have no route in from
 * the header at all — so the two levels stay.
 */
const sections = [
  {
    label: "استشارة بلو", href: "/consultations",
    items: [
      ["استشر مختص", "/services"],
      ["البرامج العلاجية", "/programs"],
      ["الأخصائيون", "/specialists"],
    ],
  },
  {
    label: "أكاديمية بلو", href: "/academy",
    items: [
      ["الدورات", "/courses"],
      ["المقالات", "/articles"],
      ["مراجعة الأبحاث", "/research"],
      ["التدريب الصيفي الإكلينيكي", "/training"],
    ],
  },
];
const plainLinks = [["عن المنصة", "/about"], ["الأسئلة الشائعة", "/faq"]];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  // The header renders on every page but only needs Supabase to decide one
  // label. Loading it statically pulled the whole database client into the
  // first paint, so it is fetched after render instead — the nav shows the
  // signed-out label for a moment and corrects itself.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void import("../lib/supabase").then(({ supabase }) => {
      if (!active) return;
      void supabase.auth.getSession().then(({ data }) => { if (active) setSignedIn(Boolean(data.session)); });
      const listener = supabase.auth.onAuthStateChange((_event, session) => { if (active) setSignedIn(Boolean(session)); });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    });

    return () => { active = false; unsubscribe?.(); };
  }, []);

  const close = () => setOpen(false);

  return <>
    <div className="environment-bar"><div className="container"><span>نسخة تشغيلية تجريبية</span><p>بيانات مقدمي الخدمة والأسعار والمواعيد الحالية نماذج واضحة وليست عروضاً تجارية معتمدة.</p></div></div>
    <header className="site-header"><nav className="container nav" aria-label="التنقل الرئيسي">
      <Brand />

      <div className={`nav-links ${open ? "is-open" : ""}`} id="site-menu">
        {sections.map((section) => <div className="nav-section" key={section.href}>
          <Link className="nav-section-head" to={section.href} onClick={close}>
            <BrandStar className="star nav-star" />{section.label}<ChevronDown className="nav-chevron" />
          </Link>
          <div className="nav-menu">{section.items.map(([label, href]) => <Link to={href} key={href} onClick={close}>{label}</Link>)}</div>
        </div>)}

        {plainLinks.map(([label, href]) => <Link className="nav-plain" to={href} key={href} onClick={close}>
          <BrandStar className="star nav-star" />{label}
        </Link>)}

        {/* The two actions live in `.nav-actions`, which collapses to the menu
            button once the drawer takes over — so on a phone there would be no
            way to reach either. They are repeated here for the drawer; exactly
            one copy is displayed at any width. */}
        <div className="nav-drawer-actions">
          <Link className="button button-small button-secondary" to={signedIn ? "/portal" : "/login"} onClick={close}>
            {signedIn ? "لوحة الحساب" : "تسجيل الدخول"}
          </Link>
          <Link className="button button-small" to="/booking" onClick={close}>ابدأ الحجز</Link>
        </div>
      </div>

      <div className="nav-actions">
        <Link className="button button-small button-secondary" to={signedIn ? "/portal" : "/login"}>
          {signedIn ? "لوحة الحساب" : "تسجيل الدخول"}
        </Link>
        <Link className="button button-small" to="/booking">ابدأ الحجز</Link>
        <button className="menu-button" type="button" onClick={() => setOpen(!open)}
          aria-expanded={open} aria-controls="site-menu"
          aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}>{open ? <X /> : <Menu />}</button>
      </div>
    </nav></header>
  </>;
}
