import { Canopy } from "./Canopy";
import { FooterBar } from "./FooterBar";
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

      <FooterBar />
    </footer>
  );
}
