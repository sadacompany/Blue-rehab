import { apiUrl } from "./api";
import type { CatalogResponse, CourseDetailResponse } from "./catalog-types";

/**
 * Public catalogue reads.
 *
 * Deliberately kept free of `@supabase/supabase-js`. These are the only calls
 * the landing, services, specialists and courses pages make, and importing the
 * database client for them dragged 210 KB into the first paint for a visitor who
 * had not signed in and may never do so.
 *
 * The API returns exactly the shape the client already expected, and its
 * responses carry a public cache header, so this is also fewer round trips: one
 * CDN-cacheable request instead of five parallel queries from the browser.
 */

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error || `REQUEST_FAILED_${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadCatalog(): Promise<CatalogResponse> {
  return await getJson<CatalogResponse>("/catalog");
}

export async function loadCourseDetail(slug: string): Promise<CourseDetailResponse> {
  return await getJson<CourseDetailResponse>(`/courses/${encodeURIComponent(slug)}`);
}
