import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arabicCheckoutUrl,
  fetchPayment,
  fromHalalas,
  isMoyasarConfigured,
  isMoyasarTestMode,
  mapPaymentStatus,
  MoyasarError,
  toHalalas,
} from "../src/moyasar.js";

describe("isMoyasarConfigured / isMoyasarTestMode", () => {
  it("is configured and in test mode with the fake sk_test_ key from test/setup.ts", () => {
    // MOYASAR_SECRET_KEY is set in test/setup.ts before config.ts (and
    // therefore this module) is ever imported.
    expect(isMoyasarConfigured()).toBe(true);
    expect(isMoyasarTestMode()).toBe(true);
  });
});

describe("mapPaymentStatus", () => {
  // Every input Moyasar can send, mapped to the app's internal payment_status
  // enum. A careless edit that drops or renames a case here silently
  // stops confirming (or stops failing) real payments.
  const cases: Array<[string, string]> = [
    ["paid", "succeeded"],
    ["authorized", "processing"],
    ["initiated", "processing"],
    ["failed", "failed"],
    ["voided", "cancelled"],
    ["refunded", "refunded"],
    // Unknown/future statuses must fail safe to "pending", never to "succeeded".
    ["captured", "pending"],
    ["", "pending"],
  ];

  it.each(cases)("maps Moyasar status %s to %s", (input, expected) => {
    expect(mapPaymentStatus(input)).toBe(expected);
  });
});

describe("arabicCheckoutUrl", () => {
  it("forces lang=ar onto a hosted invoice URL", () => {
    const result = arabicCheckoutUrl("https://api.moyasar.com/v1/invoices/inv_123/pay");
    expect(new URL(result).searchParams.get("lang")).toBe("ar");
  });

  it("overwrites an existing lang param rather than appending a second one", () => {
    const result = arabicCheckoutUrl("https://api.moyasar.com/v1/invoices/inv_123/pay?lang=en");
    const url = new URL(result);
    expect(url.searchParams.getAll("lang")).toEqual(["ar"]);
  });

  it("returns the input unchanged when it isn't a parseable URL", () => {
    expect(arabicCheckoutUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("toHalalas / fromHalalas", () => {
  it("converts a typical SAR amount to whole halalas", () => {
    expect(toHalalas(199.5)).toBe(19950);
    expect(fromHalalas(19950)).toBe(199.5);
  });

  it("rounds away floating point noise instead of truncating", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE754 — Math.trunc would produce
    // 1998 halalas (19.98 SAR), silently short-changing every such price.
    expect(toHalalas(19.99)).toBe(1999);
  });
});

describe("MoyasarError mapping (via fetchPayment)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("maps a timeout to a 504 MoyasarError, not an unhandled rejection", async () => {
    const timeoutError = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError));

    await expect(fetchPayment("pay_123")).rejects.toMatchObject({
      status: 504,
      message: "moyasar_timeout",
    });
    await expect(fetchPayment("pay_123")).rejects.toBeInstanceOf(MoyasarError);
  });

  it("maps a plain network failure to a 502 MoyasarError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.moyasar.com")));

    await expect(fetchPayment("pay_123")).rejects.toMatchObject({ status: 502 });
    await expect(fetchPayment("pay_123")).rejects.toThrow(/^moyasar_network_error:/);
  });

  it("maps a non-ok gateway response to a MoyasarError carrying that HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"message":"payment not found"}'),
      }),
    );

    await expect(fetchPayment("pay_does_not_exist")).rejects.toMatchObject({ status: 404 });
  });

  it("returns the parsed payment on a normal successful response", async () => {
    const payment = { id: "pay_123", status: "paid", amount: 25000, currency: "SAR" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(payment)) }),
    );

    await expect(fetchPayment("pay_123")).resolves.toEqual(payment);
  });
});
