/** Where "Add to Chrome" goes. Swap in the Web Store listing once it is live. */
export const INSTALL_URL = "https://chromewebstore.google.com/";

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
