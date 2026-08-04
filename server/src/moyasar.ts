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
  const encoded = Buffer.from(`${config.MOYASAR_SECRET_KEY}:`).toString("base64");
  return `Basic ${encoded}`;
}

async function moyasarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isMoyasarConfigured()) throw new Error("moyasar_not_configured");
  const response = await fetch(`${MOYASAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    // Never echo the request body back — it can carry payment details.
    throw new Error(`moyasar_${response.status}:${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export type CreateInvoiceInput = {
  amount: number;
  description: string;
  callbackUrl: string;
  orderNumber: string;
  metadata?: Record<string, string>;
};

/** Create a hosted invoice and return its payment URL. */
export async function createInvoice(input: CreateInvoiceInput): Promise<MoyasarInvoice> {
  return moyasarRequest<MoyasarInvoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      amount: toHalalas(input.amount),
      currency: "SAR",
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: { order_number: input.orderNumber, ...(input.metadata ?? {}) },
    }),
  });
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
