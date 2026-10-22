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

// One page app with one extra route; Cloudflare serves index.html for /pricing too.
const Pricing = lazy(() => import("./pages/Pricing").then((m) => ({ default: m.Pricing })));
const onPricing = /^\/pricing\/?$/.test(location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {onPricing ? (
      <Suspense fallback={null}>
        <Pricing />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
