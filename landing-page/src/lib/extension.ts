/** Matches BillingTokenReply in extension/src/background/pricingBridge.ts. */
export type BillingTokenReply =
  | { ok: true; token: string }
  | { ok: false; reason: "signed-out"; panelOpened: boolean }
  | { ok: false; reason: "unavailable" };

type RelayMessage = { source?: string; type?: string; id?: string; reply?: BillingTokenReply };

// The extension injects its relay once the page has loaded; a click right after load may beat it.
const RELAY_WAIT_MS = 1500;
// Long enough to wake the extension's service worker and fetch a token.
const REPLY_WAIT_MS = 8000;

const relayReady = () => document.documentElement.dataset.tampersloth === "ready";

function fromRelay(event: MessageEvent): RelayMessage | null {
  if (event.source !== window || event.origin !== location.origin) return null;
  const data = event.data as RelayMessage | null;
  return data?.source === "tampersloth-extension" ? data : null;
}

/** Whether a TamperSloth build is installed: its relay marks the page, or says so shortly. */
function waitForRelay(): Promise<boolean> {
  if (relayReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (found: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(found);
    };
    const onMessage = (event: MessageEvent) => {
      if (fromRelay(event)?.type === "ready") done(true);
    };
    const timer = setTimeout(() => done(relayReady()), RELAY_WAIT_MS);
    window.addEventListener("message", onMessage);
  });
}

/**
 * Asks the installed extension for a billing token for its signed-in account,
 * through the relay it injects into this site, so any build answers: store,
 * unpacked or test. null means no TamperSloth is installed.
 */
export async function askExtensionForBillingToken(): Promise<BillingTokenReply | null> {
  if (!(await waitForRelay())) return null;
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const done = (reply: BillingTokenReply) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(reply);
    };
    const onMessage = (event: MessageEvent) => {
      const data = fromRelay(event);
      if (data?.type === "billing-token" && data.id === id && data.reply) done(data.reply);
    };
    const timer = setTimeout(() => done({ ok: false, reason: "unavailable" }), REPLY_WAIT_MS);
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "tampersloth-page", type: "billing-token", id }, location.origin);
  });
}
