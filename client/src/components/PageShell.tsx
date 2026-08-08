import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">تخطي إلى المحتوى</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}

