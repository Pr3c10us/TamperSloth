import { API_URL } from "./site";

export type PlanId = "free" | "go" | "pro";
export type PaidPlanId = "go" | "pro";

/** What the server knows about the signed-in account's plan. */
export type Billing = {
  email: string;
  /** The plan the user has now. */
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "paused" | "canceled" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** A downgrade waiting for the renewal: the plan the user moves to at currentPeriodEnd. */
  scheduledPlan: PlanId | null;
};

/** A plan as the server enforces it; the cards are drawn from these. */
export type PlanSummary = {
  id: PlanId;
  name: string;
  priceUsd: number;
  credits: number;
  models: string[];
  requestsPerMinute: number;
  /** Most tokens one agent run may use; 0 means no limit. */
  runTokenBudget: number;
};

export type PlanChangePreview = {
  plan: PaidPlanId;
  /** upgrade: full price now, fresh period. downgrade: from the renewal. keep: undoes a pending downgrade. */
  kind: "upgrade" | "downgrade" | "keep";
  /** Minor units (cents), tax and account credit included; null when nothing is charged. */
  chargeToday: { amountMinor: number; currency: string } | null;
  effectiveAt: string;
  credits: { plan: number; carriedOver: number } | null;
  confirmToken: string;
};

export class BillingError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  /** The billing token ran out or was never valid. */
  get expired() {
    return this.status === 401 || this.status === 403;
  }
}

const TOKEN_KEY = "ts_billing_token";

/** The token the extension handed this tab, kept so a reload stays signed in. */
export function storedBillingToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

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

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      ...rest,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), "Content-Type": "application/json" },
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

const post = (token: string, body?: unknown) =>
  ({ method: "POST", token, ...(body !== undefined && { body: JSON.stringify(body) }) }) as const;

export const getPlans = () => call<PlanSummary[]>("/plans");

export const getBilling = (token: string) => call<Billing>("/billing", { token });

export const createCheckout = (token: string, plan: PaidPlanId) =>
  call<{ transactionId: string }>("/billing/checkout", post(token, { plan }));

export const previewPlanChange = (token: string, plan: PaidPlanId) =>
  call<PlanChangePreview>("/billing/change-plan/preview", post(token, { plan }));

export const changePlan = (token: string, plan: PaidPlanId, confirmToken: string) =>
  call<{ ok: true }>("/billing/change-plan", post(token, { plan, confirmToken }));

export const resumePlan = (token: string) => call<{ ok: true }>("/billing/resume", post(token));

export const openPortal = (token: string) => call<{ url: string }>("/billing/portal", post(token));
