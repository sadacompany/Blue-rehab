/* ============================================================================
   Site metadata — the handful of constants that are owned by the brand rather
   than by the database. Nothing here is fetched, so it stays out of ./platform
   and ./catalog; the marketing pages import it directly.
   ========================================================================= */

export type SocialPlatform = "tiktok" | "x" | "instagram" | "whatsapp";

export type SocialLink = {
  platform: SocialPlatform;
  /** Arabic name of the network — used verbatim as the link's accessible label. */
  label: string;
  href: string;
};

/* Ordered the way the clinic ranks them: the two feeds it posts to most, then
   the gallery, then the group people actually reply in. */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  { platform: "tiktok", label: "تيك توك", href: "https://www.tiktok.com/@blo.rehab" },
  { platform: "x", label: "إكس", href: "https://x.com/blo_rehab" },
  { platform: "instagram", label: "إنستقرام", href: "https://www.instagram.com/blo.rehab/?hl=ar" },
  { platform: "whatsapp", label: "مجموعة واتساب", href: "https://chat.whatsapp.com/IeKvpl25dHJ9kIAoRUZmxG?s=cl&p=i&ilr=1" },
];
