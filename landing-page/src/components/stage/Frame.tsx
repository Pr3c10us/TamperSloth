import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GuideCursor, Icon, TypedTip } from "../brand";
import { SidePanel, type DemoMsg, type DemoStep } from "../panel/Panel";
import { Aborted, drawStrokes, moveCursor, setCursor, typeText, wait } from "../../lib/pen";
import { sketchArrow, sketchRect, type Box, type Pt } from "../../lib/sketch";
import { LockPill } from "./LockPill";

/*
 * A browser window with a fictional invoice site and the Tampersloth side
 * panel, playing one of three short runs: Do it, Show me, Keep it. The panel
 * is the extension's chat UI; the page shows what the extension draws on a
 * site (edge glow, Stop pill, cursor, ripples, guide strokes).
 */

export const WIDE = { w: 1200, h: 740 };
export const NARROW = { w: 600, h: 900 };

type Status = "Overdue" | "Pending" | "Paid";
type Row = { id: string; client: string; due: string; amount: string };

const ROWS: Row[] = [
  { id: "1042", client: "Studio North", due: "Oct 08", amount: "$2,400.00" },
  { id: "1043", client: "Fieldwork Co.", due: "Oct 18", amount: "$3,250.00" },
  { id: "1044", client: "Studio South", due: "Oct 24", amount: "$2,800.00" },
  { id: "1045", client: "Northwind Press", due: "Oct 02", amount: "$1,120.00" },
  { id: "1046", client: "Atlas & Oak", due: "Oct 29", amount: "$4,600.00" },
  { id: "1047", client: "Little Harbor", due: "Sep 30", amount: "$860.00" },
];
const START_STATUS: Record<string, Status> = {
  "1042": "Overdue",
  "1043": "Pending",
  "1044": "Paid",
  "1045": "Overdue",
  "1046": "Pending",
  "1047": "Overdue",
};
const START_ORDER = ROWS.map((r) => r.id);

type State = {
  title: string | null;
  msgs: DemoMsg[];
  draft: string;
  loading: boolean;
  sendPressed: boolean;
  search: string;
  searchFocus: boolean;
  statuses: Record<string, Status>;
  flash: string | null;
  order: string[];
  scriptInstalled: boolean;
  rowMenu: string | null;
  menuHover: string | null;
  exportPressed: boolean;
  exportOpen: boolean;
  exportHover: string | null;
  reloading: boolean;
  lock: "agent" | "guide" | null;
  tip: string | null;
};

const initial = (): State => ({
  title: null,
  msgs: [],
  draft: "",
  loading: false,
  sendPressed: false,
  search: "",
  searchFocus: false,
  statuses: { ...START_STATUS },
  flash: null,
  order: START_ORDER,
  scriptInstalled: false,
  rowMenu: null,
  menuHover: null,
  exportPressed: false,
  exportOpen: false,
  exportHover: null,
  reloading: false,
  lock: null,
  tip: null,
});

export type FrameHandle = { el: HTMLDivElement | null };

/** Message-list edits shared by the stage and the Try it section. */
export function chatOps(set: (f: (p: { msgs: DemoMsg[] }) => { msgs: DemoMsg[] }) => void) {
  const editLastGroup = (f: (steps: DemoStep[]) => DemoStep[], extra?: { live?: boolean }) =>
    set((p) => {
      const msgs = [...p.msgs];
      const last = msgs[msgs.length - 1];
      if (last?.role !== "assistant") return p;
      const groups = [...last.groups];
      const gi = groups.map((g) => g.kind).lastIndexOf("steps");
      const g = groups[gi];
      if (g?.kind !== "steps") return p;
      groups[gi] = { ...g, steps: f(g.steps), ...(extra ?? {}) };
      msgs[msgs.length - 1] = { ...last, groups };
      return { msgs };
    });
  return {
    user: (text: string) => set((p) => ({ msgs: [...p.msgs, { role: "user", text }] })),
    startRun: () =>
      set((p) => ({ msgs: [...p.msgs, { role: "assistant", groups: [{ kind: "steps", steps: [], live: true, since: Date.now() }] }] })),
    step: (s: DemoStep) => editLastGroup((steps) => [...steps, s]),
    finishStep: (patch: Partial<DemoStep>) =>
      editLastGroup((steps) => {
        const last = steps[steps.length - 1];
        const ms = last.startedAt !== undefined ? Date.now() - last.startedAt : undefined;
        return [...steps.slice(0, -1), { ...last, state: "done", ...(last.kind === "thinking" ? { ms } : {}), ...patch } as DemoStep];
      }),
    endSteps: () => editLastGroup((steps) => steps, { live: false }),
    text: (body: ReactNode) =>
      set((p) => {
        const msgs = [...p.msgs];
        const last = msgs[msgs.length - 1];
        if (last?.role !== "assistant") return p;
        msgs[msgs.length - 1] = { ...last, groups: [...last.groups, { kind: "text", body }] };
        return { msgs };
      }),
  };
}

export const Frame = forwardRef<FrameHandle, { step: number; playing: boolean; narrow: boolean }>(function Frame({ step, playing, narrow }, ref) {
  const [s, setS] = useState<State>(initial);
  const frame = useRef<HTMLDivElement>(null);
  const ink = useRef<SVGSVGElement>(null);
  const sloth = useRef<HTMLDivElement>(null);
  const user = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const design = narrow ? NARROW : WIDE;

  useImperativeHandle(ref, () => ({ el: frame.current }), []);

  const set = useCallback((patch: Partial<State> | ((p: State) => Partial<State>)) => {
    setS((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const ctrl = new AbortController();
    const signal = ctrl.signal;
    const resetScene = () => {
      setS(initial());
      if (ink.current) ink.current.innerHTML = "";
      sloth.current?.classList.remove("is-on");
      user.current?.classList.remove("is-on");
    };
    resetScene();
    // Show me only guides, so Sloth's cursor drops its mark there.
    sloth.current?.classList.toggle("is-guiding", step === 1);
    const chat = chatOps(set);
    const now = Date.now;

    // ── helpers in design-space coordinates ──
    // Offsets rather than client rects: the frame is scaled and, while it
    // rises out of the hero, tilted in 3D, but layout offsets ignore both.
    const box = (name: string): Box => {
      const root = frame.current;
      const el = root?.querySelector<HTMLElement>(`[data-t="${name}"]`);
      if (!root || !el) return { x: design.w / 2, y: design.h / 2, w: 0, h: 0 };
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== root) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const center = (name: string, dx = 0, dy = 0): Pt => {
      const b = box(name);
      return { x: b.x + b.w / 2 + dx, y: b.y + b.h / 2 + dy };
    };
    // The extension's click ripple: a sage ring that swells and fades.
    const tap = async (cur: HTMLDivElement, p: Pt) => {
      cur.classList.add("is-press");
      const ring = document.createElement("span");
      ring.className = "ripple";
      ring.style.left = `${p.x}px`;
      ring.style.top = `${p.y}px`;
      fx.current?.appendChild(ring);
      window.setTimeout(() => ring.remove(), 600);
      await wait(140, signal);
      cur.classList.remove("is-press");
    };
    const send = async (text: string) => {
      await wait(500, signal);
      await typeText(text, (v) => set({ draft: v }), signal, 34);
      await wait(380, signal);
      set({ sendPressed: true });
      await wait(140, signal);
      set({ sendPressed: false, draft: "", loading: true });
      chat.user(text);
      await wait(450, signal);
      chat.startRun();
    };
    const think = async (ms: number) => {
      chat.step({ kind: "thinking", state: "active", startedAt: now() });
      await wait(ms, signal);
      chat.finishStep({});
    };
    const tool = async (name: string, reason: string, tokens: [number, number], body?: () => Promise<void>, ms = 900) => {
      chat.step({ kind: "tool", tool: name, reason, state: "active", startedAt: now() });
      if (body) await body();
      else await wait(ms, signal);
      chat.finishStep({ tokens });
    };
    const reply = async (body: ReactNode) => {
      chat.endSteps();
      await wait(250, signal);
      chat.text(body);
      set({ loading: false });
    };
    const reload = async () => {
      set({ reloading: true, rowMenu: null, exportOpen: false });
      await wait(650, signal);
      set((p) => ({
        reloading: false,
        // A saved script runs on every load of the page.
        order: p.scriptInstalled
          ? [...START_ORDER].sort((a, b) => Number(START_STATUS[b] === "Overdue") - Number(START_STATUS[a] === "Overdue"))
          : START_ORDER,
      }));
    };
    const panelEdge = (): Pt => (narrow ? { x: design.w * 0.7, y: design.h - 260 } : { x: design.w - 400, y: 420 });

    const scripts: Record<number, () => Promise<void>> = {
      // 01 · Do it: Sloth works the page itself.
      0: async () => {
        await send("Find Studio North’s invoice and mark it paid.");
        set({ title: "Mark Studio North invoice paid" });
        await think(1500);
        await tool("getPageStructure", "Find the invoice search box", [26, 488]);
        const cur = sloth.current!;
        set({ lock: "agent" });
        setCursor(cur, panelEdge());
        cur.classList.add("is-on");
        await tool("typeText", "Search for Studio North", [41, 36], async () => {
          const field = box("search");
          const at = { x: field.x + 44, y: field.y + field.h / 2 };
          await moveCursor(cur, at, signal);
          await tap(cur, at);
          set({ searchFocus: true });
          await typeText("Studio North", (v) => set({ search: v }), signal, 18);
          await wait(250, signal);
        });
        await tool("clickElement", "Open the menu for INV-1042", [33, 29], async () => {
          await moveCursor(cur, center("kebab-1042"), signal);
          await tap(cur, center("kebab-1042"));
          set({ rowMenu: "1042", searchFocus: false });
          await wait(300, signal);
        });
        await tool("clickElement", "Mark INV-1042 as paid", [31, 27], async () => {
          await moveCursor(cur, center("menu-paid", -24), signal, 420);
          set({ menuHover: "paid" });
          await wait(240, signal);
          await tap(cur, center("menu-paid", -24));
          set((p) => ({ rowMenu: null, menuHover: null, statuses: { ...p.statuses, "1042": "Paid" }, flash: "1042" }));
          await wait(300, signal);
        });
        set({ lock: null });
        cur.classList.remove("is-on");
        await reply(
          <>
            Done. Studio North&rsquo;s invoice <strong>INV-1042</strong> is now marked as paid.
          </>,
        );
      },

      // 02 · Show me: draw the next step, wait for the person to take it.
      1: async () => {
        await send("Show me how to export my invoices.");
        set({ title: "Export invoices" });
        await think(1200);
        await tool("getPageStructure", "Find the export controls", [24, 512]);
        chat.step({ kind: "tool", tool: "waitForUserAction", reason: "Guide you to the Export button", state: "active", startedAt: now() });
        const cur = sloth.current!;
        setCursor(cur, panelEdge());
        cur.classList.add("is-on");
        // Site input pauses while the guide is drawn.
        set({ lock: "guide" });
        const b = box("export");
        await drawStrokes(ink.current!, sketchRect(b, 7, { pad: 8, radius: 10 }), { cursor: cur, signal, pace: 2.6 });
        const tip = { x: b.x - 8, y: b.y + b.h + 12 };
        const from = narrow ? { x: b.x - 120, y: b.y + b.h + 120 } : { x: b.x - 150, y: b.y + b.h + 96 };
        await drawStrokes(ink.current!, sketchArrow(from, tip, 3, -0.3), { cursor: cur, signal });
        await moveCursor(cur, { x: from.x - 14, y: from.y + 4 }, signal, 420);
        set({ lock: null, tip: "Click Export to download your invoices." });
        await wait(3200, signal);
        const you = user.current!;
        setCursor(you, narrow ? { x: 120, y: design.h - 380 } : { x: 360, y: design.h - 70 });
        you.classList.add("is-on");
        await moveCursor(you, center("export", 6, 4), signal, 1100);
        await wait(200, signal);
        set({ exportPressed: true, tip: null });
        // The expected action ends the step: the guide is removed straight away.
        if (ink.current) ink.current.innerHTML = "";
        cur.classList.remove("is-on");
        await wait(140, signal);
        set({ exportPressed: false, exportOpen: true });
        chat.finishStep({ tokens: [58, 41] });
        await wait(700, signal);
        await reply(
          <>
            That&rsquo;s it. Pick <strong>CSV</strong>, <strong>PDF</strong> or <strong>Excel</strong> and the download starts.
          </>,
        );
        await moveCursor(you, center("export-csv", -10, 4), signal, 600);
        set({ exportHover: "csv" });
      },

      // 03 · Keep it: a saved script runs on every visit.
      2: async () => {
        await send("Always put overdue invoices first on this site.");
        set({ title: "Overdue invoices first" });
        await think(1400);
        await tool("getPageStructure", "Read the invoice table layout", [22, 640]);
        await tool("saveScript", "Save an Overdue first script for this site", [212, 38], async () => {
          await wait(1300, signal);
          set({ scriptInstalled: true });
        });
        await tool("reloadPage", "Reload so the script runs", [12, 18], reload);
        await reply(
          <>
            Saved <strong>Overdue first</strong>. It runs every time workspace.example loads, so overdue invoices always come first. Pause or
            edit it anytime from the gallery.
          </>,
        );
        // Later visits: the person reloads, the script runs again.
        await wait(1600, signal);
        const you = user.current!;
        setCursor(you, narrow ? { x: 160, y: 300 } : { x: 300, y: 300 });
        you.classList.add("is-on");
        await moveCursor(you, center("reload", 2, 3), signal, 900);
        await wait(150, signal);
        await reload();
        await wait(400, signal);
        await moveCursor(you, { x: center("reload").x + 140, y: center("reload").y + 160 }, signal, 700);
      },
    };

    // Each mode loops, so one that started while only peeking out of the hero
    // still plays from the top once it is properly in view.
    const loop = async () => {
      const script = scripts[step];
      if (!script) return;
      for (;;) {
        await script();
        await wait(2600, signal);
        resetScene();
        await wait(400, signal);
      }
    };
    loop().catch((e) => {
      if (!(e instanceof Aborted)) console.error(e);
    });
    return () => ctrl.abort();
  }, [step, playing, narrow, design.w, design.h, set]);

  return (
    <div ref={frame} className={`frame ${narrow ? "is-narrow" : ""}`} style={{ width: design.w, height: design.h }} aria-label="Animated demo of Tampersloth in a browser" role="img">
      <BrowserChrome reloading={s.reloading} />
      <div className="frame-body">
        <Site s={s} narrow={narrow} />
        <SidePanel
          theme="dark"
          chrome={!narrow}
          className="frame-panel"
          title={s.title}
          messages={s.msgs}
          draft={s.draft}
          loading={s.loading}
          pressed={s.sendPressed}
        />
      </div>
      <div ref={fx} className="frame-fx" />
      <svg ref={ink} className="ink-layer" viewBox={`0 0 ${design.w} ${design.h}`} />
      <GuideCursor ref={sloth} label={s.tip ? <TypedTip text={s.tip} /> : null} />
      <GuideCursor ref={user} variant="user" />
    </div>
  );
});

function BrowserChrome({ reloading }: { reloading: boolean }) {
  return (
    <div className="chrome">
      <div className="chrome-tabs">
        <span className="chrome-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="chrome-tab">
          <span className="chrome-tab-icon">
            <Icon.layers />
          </span>
          Invoice workspace
          <span className="chrome-x">×</span>
        </span>
        <span className="chrome-plus">+</span>
      </div>
      <div className="chrome-bar">
        <span className="chrome-nav">
          <Icon.arrowL />
          <Icon.arrowR />
          <span data-t="reload" className={`chrome-reload ${reloading ? "is-spinning" : ""}`}>
            <Icon.reload />
          </span>
        </span>
        <span className="chrome-url">
          <Icon.lock />
          workspace.example <span className="dim">/ invoices</span>
        </span>
        <span className="chrome-ext">
          <Icon.puzzle />
          <Icon.panel />
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status, flash }: { status: Status; flash?: boolean }) {
  return <span className={`pill pill-${status.toLowerCase()} ${flash ? "is-flash" : ""}`}>{status}</span>;
}

function Site({ s, narrow }: { s: State; narrow: boolean }) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevTops = useRef(new Map<string, number>());
  const q = s.search.trim().toLowerCase();
  const rows = s.order.map((id) => ROWS.find((r) => r.id === id)!).filter((r) => !q || r.client.toLowerCase().includes(q));
  const orderKey = rows.map((r) => r.id).join(",");

  // FLIP: rows glide to their new places when the order changes.
  useLayoutEffect(() => {
    rowRefs.current.forEach((el, id) => {
      const prev = prevTops.current.get(id);
      const now = el.offsetTop;
      if (prev !== undefined && prev !== now) {
        el.animate([{ transform: `translateY(${prev - now}px)` }, { transform: "none" }], {
          duration: 900,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
    });
    const next = new Map<string, number>();
    rowRefs.current.forEach((el, id) => next.set(id, el.offsetTop));
    prevTops.current = next;
  }, [orderKey]);

  return (
    <div className={`site ${s.reloading ? "is-reloading" : ""}`}>
      <div className="site-head">
        <span className="site-logo">
          <Icon.layers />
          Ledger
        </span>
        <span className="site-nav">
          <span>Overview</span>
          <span className="is-on">Invoices</span>
          {!narrow && <span>Clients</span>}
        </span>
        <span className="site-avatar">JD</span>
      </div>
      <div className="site-body">
        <div className="site-eyebrow">Workspace / Invoices</div>
        <div className="site-titlerow">
          <h3 className="site-title">Keep things moving.</h3>
          <div className="site-export-wrap">
            <span data-t="export" className={`site-btn ${s.exportPressed ? "is-pressed" : ""} ${s.exportOpen ? "is-open" : ""}`}>
              <Icon.download />
              Export
              <Icon.chevron />
            </span>
            {s.exportOpen && (
              <div className="menu menu-export">
                <span data-t="export-csv" className={s.exportHover === "csv" ? "is-hover" : ""}>
                  CSV <em>.csv</em>
                </span>
                <span>
                  PDF <em>.pdf</em>
                </span>
                <span>
                  Excel <em>.xlsx</em>
                </span>
              </div>
            )}
          </div>
        </div>
        {!narrow && (
          <div className="site-stats">
            <div>
              <span>Outstanding</span>
              <b>$8,450.00</b>
            </div>
            <div>
              <span>Paid this month</span>
              <b>$24,800.00</b>
            </div>
            <div>
              <span>Next reminder</span>
              <b>Tomorrow</b>
            </div>
          </div>
        )}
        <div className="site-tools">
          <span data-t="search" className={`site-search ${s.searchFocus ? "is-focus" : ""}`}>
            <Icon.search />
            {s.search ? <span className="val">{s.search}</span> : <span className="ph">Search invoices…</span>}
            {s.searchFocus && <span className="text-caret" />}
          </span>
          <span className="site-select">
            All invoices <Icon.chevron />
          </span>
        </div>
        <div className="table">
          <div className="thead">
            <span>Client / Invoice</span>
            {!narrow && <span>Due</span>}
            <span className="r">Amount</span>
            <span>Status</span>
            <span />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              ref={(el) => {
                if (el) rowRefs.current.set(r.id, el);
                else rowRefs.current.delete(r.id);
              }}
              className="tr"
            >
              <span className="cell-client">
                <span className="avatar">{r.client[0]}</span>
                <span>
                  <b>{r.client}</b>
                  <small>INV-{r.id}</small>
                </span>
              </span>
              {!narrow && <span className="cell-due">{r.due}</span>}
              <span className="cell-amt">{r.amount}</span>
              <span>
                <StatusPill status={s.statuses[r.id]} flash={s.flash === r.id} />
              </span>
              <span className="cell-kebab" data-t={`kebab-${r.id}`}>
                <Icon.dots />
                {s.rowMenu === r.id && (
                  <span className="menu menu-row">
                    <span data-t="menu-paid" className={s.menuHover === "paid" ? "is-hover" : ""}>
                      <Icon.check /> Mark as paid
                    </span>
                    <span>Send reminder</span>
                    <span>Download PDF</span>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* What the extension adds to a page while Sloth drives it. */}
      <div className={`agent-glow ${s.lock === "agent" ? "is-on" : ""}`} aria-hidden />
      <LockPill mode={s.lock} />
    </div>
  );
}
