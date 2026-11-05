/** Vite dev server, or an unpacked extension (store installs carry update_url). */
export const IS_DEV = import.meta.env.DEV
    || (typeof chrome !== "undefined" && !!chrome.runtime?.getManifest && !("update_url" in chrome.runtime.getManifest()));
