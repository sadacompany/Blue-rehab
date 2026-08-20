import { describe, expect, it } from "vitest";
import { amountsMatch, mapDomainError } from "../src/runtime-api.js";

describe("amountsMatch", () => {
  // payment.amount is stored in SAR; Moyasar's `amount` field on a payment is
  // in halalas. A careless swap of the two, or a dropped `* 100`, must fail
  // loudly here rather than as a silently confirmed underpayment in production.
  it("matches when the captured halalas equal the expected SAR amount * 100", () => {
    expect(amountsMatch(250, 25000)).toBe(true);
  });

  it("rejects an amount off by a single halala", () => {
    expect(amountsMatch(250, 24999)).toBe(false);
    expect(amountsMatch(250, 25001)).toBe(false);
  });

  it("rejects an amount off by a whole riyal", () => {
    // 249 SAR captured against a 250 SAR order — a mispriced checkout, not a
    // rounding wobble, and must never be treated as a match.
    expect(amountsMatch(250, 24900)).toBe(false);
  });

  it("tolerates floating point noise in the SAR side without tolerating a real mismatch", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE754 before rounding.
    expect(amountsMatch(19.99, 1999)).toBe(true);
    expect(amountsMatch(19.99, 1998)).toBe(false);
  });

  it("treats string-shaped numeric input the same as numeric input", () => {
    // payment.amount comes back from Supabase as a numeric column, which the
    // JS client can hand back as a string depending on driver/config; the
    // Number() coercion inside amountsMatch is what makes that safe.
    expect(amountsMatch("250" as unknown as number, 25000)).toBe(true);
  });
});

describe("mapDomainError", () => {
  it("maps a known SQL error code to its HTTP status and Arabic message", () => {
    expect(mapDomainError("ERROR: ALREADY_ENROLLED (SQLSTATE P0001)")).toEqual({
      status: 409,
      message: "أنت مسجل في هذه الدورة بالفعل. تجدها في «دوراتي».",
    });
  });

  it("matches the error code even when it's embedded in a longer Postgres message", () => {
    expect(mapDomainError("new row violates check: SLOT_UNAVAILABLE at line 4")).toEqual({
      status: 409,
      message: "هذا الموعد لم يعد متاحاً. اختر موعداً آخر.",
    });
  });

  it("returns null for an unrecognised error message", () => {
    expect(mapDomainError("ERROR: some_unrelated_postgres_error")).toBeNull();
  });

  it("returns null for an undefined message rather than throwing", () => {
    expect(mapDomainError(undefined)).toBeNull();
  });
});
