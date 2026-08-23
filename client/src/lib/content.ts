import { AuthenticationRequiredError } from "./platform";
import { typedSupabase as supabase } from "./supabase";
import type { Database } from "./database.types";

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
  /** Cover artwork. The landing page shows only items that have one. */
  coverUrl: string | null;
  /** Former price, struck through beside `price`. Null shows no comparison. */
  compareAtPrice: number | null;
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
  coverUrl: string | null;
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
  coverUrl: string | null;
};

// `select("*")` against a typed client already infers the exact row shape from
// `Database["public"]["Tables"][table]["Row"]`, so these take that inferred
// type directly rather than a hand-maintained duplicate of the schema.
type RehabProgramRow = Database["public"]["Tables"]["rehab_programs"]["Row"];
type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];
type ResearchReviewRow = Database["public"]["Tables"]["research_reviews"]["Row"];

const toProgram = (row: RehabProgramRow): RehabProgram => ({
  id: row.id, slug: row.slug, title: row.title,
  summary: row.summary ?? "", description: row.description ?? "",
  goals: row.goals ?? [], suitableFor: row.suitable_for ?? [],
  durationWeeks: row.duration_weeks, sessionsPerWeek: row.sessions_per_week,
  level: row.level, price: Number(row.price), coverUrl: row.cover_url ?? null,
  compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined
    ? null : Number(row.compare_at_price),
});

const toArticle = (row: ArticleRow): Article => ({
  id: row.id, slug: row.slug, title: row.title,
  excerpt: row.excerpt ?? "", body: row.body ?? "",
  category: row.category, tags: row.tags ?? [],
  readingMinutes: row.reading_minutes, authorName: row.author_name,
  publishedAt: row.published_at, coverUrl: row.cover_url ?? null,
});

const toResearch = (row: ResearchReviewRow): ResearchReview => ({
  id: row.id, slug: row.slug, title: row.title,
  excerpt: row.excerpt ?? "", body: row.body ?? "",
  sourceTitle: row.source_title, sourceAuthors: row.source_authors,
  sourceJournal: row.source_journal, sourceYear: row.source_year, sourceUrl: row.source_url,
  keyFindings: row.key_findings ?? [], practicalTakeaway: row.practical_takeaway,
  evidenceLevel: row.evidence_level, tags: row.tags ?? [],
  reviewerName: row.reviewer_name, publishedAt: row.published_at,
  coverUrl: row.cover_url ?? null,
});

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

/* ------------------------------------------------------- putting work forward */

export type ContentKind = "article" | "research";

export type ContentSubmission = {
  kind: ContentKind;
  title: string;
  excerpt: string;
  body: string;
  category?: string;
  tags: string[];
  sourceTitle?: string;
  sourceAuthors?: string;
  sourceJournal?: string;
  sourceYear?: number | null;
  sourceUrl?: string;
  practicalTakeaway?: string;
  /**
   * Set by `uploadPendingCover` below, before this is called — the file
   * itself has already been written to the author's own `pending/{uid}/`
   * prefix in the `content-covers` bucket by then. The function re-validates
   * the URL actually belongs to the caller before attaching it, so this
   * value is a claim, not a grant.
   */
  coverUrl?: string;
};

const SUBMIT_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "يلزم تسجيل الدخول.",
  KIND_INVALID: "نوع المحتوى غير معروف.",
  TITLE_INVALID: "العنوان يجب أن يكون بين ٦ و٢٠٠ حرفًا.",
  BODY_TOO_SHORT: "أضف نصاً كافياً قبل الإرسال للمراجعة.",
  NOT_A_PROVIDER: "الطلب متاح للأخصائيين والمدربين المعتمدين فقط.",
  COVER_PATH_INVALID: "تعذر التحقق من صورة الغلاف. أعد رفعها وحاول مجدداً.",
};

const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * Upload a cover image before the article/research row exists to attach it
 * to. Written to the author's own `pending/{uid}/` prefix — a path only they
 * can write to (20260823110000_author_cover_upload.sql) — and returned as a
 * public URL for `submitContentForReview` to pass straight through.
 */
export async function uploadPendingCover(file: File): Promise<string> {
  if (file.size > MAX_COVER_BYTES) throw new Error("حجم الصورة يتجاوز ٥ ميغابايت.");
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("تُقبل صور JPG أو PNG أو WebP أو AVIF فقط.");

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new AuthenticationRequiredError();

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `pending/${userId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from("content-covers")
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (error) throw new Error("تعذر رفع الصورة.");

  const { data } = supabase.storage.from("content-covers").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Put an article or a research review forward for review.
 *
 * Nothing here publishes: the function writes `in_review`, and the decision —
 * accuracy of the information, fit with the platform's scientific methodology —
 * belongs to administration, exactly as it already does for a course.
 */
export async function submitContentForReview(input: ContentSubmission) {
  // Every optional argument below is `default null` in the function
  // (20260816120000), so omitting the key — `undefined` — reaches the
  // function exactly the same as sending `null` did. The generated Args type
  // just does not carry `| null` for RPC parameters the way it does for table
  // columns, so `undefined` is the spelling that satisfies it.
  const { data, error } = await supabase.rpc("submit_content_for_review", {
    p_kind: input.kind,
    p_title: input.title,
    p_excerpt: input.excerpt || undefined,
    p_body: input.body,
    p_category: input.category || undefined,
    p_tags: input.tags,
    p_source_title: input.sourceTitle || undefined,
    p_source_authors: input.sourceAuthors || undefined,
    p_source_journal: input.sourceJournal || undefined,
    p_source_year: input.sourceYear ?? undefined,
    p_source_url: input.sourceUrl || undefined,
    p_practical_takeaway: input.practicalTakeaway || undefined,
    p_cover_url: input.coverUrl || undefined,
  });
  if (error) {
    const code = Object.keys(SUBMIT_ERRORS).find((key) => error.message.includes(key));
    throw new Error(code ? SUBMIT_ERRORS[code] : error.message);
  }
  return data as { id: string; kind: ContentKind; slug: string; status: string };
}

export type MySubmission = {
  id: string;
  kind: ContentKind;
  title: string;
  status: string;
  createdAt: string;
};

/** Everything the signed-in provider has put forward, whatever state it is in. */
export async function loadMySubmissions(): Promise<MySubmission[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return [];

  const [articles, research] = await Promise.all([
    supabase.from("articles").select("id,title,status,created_at").eq("author_id", user.id),
    supabase.from("research_reviews").select("id,title,status,created_at").eq("reviewer_id", user.id),
  ]);

  const rows: MySubmission[] = [
    ...(articles.data ?? []).map((r) => ({ id: r.id, kind: "article" as const, title: r.title, status: r.status, createdAt: r.created_at })),
    ...(research.data ?? []).map((r) => ({ id: r.id, kind: "research" as const, title: r.title, status: r.status, createdAt: r.created_at })),
  ];
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadResearchReview(slug: string): Promise<ResearchReview | null> {
  const { data, error } = await supabase
    .from("research_reviews").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toResearch(data) : null;
}
