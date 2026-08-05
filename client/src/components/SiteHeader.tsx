"use client";

import { LayoutDashboard, LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import mascotIcon from "../assets/brand/mascot-icon.png";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="تأهيل بلو — الرئيسية">
      <span className="brand-mark" aria-hidden="true"><img src={mascotIcon} alt="" /></span>
      <span className="brand-copy"><strong>تأهيل <b>بلو</b></strong><small>علاج طبيعي وتأهيل مهني</small></span>
    </a>
  );
}

const links = [["الخدمات", "/services"],["الأخصائيون", "/specialists"],["الدورات", "/courses"],["عن المنصة", "/about"],["الأسئلة الشائعة", "/faq"]];

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

  return <>
    <div className="environment-bar"><div className="container"><span>نسخة تشغيلية تجريبية</span><p>بيانات مقدمي الخدمة والأسعار والمواعيد الحالية نماذج واضحة وليست عروضاً تجارية معتمدة.</p></div></div>
    <header className="site-header"><nav className="container nav" aria-label="التنقل الرئيسي">
      <Brand />
      <div className={`nav-links ${open ? "is-open" : ""}`}>{links.map(([label, href]) => <a href={href} key={href} onClick={() => setOpen(false)}>{label}</a>)}</div>
      <div className="nav-actions">
        <a className="nav-portal" href={signedIn ? "/portal" : "/login"}>{signedIn ? <LayoutDashboard /> : <LogIn />}{signedIn ? "لوحة الحساب" : "تسجيل الدخول"}</a>
        <a className="button button-small" href="/booking">ابدأ الحجز</a>
        <button className="menu-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}>{open ? <X /> : <Menu />}</button>
      </div>
    </nav></header>
  </>;
}
