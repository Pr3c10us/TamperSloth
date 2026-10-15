import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import {
  Brain,
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  CornerDownLeft,
  FileText,
  GalleryVerticalEnd,
  Keyboard,
  Lightbulb,
  LoaderCircle,
  Mic,
  MousePointerClick,
  MousePointerSquareDashed,
  PanelLeft,
  PencilLine,
  Pin,
  Plus,
  RefreshCw,
  Route,
  Save,
  ScanSearch,
  SquarePen,
  TreePine,
  X,
  type LucideIcon,
} from "lucide-react";
import { createSwarm, MAX_DOTS } from "./livingDots";
import { SlothMark } from "../brand";
import "../../styles/panel.css";

/*
 * A port of the extension's side panel (src/chat): page header, message list,
 * step sequences on a rail, and the composer. Markup and sizes follow the
 * extension's components; content is driven by the demo scripts.
 */

// From src/chat/lib/toolMeta.ts
const TOOL_ICONS: Record<string, LucideIcon> = {
  getPageStructure: TreePine,
  getElementDetails: ScanSearch,
  getPageText: FileText,
  takeScreenshot: Camera,
  clickElement: MousePointerClick,
  typeText: Keyboard,
  annotatePage: MousePointerClick,
  waitForUserAction: Route,
  saveScript: Save,
  reloadPage: RefreshCw,
};

// From src/chat/lib/stepSummary.ts
const VERBS: Record<string, string> = {
  getPageStructure: "inspected the page",
  getElementDetails: "inspected an element",
  getPageText: "read the page",
  takeScreenshot: "took a screenshot",
  clickElement: "clicked",
  typeText: "typed",
  annotatePage: "drew guidance",
  waitForUserAction: "guided a step",
  saveScript: "saved a change",
  reloadPage: "reloaded the page",
};

export type DemoStep =
  | { kind: "thinking"; state: "active" | "done"; startedAt?: number; ms?: number }
  | { kind: "tool"; tool: string; reason: string; state: "active" | "done"; startedAt?: number; tokens?: [number, number] };

export type DemoGroup = { kind: "steps"; steps: DemoStep[]; live: boolean; since?: number } | { kind: "text"; body: ReactNode };

export type DemoMsg = { role: "user"; text: string } | { role: "assistant"; groups: DemoGroup[]; startedAt?: number };

// From src/chat/lib/efficiency.ts and toolPreview.ts
export function formatElapsedTime(ms: number): string {
  if (ms > 0 && ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function formatStepDuration(ms: number): string {
  if (ms < 100) return "<0.1s";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function summarize(steps: DemoStep[]) {
  const parts: string[] = [];
  const thinking = steps.filter((s) => s.kind === "thinking");
  const tools = steps.filter((s): s is Extract<DemoStep, { kind: "tool" }> => s.kind === "tool");
  if (thinking.length) {
    const total = thinking.reduce((sum, s) => sum + (s.ms ?? 0), 0);
    parts.push(total >= 1000 ? `thought for ${formatElapsedTime(total)}` : "thought");
  }
  parts.push(...[...new Set(tools.map((t) => VERBS[t.tool] ?? `used ${t.tool}`))].slice(0, 2));
  if (tools.length > 1) parts.push(`used ${tools.length} tools`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function useNow(active: boolean, interval = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [active, interval]);
  return now;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The extension's living dots: the same motion model, written straight to the DOM. */
export function LivingDots({ className = "" }: { className?: string }) {
  const W = 26;
  const H = 14;
  const DOT = 4;
  const slots = useRef<(HTMLSpanElement | null)[]>([]);
  const calm = reduced();
  useEffect(() => {
    if (calm) return;
    const swarm = createSwarm();
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      swarm.step(now - last).forEach((v) => {
        const el = slots.current[v.id];
        if (!el) return;
        const x = W / 2 - DOT / 2 + v.x * (W / 2 - DOT / 2) * 0.75;
        const y = H / 2 - DOT / 2 + v.y * (H / 2 - DOT / 2) * 0.85;
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${v.scale.toFixed(3)})`;
        el.style.opacity = v.opacity.toFixed(3);
        el.style.filter = v.blur > 0.05 ? `blur(${v.blur.toFixed(2)}px)` : "";
        el.style.zIndex = String(Math.round(v.scale * 100));
      });
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calm]);
  if (calm) {
    return (
      <span aria-hidden className={`ld-calm ${className}`}>
        <i />
        <i />
        <i />
      </span>
    );
  }
  return (
    <span aria-hidden className={`ld ${className}`} style={{ width: W, height: H }}>
      {Array.from({ length: MAX_DOTS }, (_, i) => (
        <span key={i} ref={(el) => void (slots.current[i] = el)} style={{ width: DOT, height: DOT }} />
      ))}
    </span>
  );
}

function StepNode({ icon: I, state }: { icon: LucideIcon; state: "active" | "done" }) {
  return (
    <span aria-hidden className={`sp-node is-${state}`}>
      <I size={11} strokeWidth={2} />
    </span>
  );
}

function StepRow({ icon, state, title, meta, expandable }: { icon: LucideIcon; state: "active" | "done"; title: ReactNode; meta?: ReactNode; expandable?: boolean }) {
  return (
    <div className="sp-step">
      <div className={`sp-step-head ${expandable ? "is-btn" : ""}`}>
        <StepNode icon={icon} state={state} />
        <span className={`sp-step-title ${state === "active" ? "ts-shimmer" : "is-done"}`}>{title}</span>
        {meta && <span className="sp-step-meta">{meta}</span>}
        {expandable && <ChevronRight className="sp-chev" size={14} strokeWidth={1.75} aria-hidden />}
      </div>
    </div>
  );
}

function StepItem({ step, now }: { step: DemoStep; now: number }) {
  if (step.kind === "thinking") {
    const active = step.state === "active";
    const elapsed = active && step.startedAt !== undefined ? Math.max(1000, now - step.startedAt) : undefined;
    return (
      <StepRow
        icon={active ? Lightbulb : Brain}
        state={step.state}
        title={active ? "Thinking" : step.ms !== undefined && step.ms >= 1000 ? `Thought for ${formatElapsedTime(step.ms)}` : "Thought briefly"}
        meta={elapsed !== undefined ? formatElapsedTime(elapsed) : undefined}
        expandable={!active}
      />
    );
  }
  const active = step.state === "active";
  const elapsed = active && step.startedAt !== undefined ? now - step.startedAt : undefined;
  return (
    <StepRow
      icon={TOOL_ICONS[step.tool] ?? Route}
      state={step.state}
      title={step.reason}
      meta={
        elapsed !== undefined && elapsed >= 1000
          ? formatStepDuration(elapsed)
          : !active && step.tokens
            ? `${step.tokens[0].toLocaleString()} in · ${step.tokens[1].toLocaleString()} out`
            : undefined
      }
    />
  );
}

/** Consecutive thinking and tool steps: a live status line that folds into a summary, with the steps on a rail. */
const StepSequence = memo(function StepSequence({ group }: { group: Extract<DemoGroup, { kind: "steps" }> }) {
  const [open, setOpen] = useState(true);
  const anyActive = group.steps.some((s) => s.state === "active");
  const now = useNow(group.live || anyActive);
  const latest = group.steps[group.steps.length - 1];
  const label = latest.kind === "thinking" ? "Thinking" : latest.reason;
  const elapsed = group.since !== undefined ? now - group.since : undefined;
  return (
    <div className="sp-seq">
      <button type="button" className="sp-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {group.live ? (
          <>
            <LivingDots className="sp-line-dots" />
            <span key={group.steps.length} className="ts-enter sp-trunc">
              {label}
            </span>
            {elapsed !== undefined && elapsed >= 1000 && <span className="sp-line-time">{formatElapsedTime(elapsed)}</span>}
          </>
        ) : (
          <span key="summary" className="ts-enter sp-trunc">
            {summarize(group.steps)}
          </span>
        )}
        <ChevronRight className={`sp-chev ${open ? "is-open" : ""}`} size={14} strokeWidth={1.75} aria-hidden />
      </button>
      <div className="ts-collapse" data-open={open}>
        <div>
          <div className="sp-list">
            {group.steps.map((s, i) => (
              <div key={i} className="sp-rail-item">
                {i > 0 && <span className="sp-rail top" />}
                {i < group.steps.length - 1 && <span className="sp-rail center" />}
                <StepItem step={s} now={now} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

function UserMessage({ text }: { text: string }) {
  return (
    <div className="sp-user">
      <div className="sp-you">You</div>
      <div className="sp-bubble">{text}</div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: Extract<DemoMsg, { role: "assistant" }> }) {
  return (
    <div className="sp-assistant">
      <div className="sp-groups">
        {msg.groups.map((g, i) =>
          g.kind === "steps" ? (
            <StepSequence key={i} group={g} />
          ) : (
            <div key={i} className="sp-text ts-enter">
              {g.body}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="sp-empty">
      <SlothMark className="sp-empty-mark" />
      <div className="sp-empty-title">
        What should the sloth <em>do?</em>
      </div>
    </div>
  );
}

function ProviderMark() {
  // Anthropic mark from the extension's ProviderLogo (@lobehub/icons, MIT).
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="#D97757"
        d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      />
    </svg>
  );
}

export interface ComposerProps {
  draft: string;
  loading: boolean;
  /** When set, the send button is a real button (the landing page's interactive demo). */
  onSend?: () => void;
  sendRef?: Ref<HTMLButtonElement>;
  pressed?: boolean;
  /** data-tk hook so the landing page can point at the send button. */
  sendTarget?: string;
}

function Composer({ draft, loading, onSend, sendRef, pressed, sendTarget }: ComposerProps) {
  return (
    <div className="sp-composer">
      <div className={`sp-box ${draft ? "has-text" : ""}`}>
        <div className="sp-input-row">
          <div className={`sp-input ${draft ? "" : "is-ph"}`}>{draft || "Tell the sloth what to do…"}</div>
          <button
            ref={sendRef}
            data-tk={sendTarget}
            type="button"
            className={`sp-icon-sm ${pressed ? "is-pressed" : ""}`}
            onClick={onSend}
            disabled={!onSend || (!loading && !draft)}
            aria-label={loading ? "Stop" : "Send"}
            tabIndex={onSend ? 0 : -1}
          >
            {loading ? <CircleDot size={16} strokeWidth={1.75} /> : <CornerDownLeft size={16} strokeWidth={1.75} />}
          </button>
        </div>
      </div>
      <div className="sp-toolbar">
        <div className="sp-tools">
          <span className="sp-icon-xs">
            <Plus size={12} strokeWidth={1.75} />
          </span>
          <span className="sp-icon-xs">
            <MousePointerSquareDashed size={12} strokeWidth={1.5} />
          </span>
          <span className="sp-icon-xs">
            <PencilLine size={12} strokeWidth={1.5} />
          </span>
          <span className="sp-icon-xs">
            <Mic size={12} strokeWidth={1.75} />
          </span>
          <span className="sp-icon-xs sp-narrow">
            <ChevronDown size={12} strokeWidth={1.75} />
          </span>
        </div>
        <div className="sp-model-wrap">
          <span className="sp-model">
            <ProviderMark />
            <span>Claude Sonnet 5.5</span>
            <ChevronUp size={12} strokeWidth={1.5} />
          </span>
          {loading && <LoaderCircle className="sp-spin" size={14} strokeWidth={1.75} aria-label="Working" />}
        </div>
      </div>
    </div>
  );
}

export interface SidePanelProps extends ComposerProps {
  theme: "dark" | "light";
  title: string | null;
  messages: DemoMsg[];
  /** Show Chrome's own side panel header around the extension page. */
  chrome?: boolean;
  className?: string;
}

/** The extension's chat page inside Chrome's side panel. */
export function SidePanel({ theme, title, messages, chrome = true, className = "", ...composer }: SidePanelProps) {
  const list = useRef<HTMLDivElement>(null);
  // Follow mode: stay pinned to the newest content, like MessageList.
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const ro = new ResizeObserver(() => (el.scrollTop = el.scrollHeight));
    ro.observe(el.firstElementChild as Element);
    return () => ro.disconnect();
  }, []);

  return (
    <aside className={`sp-chrome ts-${theme} ${chrome ? "" : "no-chrome"} ${className}`} aria-label="Tampersloth side panel">
      {chrome && (
        <div className="sp-chrome-head">
          <SlothMark className="sp-chrome-mark" />
          <span>TamperSloth</span>
          <span className="sp-chrome-actions">
            <Pin size={14} strokeWidth={1.75} />
            <X size={15} strokeWidth={1.75} />
          </span>
        </div>
      )}
      <div className="sp-page">
        <header className="sp-head">
          <span className="sp-hbtn">
            <PanelLeft size={16} strokeWidth={1.5} />
          </span>
          <div className="sp-title-wrap">
            {composer.loading && (
              <span className="sp-working" role="status" aria-label="Working">
                <i />
                <i />
              </span>
            )}
            <h3 key={title ?? "new"} className={`sp-title ${title ? "" : "is-new"}`}>
              {title ?? "New chat"}
            </h3>
          </div>
          <span className="sp-hbtn">
            <SquarePen size={16} strokeWidth={1.5} />
          </span>
          <span className="sp-hbtn">
            <GalleryVerticalEnd size={16} strokeWidth={1.5} />
          </span>
        </header>
        <div ref={list} className="sp-list-scroll">
          <div className="sp-msgs">
            {messages.length === 0 && <EmptyState />}
            {messages.map((m, i) => (m.role === "user" ? <UserMessage key={i} text={m.text} /> : <AssistantMessage key={i} msg={m} />))}
          </div>
        </div>
        <Composer {...composer} />
      </div>
    </aside>
  );
}
