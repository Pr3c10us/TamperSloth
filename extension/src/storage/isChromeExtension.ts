/** False when a page runs outside the extension, such as under the Vite dev server. */
export const isChromeExtension = typeof chrome !== "undefined" && !!chrome?.storage?.local;
