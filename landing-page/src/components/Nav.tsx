import { useEffect, useState } from "react";
import { ArrowIcon, SlothMark } from "./brand";
import { INSTALL_URL } from "../lib/site";
import "../styles/nav.css";

const LINKS = [
  { id: "stage", label: "How it helps" },
  { id: "try", label: "Try it" },
  { id: "toolbox", label: "Toolbox" },
  { id: "setup", label: "Setup" },
  { id: "faq", label: "FAQ" },
];

export function Nav() {
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const [onLight, setOnLight] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      // Over the paper section the logo switches to ink and the dark fade steps aside.
      const paper = document.querySelector(".on-paper");
      if (paper) {
        const r = paper.getBoundingClientRect();
        setOnLight(r.top < 64 && r.bottom > 64);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // The nav follows whichever section is crossing the middle of the viewport.
    const els = LINKS.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <header className={`nav ${scrolled ? "is-scrolled" : ""} ${onLight ? "is-light" : ""}`}>
      <a href="#top" className="nav-logo" aria-label="Tampersloth home">
        <SlothMark className="nav-mark" />
        <span className="nav-word">Tampersloth</span>
      </a>

      <nav className="nav-hang" aria-label="Sections">
        {LINKS.map((l) => (
          <a key={l.id} href={`#${l.id}`} className={active === l.id ? "is-active" : ""}>
            {l.label}
          </a>
        ))}
      </nav>

      <a className="nav-cta" href={INSTALL_URL} target="_blank" rel="noreferrer">
        <span>Add to Chrome</span>
        <span className="nav-cta-icon">
          <ArrowIcon />
        </span>
      </a>
    </header>
  );
}
