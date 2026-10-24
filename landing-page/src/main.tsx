import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import { App } from "./App";
import type { LegalSlug } from "./pages/legal/documents";

// One page app with a few extra routes; Cloudflare serves index.html for each of them too.
const Pricing = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const Legal = lazy(() => import("./pages/legal/Legal").then((m) => ({ default: m.Legal })));
const onPricing = /^\/pricing\/?$/.test(location.pathname);
const legal = location.pathname.match(/^\/(terms|privacy|refunds)\/?$/)?.[1] as LegalSlug | undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {onPricing ? (
      <Suspense fallback={null}>
        <Pricing />
      </Suspense>
    ) : legal ? (
      <Suspense fallback={null}>
        <Legal slug={legal} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
