import { useCallback, useEffect, useState, type DependencyList } from "react";

/**
 * The fetch/loading/error boilerplate nine components used to hand-roll.
 *
 * `useCatalog` (components/CatalogSections.tsx) had it right — `reload`
 * memoized with `useCallback` and listed as the effect's own dependency,
 * rather than the `useEffect(() => { void reload() }, [])` version several
 * other screens carried, which every linter flags as `react-hooks/
 * exhaustive-deps` because `reload` genuinely can go stale. This generalises
 * that shape rather than the other one.
 *
 * `deps` plays the same role `useCallback`'s own dependency array always
 * plays: it is what decides whether a *new* `reload` is produced, which is
 * what makes the effect re-run and refetch. A component whose fetch does not
 * depend on anything reactive passes `[]`, exactly like `useCatalog` does; one
 * whose fetch is keyed by a route param or an id passes that value, exactly
 * like the old hand-rolled `useEffect(() => { void reload() }, [slug])`
 * versions did. `fetcher` itself is deliberately left out of that list — it is
 * almost always a fresh closure every render, and putting it in `deps` would
 * refetch on every render rather than only when something the caller actually
 * named has changed. Callers that close over reactive values inside `fetcher`
 * are expected to list those values in `deps`, the same contract `useCatalog`
 * already relied on.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetcher());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void reload(); }, [reload]);

  // `setData` is exposed alongside `reload` for the rare caller that needs an
  // optimistic update — flipping a notification's `read_at` locally before the
  // request that persists it returns, the way ConnectedPortal does. Most
  // callers never touch it; `reload()` is the normal way to get fresh data.
  return { data, error, loading, reload, setData };
}
