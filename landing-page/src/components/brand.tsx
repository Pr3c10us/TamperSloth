import { forwardRef, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** The sloth mark from the extension icon (public/icon.svg), drawn in currentColor. */
export function SlothMark({ className, style, title }: { className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} style={style} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path
        fill="currentColor"
        d="M102.272 36.2747C157.226 32.7677 230.938 63.0061 251.172 117.512C253.808 124.611 260.615 155.502 251.095 158.158C246.838 153.721 243.337 145.55 239.567 140.393C225.04 120.517 199.794 102.442 174.097 104.314C159.945 105.344 156.315 118.38 158.213 130.365C160.548 145.113 173.585 156.882 185.905 164.002C194.586 168.596 226.279 185.531 215.63 198.69C206.036 210.546 174.28 217.175 160.301 218.373C159.988 218.422 159.674 218.469 159.36 218.512C122.275 223.583 39.0175 204.756 21.2527 158.264C16.1024 144.784 63.28 138.886 74.6267 134.929C91.0784 129.192 116.212 108.702 94.6173 90.098C72.6134 76.6751 41.9661 82.7133 21.0183 95.5357C16.2301 98.4664 3.93877 109.111 0.532216 106.551C-2.44754 97.2421 7.78305 80.5443 13.8882 73.348C37.0565 46.038 68.1352 39.2934 102.272 36.2747ZM151.319 179.382C153.557 177.421 154.054 177.118 154.664 174.165L154.102 172.56C151.568 171.609 138.677 175.957 133.895 176.526C128.375 177.137 122.797 176.961 117.328 176.003C97.9826 172.559 93.0729 160.644 85.6874 158.587C84.3914 160.976 83.2505 162.027 84.1835 164.868C86.5729 172.143 95.3837 177.077 101.873 180.277C116.497 187.49 137.495 188.911 151.319 179.382ZM132.413 156.689C136.731 154.643 139.929 153.589 141.801 149.197C142.518 139.285 124.917 136.183 117.476 136.556C113.565 137.494 105.067 140.015 107.811 146.096C112.551 156.601 121.925 158.769 132.413 156.689Z"
      />
      <path fill="currentColor" d="M66.4562 102.124C76.6377 101.351 85.2872 114.542 66.8027 121.012C66.1212 120.758 65.4437 120.495 64.7692 120.222C61.3401 118.82 56.8892 116.32 55.5566 112.62C55.0262 111.175 55.1088 109.577 55.7864 108.195C57.7116 104.326 62.6252 103.231 66.4562 102.124Z" />
      <path fill="currentColor" d="M184.468 125.412C196.596 124.992 207.26 136.94 193.138 143.966C189.074 145.26 184.501 143.672 181.769 140.476C179.939 138.333 179.052 135.541 179.308 132.734C179.662 129.088 181.796 127.559 184.468 125.412Z" />
    </svg>
  );
}

/** The guide cursor path from the extension (Group.svg): black fill, sage border. */
const CURSOR_PATH =
  "M3.22324 1.01515C3.80072 0.979711 4.18353 1.07776 4.52329 1.2562C4.88774 1.4476 5.21147 1.73276 5.6883 2.12712L6.90573 3.13322L11.5141 6.93707L17.0594 11.5159L18.8174 12.9671C19.5124 13.5406 20.0412 13.8704 20.287 14.5648C20.4723 15.1169 20.433 15.6836 20.1892 16.1734C19.9303 16.6924 19.4678 17.0808 18.9119 17.2456C18.7255 17.3009 18.4641 17.3253 18.1613 17.3323C17.8558 17.3394 17.5673 17.329 17.2892 17.3289L14.7591 17.3283L14.5467 17.3272C13.4844 17.3179 12.408 17.2564 11.2857 17.6349C10.6288 17.8695 10.0298 18.2262 9.51555 18.6876C8.9568 19.194 8.37077 20.0415 7.94962 20.5985L5.76281 23.4916C5.35625 24.0246 4.90711 24.35 4.28151 24.4303C3.73006 24.5013 3.17316 24.35 2.73357 24.0098L2.69149 23.9766C2.27026 23.6351 2.00034 23.1405 1.94195 22.5999C1.90319 22.2681 1.90303 21.9092 1.88301 21.5315L1.76046 19.0148L1.38344 11.285L1.12843 6.05718L1.05601 4.58044L1.03608 4.24415C1.01541 3.88822 0.996222 3.48586 1.01639 3.23811C1.0562 2.7496 1.24236 2.28437 1.55054 1.90324C1.96645 1.38122 2.54412 1.09363 3.22324 1.01515Z";

export function CursorGlyph({ variant = "sloth" }: { variant?: "sloth" | "user" }) {
  const sloth = variant === "sloth";
  return (
    <svg viewBox="0 0 22 26" width="22" height="26" className="cursor-glyph" aria-hidden>
      <path d={CURSOR_PATH} fill={sloth ? "#0d0e0c" : "#ffffff"} stroke={sloth ? "#A8BD85" : "#0d0e0c"} strokeWidth="2.016" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The guide cursor plus its bubble. Positioned by transform from lib/pen; the
 * hotspot (rounded tip) sits at the element's origin.
 */
export const GuideCursor = forwardRef<HTMLDivElement, { label?: ReactNode; tag?: ReactNode; variant?: "sloth" | "user"; className?: string }>(
  function GuideCursor({ label, tag, variant = "sloth", className = "" }, ref) {
    return (
      <div ref={ref} className={`guide-cursor ${variant} ${className}`} aria-hidden>
        <div className="guide-cursor-glyph">
          <CursorGlyph variant={variant} />
        </div>
        {tag ? <div className="cursor-tag">{tag}</div> : null}
        {label ? <div className="cursor-bubble">{label}</div> : null}
      </div>
    );
  },
);

/** Text that reveals one character at a time with a blinking caret, as on-page tips do. */
export function TypedTip({ text, start = true, speed = 45 }: { text: string; start?: boolean; speed?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!start) {
      el.textContent = "";
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = text;
      return;
    }
    let i = 0;
    el.textContent = "";
    const id = window.setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, start, speed]);
  return (
    <span className="typed">
      <span ref={ref} />
      <span className="caret" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Living dots: the extension's working indicator, simplified to a looping orbit. */
export function LivingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`living-dots ${className}`} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function ChromeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 8.4h8.4M8.9 13.8 4.6 6.4M15.1 13.8l-4.2 7.4" strokeLinecap="round" />
    </svg>
  );
}

/** Lucide-style 1.5px icons used inside the product mocks. */
export const Icon = {
  panel: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  ),
  pen: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  ),
  gallery: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M5 5h14M7 2h10" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  picker: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h2M14 3h1M3 9v1M21 9v2M3 14v1" />
      <path d="m12 12 4 10 1.7-5.3L23 15Z" />
    </svg>
  ),
  pencil: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2 2 22l5.8-1.8Z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  mic: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  ),
  enter: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      <path d="m9 10-5 5 5 5" />
    </svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  dots: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  ),
  layers: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="m12 2 10 5-10 5L2 7Z" />
      <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
    </svg>
  ),
  lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  reload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
  arrowL: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  arrowR: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  puzzle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <path d="M15.4 4.6a2.4 2.4 0 1 0-4.6 1H7a1 1 0 0 0-1 1v3.8a2.4 2.4 0 1 1 0 4.6V19a1 1 0 0 0 1 1h3.8a2.4 2.4 0 1 1 4.6 0H19a1 1 0 0 0 1-1v-3.8a2.4 2.4 0 1 0 0-4.6V7a1 1 0 0 0-1-1h-3.8c.1-.4.2-.9.2-1.4Z" />
    </svg>
  ),
  script: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  ),
  route: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  ),
};
