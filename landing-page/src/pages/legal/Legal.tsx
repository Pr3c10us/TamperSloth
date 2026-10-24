import { useEffect } from "react";
import { Nav } from "../../components/Nav";
import { FooterBar } from "../../components/FooterBar";
import { observeReveals } from "../../lib/reveal";
import { DOCS, type LegalSlug } from "./documents";
import "../../styles/legal.css";

const TITLES: Record<LegalSlug, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Notice",
  refunds: "Refund Policy",
};

export function Legal({ slug }: { slug: LegalSlug }) {
  const doc = DOCS[slug];

  useEffect(() => observeReveals(), []);
  useEffect(() => {
    document.title = `${TITLES[slug]} | Tampersloth`;
  }, [slug]);

  return (
    <>
      <Nav page="legal" />
      <main className="legal container">
        <div className="section-head legal-head">
          <div className="eyebrow tick" data-reveal>
            Last updated {doc.updated}
          </div>
          <h1 data-reveal style={{ ["--d" as string]: "80ms" }}>
            {doc.title} <span className="accent">{doc.accent}</span>
          </h1>
          <p className="lead" data-reveal style={{ ["--d" as string]: "160ms" }}>
            {doc.lead}
          </p>
        </div>

        <div className="legal-body" data-reveal style={{ ["--d" as string]: "220ms" }}>
          <nav className="legal-toc" aria-label="On this page">
            <ol>
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="legal-doc">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2>{s.heading}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </main>
      <FooterBar page="legal" />
      <div className="grain" aria-hidden />
    </>
  );
}
