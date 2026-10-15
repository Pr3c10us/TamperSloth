import { Canopy } from "./Canopy";
import { ArrowIcon, SlothMark } from "./brand";
import { INSTALL_URL, isMac } from "../lib/site";
import "../styles/finale.css";

export function Finale() {
  return (
    <footer className="finale">
      <Canopy className="finale-canopy" />
      <div className="finale-cta container">
        <h2 data-reveal>
          A little sloth.
          <br />
          <span className="accent">A lot less work.</span>
        </h2>
        <div className="finale-actions" data-reveal style={{ ["--d" as string]: "120ms" }}>
          <a className="btn btn-primary" href={INSTALL_URL} target="_blank" rel="noreferrer">
            Add to Chrome
            <span className="btn-icon">
              <ArrowIcon />
            </span>
          </a>
          <span className="finale-kbd">
            then press <kbd>{isMac ? "⌘" : "Ctrl"}</kbd> <kbd>⇧</kbd> <kbd>S</kbd>
          </span>
        </div>
      </div>

      <div className="wordmark" aria-hidden>
        <SlothMark className="wordmark-mark" />
        <span>Tampersloth</span>
      </div>

      <div className="finale-bar">
        <div className="finale-bar-inner container">
          <span>© {new Date().getFullYear()} Tampersloth</span>
          <span className="finale-motto">Made for the way you browse.</span>
          <nav aria-label="Footer">
            <a href="#stage">How it helps</a>
            <a href="#toolbox">Toolbox</a>
            <a href="#faq">FAQ</a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
