import { supabase } from "./supabase";

/**
 * فريقنا الطبي — the clinical team shown on the landing page.
 *
 * Read straight from Supabase rather than through the catalogue API: the row
 * policy already publishes verified specialists, there is nothing to derive, and
 * the landing page should not wait on the API function to cold start.
 *
 * `team_order` decides membership and sequence. A specialist can be bookable
 * without being introduced on the front page, which is why it is a separate
 * column rather than a flag on verification.
 */

export type TeamMember = {
  id: string;
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  languages: string[];
  yearsExperience: number;
  photoUrl: string | null;
  /** Whether this specialist has any open time. Decides the card's action. */
  bookable: boolean;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("specialists")
    .select("id,display_name,title,bio,specialties,languages,years_experience,photo_url")
    .not("team_order", "is", null)
    .order("team_order");
  if (error) throw new Error(error.message);

  const members = (data ?? []) as any[];
  if (!members.length) return [];

  // One query for everyone: which of them actually have time to book. A card
  // that offers an appointment nobody can take is worse than one that does not.
  const { data: slots } = await supabase
    .from("availability_slots")
    .select("specialist_id")
    .eq("is_available", true)
    .in("specialist_id", members.map((m) => m.id))
    .gte("starts_at", new Date().toISOString());

  const withTime = new Set((slots ?? []).map((s: any) => s.specialist_id));

  return members.map((row) => ({
    id: row.id,
    name: row.display_name,
    title: row.title ?? "",
    bio: row.bio ?? "",
    specialties: row.specialties ?? [],
    languages: row.languages ?? [],
    yearsExperience: Number(row.years_experience ?? 0),
    photoUrl: row.photo_url,
    bookable: withTime.has(row.id),
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------ administration */

export type TeamAdminRow = TeamMember & { teamOrder: number | null; isDemo: boolean; isVerified: boolean };

/** Every specialist, on the landing page or not, for the administration screen. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadAllSpecialists(): Promise<TeamAdminRow[]> {
  const { data, error } = await supabase
    .from("specialists")
    .select("id,display_name,title,bio,specialties,languages,years_experience,photo_url,team_order,is_demo,is_verified")
    .order("team_order", { ascending: true, nullsFirst: false })
    .order("display_name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id, name: row.display_name, title: row.title ?? "", bio: row.bio ?? "",
    specialties: row.specialties ?? [], languages: row.languages ?? [],
    yearsExperience: Number(row.years_experience ?? 0), photoUrl: row.photo_url,
    teamOrder: row.team_order, isDemo: Boolean(row.is_demo), isVerified: Boolean(row.is_verified),
    bookable: false,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Position on the landing page; null takes them off it. Administration only. */
export async function setTeamPosition(specialistId: string, position: number | null) {
  const { error } = await supabase.rpc("set_team_position", {
    p_specialist_id: specialistId, p_position: position,
  });
  if (error) throw new Error(error.message.includes("FORBIDDEN") ? "هذه العملية تتطلب صلاحية إدارية." : error.message);
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Replace a specialist's photograph.
 *
 * Stored under the specialist's own id and upserted, so a person has exactly one
 * portrait and replacing it does not leave the old file behind. The bucket is
 * public — these are chosen to be shown on the front page — so the returned URL
 * can go straight onto the row.
 */
export async function uploadSpecialistPhoto(specialistId: string, file: File): Promise<string> {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("حجم الصورة يتجاوز ٥ ميغابايت.");
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("تُقبل صور JPG أو PNG أو WebP فقط.");

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${specialistId}/portrait.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("specialist-photos")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (uploadError) throw new Error("تعذر رفع الصورة.");

  const { data } = supabase.storage.from("specialist-photos").getPublicUrl(path);
  // Cache-bust so a replaced portrait is not served from the old copy.
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase.from("specialists").update({ photo_url: url }).eq("id", specialistId);
  if (error) throw new Error(error.message);
  return url;
}

/** Initials for the placeholder when a specialist has no photograph yet. */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
}
