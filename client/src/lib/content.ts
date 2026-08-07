import { supabase } from "./supabase";

/**
 * Public content for the two sections of the platform.
 *
 * أكاديمية بلو  — articles and research reviews
 * استشارة بلو   — rehabilitation programmes
 *
 * Reads only published rows: RLS enforces that, so a draft cannot leak even if
 * a query here forgot to filter.
 */

export type RehabProgram = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  goals: string[];
  suitableFor: string[];
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  level: string;
  price: number;
};

export type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string | null;
  tags: string[];
  readingMinutes: number | null;
  authorName: string | null;
  publishedAt: string | null;
};

export type ResearchReview = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  sourceTitle: string | null;
  sourceAuthors: string | null;
  sourceJournal: string | null;
  sourceYear: number | null;
  sourceUrl: string | null;
  keyFindings: string[];
  practicalTakeaway: string | null;
  evidenceLevel: string | null;
  tags: string[];
  reviewerName: string | null;
  publishedAt: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const toProgram = (row: any): RehabProgram => ({
  id: row.id, slug: row.slug, title: row.title,
  summary: row.summary ?? "", description: row.description ?? "",
  goals: row.goals ?? [], suitableFor: row.suitable_for ?? [],
  durationWeeks: row.duration_weeks, sessionsPerWeek: row.sessions_per_week,
  level: row.level, price: Number(row.price),
});

const toArticle = (row: any): Article => ({
  id: row.id, slug: row.slug, title: row.title,
  excerpt: row.excerpt ?? "", body: row.body ?? "",
  category: row.category, tags: row.tags ?? [],
  readingMinutes: row.reading_minutes, authorName: row.author_name,
  publishedAt: row.published_at,
});

const toResearch = (row: any): ResearchReview => ({
  id: row.id, slug: row.slug, title: row.title,
  excerpt: row.excerpt ?? "", body: row.body ?? "",
  sourceTitle: row.source_title, sourceAuthors: row.source_authors,
  sourceJournal: row.source_journal, sourceYear: row.source_year, sourceUrl: row.source_url,
  keyFindings: row.key_findings ?? [], practicalTakeaway: row.practical_takeaway,
  evidenceLevel: row.evidence_level, tags: row.tags ?? [],
  reviewerName: row.reviewer_name, publishedAt: row.published_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadPrograms(): Promise<RehabProgram[]> {
  const { data, error } = await supabase
    .from("rehab_programs")
    .select("*").eq("status", "published").order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toProgram);
}

export async function loadProgram(slug: string): Promise<RehabProgram | null> {
  const { data, error } = await supabase
    .from("rehab_programs").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProgram(data) : null;
}

export async function loadArticles(): Promise<Article[]> {
  const { data, error } = await supabase
    .from("articles").select("*").eq("status", "published").order("published_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toArticle);
}

export async function loadArticle(slug: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from("articles").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toArticle(data) : null;
}

export async function loadResearch(): Promise<ResearchReview[]> {
  const { data, error } = await supabase
    .from("research_reviews").select("*").eq("status", "published").order("published_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toResearch);
}

export async function loadResearchReview(slug: string): Promise<ResearchReview | null> {
  const { data, error } = await supabase
    .from("research_reviews").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toResearch(data) : null;
}
