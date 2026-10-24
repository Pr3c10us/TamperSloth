/** Where "Add to Chrome" goes: the Chrome Web Store listing. */
export const INSTALL_URL = "https://chromewebstore.google.com/detail/tampersloth/nicjipdfkdolbpoonnndifkcdblfpmpj";

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The TamperSloth API; .env.local points it at a local server. */
export const API_URL = (import.meta.env.VITE_TAMPERSLOTH_API_URL || "https://api.tampersloth.com").replace(/\/+$/, "");

/** Paddle.js client-side token (test_… in sandbox, live_… in production); public by design. */
export const PADDLE_CLIENT_TOKEN: string = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || "";
export const PADDLE_ENV: "sandbox" | "production" = import.meta.env.VITE_PADDLE_ENV === "sandbox" ? "sandbox" : "production";

/** Where people write for support, refunds and privacy requests. */
export const SUPPORT_EMAIL = "support@tampersloth.com";

/** The policy pages Paddle needs every page to link to; each is its own route. */
export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
];
