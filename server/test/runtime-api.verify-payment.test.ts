import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient, type FakeSupabaseClient } from "./helpers/fake-supabase-client.js";

// --- module mocks -----------------------------------------------------------
//
// runtime-api.ts is deeply intertwined with I/O: verifyPayment alone touches
// the payments, notifications and bookings tables, two RPCs, and a live
// Moyasar lookup. Extracting all of that into pure functions would risk
// changing behavior for very little gain, so per the audit's own guidance
// these tests mock the Supabase clients and the Moyasar network calls instead,
// and drive the real (unmodified) verifyPayment/findLocalPayment through them.

vi.mock("../src/supabase.js", () => ({
  authenticatedClient: vi.fn(),
  adminClient: vi.fn(),
  catalog: {},
}));

vi.mock("../src/moyasar.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/moyasar.js")>();
  return {
    ...actual, // keep the real mapPaymentStatus, MoyasarError, toHalalas, etc.
    isMoyasarConfigured: vi.fn(() => true),
    fetchPayment: vi.fn(),
    fetchInvoice: vi.fn(),
    refundPayment: vi.fn(),
  };
});

vi.mock("../src/meetings.js", () => ({
  // Remote-meeting issuance is a separate, best-effort side effect with its
  // own try/catch (see issueMeetingLinkIfRemote); switching it off here keeps
  // these tests focused on the payment-verification decision itself.
  isMeetingConfigured: vi.fn(() => false),
  createMeeting: vi.fn(),
  meetingProvider: vi.fn(() => "none"),
}));

const { authenticatedClient, adminClient } = await import("../src/supabase.js");
const { fetchPayment } = await import("../src/moyasar.js");
const { verifyPayment, findLocalPayment } = await import("../src/runtime-api.js");

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION = "Bearer test-user-token";

function localPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pay_row_1",
    order_number: "BR-20260810-0421",
    user_id: AUTH_USER_ID,
    amount: 250, // SAR
    status: "processing",
    booking_id: null,
    enrollment_id: null,
    ...overrides,
  };
}

function remoteMoyasarPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pay_moyasar_1",
    status: "paid",
    amount: 25000, // halalas, matches localPayment's 250 SAR by default
    currency: "SAR",
    invoice_id: "inv_1",
    ...overrides,
  };
}

let client: FakeSupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = createFakeSupabaseClient();
  client.auth.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
  vi.mocked(authenticatedClient).mockReturnValue(client as never);
  vi.mocked(adminClient).mockReturnValue(client as never);
});

describe("verifyPayment — ownership", () => {
  it("returns 403 Forbidden when the Moyasar payment belongs to someone else's order", async () => {
    const foreign = localPayment({ user_id: "some-other-user-id" });
    client.queue("payments", { data: foreign, error: null }); // findLocalPayment
    vi.mocked(fetchPayment).mockResolvedValue(remoteMoyasarPayment() as never);

    const result = await verifyPayment(AUTHORIZATION, { paymentId: "pay_moyasar_1" });

    expect(result.status).toBe(403);
    // No write of any kind should happen before ownership is confirmed.
    expect(client.calls.filter((c) => c.method === "update" || c.method === "insert")).toEqual([]);
    expect(client.rpcCalls).toEqual([]);
  });
});

describe("verifyPayment — amount matching", () => {
  it("never confirms a payment whose captured amount is short by one riyal, and flags it for review", async () => {
    const payment = localPayment({ amount: 250 });
    client.queue("payments", { data: payment, error: null }); // findLocalPayment
    client.queue("payments", { data: null, error: null }); // status update
    vi.mocked(fetchPayment).mockResolvedValue(
      remoteMoyasarPayment({ amount: 24900, status: "paid" }) as never, // 249.00 SAR captured
    );

    const result = await verifyPayment(AUTHORIZATION, { paymentId: "pay_moyasar_1" });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "قيمة الدفع لا تطابق الطلب." });

    const update = client.calls.find((c) => c.table === "payments" && c.method === "update");
    expect(update?.args[0]).toMatchObject({ status: "failed", failure_reason: "amount_mismatch" });

    // A mismatched payment must never trigger booking conversion or a
    // "payment received" notification.
    expect(client.rpcCalls).toEqual([]);
    expect(client.calls.some((c) => c.table === "notifications")).toBe(false);
  });

  it("confirms when the captured amount matches exactly", async () => {
    const payment = localPayment({ amount: 250, status: "processing" });
    client.queue("payments", { data: payment, error: null }); // findLocalPayment
    client.queue("payments", { data: null, error: null }); // status update -> succeeded
    client.queueRpc({ data: "booking_confirmed", error: null }); // convert_paid_intent
    client.queue("notifications", { data: null, error: null }); // mark old notice read
    client.queue("notifications", { data: null, error: null }); // payment_succeeded insert
    client.queue("payments", { data: { ...payment, status: "succeeded" }, error: null }); // 2nd findLocalPayment (receipt)
    vi.mocked(fetchPayment).mockResolvedValue(remoteMoyasarPayment({ amount: 25000, status: "paid" }) as never);

    const result = await verifyPayment(AUTHORIZATION, { paymentId: "pay_moyasar_1" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "succeeded", persisted: true });
    expect(client.rpcCalls.map((c) => c.name)).toEqual(["convert_paid_intent"]);
  });
});

describe("verifyPayment — idempotency", () => {
  it("does not re-process a payment that is already settled", async () => {
    // Simulates reloading the callback page: the local row is already
    // "succeeded" and Moyasar still reports "paid".
    const payment = localPayment({ status: "succeeded", amount: 250 });
    client.queue("payments", { data: payment, error: null }); // findLocalPayment (1st)
    client.queue("payments", { data: payment, error: null }); // findLocalPayment (2nd, receipt lookup)
    vi.mocked(fetchPayment).mockResolvedValue(remoteMoyasarPayment({ amount: 25000, status: "paid" }) as never);

    const result = await verifyPayment(AUTHORIZATION, { paymentId: "pay_moyasar_1" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "succeeded", persisted: true });

    // The whole point of the idempotency guard: no second status write, no
    // second "payment received" notification, no re-run of booking conversion.
    expect(client.calls.some((c) => c.table === "payments" && c.method === "update")).toBe(false);
    expect(client.calls.some((c) => c.table === "notifications")).toBe(false);
    expect(client.rpcCalls).toEqual([]);
  });

  it("contrast: a first-time settlement (not yet succeeded locally) does write status, notify, and convert", async () => {
    const payment = localPayment({ status: "processing", amount: 250 });
    client.queue("payments", { data: payment, error: null }); // findLocalPayment
    client.queue("payments", { data: null, error: null }); // status update
    client.queueRpc({ data: "booking_confirmed", error: null }); // convert_paid_intent
    client.queue("notifications", { data: null, error: null }); // mark old notice read
    client.queue("notifications", { data: null, error: null }); // payment_succeeded insert
    client.queue("payments", { data: { ...payment, status: "succeeded" }, error: null }); // 2nd findLocalPayment
    vi.mocked(fetchPayment).mockResolvedValue(remoteMoyasarPayment({ amount: 25000, status: "paid" }) as never);

    await verifyPayment(AUTHORIZATION, { paymentId: "pay_moyasar_1" });

    expect(client.calls.filter((c) => c.table === "payments" && c.method === "update")).toHaveLength(1);
    expect(client.calls.filter((c) => c.table === "notifications" && c.method === "insert")).toHaveLength(1);
    expect(client.rpcCalls.map((c) => c.name)).toEqual(["convert_paid_intent"]);
  });
});

describe("verifyPayment — no service role key", () => {
  it("reports the verified status without persisting, instead of pretending the booking is confirmed", async () => {
    const payment = localPayment({ amount: 250 });
    client.queue("payments", { data: payment, error: null }); // findLocalPayment
    vi.mocked(adminClient).mockReturnValue(null); // service role key missing
    vi.mocked(fetchPayment).mockResolvedValue(remoteMoyasarPayment({ amount: 25000, status: "paid" }) as never);

    const result = await verifyPayment(AUTHORIZATION, { paymentId: "pay_moyasar_1" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "succeeded", persisted: false, reason: "service_role_key_missing" });
    expect(client.calls.some((c) => c.method === "update" || c.method === "insert")).toBe(false);
  });
});

describe("findLocalPayment", () => {
  it("matches on metadata.order_number when Moyasar's payment carries it", async () => {
    const payment = localPayment();
    client.queue("payments", { data: payment, error: null });

    const remote = { ...remoteMoyasarPayment(), metadata: { order_number: "BR-20260810-0421" } };
    const result = await findLocalPayment(client as never, remote as never);

    expect(result).toEqual(payment);
    const call = client.calls.find((c) => c.table === "payments" && c.method === "eq");
    expect(call?.args).toEqual(["order_number", "BR-20260810-0421"]);
  });

  it("falls back to provider_invoice_id when the payment has no order_number metadata", async () => {
    // This is the hosted-invoice case the code comments describe: the invoice
    // carries metadata.order_number, but the payment created *inside* it does
    // not inherit it.
    const payment = localPayment();
    client.queue("payments", { data: payment, error: null });

    const remote = remoteMoyasarPayment({ invoice_id: "inv_1" });
    const result = await findLocalPayment(client as never, remote as never);

    expect(result).toEqual(payment);
    const call = client.calls.find((c) => c.table === "payments" && c.method === "eq");
    expect(call?.args).toEqual(["provider_invoice_id", "inv_1"]);
  });

  it("tries order_number first and only falls back to invoice_id if that lookup misses", async () => {
    client.queue("payments", { data: null, error: null }); // order_number miss
    const payment = localPayment();
    client.queue("payments", { data: payment, error: null }); // invoice_id hit

    const remote = { ...remoteMoyasarPayment(), metadata: { order_number: "BR-does-not-exist" } };
    const result = await findLocalPayment(client as never, remote as never);

    expect(result).toEqual(payment);
    const eqCalls = client.calls.filter((c) => c.table === "payments" && c.method === "eq");
    expect(eqCalls.map((c) => c.args[0])).toEqual(["order_number", "provider_invoice_id"]);
  });

  it("returns null when neither order_number nor invoice_id match anything", async () => {
    client.queue("payments", { data: null, error: null });
    client.queue("payments", { data: null, error: null });

    const remote = { ...remoteMoyasarPayment(), metadata: { order_number: "BR-nope" } };
    const result = await findLocalPayment(client as never, remote as never);

    expect(result).toBeNull();
  });
});
