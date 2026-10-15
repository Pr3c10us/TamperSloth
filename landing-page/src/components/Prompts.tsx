import { ArrowIcon, SlothMark } from "./brand";
import { INSTALL_URL } from "../lib/site";
import "../styles/prompts.css";

type Pill = string | null; // null renders the sloth mark
const ROWS: { items: Pill[]; dir: 1 | -1; speed: number }[] = [
  { items: ["Hide Shorts on YouTube", "Summarize this thread", null, "Fill this form for me", "Dark mode, everywhere"], dir: -1, speed: 46 },
  { items: ["Where’s the billing page?", null, "Compare these three tabs", "Export this table to CSV", "Translate this page"], dir: 1, speed: 54 },
  { items: ["Unsubscribe me from these", "Mute spoilers", "Find the cheapest seat", null, "Tidy up this article"], dir: -1, speed: 50 },
  { items: ["Show me how to share this", null, "Copy the prices as a table", "Make the text bigger here", "Close every tab but this"], dir: 1, speed: 58 },
];
const TONES = ["sage", "moss", "paper", "line", "deep"];

export function Prompts() {
  return (
    <section className="prompts container" aria-label="Things people ask Sloth">
      <div className="prompts-card" data-reveal>
        <div className="prompts-rows" aria-hidden>
          {ROWS.map((row, r) => (
            <div key={r} className="prompts-row" style={{ ["--dur" as string]: `${row.speed}s`, ["--dir" as string]: row.dir === 1 ? "reverse" : "normal" }}>
              {/* Two copies so the loop is seamless. */}
              {[0, 1].map((copy) => (
                <div key={copy} className="prompts-track">
                  {row.items.map((p, i) =>
                    p === null ? (
                      <span key={i} className={`pp pp-mark tone-${(r + i) % 2 ? "sage" : "moss"}`}>
                        <SlothMark />
                      </span>
                    ) : (
                      <span key={i} className={`pp tone-${TONES[(r * 2 + i) % TONES.length]}`}>
                        {p}
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <ul className="sr-only">
          {ROWS.flatMap((r) => r.items.filter(Boolean)).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="prompts-foot">
          <div>
            <div className="eyebrow tick">Things people ask</div>
            <p className="prompts-say">
              If you can say it, <span className="accent">Sloth can probably do it.</span>
            </p>
            <p className="prompts-sub">Any site, any tab, in plain words. Type it, or just say it out loud.</p>
          </div>
          <a className="btn btn-primary" href={INSTALL_URL} target="_blank" rel="noreferrer">
            Add to Chrome
            <span className="btn-icon">
              <ArrowIcon />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
