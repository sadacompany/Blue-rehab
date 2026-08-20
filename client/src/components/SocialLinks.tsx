import type { ReactNode } from "react";
import { SOCIAL_LINKS, type SocialPlatform } from "../lib/site";

/* The brand glyphs are drawn inline rather than pulled from an icon package.
   lucide-react — the set the rest of the site uses — carries no brand marks,
   and every alternative either ships a second font/sprite or resolves at
   runtime against a CDN. Four paths cost less than either and keep the page
   self-contained.

   Each is a 24×24 glyph painted in `currentColor`, so a mark inherits the
   colour of the link that wraps it and follows the same hover as the text
   links beside it. TikTok, X and WhatsApp are solid marks; Instagram's is an
   outline in the brand's own presentation, so it is stroked. */
const GLYPHS: Record<SocialPlatform, ReactNode> = {
  tiktok: (
    <path d="M16.5 0h-3.2v16.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1v-3.3a6.2 6.2 0 1 0 5.2 6.1V7.9a7.5 7.5 0 0 0 4.4 1.4V6a4.4 4.4 0 0 1-4.4-4.4V0Z" />
  ),
  x: (
    <path d="M18.9 1.2h3.7l-8.1 9.2L24 22.8h-7.4l-5.8-7.6-6.7 7.6H.4l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9ZM17.6 20.6h2L6.5 3.2H4.3l13.3 17.4Z" />
  ),
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" stroke="none" />
    </g>
  ),
  whatsapp: (
    <path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.15L2 22.5l5.5-1.6A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.2 15.02l-.3-.18-3.03.88.9-2.95-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm-3.7 4.02c-.17 0-.45.06-.69.32-.24.26-.9.88-.9 2.14s.92 2.48 1.05 2.65c.13.17 1.8 2.87 4.46 3.9 2.2.86 2.65.69 3.13.64.48-.04 1.54-.62 1.76-1.23.22-.61.22-1.13.15-1.24-.06-.1-.24-.17-.5-.3-.26-.13-1.54-.76-1.78-.85-.24-.09-.41-.13-.58.13-.17.26-.67.85-.82 1.02-.15.17-.3.2-.56.07-.26-.13-1.1-.4-2.1-1.3-.78-.69-1.3-1.54-1.45-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.15.17-.26.26-.43.09-.18.04-.33-.02-.46-.07-.13-.58-1.4-.8-1.92-.2-.5-.4-.43-.55-.44h-.48Z" />
  ),
};

/**
 * The clinic's social accounts, as a row of icon links.
 *
 * Rendered in the footer and on the contact page. Every entry opens in a new
 * tab, so each carries `rel="noopener noreferrer"` — `noopener` to keep the
 * opened tab from reaching back through `window.opener`, `noreferrer` for the
 * older browsers that need it to get the same guarantee.
 */
export default function SocialLinks() {
  return (
    <ul className="social-links" aria-label="حسابات بلو ريهاب على مواقع التواصل">
      {SOCIAL_LINKS.map((link) => (
        <li key={link.platform}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            {/* The glyph is decorative: the accessible name comes from the
                link's own `aria-label`, so the icon is hidden from the tree
                rather than announced a second time. */}
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
              {GLYPHS[link.platform]}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
