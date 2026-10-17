import { useEffect, useReducer, useRef, useState } from "react";
import { BedDouble, ChevronDown, CircleHelp, CornerDownLeft, FileText, Mail, MapPin, Pause, Plane, Radio, TabletSmartphone, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { Icon } from "./brand";
import { LivingDots, StepRow } from "./panel/Panel";
import { prefersReducedMotion } from "../lib/pen";
import "../styles/tabmanager.css";

/*
 * The tab tools on a loop: a Chrome tab strip that Sloth opens tabs into,
 * groups as a 🦥 task, mutes, pins, moves, folds and finally tidies up, next
 * to the side panel's step rail and task-tabs card (TaskTabsCard.tsx).
 */

type TabId = "inbox" | "radio" | "plan" | "flights" | "hotels" | "map";

const TABS: Record<TabId, { title: string; icon: LucideIcon; tone: string }> = {
  inbox: { title: "Inbox (3)", icon: Mail, tone: "#d9a58e" },
  radio: { title: "Lo-fi radio", icon: Radio, tone: "#b7a5d9" },
  plan: { title: "Lisbon weekend plan", icon: FileText, tone: "#8fb2d9" },
  flights: { title: "Flights to Lisbon", icon: Plane, tone: "#a8bd85" },
  hotels: { title: "Hotels in Alfama", icon: BedDouble, tone: "#d9c48e" },
  map: { title: "Map · Lisbon", icon: MapPin, tone: "#8ed9c2" },
};
/** Strip order before anything moves; closed tabs grow in and shrink out where they'd sit in it. */
const ORDER = Object.keys(TABS) as TabId[];
const TRIP: TabId[] = ["flights", "hotels", "map"];
const GROUP = "Lisbon trip";

interface View {
  order: TabId[];
  pinned: TabId[];
  muted: boolean;
  group: { waiting?: boolean; collapsed?: boolean } | null;
}

interface Scene extends View {
  name: string;
  call: string;
  step: string;
  icon: LucideIcon;
  /** What the step changed, ringed briefly once it lands. */
  touch: (TabId | "group")[];
}

const START: View = { order: ["inbox", "radio", "plan"], pinned: [], muted: false, group: null };

// Each scene builds on the one before it.
const SCENES: Scene[] = (
  [
    {
      name: "Open tabs in the background",
      call: 'browserTabs({ action: "create", background: true })',
      step: "Opening flights, hotels and a map",
      order: ["inbox", "radio", "plan", ...TRIP],
      touch: TRIP,
    },
    {
      name: "Group what belongs together",
      call: `browserTabGroups({ action: "group", title: "${GROUP}" })`,
      step: `Grouping them as 🦥 ${GROUP}`,
      group: {},
      touch: ["group"],
    },
    { name: "Mute the noisy one", call: 'browserTabs({ action: "mute" })', step: "Muting the radio", muted: true, touch: ["radio"] },
    { name: "Pin what you keep", call: 'browserTabs({ action: "pin" })', step: "Pinning your inbox", pinned: ["inbox"], touch: ["inbox"] },
    {
      name: "Move tabs and groups",
      call: 'browserTabGroups({ action: "move", index: 1 })',
      step: "Moving the trip up front",
      order: ["inbox", ...TRIP, "radio", "plan"],
      touch: ["group"],
    },
    {
      name: "Fold references away",
      call: 'browserTabGroups({ action: "update", collapsed: true })',
      step: "Folding the references away",
      group: { collapsed: true },
      touch: ["group"],
    },
    {
      name: "Show when it’s waiting on you",
      call: 'askUser({ question: "Fri–Sun or Sat–Mon?" })',
      step: "Waiting for you",
      icon: CircleHelp,
      group: { collapsed: true, waiting: true },
      touch: ["group"],
    },
    {
      name: "Tidy up when it’s done",
      call: 'browserTabs({ action: "finish", keepTabIds: [412] })',
      step: "Closed 2 tabs, kept the hotels",
      order: ["inbox", "hotels", "radio", "plan"],
      group: null,
      touch: ["hotels"],
    },
  ] as (Partial<Scene> & Pick<Scene, "name" | "call" | "step" | "touch">)[]
).reduce<Scene[]>((all, s) => [...all, { ...(all[all.length - 1] ?? START), icon: TabletSmartphone, ...s }], []);

// Announce the step, act, settle, hold.
const CUE = 550;
const ACT = 1000;
const HOLD = 1300;
const LAST_HOLD = 2400;
const FADE = 450;

type Phase = "cue" | "act" | "done" | "out";

const PIN_W = 40;
const PLUS_W = 34;
const CHIP_GAP = 6;
const TAB_MAX = 196;
const TAB_MIN = 30;

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** The group chip's width, measured in its own font so it can animate between titles. */
function chipWidth(title: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return title.length * 7 + 20;
  measureCtx.font = '600 11px "Geist Variable", ui-sans-serif, system-ui, sans-serif';
  return Math.ceil(measureCtx.measureText(title).width) + 20;
}

type Box = { x: number; w: number; on: boolean };

function layout(v: View, width: number, chipW: number, left: number) {
  const g = v.group;
  const inGroup = (id: TabId) => !!g && TRIP.includes(id);
  const folded = (id: TabId) => inGroup(id) && !!g?.collapsed;
  const pinned = v.order.filter((id) => v.pinned.includes(id));
  const loose = v.order.filter((id) => !v.pinned.includes(id));
  const chipSpace = g ? chipW + CHIP_GAP * 2 : 0;
  const n = Math.max(1, loose.filter((id) => !folded(id)).length);
  const tabW = Math.max(TAB_MIN, Math.min(TAB_MAX, (width - left - PLUS_W - pinned.length * PIN_W - chipSpace) / n));

  const boxes = {} as Record<TabId, Box>;
  let chip: { x: number; end: number } | null = null;
  let x = left;
  for (const id of pinned) {
    boxes[id] = { x, w: PIN_W, on: true };
    x += PIN_W;
  }
  for (const id of loose) {
    if (inGroup(id) && !chip) {
      chip = { x: x + CHIP_GAP, end: x + CHIP_GAP + chipW };
      x += chipSpace;
    }
    if (folded(id)) {
      boxes[id] = { x, w: 0, on: false };
      continue;
    }
    boxes[id] = { x, w: tabW, on: true };
    x += tabW;
    if (inGroup(id)) chip!.end = x;
  }
  // A closed tab sits, zero wide, where the next open tab in the original order is.
  let next = x;
  for (const id of [...ORDER].reverse()) {
    if (boxes[id]) next = boxes[id].x;
    else boxes[id] = { x: next, w: 0, on: false };
  }
  return { boxes, chip, end: x };
}

export function TabManagerVisual() {
  const root = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState({ strip: 0, root: 0 });
  const calm = prefersReducedMotion();
  const [{ i, phase }, setPlay] = useState<{ i: number; phase: Phase }>(calm ? { i: 3, phase: "done" } : { i: 0, phase: "cue" });
  const [, refit] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth({ strip: strip.current?.clientWidth ?? 0, root: root.current?.clientWidth ?? 0 }));
    if (root.current) ro.observe(root.current);
    // Chip widths are measured in the web font, so measure again once it has loaded.
    void document.fonts?.ready.then(refit);
    return () => ro.disconnect();
  }, []);

  // Plays while on screen; leaving and coming back picks up where it was.
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || calm) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [calm]);

  useEffect(() => {
    if (!onScreen) return;
    const last = i === SCENES.length - 1;
    const after = { cue: CUE, act: ACT, done: last ? LAST_HOLD : HOLD, out: FADE }[phase];
    const id = window.setTimeout(() => {
      setPlay(({ i, phase }) => {
        if (phase === "cue") return { i, phase: "act" };
        if (phase === "act") return { i, phase: "done" };
        if (phase === "done") return i === SCENES.length - 1 ? { i, phase: "out" } : { i: i + 1, phase: "cue" };
        return { i: 0, phase: "cue" };
      });
    }, after);
    return () => window.clearTimeout(id);
  }, [onScreen, i, phase]);

  const scene = SCENES[i];
  // While a step is announced, the strip still shows the state before it.
  const view: View = phase === "cue" ? (SCENES[i - 1] ?? START) : scene;
  const narrow = width.root > 0 && width.root < 680;
  const left = width.strip > 0 && width.strip < 520 ? 10 : 70;
  const chipTitle = `🦥 ${view.group?.waiting ? "⏸ " : ""}${GROUP}`;
  const chipW = chipWidth(chipTitle);
  const { boxes, chip, end } = layout(view, width.strip || 900, chipW, left);
  const lastChip = useRef(chip);
  if (chip) lastChip.current = chip;
  const chipAt = chip ?? lastChip.current ?? { x: left, end: left };
  const touched = phase === "act" ? scene.touch : [];
  const running = !(i === SCENES.length - 1 && phase !== "cue" && phase !== "act");

  const steps = SCENES.slice(0, i + 1).map((s, n) => ({ ...s, state: n === i && running ? ("active" as const) : ("done" as const) }));
  const visibleSteps = steps.slice(-3);
  const taskTabs = view.group ? view.order.filter((id) => TRIP.includes(id)).length + 1 : 0;

  return (
    <div ref={root} className={`tm ${narrow ? "is-narrow" : ""} ${phase === "out" ? "is-out" : ""} ${phase === "cue" && i === 0 ? "is-reset" : ""}`}>
      <div ref={strip} className="tm-strip">
        {left > 10 && (
          <span className="tm-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
        {ORDER.map((id) => {
          const t = TABS[id];
          const b = boxes[id];
          const pinned = view.pinned.includes(id);
          const I = t.icon;
          return (
            <div
              key={id}
              className={`tm-tab ${id === "plan" ? "is-active" : ""} ${pinned ? "is-pinned" : ""} ${b.on ? "" : "is-gone"} ${b.w < 72 ? "is-tight" : ""} ${b.w < 120 ? "is-slim" : ""}`}
              // A narrow tab is just its favicon, centered.
              style={{ transform: `translateX(${b.x}px)`, width: b.w, paddingLeft: b.w < 72 ? Math.max(4, (b.w - 16) / 2) : 10 }}
            >
              <span className="tm-fav" style={{ ["--tone" as string]: t.tone }}>
                <I size={10} strokeWidth={2.25} />
              </span>
              <span className="tm-title">{t.title}</span>
              {id === "radio" && (
                <span key={String(view.muted)} className={`tm-audio ${view.muted ? "is-muted" : "is-playing"}`}>
                  {view.muted ? <VolumeX size={13} strokeWidth={1.75} /> : <Volume2 size={13} strokeWidth={1.75} />}
                </span>
              )}
              <span className="tm-x">×</span>
              {touched.includes(id) && <span key={i} className="tm-ping" />}
            </div>
          );
        })}
        <div
          className={`tm-chip ${chip ? "" : "is-gone"}`}
          style={{ transform: `translateX(${chipAt.x}px)`, width: chipW }}
        >
          <span key={chipTitle} className="tm-chip-label">
            {chipTitle}
          </span>
          {touched.includes("group") && <span key={i} className="tm-ping" />}
        </div>
        <span className={`tm-gline ${chip ? "" : "is-gone"}`} style={{ transform: `translateX(${chipAt.x}px)`, width: chipAt.end - chipAt.x }} />
        <span className="tm-plus" style={{ transform: `translateX(${end + 8}px)` }}>
          +
        </span>
      </div>

      <div className="tm-bar">
        <span className="tm-nav" aria-hidden>
          <Icon.arrowL />
          <Icon.arrowR />
          <Icon.reload />
        </span>
        <span className="tm-url">
          <Icon.lock />
          docs.example <span className="dim">/ lisbon-weekend</span>
        </span>
        <span className="tm-ext" aria-hidden>
          <Icon.puzzle />
          <Icon.panel />
        </span>
      </div>

      <div className="tm-body">
        <div className="tm-stage">
          <div className="tm-num">
            {String(i + 1).padStart(2, "0")} <span>/ {String(SCENES.length).padStart(2, "0")}</span>
          </div>
          <h4 key={`n${i}`} className="tm-name">
            {scene.name}
          </h4>
          <code key={`c${i}`} className="tm-call">
            <b>{scene.call.slice(0, scene.call.indexOf("("))}</b>
            {scene.call.slice(scene.call.indexOf("("))}
          </code>
          <div className="tm-prog" aria-hidden>
            {SCENES.map((_, n) => (
              <i key={n} className={n < i ? "is-past" : n === i ? "is-now" : ""}>
                {n === i && (
                  <b
                    key={i}
                    style={
                      calm
                        ? { animation: "none" }
                        : { animationDuration: `${CUE + ACT + (i === SCENES.length - 1 ? LAST_HOLD : HOLD)}ms`, animationPlayState: onScreen ? "running" : "paused" }
                    }
                  />
                )}
              </i>
            ))}
          </div>
        </div>

        <div className="tm-panel ts-dark">
          <div className="sp-user">
            <div className="sp-bubble">Plan a Lisbon weekend. Pin my inbox and mute that radio.</div>
          </div>
          <div className="sp-seq">
            <div className="sp-line">
              {running ? (
                <>
                  <LivingDots className="sp-line-dots" />
                  <span key={i} className="ts-enter sp-trunc">
                    {scene.step}
                  </span>
                </>
              ) : (
                <span className="ts-enter sp-trunc">Managed tabs, grouped tabs, used {SCENES.length} tools</span>
              )}
            </div>
            <div className="sp-list">
              {visibleSteps.map((s, n) => (
                <div key={s.name} className="sp-rail-item">
                  {n > 0 && <span className="sp-rail top" />}
                  {n < visibleSteps.length - 1 && <span className="sp-rail center" />}
                  <StepRow icon={s.icon} state={s.state} title={s.step} />
                </div>
              ))}
            </div>
          </div>

          <div className={`tm-task ${view.group ? "" : "is-gone"}`} aria-hidden={!view.group}>
            <span className="tm-task-mark" aria-hidden>
              🦥
            </span>
            <span className="tm-task-title">{GROUP}</span>
            {view.group?.waiting && (
              <span className="tm-task-wait">
                <Pause size={12} strokeWidth={1.75} />
                Waiting for you
              </span>
            )}
            <span className="tm-task-count">{taskTabs || 4} tabs</span>
            <ChevronDown size={14} strokeWidth={1.75} />
          </div>
          <div className="sp-composer">
            <div className="sp-box">
              <div className="sp-input-row">
                <div className="sp-input is-ph">Tell the sloth what to do…</div>
                <span className="sp-icon-sm">
                  {running ? (
                    <span className="sp-stop">
                      <i />
                    </span>
                  ) : (
                    <CornerDownLeft size={16} strokeWidth={1.75} />
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
