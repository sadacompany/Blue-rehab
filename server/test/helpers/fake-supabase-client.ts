import { vi } from "vitest";

/**
 * Minimal stand-in for a supabase-js query builder result.
 *
 * The real client's builder methods (`.select`, `.eq`, `.update`, ...) are all
 * chainable and the chain itself is a thenable — `await x.from(t).update(v).eq(a,b)`
 * resolves without ever calling `.select()`/`.maybeSingle()`. This fake mirrors
 * that: every chain method just records the call and returns the same builder,
 * and the builder resolves (via `.then` or `.maybeSingle()`) to the next queued
 * result for that table.
 */
export type FakeResult = { data: unknown; error: unknown };

export type RecordedCall = { table: string; method: string; args: unknown[] };

/**
 * A fake Supabase client good enough to drive `runtime-api.ts`'s payment
 * verification paths without a live database.
 *
 * Queue discipline: push one `FakeResult` per `.from(table)` chain the code
 * under test is expected to run against that table, in call order. Pulling
 * from an empty queue throws immediately, which is deliberate — it turns "the
 * code under test made a query I didn't expect" into a clear test failure
 * instead of a silent `undefined`.
 */
export function createFakeSupabaseClient() {
  const queues = new Map<string, FakeResult[]>();
  const rpcQueue: FakeResult[] = [];
  const calls: RecordedCall[] = [];
  const rpcCalls: { name: string; params: unknown }[] = [];

  function queue(table: string, result: FakeResult) {
    const existing = queues.get(table);
    if (existing) existing.push(result);
    else queues.set(table, [result]);
  }

  function queueRpc(result: FakeResult) {
    rpcQueue.push(result);
  }

  function nextResult(table: string): FakeResult {
    const list = queues.get(table);
    const result = list?.shift();
    if (!result) {
      throw new Error(
        `createFakeSupabaseClient: unexpected query against "${table}" — no queued result left. ` +
          `Recorded calls so far: ${JSON.stringify(calls)}`,
      );
    }
    return result;
  }

  function makeBuilder(table: string) {
    const record = (method: string, args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
    const builder: PromiseLike<FakeResult> & Record<string, (...args: unknown[]) => unknown> = {
      select: (...args: unknown[]) => record("select", args),
      update: (...args: unknown[]) => record("update", args),
      insert: (...args: unknown[]) => record("insert", args),
      eq: (...args: unknown[]) => record("eq", args),
      in: (...args: unknown[]) => record("in", args),
      is: (...args: unknown[]) => record("is", args),
      contains: (...args: unknown[]) => record("contains", args),
      order: (...args: unknown[]) => record("order", args),
      limit: (...args: unknown[]) => record("limit", args),
      not: (...args: unknown[]) => record("not", args),
      maybeSingle: () => Promise.resolve(nextResult(table)),
      // Makes the builder itself awaitable, matching real supabase-js chains
      // that are never terminated with `.maybeSingle()` (e.g. plain updates).
      then: (onFulfilled?: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(nextResult(table)).then(onFulfilled, onRejected),
    };
    return builder;
  }

  return {
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, params?: unknown) => {
      rpcCalls.push({ name, params });
      const result = rpcQueue.shift();
      if (!result) {
        throw new Error(`createFakeSupabaseClient: unexpected rpc("${name}") — no queued result left.`);
      }
      return Promise.resolve(result);
    },
    auth: { getUser: vi.fn() },
    queue,
    queueRpc,
    calls,
    rpcCalls,
  };
}

export type FakeSupabaseClient = ReturnType<typeof createFakeSupabaseClient>;
