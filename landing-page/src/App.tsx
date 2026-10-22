import { useEffect } from "react";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Stage } from "./components/stage/Stage";
import { Providers } from "./components/Providers";
import { TryIt } from "./components/TryIt";
import { Prompts } from "./components/Prompts";
import { Toolbox } from "./components/Toolbox";
import { Setup } from "./components/Setup";
import { Faq, Privacy } from "./components/Trust";
import { Finale } from "./components/Finale";
import { ASCII_SLOTH } from "./components/AsciiSloth";
import { scrollToHashOnLoad, startSmoothScroll } from "./lib/motion";
import { observeReveals } from "./lib/reveal";
import "./styles/brand.css";

export function App() {
  useEffect(() => startSmoothScroll(), []);
  useEffect(() => scrollToHashOnLoad(), []);

  // A hello for anyone who opens DevTools; userscript people tend to.
  useEffect(() => {
    console.log(`%c${ASCII_SLOTH}\n\n  Peeking under the hood? Sloth approves.`, "color:#a8bd85;font-family:monospace;line-height:1.1");
  }, []);

  useEffect(() => observeReveals(), []);

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stage />
        <Providers />
        <TryIt />
        <Prompts />
        <Toolbox />
        <Setup />
        <Privacy />
        <Faq />
      </main>
      <Finale />
      <div className="grain" aria-hidden />
    </>
  );
}
