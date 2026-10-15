import { useRef } from "react";

/**
 * The pill the extension pins to the bottom of a page: "Stop Sloth" while the
 * agent drives it, "Drawing guide · Esc" while a guide is being drawn.
 */
export function LockPill({ mode }: { mode: "agent" | "guide" | null }) {
  // Keep the last label while the pill fades out.
  const last = useRef<"agent" | "guide">("agent");
  if (mode) last.current = mode;
  const shown = mode ?? last.current;
  return (
    <div className={`lock-pill ${mode ? "is-on" : ""}`} aria-hidden>
      {shown === "agent" && (
        <span className="lock-icon">
          <svg viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" />
          </svg>
        </span>
      )}
      <span>{shown === "guide" ? "Drawing guide" : "Stop Sloth"}</span>
      {shown === "guide" && <span className="lock-hint">Esc</span>}
    </div>
  );
}
