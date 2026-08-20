import { Buffer } from "node:buffer";
import { config } from "./config.js";

/**
 * Moyasar payment gateway (https://moyasar.com).
 *
 * The platform uses **hosted invoices**: the server creates an invoice with a
 * server-derived amount and hands the browser a Moyasar-hosted payment URL. Card
 * data never touches this application, which satisfies PRD §14.1 ("لا تخزين
 * بيانات البطاقة") without any PCI burden on us.
 *
 * Both keys live only in environment variables. The secret key is used here,
 * server-side, and is never exposed to the client.
 *
 * Amounts are expressed in the smallest currency unit (halalas for SAR).
 */

const MOYASAR_API = "https://api.moyasar.com/v1";

export type MoyasarInvoice = {
  id: string;
  status: string;
  url: string;
  amount: number;
  currency: string;
  /** Populated when fetching a single invoice, not when listing. */
  payments?: MoyasarPayment[];
};

export type MoyasarPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  invoice_id?: string | null;
  source?: { message?: string | null } | null;
  refunded?: number;
};

export function isMoyasarConfigured(): boolean {
  return Boolean(config.MOYASAR_SECRET_KEY);
}

/** True when the configured secret key is a test-mode key. */
export function isMoyasarTestMode(): boolean {
  return (config.MOYASAR_SECRET_KEY ?? "").startsWith("sk_test_");
}

export function toHalalas(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export function fromHalalas(amount: number): number {
  return Number(amount) / 100;
}

function authHeader(): string {
  // Moyasar uses HTTP Basic with the secret key as the username and no password.
  //
  // Imported rather than taken from the global scope: `Buffer` is a global in
  // Node but not in Deno, so on the Supabase Edge Function this threw and every
  // checkout came back as "خطأ غير متوقع" — the booking was made and the patient
  // could not pay for it. `node:buffer` resolves on both.
  const encoded = Buffer.from(`${config.MOYASAR_SECRET_KEY}:`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Carries the gateway's HTTP status so callers can distinguish "you asked for
 * something that does not exist" from "the gateway is having a bad day". Without
 * it an unknown payment id surfaced to the browser as a 500.
 */
export class MoyasarError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "MoyasarError";
  }
}

// Vercel gives the whole request 30s (vercel.json). Without a bound on this
// one call, a slow or hanging Moyasar response ate the entire budget: the user
// stared at a spinner for 30 seconds before seeing a generic timeout, with no
// way to tell "the gateway is slow" from "our server is broken". 12s leaves
// headroom for the rest of verifyPayment/createPaymentCheckout to still run
// and return a real error instead of the platform's own 504.
const MOYASAR_TIMEOUT_MS = 12_000;

async function moyasarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isMoyasarConfigured()) throw new Error("moyasar_not_configured");
  let response: Response;
  try {
    response = await fetch(`${MOYASAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(MOYASAR_TIMEOUT_MS),
    });
  } catch (error) {
    // AbortSignal.timeout raises a DOMException named "TimeoutError". Mapped
    // onto MoyasarError's existing shape so every caller's status-based
    // handling (see runtime-api.ts) keeps working without a special case —
    // a gateway that doesn't answer is treated the same as one that answers
    // with a 5xx.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new MoyasarError(
      timedOut ? 504 : 502,
      timedOut ? "moyasar_timeout" : `moyasar_network_error:${String(error).slice(0, 200)}`,
    );
  }
  const text = await response.text();
  if (!response.ok) {
    // Never echo the request body back — it can carry payment details.
    throw new MoyasarError(response.status, `moyasar_${response.status}:${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export type CreateInvoiceInput = {
  amount: number;
  description: string;
  callbackUrl: string;
  /** Where Moyasar sends the payer once the payment succeeds. */
  successUrl?: string;
  /** The "back" link on Moyasar's own page. */
  backUrl?: string;
  orderNumber: string;
  metadata?: Record<string, string>;
};

/**
 * Force the hosted checkout into Arabic.
 *
 * Moyasar hands back an invoice URL carrying `lang=en`, which drops an Arabic
 * RTL audience onto an English payment page at the last and most trust-sensitive
 * step of the journey.
 */
// Exported (only) so the query-param rewrite, and its fallback for a URL that
// fails to parse, can be unit-tested without minting a real Moyasar invoice.
export function arabicCheckoutUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("lang", "ar");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Create a hosted invoice and return its payment URL. */
export async function createInvoice(input: CreateInvoiceInput): Promise<MoyasarInvoice> {
  const invoice = await moyasarRequest<MoyasarInvoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      amount: toHalalas(input.amount),
      currency: "SAR",
      description: input.description,
      callback_url: input.callbackUrl,
      // Without success_url the payer lands on Moyasar's receipt page and stops
      // there: no button back, nothing that tells our platform to confirm. It is
      // the field that actually moves them on; callback_url alone does not.
      success_url: input.successUrl ?? input.callbackUrl,
      back_url: input.backUrl ?? null,
      metadata: { order_number: input.orderNumber, ...(input.metadata ?? {}) },
    }),
  });
  return invoice.url ? { ...invoice, url: arabicCheckoutUrl(invoice.url) } : invoice;
}

export async function fetchInvoice(invoiceId: string): Promise<MoyasarInvoice> {
  return moyasarRequest<MoyasarInvoice>(`/invoices/${encodeURIComponent(invoiceId)}`);
}

/**
 * Authoritative payment lookup. Callback query parameters are attacker-controlled,
 * so a payment is only ever treated as paid after this server-side read.
 */
export async function fetchPayment(paymentId: string): Promise<MoyasarPayment> {
  return moyasarRequest<MoyasarPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function refundPayment(paymentId: string, amount?: number): Promise<MoyasarPayment> {
  return moyasarRequest<MoyasarPayment>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify(amount === undefined ? {} : { amount: toHalalas(amount) }),
  });
}

/** Map a Moyasar payment status onto the platform's `payment_status` enum. */
export function mapPaymentStatus(status: string): string {
  switch (status) {
    case "paid":
      return "succeeded";
    case "authorized":
    case "initiated":
      return "processing";
    case "failed":
      return "failed";
    case "voided":
      return "cancelled";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}
