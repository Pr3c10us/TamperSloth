import { API_URL } from "./site";

export type PlanId = "free" | "go" | "pro";

/** What the server knows about the signed-in account's plan. */
export type Billing = {
  email: string;
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "paused" | "canceled" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export class BillingError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  /** The billing token ran out or was never valid; the extension has to open the page again. */
  get expired() {
    return this.status === 401 || this.status === 403;
  }
}

const TOKEN_KEY = "ts_billing_token";

/**
 * The extension opens /pricing#t=<billing token>. The token moves to session
 * storage and leaves the address bar, so it isn't bookmarked or shared.
 */
export function takeBillingToken(): string | null {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("t");
  if (fromHash) {
    history.replaceState(null, "", location.pathname + location.search);
    try {
      sessionStorage.setItem(TOKEN_KEY, fromHash);
    } catch {
      /* Storage blocked: the token still works until the tab closes. */
    }
    return fromHash;
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Keeps a token the extension handed over directly, as takeBillingToken does for one in the URL. */
export function rememberBillingToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* Storage blocked: the token still works until the tab closes. */
  }
}

export function forgetBillingToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Nothing stored. */
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/billing${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new BillingError("Couldn't reach TamperSloth. Check your connection and try again.", 0);
  }
  const body = (await response.json().catch(() => null)) as { data?: T; message?: string; code?: string } | null;
  if (!response.ok) {
    throw new BillingError(body?.message ?? `Something went wrong (${response.status}). Try again.`, response.status, body?.code);
  }
  return body?.data as T;
}

export const getBilling = (token: string) => call<Billing>(token, "");

export const createCheckout = (token: string, plan: "go" | "pro") =>
  call<{ transactionId: string }>(token, "/checkout", { method: "POST", body: JSON.stringify({ plan }) });

export const changePlan = (token: string, plan: "go" | "pro") =>
  call<{ ok: true }>(token, "/change-plan", { method: "POST", body: JSON.stringify({ plan }) });

export const openPortal = (token: string) => call<{ url: string }>(token, "/portal", { method: "POST" });
