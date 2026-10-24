import { LEGAL_LINKS } from "../lib/site";
import "../styles/footer.css";

const SECTIONS = [
  { id: "stage", label: "How it helps" },
  { id: "toolbox", label: "Toolbox" },
  { id: "faq", label: "FAQ" },
];

/** The bottom bar on every page; away from home the section links lead back there. */
export function FooterBar({ page = "home" }: { page?: "home" | "pricing" | "legal" }) {
  const home = page === "home" ? "" : "/";
  return (
    <div className="finale-bar">
      <div className="finale-bar-inner container">
        <span>© {new Date().getFullYear()} Tampersloth</span>
        <span className="finale-motto">Made for the way you browse.</span>
        <nav aria-label="Footer">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`${home}#${s.id}`}>
              {s.label}
            </a>
          ))}
          <a href="/pricing">Pricing</a>
          <a href="#top">Back to top ↑</a>
        </nav>
        <nav className="finale-legal" aria-label="Legal">
          {LEGAL_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <span>Payments by Paddle</span>
        </nav>
      </div>
    </div>
  );
}
