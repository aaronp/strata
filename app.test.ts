// Drives the app's logic class (design/strata.dc.html) with React/DOM stubbed out and fetch wired to the real dev-server handler.
import { test, expect, beforeEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler } from "./server";
import { Window } from "happy-dom";

const js = (await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text()).split('<script type="text/x-dc" data-dc-script>')[1].split("</script>")[0];
class DCLogic { state: any; setState(u: any, cb?: () => void) { this.state = { ...this.state, ...(typeof u === "function" ? u(this.state) : u) }; cb?.(); } forceUpdate() {} }
// Like React: setState calls in one tick are applied together, then componentDidUpdate, then their callbacks.
class DCLogicBatched { state: any; _q: any[] = []; _cbs: any[] = [];
  setState(u: any, cb?: () => void) { this._q.push(u); if (cb) this._cbs.push(cb); if (this._q.length === 1) queueMicrotask(() => this._flush()); }
  _flush() { const q = this._q.splice(0), cbs = this._cbs.splice(0); for (const u of q) this.state = { ...this.state, ...(typeof u === "function" ? u(this.state) : u) }; (this as any).componentDidUpdate?.(); cbs.forEach(f => f()); }
  forceUpdate() {} }

let root: string;
// Components from earlier tests keep timers (autosave); stop them writing into the next test's deck folder.
const mounted: any[] = [];
beforeEach(async () => { for (const m of mounted.splice(0)) { clearTimeout(m._as); m._loaded = false; } root = await mkdtemp(join(tmpdir(), "strata-app-")); });

const until = async (ok: () => boolean, ms = 3000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting for the app"); await Bun.sleep(5); } };

async function mount(search: string, opts: { batched?: boolean; isStatic?: boolean; settle?: boolean; deckMode?: boolean; fetch?: (u: string) => Response | undefined; store?: Record<string, string> } = {}) {
  opts = { deckMode: /(deck=[a-z0-9-]+|src=)/.test(search), ...opts };
  const store: Record<string, string> = opts.store ?? {}, listeners: Record<string, Function> = {};
  const g = {
    location: { search }, window: { StrataMd: await import("./markdown"), STRATA_STATIC: !!opts.isStatic, addEventListener: (t: string, f: Function) => (listeners[t] = f), removeEventListener() {} },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] },
    fetch: async (u: string, o: RequestInit = {}) => opts.fetch?.(u) ?? handler(root)(new Request(new URL(u, "http://x/design/strata.dc.html"), o)),
    setTimeout, requestAnimationFrame: () => {},
  };
  const C = new Function("DCLogic", "React", ...Object.keys(g), js + "\nreturn Component;")(opts.batched ? DCLogicBatched : DCLogic, { createRef: () => ({ current: null }) }, ...Object.values(g));
  const c = new C(); mounted.push(c); c.componentDidMount();
  // Wait for the deck load (and a new deck's first save) to finish rather than sleeping a fixed time.
  if (opts.settle !== false) await until(() => (!!c._loaded || !!c.state.saveMsg || !opts.deckMode) && !c.state.saving);
  return { c, listeners, win: g.window as any, store };
}

// ---- markdown + layout file decks ----
const deckDir = (slug: string) => join(root, `decks/${slug}/`);
const writeMd = async (slug: string, md: string, layout?: any) => {
  await Bun.write(deckDir(slug) + slug + ".md", md);
  if (layout !== undefined) await Bun.write(deckDir(slug) + slug + "-layout.json", typeof layout === "string" ? layout : JSON.stringify(layout));
};
const TALK = "# Intro\nslug: intro\n\nHello there.\n\n## Detail\nslug: detail\n\n# Next\nslug: next\n";
const layerOf = (c: any, id: string, lid: string) => c.layersOf(id).find((l: any) => l.id === lid);
const nudge = (c: any, id: string, lid: string, dx: number) => { c.setLayers(id, (ls: any[]) => ls.map(l => l.id === lid ? { ...l, x: l.x + dx } : l)); c.componentDidUpdate(); };
const reply = (body: string, type: string, status = 200) => new Response(body, { status, headers: { "content-type": type } });

test("app: loads deck markdown and layout", async () => {
  await writeMd("talk", TALK, { version: 1, deck: { bg: "space", styles: { h1: { size: 80 } } },
    slides: { intro: { custom: true, frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", block: "title", x: 1, y: 2, w: 50, h: 10 }, { id: "x1", type: "shape", x: 0, y: 0, w: 5, h: 5 }] }] } } });
  const { c } = await mount("?deck=talk");
  expect(c.state.md).toBe(TALK);
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "next"]);
  expect(c.state.nodes.intro.children).toEqual(["detail"]);
  expect(c.state.bg).toBe("space"); expect(c.state.styles).toEqual({ h1: { size: 80 } });
  expect(layerOf(c, "intro", "md-title")).toMatchObject({ x: 1, y: 2, text: "Intro" });
  expect(layerOf(c, "intro", "x1")).toBeDefined();
  expect(layerOf(c, "next", "md-title").text).toBe("Next");
  expect(c.isDirty()).toBe(false); expect(c._past.length).toBe(0);
});

test("app: typing markdown updates slides after 200ms and is not an undo step", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  const n = c._past.length;
  c.setMd(TALK + "\n# Last\nslug: last\n"); c.componentDidUpdate();
  expect(c.state.nodes.last).toBeUndefined();
  await Bun.sleep(250); c.componentDidUpdate();
  expect(c.state.nodes.last.title).toBe("Last");
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "next", "last"]);
  expect(c._past.length).toBe(n);
});

test("app: layout edit then undo keeps current markdown", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "intro" });
  const x0 = layerOf(c, "intro", "md-body-1").x;
  nudge(c, "intro", "md-body-1", 10);
  expect(c.state.nodes.intro.custom).toBe(true);
  c.setMd(TALK.replace("Hello there.", "Changed.")); c.reenrich(); c.componentDidUpdate();
  expect(layerOf(c, "intro", "md-body-1")).toMatchObject({ x: x0 + 10, text: "Changed." });
  c.undo(); c.componentDidUpdate();
  expect(layerOf(c, "intro", "md-body-1")).toMatchObject({ x: x0, text: "Changed." });
  expect(c.state.md).toContain("Changed.");
});

test("app: save writes md and layout", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk");
  const md = TALK + "\n# Last\nslug: last\n";
  c.setMd(md); c.reenrich(); c.componentDidUpdate();
  nudge(c, "intro", "md-body-1", 10);
  c.setState({ bg: "space", images: { ...c.state.images, im1: "data:image/png;base64," + Buffer.from("png").toString("base64") } });
  await c.save();
  expect(await Bun.file(deckDir("talk") + "talk.md").text()).toBe(md);
  const L = await Bun.file(deckDir("talk") + "talk-layout.json").json();
  expect(L.deck.bg).toBe("space"); expect(L.deck.images.im1).toMatch(/^img\/[0-9a-f]{12}\.png$/);
  expect(L.slides.intro.custom).toBe(true); expect(L.slides.next).toBeUndefined();
  expect(c.state.images.im1).toMatch(/^\.\.\/decks\/talk\/img\/[0-9a-f]{12}\.png$/);
  expect(c.isDirty()).toBe(false);
});

test("app: src loads https url", async () => {
  const files: Record<string, Response> = { "https://x/a.md": reply("# Remote\nslug: r\n\n![pic](img/p.png)\n", "text/markdown"),
    "https://x/a-layout.json": reply(JSON.stringify({ version: 1, deck: { bg: "space", images: { im1: "img/a.png", im2: "data:image/png;base64,AA" }, customBg: "img/bg.jpg" }, slides: {} }), "application/json") };
  const { c } = await mount("?src=https://x/a.md", { fetch: u => files[u] });
  expect(c.state.saveMsg).toBeFalsy();
  expect(c.state.nodes.r.title).toBe("Remote"); expect(c.state.bg).toBe("space");
  expect(c.state.images["md:https://x/img/p.png"]).toBe("https://x/img/p.png");   // relative to the markdown file
  expect(c.state.images.im1).toBe("https://x/img/a.png"); expect(c.state.images.im2).toBe("data:image/png;base64,AA"); expect(c.state.customBg).toBe("https://x/img/bg.jpg");   // layout file paths too
});

test("app: src returns html", async () => {
  const { c } = await mount("?src=https://x/a.md", { fetch: u => u.startsWith("https://") ? reply("<!DOCTYPE html><html></html>", "text/plain") : undefined });
  expect(c.state.saveMsg).toBe("Can't load https://x/a.md: not a markdown file");
  const { c: c2 } = await mount("?src=https://x/a.md", { fetch: u => u.startsWith("https://") ? reply("# Hi", "text/html; charset=utf-8") : undefined });
  expect(c2.state.saveMsg).toBe("Can't load https://x/a.md: not a markdown file");
});

test("app: empty markdown", async () => {
  await writeMd("talk", "Just words, no heading.\n");
  const { c } = await mount("?deck=talk");
  expect(c.state.nodes.ROOT.children).toEqual([]);
  const v = c.renderVals();
  expect(v.emptyMsg).toBe("Add a # heading to make a slide");
  c.setMd(TALK); c.reenrich();
  expect(c.renderVals().emptyMsg).toBe("");
});

test("app: current slide removed by edit", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "detail" }); c.componentDidUpdate(); const n = c._past.length;
  c.setMd(TALK.replace("## Detail\nslug: detail\n", "")); c.reenrich(); c.componentDidUpdate();
  expect(c.state.cur).toBe("intro");
  c.setMd("# \n\n# Next\nslug: next\n"); c.reenrich(); c.componentDidUpdate();
  expect(c.state.cur).toBe("next");
  expect(() => c.renderVals()).not.toThrow();
  expect(c._past.length).toBe(n);
});

test("app: bad layout file", async () => {
  await writeMd("talk", TALK, "{ nope");
  let msg = ""; try { JSON.parse("{ nope"); } catch (e: any) { msg = e.message; }
  const { c } = await mount("?deck=talk");
  expect(c.state.note).toBe("Layout file ignored: " + msg);
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "next"]);
  await writeMd("talk2", TALK);
  const { c: c2 } = await mount("?deck=talk2");
  expect(c2.state.note).toBeFalsy(); expect(c2.state.saveMsg).toBeFalsy();
});

test("new deck saves, reloads clean, keeps relative image paths", async () => {
  let { c } = await mount("?deck=talk");
  expect(c.isDirty()).toBe(false);                     // saved on open
  c.setState({ images: { im1: "data:image/png;base64," + Buffer.from("png").toString("base64") } });
  await c.save();
  expect(c.isDirty()).toBe(false);
  ({ c } = await mount("?deck=talk"));
  expect(c.isDirty()).toBe(false);
  expect(c._past.length).toBe(0);
  expect(c.state.images.im1).toMatch(/^\.\.\/decks\/talk\/img\/[0-9a-f]{12}\.png$/);
});

test("save refuses to overwrite a deck that failed to load", async () => {
  await writeMd("talk", "<!doctype html>\n# not markdown");
  const { c } = await mount("?deck=talk");
  expect(c.state.saveMsg).toBe('Could not load deck "talk": not a markdown file');
  await c.save();
  expect(await Bun.file(deckDir("talk") + "talk.md").text()).toStartWith("<!doctype html>");
  expect(c.state.saveMsg).toContain("Could not load");
});

test("save before the load finishes is a no-op", async () => {
  await writeMd("talk", "# Real\n");
  const { c } = await mount("?deck=talk", { settle: false });
  await c.save();
  await Bun.sleep(30);
  expect(await Bun.file(deckDir("talk") + "talk.md").text()).toBe("# Real\n");
});

test("leaving the page with unsaved deck edits asks first", async () => {
  const { c, listeners } = await mount("?deck=talk");
  c.setMd("# Edited\n");
  const ev = { prevented: false, preventDefault() { this.prevented = true; }, returnValue: undefined as any };
  listeners.beforeunload(ev);
  expect(ev.prevented).toBe(true);
  await c.save();
  const ev2 = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners.beforeunload(ev2);
  expect(ev2.prevented).toBe(false);
});

test("static mode presents and never saves", async () => {
  await writeMd("talk", "# Real\n");
  const { c } = await mount("?deck=talk", { isStatic: true });
  expect(c.state.mode).toBe("present");
  c.setMd("# Changed\n"); c.componentDidUpdate();
  await c.save(); await Bun.sleep(1000);
  expect(await Bun.file(deckDir("talk") + "talk.md").text()).toBe("# Real\n");
});

test("header logo links home to the deck list", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html.split("<header")[1].split("</header>")[0]).toMatch(/<a href="\.\.\/" title="← All decks"/);
});

const onDisk = () => Bun.file(deckDir("talk") + "talk-layout.json").json(), mdOnDisk = () => Bun.file(deckDir("talk") + "talk.md").text();

test("a new deck is written to disk as soon as it opens", async () => {
  await mount("?deck=talk");
  expect(await mdOnDisk()).toBe("# Talk\n");
  expect((await onDisk()).slides.ROOT).toBeDefined();
});

test("edits autosave after a pause, without pressing save", async () => {
  const { c } = await mount("?deck=talk");
  c.setMd("# Edited\n"); c.componentDidUpdate();
  expect(await mdOnDisk()).toBe("# Talk\n");   // debounced, not immediate
  await Bun.sleep(1200);
  expect(await mdOnDisk()).toBe("# Edited\n");
  expect(c.isDirty()).toBe(false);
});

const slideNode = (id: string, title: string, children: string[] = [], extra: object = {}) => ({ id, title, body: "", children, ...extra });
// A node tree as a markdown deck: headings with slug lines and bodies; slides with layers become overrides; extra is deck fields.
const writeDeck = (slug: string, nodes: Record<string, any>, extra: object = {}) => {
  let md = ""; const slides: Record<string, any> = { ROOT: nodes.ROOT };
  const walk = (id: string, d: number) => { for (const k of nodes[id].children) {
    const { id: _i, title, body, children: _c, layers, ...rest } = nodes[k], frames = rest.frames || (layers && [{ id: "f0-" + k, layers }]);
    md += `${"#".repeat(d)} ${title || k}\nslug: ${k}\n\n${body ? body + "\n\n" : ""}`;
    if (frames) slides[k] = { ...rest, frames, custom: true };
    walk(k, d + 1); } };
  walk("ROOT", 1);
  return writeMd(slug, md, { version: 1, deck: { images: {}, customBg: null, ...extra }, slides });
};
const deckTalk = (t: object = {}) => writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t"]), t: slideNode("t", "Intro", [], t) });

test("a new deck starts with one blank slide named after its slug", async () => {
  const { c } = await mount("?deck=my-talk");
  expect(await Bun.file(deckDir("my-talk") + "my-talk.md").text()).toBe("# My talk\n");
  expect(c.state.nodes.ROOT.children.length).toBe(1);
  expect(c.state.nodes[c.state.nodes.ROOT.children[0]]).toMatchObject({ title: "My talk", children: [] });
});

test("the deck's readability card is saved", async () => {
  const { c } = await mount("?deck=talk");
  c.setState({ card: { mode: "slide", color: "#ffffff", opacity: 0.6, blur: 10 } }); await c.save();
  expect((await onDisk()).deck.card).toEqual({ mode: "slide", color: "#ffffff", opacity: 0.6, blur: 10 });
});

test("every Layers render gets the deck card, and the card controls exist", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const imports = html.match(/<dc-import name="Layers"[^>]*>/g)!;
  expect(imports.every(t => t.includes('card="{{ deckCard }}"'))).toBe(true);
  expect(html).toContain('<sc-for list="{{ cardModes }}"');
  expect(html).toContain('<sc-for list="{{ boxFields }}"');
});

test("the editor measures grown text boxes so the selection outline matches", async () => {
  const { c } = await mount("?deck=talk");
  const el = (lid: string, px: number) => ({ dataset: { lid }, firstElementChild: { offsetHeight: px } });
  let els = [el("a", 300), el("b", 50)];
  c.stageRef.current = { clientHeight: 500, querySelectorAll: (q: string) => (q === '[data-stage="main"] [data-lid]' ? els : []) };
  expect(c.measureStage()).toBe(true);
  expect(c._mh).toEqual({ a: 60, b: 10 });
  expect(c.measureStage()).toBe(false);          // unchanged → no re-render loop
  els = [el("a", 250)];
  expect(c.measureStage()).toBe(true);
  expect(c._mh).toEqual({ a: 50 });
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('data-stage="main"');
});

// ---- multi-select ----
const L3 = [
  { id: "p", type: "shape", x: 0, y: 0, w: 10, h: 10 },
  { id: "q", type: "shape", x: 20, y: 20, w: 10, h: 10 },
  { id: "r", type: "shape", x: 70, y: 70, w: 10, h: 10 },
];
async function multiDeck() {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a"]), a: slideNode("a", "A", [], { frames: [{ id: "f1", layers: L3 }] }) });
  const { c } = await mount("?deck=talk");
  c.setState({ cur: "a" });
  return c;
}
const geo = (c: any) => Object.fromEntries(c.layersOf("a").map((l: any) => [l.id, [l.x, l.y, l.w, l.h]]));
const key = (c: any, k: string, mods: object = {}) => c.onKey({ key: k, target: {}, preventDefault() {}, ...mods });

test("shift/cmd-click toggles layers in and out of the selection", async () => {
  const c = await multiDeck();
  c.setSelection(["p"]); c.selectToggle("q");
  expect(c.selIds()).toEqual(["p", "q"]);
  c.selectToggle("p");
  expect(c.selIds()).toEqual(["q"]);
  c.setState({ layerSel: null });             // any path that clears layerSel clears the whole selection
  expect(c.selIds()).toEqual([]);
});

test("the selection rectangle picks every layer it touches", async () => {
  const c = await multiDeck();
  expect(c.marqueeHits({ x: 5, y: 5, w: 16, h: 16 })).toEqual(["p", "q", "md-title"]);   // the heading's block too
  expect(c.marqueeHits({ x: 40, y: 40, w: 5, h: 5 })).toEqual([]);
});

test("group move, nudge, delete and duplicate act on the whole selection; move is one undo step", async () => {
  const c = await multiDeck();
  await Bun.sleep(150);                       // history starts recording after load
  c.setSelection(["p", "q"]);
  c.moveSel(5, 5); c.componentDidUpdate();
  expect(geo(c)).toMatchObject({ p: [5, 5, 10, 10], q: [25, 25, 10, 10], r: [70, 70, 10, 10] });
  c.undo(); c.componentDidUpdate();
  expect(geo(c)).toMatchObject({ p: [0, 0, 10, 10], q: [20, 20, 10, 10] });
  c.setSelection(["p", "q"]);
  key(c, "ArrowRight", { shiftKey: true });
  expect(geo(c).p[0]).toBe(5);
  key(c, "d", { metaKey: true });
  expect(c.layersOf("a").length).toBe(6);    // p q r, the heading, two copies
  expect(c.selIds().length).toBe(2);
  expect(c.selIds()).not.toContain("p");      // the copies are selected
  key(c, "Backspace");
  expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["p", "q", "r", "md-title"]);
  key(c, "a", { metaKey: true });
  expect(c.selIds()).toEqual(["p", "q", "r", "md-title"]);
});

test("resizing the group box scales every selected layer within it", async () => {
  const c = await multiDeck();
  c.setSelection(["p", "q"]);
  const orig = c.layersOf("a").filter((l: any) => ["p", "q"].includes(l.id));
  c.resizeGroup("a", orig, { x: 0, y: 0, w: 30, h: 30 }, "se", 30, 30, false);
  expect(geo(c)).toMatchObject({ p: [0, 0, 20, 20], q: [40, 40, 20, 20], r: [70, 70, 10, 10] });
  c.resizeGroup("a", orig, { x: 0, y: 0, w: 30, h: 30 }, "nw", 15, 0, true);   // keep proportions
  expect(geo(c)).toMatchObject({ p: [15, 15, 5, 5], q: [25, 25, 5, 5] });
});

test("stage template has the group box handles and the selection rectangle", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-for list="{{ grpHandles }}"');
  expect(html).toContain('<sc-if value="{{ hasMarquee }}">');
});

test("text layers have an always-available, collapsible Container section", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-if value="{{ sec.box.open }}">');
  expect(html).toContain('<sc-for list="{{ boxModes }}"');
  expect(html).not.toContain("{{ lyBoxCustom }}");
  expect(html).not.toContain("label: 'Box'");
});

// ---- slide tree: collapse + drag to move ----
async function treeDeck(extra: Record<string, any> = {}) {
  await writeDeck("talk", {
    ROOT: slideNode("ROOT", "", ["a", "b"]),
    a: slideNode("a", "A", ["a1", "a2"]), a1: slideNode("a1", "A1", ["a1x"]), a1x: slideNode("a1x", "A1x"), a2: slideNode("a2", "A2"),
    b: slideNode("b", "B"), ...extra,
  });
  const { c } = await mount("?deck=talk");
  return c;
}
const kids = (c: any, id: string) => c.state.nodes[id].children;

test("collapsing a slide hides its subtree, except the path to the current slide", async () => {
  const c = await treeDeck();
  c.setState({ cur: "b", collapsed: { a: true } });
  expect(c.treeVisible().vis).toEqual(["a", "b"]);
  c.setState({ cur: "a1x" });
  expect(c.treeVisible().vis).toEqual(["a", "a1", "a1x", "a2", "b"]);
  c.setState({ cur: "a" });                                   // on the collapsed slide itself: children stay hidden
  expect(c.treeVisible().vis).toEqual(["a", "b"]);
  c.toggleCollapse("a");
  expect(c.state.collapsed.a).toBe(false);
});

test("tree template has collapse toggles", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-if value="{{ n.hasKids }}">');
});



// ---- delete dialog ----
test("every {{ name }} the app template uses is provided by renderVals", async () => {
  const { c } = await mount("?deck=talk");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const tpl = html.split("<x-dc>")[1].split("</x-dc>")[0];
  const loopVars = new Set([...tpl.matchAll(/\bas="(\w+)"/g)].map(m => m[1]));
  const heads = new Set([...tpl.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]).filter(h => !loopVars.has(h)));
  const vals = c.renderVals();
  // Defined only while the frame-transition view is open (all inside <sc-if isTransView>), plus the literal {{ true }}.
  const onlyInTransView = new Set(["actRows", "allT", "closeTrans", "hasActRows", "noActRows", "previewTrans", "transLayerTitle", "transLeftLabel", "transRightLabel", "transTitle", "true"]);
  expect([...heads].filter(h => !(h in vals) && !onlyInTransView.has(h)).sort()).toEqual([]);
});

// ---- background scale / repeat / vertical position ----
test("background tiles: scale, repeat (across / tile / once) and vertical position", async () => {
  const { c } = await mount("?deck=talk");
  const B = { src: "x.svg", aspect: 2 };
  const T = (o: object) => { Object.assign(c.state, { bgScale: 1, bgRepeat: "x", bgY: 0, offset: 0 }, o); return c.bgTileRects(500, B).map((t: any) => [+t.l, +t.t, +(t.w - 0.05).toFixed(3), +(t.h - 0.05).toFixed(3)]); };
  expect(T({})).toEqual([[0, 0, 40, 100], [40, 0, 40, 100], [80, 0, 40, 100]]);            // today's behaviour
  expect(T({ bgScale: 0.5, bgY: 1 })).toEqual([0, 20, 40, 60, 80].map(l => [l, 50, 20, 50])); // half height, at the bottom
  expect(T({ bgScale: 0.5, bgRepeat: "xy" }).length).toBe(10);                                 // 2 rows × 5
  expect(T({ bgRepeat: "none", offset: 0.25 })).toEqual([[-10, 0, 40, 100]]);
  expect(c.bgTileRects(500, { src: null, aspect: 1 })).toEqual([]);
});

test("background scale, repeat and vertical position are saved with the deck", async () => {
  const { c } = await mount("?deck=talk");
  c.setState({ bgScale: 0.5, bgRepeat: "xy", bgY: 0.3 }); await c.save();
  expect((await onDisk()).deck).toMatchObject({ bgScale: 0.5, bgRepeat: "xy", bgY: 0.3 });
});

test("Background tab and image layer settings have the new controls", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-for list="{{ bgRepeatBtns }}"');
  expect(html).toContain('onChange="{{ onBgScale }}"');
  expect(html).toContain('onChange="{{ onBgY }}"');
  expect(html).toContain('<sc-for list="{{ imgFields }}"');
  expect(html).toMatch(/top:\{\{ tl\.t \}\}%;height:\{\{ tl\.h \}\}%/);
});

// ---- nav tree: focus filter + zoom ----
test("Focus shows only the path of parents, the current slide's siblings, and its children", async () => {
  const c = await treeDeck();
  c.setState({ treeFocus: true, cur: "b" });
  expect(c.treeVisible().vis).toEqual(["a", "b"]);
  c.setState({ cur: "a1" });
  expect(c.treeVisible().vis).toEqual(["a", "a1", "a1x", "a2"]);
  c.setState({ cur: "a1x" });
  expect(c.treeVisible().vis).toEqual(["a", "a1", "a1x"]);
  c.setState({ cur: "a1", collapsed: { a1: true } });             // collapse still applies to the current slide's children
  expect(c.treeVisible().vis).toEqual(["a", "a1", "a2"]);
  c.setState({ treeFocus: false, collapsed: {} });
  expect(c.treeVisible().vis).toEqual(["a", "a1", "a1x", "a2", "b"]);
});

test("tree zoom: steps, limits and fit-to-width", async () => {
  const c = await treeDeck();
  c.treeZoomStep(1); expect(c.state.treeZoom).toBe(1.25);
  c.treeZoomStep(-1); c.treeZoomStep(-1); expect(c.state.treeZoom).toBe(0.8);
  c.setTreeZoom(9); expect(c.state.treeZoom).toBe(1.5);
  c.setTreeZoom(0.01); expect(c.state.treeZoom).toBe(0.3);
  c._treeW = 1000; c.treeRef.current = { clientWidth: 408 };
  c.treeZoomFit(); expect(c.state.treeZoom).toBe(0.4);
});

test("tree panel has zoom controls, a zoom wrapper and the Focus toggle", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const s of ['onClick="{{ treeZoomIn }}"', 'onClick="{{ treeZoomOut }}"', 'onClick="{{ treeZoomFit }}"', 'onClick="{{ toggleFocus }}"', "transform:scale({{ treeZoom }});transform-origin:0 0"])
    expect(html).toContain(s);
});

// ---- component layers: protocol ----
async function compDeck() {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a", "b"]),
    a: slideNode("a", "Alpha", [], { frames: [{ id: "f1", layers: [{ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, code: "" }] }, { id: "f2", layers: [{ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, code: "" }] }] }),
    b: slideNode("b", "Beta") });
  const { c, listeners } = await mount("?deck=talk");
  const win: any = { posted: [] as any[], postMessage(m: any) { this.posted.push(m); } };
  c.stageRef.current = { clientHeight: 0, querySelectorAll: (q: string) => q === '[data-stage="main"] iframe[data-lid]' ? [{ dataset: { lid: "c1" }, contentWindow: win }] : [] };
  const send = (data: object, source: any = win) => listeners.message({ source, data: { strata: 1, ...data } });
  return { c, win, send };
}

test("hello is answered with enter (frame, frames, mode, slide); frame changes are posted", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "hello" });
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "enter", frame: 0, frames: 2, mode: "build", slide: { id: "a", title: "Alpha" } });
  c.componentDidUpdate();                                  // React runs an update after the load; the stub harness doesn't
  c.setState({ nodes: { ...c.state.nodes, a: { ...c.state.nodes.a, ftrans: { f1: { c1: { move: { dur: 900, delay: 100 }, fade: { dur: 300 } } } } } } });
  c.setState({ fi: 1 }); c.componentDidUpdate();
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "frame", frame: 1, frames: 2, from: 0, duration: 1000 });
});

test("messages from anything but a main-stage component iframe are ignored", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "hello" }, { postMessage() {} });
  send({ type: "nav", dir: "right" }, {});
  expect(win.posted).toEqual([]);
  expect(c.state.cur).toBe("a");
});

test("Present: a claiming component gets → as next; done advances, ack doesn't; an unacknowledged press is bypassed", async () => {
  const { c, win, send } = await compDeck();
  c.setState({ mode: "present" });
  send({ type: "ready", steps: true });
  key(c, "ArrowRight");
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "next" });
  expect(c.fiFor("a")).toBe(0);
  send({ type: "ack" });
  key(c, "ArrowRight");                                   // acknowledged → forwarded again
  expect(win.posted.filter((m: any) => m.type === "next").length).toBe(2);
  send({ type: "done" });                                 // component finished → deck moves (next frame)
  expect(c.fiFor("a")).toBe(1);
  key(c, "ArrowRight");                                   // forwarded, never acknowledged…
  key(c, "ArrowRight");                                   // …so this one bypasses the component
  expect(c.state.cur).toBe("b");
});

test("Present: ← and Shift+Space go to the component as prev; back moves the deck back", async () => {
  const { c, win, send } = await compDeck();
  c.setState({ mode: "present", fi: 1 });
  send({ type: "ready", steps: true });
  key(c, " ", { shiftKey: true });
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "prev" });
  send({ type: "back" });
  expect(c.fiFor("a")).toBe(0);
});

test("keys are never routed in build mode, and claims end when the slide changes", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "ready", steps: true });
  key(c, "ArrowRight");
  expect(win.posted.filter((m: any) => m.type === "next")).toEqual([]);
  c.setState({ mode: "present", cur: "b" }); c.componentDidUpdate();
  expect(c.claimer()).toBeNull();
});

test("component-initiated navigation: done without a pending key, jumpTo by id or title, nav, unknown slug", async () => {
  const { c, send } = await compDeck();
  c.setState({ mode: "present" });                         // while editing, navigation needs Interact (tested separately)
  send({ type: "jumpTo", slug: "beta" });
  expect(c.state.cur).toBe("b");
  c.setState({ cur: "a" });
  send({ type: "jumpTo", slug: "b" });
  expect(c.state.cur).toBe("b");
  c.setState({ cur: "a", fi: 0 });
  send({ type: "done" });
  expect(c.fiFor("a")).toBe(1);
  send({ type: "nav", dir: "right" });
  expect(c.state.cur).toBe("b");
  send({ type: "jumpTo", slug: "nowhere" });
  expect(c.state.note).toContain('"nowhere"');
});

test("component errors are kept per layer", async () => {
  const { c, send } = await compDeck();
  send({ type: "error", message: "x is not defined", line: 4 });
  expect(c.state.compErr).toEqual({ c1: "x is not defined (line 4)" });
});

test("+ Component adds a working default; Apply writes the draft, Revert discards it; errors show; Interact frees the overlay", async () => {
  const { c, send } = await compDeck();
  c.addLayer("component");
  const l = () => c.layersOf("a").find((x: any) => x.id === c.state.layerSel);
  expect(l()).toMatchObject({ type: "component", name: "Component" });
  expect(l().code).toContain("strata.ready({ steps: true })");
  expect(c.renderVals().addBtns.map((b: any) => b.label)).toContain("+ Component");
  let v = c.renderVals();
  expect(v.lyIsComponent).toBe(true);
  v.onCompCode({ target: { value: "<p>new</p>" } }); v = c.renderVals();
  expect(v.compDirty).toBe(true);
  expect(l().code).not.toBe("<p>new</p>");
  v.onCompRevert(); v = c.renderVals();
  expect(v.compCode).toBe(l().code);
  v.onCompCode({ target: { value: "<p>new</p>" } }); c.renderVals().onCompApply();
  expect(l().code).toBe("<p>new</p>");
  c.setState({ compErr: { [c.state.layerSel]: "boom (line 1)" } });
  expect(c.renderVals().compErrText).toBe("boom (line 1)");
  c.renderVals().onCompInteract();
  expect(c.renderVals().overlays.find((o: any) => o.selected).pe).toBe("none");
});

test("the layers list and template know about components", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const s of ['<sc-if value="{{ lyIsComponent }}">', 'onClick="{{ onCompApply }}"', 'onClick="{{ onCopyCompGuide }}"', 'pointer-events:{{ o.pe }}', 'live="{{ cur }}"'])
    expect(html).toContain(s);
});

// ---- component review fixes ----
test("Apply and Name write to every frame of the slide, so stepping frames never reloads with old code", async () => {
  const { c } = await compDeck();
  c.setState({ layerSel: "c1" });
  const v = c.renderVals(); v.onCompCode({ target: { value: "<p>new</p>" } }); c.renderVals().onCompApply(); c.renderVals().onCompName({ target: { value: "Clock" } });
  expect(c.framesOf("a").map((f: any) => [f.layers[0].code, f.layers[0].name])).toEqual([["<p>new</p>", "Clock"], ["<p>new</p>", "Clock"]]);
});

test("a claim made before hello survives it (the helper replays ready)", async () => {
  const { c, win, send } = await compDeck();
  c.setState({ mode: "present" });
  send({ type: "ready", steps: true }); send({ type: "hello" }); send({ type: "ready", steps: true });
  key(c, "ArrowRight");
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "next" });
});

test("keys pressed inside a component reach the deck in Present", async () => {
  const { c, send } = await compDeck();
  c.setState({ mode: "present" });
  send({ type: "key", key: "ArrowRight", shiftKey: false });
  expect(c.fiFor("a")).toBe(1);
});

test("while editing, a component can't navigate unless Interact is on for it", async () => {
  const { c, send } = await compDeck();
  send({ type: "done" });
  expect(c.state.cur).toBe("a");
  expect(c.fiFor("a")).toBe(0);
  expect(c.state.note).toContain("Interact");
  c.setState({ interact: "c1", layerSel: "c1" });
  send({ type: "jumpTo", slug: "b" });
  expect(c.state.cur).toBe("b");
});

test("a hidden component can't claim the keys", async () => {
  const { c, send } = await compDeck();
  c.setState({ nodes: { ...c.state.nodes, a: { ...c.state.nodes.a, frames: c.state.nodes.a.frames.map((f: any) => ({ ...f, layers: f.layers.map((l: any) => ({ ...l, hidden: true })) })) } } });
  send({ type: "ready", steps: true });
  expect(c.claimer()).toBeNull();
});

test("a repeated error doesn't re-render; Interact only applies while the component is selected; unapplied changes are shown", async () => {
  const { c, send } = await compDeck();
  send({ type: "error", message: "x", line: 1 }); const e1 = c.state.compErr;
  send({ type: "error", message: "x", line: 1 });
  expect(c.state.compErr).toBe(e1);
  c.setState({ interact: "c1", layerSel: "c1" });
  expect(c.renderVals().overlays[0].pe).toBe("none");
  c.setState({ layerSel: null });
  expect(c.renderVals().overlays[0].pe).toBe("auto");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-if value="{{ compDirty }}">');
  expect((html.match(/cards="true"/g) || []).length).toBe(4);   // tree, layout previews, frame strip, present tree view
});

test("regression: every tree node carries its selection, thumbnail framing and layers", async () => {
  const c = await treeDeck();
  const n = c.renderVals().treeNodes.find((t: any) => t.title === "A");
  expect(n).toMatchObject({ selected: true, outline: "2px solid #d9432b", full: "A" });
  expect(typeof n.cam).toBe("string");
  expect(Array.isArray(n.layers)).toBe(true);
});

test("collapsing a parent of the current slide selects that parent, so the collapse takes effect", async () => {
  const c = await treeDeck();
  c.setState({ cur: "a1x" });
  c.toggleCollapse("a");
  expect(c.state.cur).toBe("a");
  expect(c.treeVisible().vis).toEqual(["a", "b"]);
  c.toggleCollapse("a");                                     // expanding leaves the selection alone
  expect(c.state.cur).toBe("a");
  expect(c.treeVisible().vis).toEqual(["a", "a1", "a1x", "a2", "b"]);
});

// ---- title page (ROOT as an opt-in slide) ----
async function titleDeck(fields: object = { titlePage: true }) {
  await writeDeck("talk", {
    ROOT: slideNode("ROOT", "Big picture", ["a", "b"]),
    a: slideNode("a", "A", ["a1", "a2"]), a1: slideNode("a1", "A1"), a2: slideNode("a2", "A2"), b: slideNode("b", "B"),
  }, fields);
  return (await mount("?deck=talk")).c;
}

test("title page off: ROOT is unreachable and up from the top row goes nowhere", async () => {
  const c = await titleDeck({});
  expect(c.state.cur).toBe("a");
  expect(c.neighbour("a", "up", c.derive())).toBeNull();
  c.nav("ROOT", "jump"); expect(c.state.cur).toBe("a");
  c.setState({ cur: "ROOT" }); expect(c.curId()).toBe("a");
});

test("title page on: the deck opens on ROOT; up/down link it to the top row with a zoom transition", async () => {
  const c = await titleDeck();
  expect(c.state.cur).toBe("ROOT"); expect(c.curId()).toBe("ROOT");
  const D = c.derive();
  for (const d of ["left", "right", "up"]) expect(c.neighbour("ROOT", d, D)).toBeNull();
  expect(c.neighbour("ROOT", "down", D)).toBe("a");
  c.go("down"); expect(c.state.cur).toBe("a"); expect(c.state.type).toBe("zoom");
  c.go("right"); expect(c.state.cur).toBe("b"); expect(c.state.type).toBe("swipe");
  c.go("up"); expect(c.state.cur).toBe("ROOT"); expect(c.state.type).toBe("zoom");
  c.go("down"); expect(c.state.cur).toBe("b");                 // back to the last-visited top-level slide
  expect(c.derive().order).not.toContain("ROOT");              // layout untouched
});

test("Space walks from ROOT into the deck; Shift+Space walks back and stops at ROOT", async () => {
  const c = await titleDeck();
  c.step(1); expect(c.state.cur).toBe("a");
  c.step(1); expect(c.state.cur).toBe("a1");
  c.step(-1); c.step(-1); expect(c.state.cur).toBe("ROOT");
  c.step(-1); expect(c.state.cur).toBe("ROOT");
});

test("turning the title page on seeds its title once and goes there; off keeps it and leaves ROOT", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a"]), a: slideNode("a", "A") }, { title: "My talk" });
  const { c } = await mount("?deck=talk");
  c.setTitlePage(true);
  expect(c.state.titlePage).toBe(true); expect(c.state.cur).toBe("ROOT"); expect(c.state.nodes.ROOT.title).toBe("My talk");
  c.setNode("ROOT", { title: "Renamed" });
  c.setTitlePage(false);
  expect(c.state.cur).toBe("a"); expect(c.state.nodes.ROOT.title).toBe("Renamed");
  c.setTitlePage(true); expect(c.state.nodes.ROOT.title).toBe("Renamed");
});

test("titlePage and titleView are saved and reloaded", async () => {
  const c = await titleDeck();
  c.setState({ titleView: { zoom: 2, x: 0.3, y: 0.6 } }); await c.save();
  const d = (await onDisk()).deck;
  expect(d.titlePage).toBe(true); expect(d.titleView).toEqual({ zoom: 2, x: 0.3, y: 0.6 });
});

test("title camera: Fit shows the whole content width letterboxed; Cover fills the height; pan clamps to the content", async () => {
  const c = await titleDeck(); c.setState({ gap: 0.12, rowGap: 0 });   // wide spacing: content wider than 16:9
  const L = c.layout(c.derive()), CW = L.CW + L.w;
  let t = c.titleCam(L, CW);
  expect(t.s).toBeCloseTo(L.w / L.CW); expect(t.tx).toBeCloseTo(0);
  expect(t.Hc).toBeLessThan(1);                                         // this deck is wider than 16:9
  expect(t.ty).toBeCloseTo((1 - t.Hc) / 2 / (100 / L.h) * 100);        // centred vertically
  expect(t.view.l).toBeCloseTo(0); expect(t.view.w).toBeCloseTo(L.CW / CW * 100);
  c.setState({ titleView: { zoom: c.titleCover(L), x: 1, y: 0.5 } }); t = c.titleCam(L, CW);
  expect(t.Hc).toBeCloseTo(1); expect(t.ty).toBeCloseTo(0);
  expect(t.view.l + t.view.w).toBeCloseTo(L.CW / CW * 100);             // panned fully right = the content's right edge
});

test("Cover never drops below Fit, even on a canvas narrower than 16:9", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "T", ["a"]), a: slideNode("a", "A") }, { titlePage: true });
  const { c } = await mount("?deck=talk");
  expect(c.titleCover(c.layout(c.derive()))).toBeGreaterThanOrEqual(1);
});

test("the stage camera frames the title page, and a zoom transition crossfades the layers", async () => {
  const c = await titleDeck();
  let v = c.renderVals();
  expect(v.curCam).toMatch(/^translate\([-\d.]+%, [-\d.]+%\) scale\(0\.\d+\)$/);
  expect(v.titleFrame.show).toBe(true);
  c.go("down"); v = c.renderVals();
  expect(v.curCam).toMatch(/ scale\(1\)$/);
  expect(v.planeB).toEqual({ t: "none", o: 0 });                        // zoom start: incoming layers transparent, not swiped
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain("transform:{{ curCam }};transform-origin:0 0");
  expect(html).toContain("transform:{{ n.cam }};transform-origin:0 0");
  expect(html).toContain("{{ titleFrame.show }}");
});

test("on the title page the crumbs show the top row with nothing current; elsewhere a ⌂ crumb leads home", async () => {
  const c = await titleDeck();
  let v = c.renderVals();
  expect(v.crumbRows.length).toBe(1);
  expect(v.crumbRows[0].steps.map((s: any) => s.full)).toEqual(["A", "B"]);
  expect(v.crumbRows[0].steps.every((s: any) => s.title === "")).toBe(true);   // nothing highlighted
  expect(v.hasDownHint).toBe(true); expect(v.curLabel).toBe("Title page");
  expect(v.hasLeft || v.hasRight).toBe(false);
  c.go("down"); v = c.renderVals();
  expect(v.crumbRows[0].steps[0].mark).toBe("⌂");
  expect(v.upTitle).toBe("Big picture");
  v.crumbRows[0].steps[0].onClick(); expect(c.state.cur).toBe("ROOT");
  const off = await titleDeck({});
  expect(off.renderVals().crumbRows[0].steps[0].mark).not.toBe("⌂");
});

test("tree: the title page sits centred above the top row, joined to it, with no collapse", async () => {
  const c = await titleDeck();
  const v = c.renderVals(), at = (t: string) => v.treeNodes.find((n: any) => n.full === t);
  const r = at("Big picture"), a = at("A"), b = at("B");
  expect(r.hasKids).toBe(false);
  expect(a.y).toBeGreaterThan(r.y); expect(r.x).toBeCloseTo((a.x + b.x) / 2);
  expect(v.treeEdges.length).toBe(4);                              // ROOT→a, ROOT→b, a→a1, a→a2
  expect(v.slideOptions[0].id).toBe("ROOT");
  expect(v.treeH).toBeGreaterThan((await titleDeck({})).renderVals().treeH);
});

test("Title view controls set zoom/Fit/Cover/pan; the Canvas tab toggles the title page", async () => {
  const c = await titleDeck();
  let v = c.renderVals();
  expect(v.isTitlePage).toBe(true); expect(v.titlePage).toBe(true);
  expect(v.tvHint).toMatch(/Pan Y/);                                   // Fit on a wide deck: letterboxed vertically
  v.onTvZoom({ target: { value: "3" } }); expect(c.state.titleView.zoom).toBe(3);
  v = c.renderVals(); v.onTvX({ target: { value: "0.2" } }); expect(c.state.titleView).toEqual({ zoom: 3, x: 0.2, y: 0.5 });
  v = c.renderVals(); v.onTvY({ target: { value: "0.7" } }); expect(c.state.titleView.y).toBe(0.7);
  v = c.renderVals(); v.tvFit(); expect(c.state.titleView.zoom).toBe(1);
  v = c.renderVals(); v.tvCover(); expect(c.state.titleView.zoom).toBeCloseTo(c.titleCover(c.layout(c.derive())));
  v = c.renderVals(); v.onTitlePage({ target: { checked: false } });
  expect(c.state.titlePage).toBe(false); expect(c.renderVals().isTitlePage).toBe(false);
});

test("toggling the title page mid frame-tween clears the tween, so render doesn't read a missing frame", async () => {
  const c = await titleDeck({});
  c.setState({ tween: { a: 0 }, transSel: 0, fprev: true });
  c.setTitlePage(true);
  expect(c.state.tween).toBeNull(); expect(c.state.fprev).toBe(false);
  expect(() => c.renderVals()).not.toThrow();
});

test("the wireframe title rect is clamped to the canvas, so all four dashed edges show at Fit", async () => {
  const c = await titleDeck();
  const f = c.renderVals().titleFrame;
  expect(+f.t).toBeGreaterThanOrEqual(0); expect(+f.t + +f.h).toBeLessThanOrEqual(100.001);
  expect(+f.l).toBeGreaterThanOrEqual(0);
});


test("countryside balloons is a Canvas backdrop and the default for new decks", async () => {
  const { c } = await mount("?deck=fresh");
  expect(c.state.bg).toBe("balloons");
  const tile = c.renderVals().bgTiles.find((b: any) => b.label === "Balloons");
  expect(tile).toBeTruthy();
  expect(c.bgInfo()).toEqual({ src: "backdrops/countryside-balloons.png", aspect: 1.5 });
  expect(await Bun.file(join(import.meta.dir, "design/backdrops/countryside-balloons.png")).exists()).toBe(true);
});

test("column step: 100% abuts slides (camera and background move in sync); below 100% overlaps them and the canvas still covers the last slide", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a", "b", "c"]), a: slideNode("a", "A"), b: slideNode("b", "B"), c: slideNode("c", "C") }, { gap: 0 });
  const { c } = await mount("?deck=talk");
  let L = c.layout(c.derive());
  expect(L.rect.a.x).toBe(0); expect(L.rect.b.x).toBeCloseTo(L.w); expect(L.CW).toBeCloseTo(3 * L.w);
  let v = c.renderVals(); expect(v.gapLabel).toBe("100% of a slide"); expect(v.gapStep).toBe(1);
  v.onGap({ target: { value: "0.5" } }); expect(c.state.gap).toBeCloseTo(-0.5);
  L = c.layout(c.derive());
  expect(L.rect.a.x).toBe(0); expect(L.rect.b.x).toBeCloseTo(L.w / 2); expect(L.CW).toBeCloseTo(L.rect.c.x + L.w);
  c.setState({ gap: 0.12 }); expect(c.renderVals().gapLabel).toBe("112% of a slide");   // existing decks keep their spacing
});

test("Even steps (default): every sibling move is one step, whatever the subtree; Fit subtrees keeps the old packing", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a", "b"]), a: slideNode("a", "A", ["a1", "a2", "a3"]), a1: slideNode("a1", "A1"), a2: slideNode("a2", "A2"), a3: slideNode("a3", "A3"),
    b: slideNode("b", "B", ["b1"]), b1: slideNode("b1", "B1") }, { gap: 0 });
  const { c } = await mount("?deck=talk");
  let L = c.layout(c.derive()); const step = L.w;
  expect(L.rect.b.x - L.rect.a.x).toBeCloseTo(step);                     // not 3 steps past a's children
  expect(L.rect.a3.x - L.rect.a.x).toBeCloseTo(2 * step); expect(L.rect.b1.x).toBeCloseTo(L.rect.b.x);
  expect(L.CW).toBeCloseTo(3 * step);                                      // the widest row (a1..a3)
  let v = c.renderVals(); expect(v.spacingBtns.map((b: any) => b.label)).toEqual(["Even steps", "Fit subtrees"]);
  v.spacingBtns[1].onClick(); expect(c.state.spacing).toBe("fit");
  L = c.layout(c.derive()); expect(L.rect.b.x - L.rect.a.x).toBeCloseTo(3 * step);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain("{{ spacingBtns }}");
});

test("Slide tab: Layout / Frames / Layers tabs, with transition defaults inside Frames", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  let v = c.renderVals();
  expect(v.stabBtns.map((b: any) => b.label)).toEqual(["Layout", "Frames", "Layers"]);
  expect([v.stabLayout, v.stabFrames, v.stabLayers]).toEqual([false, false, true]);          // Layers by default
  c.renderVals().stabBtns[1].onClick(); v = c.renderVals(); expect(v.stabFrames).toBe(true); expect(v.layerPane).toBe(false);
  c.setState({ transSel: 0 }); c.renderVals().stabBtns[2].onClick();
  expect(c.state.transSel).toBeNull(); expect(c.renderVals().stabLayers).toBe(true);           // leaving Frames closes the transition view
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const gone of ["onExportMd", "onInsertToggle", "onCopyDeck", "onSplitLines"]) expect(html).not.toContain(gone);   // export, include/copy deck and split lines are gone
  const frames = html.slice(html.indexOf('<sc-if value="{{ stabFrames }}">'), html.indexOf('<sc-if value="{{ stabLayers }}">'));
  expect(frames).toContain("Transition defaults"); expect(frames).toContain("{{ isTransView }}");
  expect(html).not.toContain("sec.insert.toggle");
});

test("row step: 100% stacks rows edge to edge and fills the canvas; below 100% overlaps", async () => {
  const tree = { ROOT: slideNode("ROOT", "", ["a"]), a: slideNode("a", "A", ["a1"]), a1: slideNode("a1", "A1", ["a2"]), a2: slideNode("a2", "A2") };
  await writeDeck("talk", tree, { rowGap: 0 });
  let { c } = await mount("?deck=talk");
  let L = c.layout(c.derive());
  expect(L.h).toBeCloseTo(100 / 3); expect(L.rect.a.y).toBeCloseTo(0); expect(L.rect.a1.y - L.rect.a.y).toBeCloseTo(L.h); expect(L.rect.a2.y + L.h).toBeCloseTo(100);
  let v = c.renderVals(); expect(v.rowStepLabel).toBe("100% of a slide");
  v.onRowStep({ target: { value: "0.5" } }); expect(c.state.rowGap).toBeCloseTo(-0.5);
  L = c.layout(c.derive());
  expect(L.h).toBeCloseTo(50); expect(L.rect.a1.y - L.rect.a.y).toBeCloseTo(25); expect(L.rect.a2.y + L.h).toBeCloseTo(100);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('value="{{ rowStep }}" onChange="{{ onRowStep }}"');
});

// ---- text styles ----
const TL = (id: string, extra: object = {}) => ({ id, type: "text", text: id, x: 5, y: 5, w: 50, h: 20, ...extra });
const styledDeck = async (extra: object = {}, layers: any[] = [TL("a", { style: "h1" }), TL("b", { style: "h1", size: 50 }), TL("c", { size: 20 })]) => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s"]), s: slideNode("s", "S", [], { frames: [{ id: "f0", layers }] }) }, extra);
  return (await mount("?deck=talk")).c;
};

test("styles resolve in order: renderer default < style < layer override; deck.styles edits built-ins; unknown style = Custom", async () => {
  const c = await styledDeck({ styles: { h1: { size: 70 }, callout: { name: "Callout", size: 28, card: "custom", box: { bg: "#ff0000" } } } });
  const S = c.styles();
  expect(Object.keys(S)).toEqual(["h1", "h2", "h3", "body", "bullets", "callout"]);
  expect(S.h1).toMatchObject({ name: "H1", size: 70, weight: 800, valign: "middle", lh: 1.05 });
  const [a, b, cc] = c.layersOf("s").map((l: any) => c.resolveLayer(l, "s"));
  expect(a).toMatchObject({ style: "h1", size: 70, weight: 800 });
  expect(b).toMatchObject({ size: 50, weight: 800 });                          // override wins
  expect(cc.size).toBe(20); expect(cc.weight).toBeUndefined();                 // Custom: untouched
  expect(c.resolveLayer(TL("z", { style: "callout" }), "s")).toMatchObject({ size: 28, card: "custom", box: { bg: "#ff0000" } });
  expect(c.resolveLayer(TL("z", { style: "gone", size: 9 }), "s")).toMatchObject({ size: 9 });
  expect(c.resolveLayer({ id: "i", type: "image", style: "h1" }, "s").size).toBeUndefined();
  expect(c.renderVals().treeNodes.find((n: any) => n.full === "S").layers[0].size).toBe(70);   // thumbnails are resolved
  expect(c.layersOf("s")[0].size).toBeUndefined();                                             // stored layers aren't
});

test("styles save only what differs from the built-ins, and round-trip", async () => {
  const c = await styledDeck();
  await c.save(); expect((await onDisk()).deck.styles).toBeUndefined();
  c.setState({ styles: { h2: { size: 48 } } }); await c.save();
  expect((await onDisk()).deck.styles).toEqual({ h2: { size: 48 } });
});

test("a size change that comes from different styles in two frames is detected and tweened", async () => {
  const c = await styledDeck({}, []);
  c.setNode("s", { frames: [{ id: "f0", layers: [TL("a", { style: "h1" })] }, { id: "f1", layers: [TL("a", { style: "body" })] }] });
  c.setState({ transSel: 0, stab: "frames" });
  expect(JSON.stringify(c.renderVals().transRows)).toContain("size");
});

test("choosing a style clears overrides; Custom writes the resolved values back; each is one undo step", async () => {
  const c = await styledDeck(); await Bun.sleep(150);
  c.chooseStyle("s", "b", "h2"); c.componentDidUpdate();
  expect(c.layersOf("s")[1]).toMatchObject({ style: "h2" }); expect(c.layersOf("s")[1].size).toBeUndefined();
  c.undo(); c.componentDidUpdate(); expect(c.layersOf("s")[1]).toMatchObject({ style: "h1", size: 50 });
  c.chooseStyle("s", "a", ""); c.componentDidUpdate();
  const a = c.layersOf("s")[0]; expect(a.style).toBeFalsy(); expect(a).toMatchObject({ size: 64, weight: 800, valign: "middle" });
});

test("This layer mode writes an override (marked, ↺ resets); Style mode edits the style for every layer using it", async () => {
  const c = await styledDeck();
  c.setState({ layerSel: "a" }); let v = c.renderVals();
  expect(v.lyStyle).toBe("h1"); expect(v.lyStyled).toBe(true); expect(v.styleOpts.map((o: any) => o.l)).toEqual(["Custom", "H1", "H2", "H3", "Body", "Bullets"]);
  const size = () => c.renderVals().textFields.find((f: any) => f.label.startsWith("Size"));   // an overridden label reads "Size •"
  size().onChange({ target: { value: "72" } });
  expect(c.layersOf("s")[0].size).toBe(72); expect(size().over).toBe(true); expect(c.renderVals().lyHasOverrides).toBe(true);
  size().onReset(); expect(c.layersOf("s")[0].size).toBeUndefined(); expect(size().over).toBe(false);
  c.renderVals().styleTargetBtns[1].onClick(); expect(c.state.styleTarget).toBe("style");
  size().onChange({ target: { value: "80" } });
  expect(c.state.styles).toEqual({ h1: { size: 80 } }); expect(c.layersOf("s")[0].size).toBeUndefined();
  expect(c.resolveLayer(c.layersOf("s")[0], "s").size).toBe(80);
  expect(c.resolveLayer(c.layersOf("s")[1], "s").size).toBe(50);              // b overrides size, so it keeps its own
  c.renderVals().textFields.find((f: any) => f.label.startsWith("Weight")).onChange({ target: { value: "600" } });
  expect(c.resolveLayer(c.layersOf("s")[1], "s").weight).toBe(600);           // b follows the style for weight
  c.setState({ styleTarget: "layer", layerSel: "b" }); c.renderVals().onClearOverrides();
  expect(c.layersOf("s")[1].size).toBeUndefined();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ styleOpts }}", "{{ styleTargetBtns }}", "{{ tf.onReset }}", "{{ onClearOverrides }}"]) expect(html).toContain(h);
});

test("+ Text creates a Body layer", async () => {
  const c = await styledDeck(); c.setState({ cur: "s" });
  c.addLayer("text"); const l = c.layersOf("s").at(-1);
  expect(l.style).toBe("body"); expect(l.size).toBeUndefined(); expect(c.resolveLayer(l, "s").size).toBe(32);
});

test("Styles section: counts, rename keeps the id, new style from a layer, delete keeps the look and goes Custom", async () => {
  const c = await styledDeck();
  let v = c.renderVals();
  expect(v.styleRows.map((r: any) => [r.id, r.name, r.count, r.canDelete])).toEqual([["h1", "H1", "3 layers", false], ["h2", "H2", "0 layers", false], ["h3", "H3", "0 layers", false], ["body", "Body", "0 layers", false], ["bullets", "Bullets", "0 layers", false]]);
  v.styleRows[0].onName({ target: { value: "Heading" } }); expect(c.styles().h1.name).toBe("Heading");
  expect(c.renderVals().newStyleOff).toBe(true);
  c.setState({ layerSel: "c" }); v = c.renderVals(); expect(v.newStyleOff).toBe(false);
  v.onNewStyle();
  expect(c.styles()["style-1"]).toMatchObject({ name: "Style 1", size: 20 });
  expect(c.layersOf("s")[2]).toMatchObject({ style: "style-1" }); expect(c.layersOf("s")[2].size).toBeUndefined();
  v = c.renderVals(); const row = v.styleRows.find((r: any) => r.id === "style-1");
  expect(row.canDelete).toBe(true); row.onDelete();
  expect(c.renderVals().styleRows.map((r: any) => r.id)).not.toContain("style-1"); expect(c.state.styles["style-1"].deleted).toBe(true);   // tombstone
  expect(c.layersOf("s")[2].style).toBeFalsy(); expect(c.layersOf("s")[2].size).toBe(20);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ styleRows }}", "{{ onNewStyle }}"]) expect(html).toContain(h);
});

test("Style mode shows and edits the style's container, never copying this layer's own container into it", async () => {
  const c = await styledDeck({}, [TL("a", { style: "h1", card: "custom", box: { bg: "#ff0000", radius: 40 } }), TL("b", { style: "h1" })]);
  c.setState({ layerSel: "a", styleTarget: "style" }); const v = c.renderVals();
  expect(v.boxModeLabel).toBe("Off");                                         // the style's container, not the layer's Custom one
  v.boxFields.find((f: any) => f.label === "Padding").onChange({ target: { value: "20" } });
  expect(c.state.styles.h1.box.bg).not.toBe("#ff0000"); expect(c.state.styles.h1.box.radius).toBe(12);
});

test("deleting a style keeps a tombstone: undo brings layers back looking right, and the id is never reused", async () => {
  const c = await styledDeck(); await Bun.sleep(150);
  c.setState({ layerSel: "c" }); const sid = c.newStyleFrom("s", "c"); c.componentDidUpdate();
  await Bun.sleep(500);                                                         // a separate undo step (edits within 450ms group)
  c.deleteStyle(sid); c.componentDidUpdate();
  expect(c.renderVals().styleRows.map((r: any) => r.id)).not.toContain(sid);
  expect(c.renderVals().styleOpts.map((o: any) => o.v)).not.toContain(sid);
  c.undo(); c.componentDidUpdate();
  expect(c.layersOf("s")[2].style).toBe(sid); expect(c.resolveLayer(c.layersOf("s")[2], "s").size).toBe(20);
  expect(c.newStyleFrom("s", "a")).not.toBe(sid);
});

// ---- inline formatting ----
const rich = async () => (await mount("")).c.constructor.rich;

test("parseRich: bold, italic, spans with attributes and styles, nesting, escapes, literal on malformed, merged runs", async () => {
  const { parseRich } = await rich();
  const st = (id: string) => (id === "h2" ? { size: 44, weight: 700, color: "#111111", font: "grot", ls: 0, align: "center", lh: 2 } : null);
  expect(parseRich("plain")).toEqual([{ text: "plain" }]);
  expect(parseRich("a **b** *c* ***d***")).toEqual([{ text: "a " }, { text: "b", b: true }, { text: " " }, { text: "c", i: true }, { text: " " }, { text: "d", b: true, i: true }]);
  expect(parseRich("[x]{size=72 color=#d9432b font=serif weight=600}")).toEqual([{ text: "x", size: 72, color: "#d9432b", font: "serif", weight: 600 }]);
  expect(parseRich("[x]{style=h2 size=50}", st)).toEqual([{ text: "x", size: 50, weight: 700, color: "#111111", font: "grot", ls: 0 }]);   // character settings only; explicit wins
  expect(parseRich("[a [b]{size=9} c]{size=20}")).toEqual([{ text: "a ", size: 20 }, { text: "b", size: 9 }, { text: " c", size: 20 }]);
  expect(parseRich("**[x]{color=red}**")).toEqual([{ text: "x", b: true, color: "red" }]);
  expect(parseRich("[x]{bogus=1 size=abc weight=950 style=nope}", st)).toEqual([{ text: "x" }]);
  for (const lit of ["5 * 3", "**open", "[draft]", "[x](http://a.b)", "[x]{size=3", "a * b * c"]) expect(parseRich(lit).map((r: any) => r.text).join("")).toBe(lit);
  expect(parseRich("\\*not\\* \\[x\\]")).toEqual([{ text: "*not* [x]" }]);
  expect(parseRich("")).toEqual([{ text: " " }]);
});

test("plainText strips markup line by line", async () => {
  const { plainText } = await rich();
  expect(plainText("a **b** [c]{size=9}\n\n*d* \\*e")).toBe("a b c\n\nd *e");
});

test("applyFormat: toggles bold, wraps lines, updates or unwraps spans, clears, and keeps the selection on the same words", async () => {
  const { applyFormat } = await rich();
  let r = applyFormat("say hello now", 4, 9, { bold: true });
  expect(r).toEqual({ text: "say **hello** now", start: 6, end: 11 });
  expect(applyFormat(r.text, r.start, r.end, { bold: true })).toEqual({ text: "say hello now", start: 4, end: 9 });
  expect(applyFormat("ab\n\ncd", 0, 6, { italic: true }).text).toBe("*ab*\n\n*cd*");
  r = applyFormat("big word", 0, 3, { attrs: { size: 72 } });
  expect(r).toEqual({ text: "[big]{size=72} word", start: 1, end: 4 });
  r = applyFormat(r.text, r.start, r.end, { attrs: { color: "#ff0000" } });
  expect(r.text).toBe("[big]{size=72 color=#ff0000} word");
  r = applyFormat(r.text, r.start, r.end, { attrs: { size: null, color: null } });
  expect(r).toEqual({ text: "big word", start: 0, end: 3 });
  expect(applyFormat("a **b** [c]{size=9}", 0, 0, { clear: true }).text).toBe("a b c");
  expect(applyFormat("a **b** c", 2, 7, { clear: true })).toEqual({ text: "a b c", start: 2, end: 3 });
});

test("resolveLayer gives every text layer display runs, with style spans looked up like layer styles; names are plain", async () => {
  const c = await styledDeck({ styles: { h2: { size: 41 } } }, [TL("a", { text: "x [y]{style=h2} **z**" }), TL("b", { style: "h1", text: "plain" })]);
  const [a, b] = c.layersOf("s").map((l: any) => c.resolveLayer(l, "s"));
  expect(a._lines).toEqual([[{ text: "x " }, { text: "y", size: 41, weight: 700, font: "grot", ls: 0 }, { text: " " }, { text: "z", b: true }]]);   // H2's colour is null, so it's not taken
  expect(b._lines).toEqual([[{ text: "plain" }]]);
  expect(c.layersOf("s")[0]._lines).toBeUndefined();                         // never stored
  c.chooseStyle("s", "a", ""); expect(c.layersOf("s")[0]._lines).toBeUndefined();
  c.setState({ layerSel: "a" }); expect(c.renderVals().layerRows.find((r: any) => r.name.startsWith("x")).name).toBe("x y z");
});

test("formatting bar: shown only while editing; formats the remembered selection; ⌘B works in the editor; blur into the bar keeps editing", async () => {
  const c = await styledDeck({}, [TL("a", { text: "say hello now" })]);
  expect(c.renderVals().fmtShow).toBe(false);
  c.setState({ editing: "a", layerSel: "a", editMode: "markup" }); let v = c.renderVals();
  expect(v.fmtShow).toBe(true); expect(v.fmtStyleOpts.map((o: any) => o.l)).toEqual(["Style", "Plain", "H1", "H2", "H3", "Body", "Bullets"]);
  v.onEditSel({ target: { selectionStart: 4, selectionEnd: 9 } });
  v.onFmtBold();
  expect(c.layersOf("s")[0].text).toBe("say **hello** now");
  c.renderVals().onFmtSize({ target: { value: "72" } });
  expect(c.layersOf("s")[0].text).toBe("say **[hello]{size=72}** now");
  const ta = { tagName: "TEXTAREA", focus() {}, setSelectionRange() {} }; c.editRef.current = ta;
  c._sel = { start: 0, end: 3 };
  c.onKey({ key: "i", metaKey: true, shiftKey: false, target: ta, preventDefault() {} });
  expect(c.layersOf("s")[0].text).toBe("*say* **[hello]{size=72}** now");
  c.focusInBar = () => true; c.renderVals().stopEditing(); await Bun.sleep(5); expect(c.state.editing).toBe("a");
  c.focusInBar = () => false; c.renderVals().stopEditing(); await Bun.sleep(5); expect(c.state.editing).toBeNull();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ['data-role="fmtbar"', "{{ onFmtBold }}", "{{ onEditSel }}"]) expect(html).toContain(h);
});

test("applyFormat normalises the selection: trims spaces, includes or toggles markers, and never leaves literal stars", async () => {
  const { applyFormat, plainText } = await rich();
  expect(applyFormat("***both***", 3, 7, { bold: true }).text).toBe("*both*");          // bold off inside bold-italic
  expect(applyFormat("***both***", 3, 7, { italic: true }).text).toBe("**both**");
  expect(applyFormat("**hello**", 0, 9, { bold: true }).text).toBe("hello");            // selection includes the markers
  expect(applyFormat("[big]{size=9} x", 0, 13, { attrs: { size: 72 } }).text).toBe("[big]{size=72} x");
  expect(applyFormat("say hello now", 4, 10, { bold: true }).text).toBe("say **hello** now");   // trailing space trimmed
  const bad = applyFormat("a **bold** c", 0, 6, { bold: true });                       // cuts through existing markup
  expect(bad.text).toBe("a **bold** c"); expect(bad.refused).toBe(true);
  expect(plainText(applyFormat("x *y* z", 0, 7, { bold: true }).text)).toBe("x y z");
  expect(applyFormat("[b]{size=9} c", 1, 2, { clear: true }).text).toBe("b c");        // clear grows over adjoining markers
  expect(applyFormat("**ab** c", 2, 4, { clear: true }).text).toBe("ab c");
  expect(applyFormat("say hello now", 9, 4, { bold: true }).text).toBe("say **hello** now");   // reversed range
});

test("formatting bar: Plain is choosable, focus in the bar counts as typing, leaving the bar ends editing, the bar stays on the slide", async () => {
  const c = await styledDeck({}, [TL("a", { text: "[x]{style=h2} y", x: 80, y: 80, h: 18 })]);
  c.setState({ editing: "a", layerSel: "a", editMode: "markup" }); let v = c.renderVals();
  expect(v.fmtStyleOpts[0]).toMatchObject({ v: "", off: true }); expect(v.fmtStyleOpts[1]).toMatchObject({ v: "-", l: "Plain" });
  v.onEditSel({ target: { selectionStart: 1, selectionEnd: 2 } }); v.onFmtStyle({ target: { value: "-" } });
  expect(c.layersOf("s")[0].text).toBe("x y");
  expect(v.fmtPos).toContain("min("); expect(v.fmtPos).not.toContain("+ 6px");          // clamped, and not pushed below the slide
  const before = c.layersOf("s").length;
  c.onKey({ key: "Backspace", target: { tagName: "SELECT" }, preventDefault() {} });
  expect(c.layersOf("s").length).toBe(before);                                         // a focused bar select doesn't delete the layer
  c.focusInBar = () => false; c.renderVals().onFmtBlur(); await Bun.sleep(5); expect(c.state.editing).toBeNull();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('onMouseDown="{{ fmtDown }}"'); expect(html).toContain('onBlur="{{ onFmtBlur }}"');
});

// ---- container: On / Off, sourced from the style ----
test("container is On/Off: every old setting maps onto it, and the header says where it comes from", async () => {
  const c = await styledDeck({}, [TL("a", { card: "custom", box: { bg: "#ff0000" } }), TL("b", { card: "off" }), TL("c"), TL("e", { style: "h1" }), TL("f", { style: "h1", card: "custom", box: {} })]);
  const v = (id: string) => { c.setState({ layerSel: id, styleTarget: "layer" }); return c.renderVals(); };
  expect(v("a").boxModes.map((m: any) => m.label)).toEqual(["On", "Off"]);
  for (const [id, on] of [["a", "On"], ["b", "Off"], ["c", "Off"]]) expect(v(id).boxModeLabel).toBe(on);
  expect(v("e").boxModeLabel).toBe("From H1 · Off"); expect(v("e").boxTitle).toBe("Container");
  expect(v("f").boxModeLabel).toBe("This layer · On •");
  c.setState({ layerSel: "e", styleTarget: "style" }); expect(c.renderVals().boxTitle).toBe("H1 container");
  v("c").boxModes[0].onClick(); expect(c.layersOf("s")[2].card).toBe("custom");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain("{{ boxTitle }}");
});

test("Readability offers None / Whole slide", async () => {
  const c = await styledDeck();
  expect(c.renderVals().cardModes.map((m: any) => m.label)).toEqual(["None", "Whole slide"]);
});

test("London, Under the sea and Space are Canvas backdrops next to the others", async () => {
  const { c } = await mount("?deck=fresh");
  expect(c.renderVals().bgTiles.map((b: any) => b.label)).toEqual(["Balloons", "London", "Under the sea", "Space", "Forest", "Sky", "Ocean", "None"]);
  for (const [id, src, aspect] of [["london", "backdrops/london.png", 1], ["sea", "backdrops/under-the-sea.png", 0.4], ["space", "backdrops/space.png", 0.4], ["forest", "backdrops/forest.png", 0.4]] as const) {
    c.setState({ bg: id }); expect(c.bgInfo()).toEqual({ src, aspect });
    expect(await Bun.file(join(import.meta.dir, "design", src)).exists()).toBe(true);
  }
});

// ---- inline links ----
test("inline links: parsed into runs, broken targets flagged, followed in present mode, and set from the bar", async () => {
  const { parseRich } = await rich();
  expect(parseRich("see [the costs]{link=costs} or [r]{href=https://e.x/r?a=b}")).toEqual([{ text: "see " }, { text: "the costs", link: "costs" }, { text: " or " }, { text: "r", href: "https://e.x/r?a=b" }]);
  expect(parseRich("[x]{href=javascript:alert(1)}")).toEqual([{ text: "x" }]);              // only http(s)/mailto
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { frames: [{ id: "f", layers: [TL("a", { text: "go [here]{link=costs} or [there]{link=gone}" })] }] }), costs: slideNode("costs", "Costs") });
  const { c } = await mount("?deck=talk");
  const runs = c.resolveLayer(c.layersOf("s")[0], "s")._lines[0];
  expect(runs[1]).toMatchObject({ text: "here", link: "costs" }); expect(runs[1].broken).toBeUndefined();
  expect(runs[3]).toMatchObject({ text: "there", link: "gone", broken: true });
  c.followInline({ link: "costs" }); expect(c.state.cur).toBe("costs");
  c.setState({ cur: "s", editing: "a", layerSel: "a", editMode: "markup" }); const v = c.renderVals();
  expect(v.fmtLinkOpts.map((o: any) => o.v).slice(0, 3)).toEqual(["", "-", "s"]); expect(v.fmtLinkOpts.at(-1).v).toBe("@url");
  v.onEditSel({ target: { selectionStart: 0, selectionEnd: 2 } }); v.onFmtLink({ target: { value: "costs" } });
  expect(c.layersOf("s")[0].text.startsWith("[go]{link=costs}")).toBe(true);
  c.renderVals().onFmtLink({ target: { value: "@url" } }); expect(c.state.fmtUrl).toBe(true);
  c.setState({ fmtUrlVal: "https://a.b" }); c.renderVals().onFmtUrlApply();
  expect(c.layersOf("s")[0].text.startsWith("[go]{href=https://a.b}")).toBe(true);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ fmtLinkOpts }}", "{{ onFmtUrlApply }}", 'onClick="{{ onStageLinkClick }}"', 'links="{{ isPresent }}"']) expect(html).toContain(h);
});

test("links: javascript: href not clickable", async () => {
  const { parseRich } = await rich(), md = await import("./markdown");
  expect(parseRich("[x]{href=mailto:a@b.c} [y]{href=http://e.x}")).toEqual([{ text: "x " }, { text: "y", href: "http://e.x" }]);   // only http(s)
  const files: Record<string, Response> = { "https://x/a.md": reply("# A\nslug: a\n\n[bad](javascript:alert%281%29)\n", "text/markdown") };
  const { c, win } = await mount("?src=https://x/a.md", { fetch: u => files[u] });
  const opened: string[] = []; win.open = (u: string) => opened.push(u);
  expect(c.resolveLayer(c.layersOf("a").find((l: any) => /bad/.test(l.text)), "a")._lines[0]).toEqual([{ text: "bad" }]);
  c.followInline({ href: "javascript:alert(1)" }); expect(opened).toEqual([]);
  const lid = c.layersOf("a")[0].id, setUrl = (url: string) => c.setLayers("a", (ls: any[]) => ls.map(l => l.id === lid ? { ...l, link: { type: "url", url } } : l));
  c.setState({ mode: "present", cur: "a" }); setUrl("javascript:alert(1)");
  expect(c.renderVals().linkSpots).toEqual([]);
  setUrl("e.x/p"); c.renderVals().linkSpots[0].onClick(); expect(opened).toEqual(["https://e.x/p"]);
});

// ---- remote drafts ----
const REMOTE = "# Remote\nslug: r\n", DRAFTED = "# Mine\nslug: r\n";
const remote = (u: string) => u === "https://x/a.md" ? reply(REMOTE, "text/markdown") : u.startsWith("https://") ? reply("", "text/plain", 404) : undefined;
const draftStore = () => ({ "strata-draft:https://x/a.md": JSON.stringify({ md: DRAFTED, layout: null }) });

test("draft: present ignores draft", async () => {
  const { c } = await mount("?src=https://x/a.md", { fetch: remote, store: draftStore(), isStatic: true });
  expect(c.state.md).toBe(REMOTE); expect(c.renderVals().draftPrompt).toBeFalsy();
});

test("draft: build asks; use draft loads it; discard removes it", async () => {
  const { c } = await mount("?src=https://x/a.md", { fetch: remote, store: draftStore() });
  expect(c.state.md).toBe(REMOTE); expect(c.renderVals().draftPrompt).toBe(true);
  c.renderVals().onUseDraft(); expect(c.state.md).toBe(DRAFTED); expect(c.renderVals().draftPrompt).toBe(false);
  const { c: c2, store } = await mount("?src=https://x/a.md", { fetch: remote, store: draftStore() });
  c2.renderVals().onDiscardDraft(); expect(c2.state.md).toBe(REMOTE); expect(c2.state.draftPrompt).toBe(false);
  expect(store["strata-draft:https://x/a.md"]).toBeUndefined();
  c2.componentDidUpdate(); expect(store["strata-draft:https://x/a.md"]).toBeUndefined();   // loading isn't an edit
  const laid = c2.constructor.md.layoutOf(c2.state.nodes, c2.state, c2._linkedOv);   // the remote deck as the app writes it
  c2.setMd(REMOTE + "\nMore.\n"); c2.componentDidUpdate();   // edits autosave
  expect(JSON.parse(store["strata-draft:https://x/a.md"]).md).toBe(REMOTE + "\nMore.\n");
  const { c: c3 } = await mount("?src=https://x/a.md", { fetch: remote, store: { "strata-draft:https://x/a.md": JSON.stringify({ md: REMOTE, layout: laid }) } });
  expect(c3.state.draftPrompt).toBeFalsy();   // same as remote: nothing to ask
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["You have local changes to this deck", "{{ onUseDraft }}", "{{ onDiscardDraft }}"]) expect(html).toContain(h);
});

// ---- WYSIWYG: model ----
test("raw parsing keeps the style id and what the markup states; span flags b/i work everywhere", async () => {
  const { parseRich } = await rich();
  const st = (id: string) => (id === "h2" ? { size: 44, weight: 700 } : null);
  expect(parseRich("[x]{style=h2 size=50}", st, { raw: true })).toEqual([{ text: "x", style: "h2", size: 50 }]);
  expect(parseRich("[a [b]{style=h2} c]{size=20 color=red}", null, { raw: true })).toEqual([{ text: "a ", size: 20, color: "red" }, { text: "b", style: "h2" }, { text: " c", size: 20, color: "red" }]);
  expect(parseRich("[go]{link=k} [w]{href=https://x}", null, { raw: true })).toEqual([{ text: "go", link: "k" }, { text: " " }, { text: "w", href: "https://x" }]);
  expect(parseRich("[t]{b i size=9}", null, { raw: true })).toEqual([{ text: "t", b: true, i: true, size: 9 }]);
  expect(parseRich("[t]{b}")).toEqual([{ text: "t", b: true }]);                 // display parsing accepts flags too
  expect(parseRich("", null, { raw: true })).toEqual([]);
  expect(parseRich("x [y]{style=h2}", st)).toEqual([{ text: "x " }, { text: "y", size: 44, weight: 700 }]);   // display parsing unchanged
});
test("runsToMarkup: escapes, attribute order, emphasis inside spans, spaces outside markers, no touching markers, merging", async () => {
  const { runsToMarkup } = await rich();
  expect(runsToMarkup([{ text: "a*b [c] {d} \\e" }])).toBe("a\\*b \\[c\\] \\{d\\} \\\\e");
  expect(runsToMarkup([{ text: "x", href: "https://h", size: 9, style: "h2", color: "red", link: "k" }])).toBe("[x]{style=h2 size=9 color=red link=k href=https://h}");
  expect(runsToMarkup([{ text: " bold ", b: true }])).toBe(" **bold** ");
  expect(runsToMarkup([{ text: "x", b: true, i: true }])).toBe("***x***");
  expect(runsToMarkup([{ text: "x", b: true, size: 9 }])).toBe("[x]{b size=9}");
  expect(runsToMarkup([{ text: "a", b: true }, { text: "b", b: true, i: true }])).toBe("**a**[b]{b i}");
  expect(runsToMarkup([{ text: "a", b: true }, { text: "b", b: true }, { text: "" }])).toBe("**ab**");
  expect(runsToMarkup([{ text: "   ", b: true }])).toBe("   ");
});
test("round trip: markup → raw runs → markup → raw runs is stable (table + 500 random run lists)", async () => {
  const { parseRich, runsToMarkup } = await rich();
  const raw = (s: string) => parseRich(s, null, { raw: true });
  for (const s of ["plain", "a **b** *c* ***d***", "[x]{style=h2 size=50}", "[a [b]{style=h2} c]{size=20}", "**[x]{color=red}** y", "\\*lit\\* [go]{link=k}", "5 * 3 [draft]", "[t]{b i size=9}"])
    expect(raw(runsToMarkup(raw(s)))).toEqual(raw(s));
  let seed = 7; const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const words = ["a", "b c", " x ", "*", "[", "}", "go", "  ", "é"];
  for (let t = 0; t < 500; t++) {
    const runs = Array.from({ length: 1 + rnd(5) }, () => { const r: any = { text: words[rnd(words.length)] };
      if (rnd(2)) r.b = true; if (rnd(3) === 0) r.i = true; if (rnd(4) === 0) r.size = 10 + rnd(50); if (rnd(5) === 0) r.link = "s" + rnd(3); if (rnd(6) === 0) r.style = "h2"; return r; });
    const once = raw(runsToMarkup(runs)); expect(raw(runsToMarkup(once))).toEqual(once);
    expect(once.map((r: any) => r.text).join("")).toBe(runs.map((r: any) => r.text).join(""));   // the text itself survives
  }
});
test("run operations: set/clear attributes, toggle (incl. word at cursor), breaks, paste, deletes across lines, link lookup", async () => {
  const R = await rich(); const { linesOf, textOf } = R;
  const L = linesOf("say hello now\n[go]{link=k} on");
  expect(textOf(R.setAttr(L, 4, 9, { size: 72 }))).toBe("say [hello]{size=72} now\n[go]{link=k} on");
  expect(textOf(R.setAttr(linesOf("[ab]{size=9}"), 0, 1, { size: null }))).toBe("a[b]{size=9}");
  expect(textOf(R.toggleAttr(L, 4, 9, "b"))).toBe("say **hello** now\n[go]{link=k} on");
  expect(textOf(R.toggleAttr(linesOf("say **hello** now"), 4, 9, "b"))).toBe("say hello now");     // all on → off
  expect(textOf(R.toggleAttr(linesOf("a **b** c"), 0, 3, "b"))).toBe("**a b** c");                 // mixed → on
  expect(textOf(R.toggleAttr(L, 6, 6, "i"))).toBe("say *hello* now\n[go]{link=k} on");              // word at the cursor
  const L2 = linesOf("a  b"); expect(R.toggleAttr(L2, 2, 2, "i")).toBe(L2);                          // not in a word
  expect(textOf(R.clearRange(linesOf("a **b** [c]{size=9}"), 0, 5))).toBe("a b c");
  expect(textOf(R.insertBreak(L, 9))).toBe("say hello\n now\n[go]{link=k} on");
  expect(textOf(R.insertPlain(linesOf("**ab**"), 1, "x\ny"))).toBe("**ax**\n**yb**");                 // pasted text takes the run's settings
  expect(textOf(R.deleteRange(L, 9, 16))).toBe("say hello on");                                      // " now\ngo" removed across the break
  expect(textOf(R.deleteRange(L, 13, 14))).toBe("say hello now[go]{link=k} on");                    // joining two lines
  expect(R.linkAt(L, 15)).toEqual({ link: "k", href: undefined, start: 14, end: 16 });
  expect(R.linkAt(L, 2)).toBeNull();
  expect(R.toPlain(L)).toBe("say hello now\ngo on");
  expect(R.locate(L, 14)).toEqual([1, 0]);
});

// ---- WYSIWYG: app ----
test("rich editing: the editor fills in, Enter goes through the model, bar actions use run operations, </> switches to markup", async () => {
  const c = await styledDeck({}, [TL("a", { text: "say hello\nnow" })]);
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  c.setState({ editing: "a", layerSel: "a" }); c.componentDidUpdate();
  expect(root.querySelectorAll("[data-line]").length).toBe(2);
  c.renderVals(); expect(c.renderVals().isEditingRich).toBe(true); expect(c.renderVals().isEditingMarkup).toBe(false);
  c.constructor.rich.setOffsets(root, 3, 3);
  const ev = new w.InputEvent("beforeinput", { inputType: "insertParagraph", cancelable: true }); root.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true); expect(c.layersOf("s")[0].text).toBe("say\n hello\nnow");
  c.constructor.rich.setOffsets(root, 5, 10); c.renderVals().onFmtBold();                     // the live selection
  expect(c.layersOf("s")[0].text).toBe("say\n **hello**\nnow");
  c.renderVals().onFmtMode(); expect(c.state.editMode).toBe("markup"); expect(c.renderVals().isEditingMarkup).toBe(true);
  const typing = { isContentEditable: true, tagName: "DIV" }; const n = c.layersOf("s").length;
  c.setState({ editMode: "rich" }); c.onKey({ key: "Backspace", target: typing, preventDefault() {} }); expect(c.layersOf("s").length).toBe(n);   // typing doesn't delete the layer
});

test("link popover: shown with the cursor in a link run; Remove clears the whole link; ⌘K opens the chooser for a selection", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { frames: [{ id: "f", layers: [TL("a", { text: "see [the costs]{link=costs} now" })] }] }), costs: slideNode("costs", "Costs") });
  const { c } = await mount("?deck=talk");
  c.setState({ cur: "s", editing: "a", layerSel: "a", wysSel: { start: 6, end: 6 } }); let v = c.renderVals();
  expect(v.linkPopShow).toBe(true); expect(v.linkPopLabel).toBe("→ Costs");
  v.onLinkPopRemove(); expect(c.layersOf("s")[0].text).toBe("see the costs now");
  c.setState({ wysSel: { start: 0, end: 3 } }); c._wysSel = { start: 0, end: 3 };
  c.onKey({ key: "k", metaKey: true, target: { isContentEditable: true, tagName: "DIV" }, preventDefault() {} });
  v = c.renderVals(); expect(v.linkPick).toBe(true); expect(v.linkPopShow).toBe(true);
  v.onLinkPick({ target: { value: "costs" } }); expect(c.layersOf("s")[0].text).toBe("[see]{link=costs} the costs now");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ['data-role="wysiwyg"', 'ref="{{ wysRef }}"', "{{ onFmtMode }}", "{{ linkPopShow }}", "{{ onLinkPick }}"]) expect(html).toContain(h);
});

test("rich editor: ⌘Z undoes model edits and keeps editing; clicking back from the bar keeps editing; popover web address and position", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { frames: [{ id: "f", layers: [TL("a", { text: "see [the costs]{link=costs} now", y: 8 })] }] }), costs: slideNode("costs", "Costs") });
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  c.setState({ cur: "s", editing: "a", layerSel: "a" }); c.componentDidUpdate(); await Bun.sleep(500);
  c.constructor.rich.setOffsets(root, 0, 3); c.renderVals().onFmtBold(); c.componentDidUpdate();
  expect(c.layersOf("s")[0].text).toBe("**see** [the costs]{link=costs} now");
  c.onKey({ key: "z", metaKey: true, shiftKey: false, target: { isContentEditable: true, tagName: "DIV" }, preventDefault() {} }); c.componentDidUpdate();
  expect(c.layersOf("s")[0].text).toBe("see [the costs]{link=costs} now"); expect(c.state.editing).toBe("a");
  expect(c.constructor.rich.textOf(c._wysLines)).toBe("see [the costs]{link=costs} now");            // the editor's model was rebuilt
  c.activeEl = () => root; c.focusInBar = () => false; c.renderVals().onFmtBlur(); await Bun.sleep(5); expect(c.state.editing).toBe("a");
  c.setState({ wysSel: { start: 6, end: 6 } }); c._wysSel = { start: 6, end: 6 };
  expect(c.renderVals().linkPopPos).toContain("+ 44px");                                             // below the layer near the top
  c.renderVals().onLinkPick({ target: { value: "@url" } }); c.setState({ fmtUrlVal: "x.org" }); c.renderVals().onFmtUrlApply();
  expect(c.layersOf("s")[0].text).toBe("see [the costs]{href=https://x.org} now");
});

test("rich editor: typing after a run vanished keeps the other runs' formatting (reads against the built DOM's lines)", async () => {
  const c = await styledDeck({}, [TL("a", { text: "x**y**z*w*" })]);
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  c.setState({ editing: "a", layerSel: "a" }); c.componentDidUpdate();
  root.querySelectorAll("[data-run]")[1].remove(); root.dispatchEvent(new w.Event("input"));
  expect(c.layersOf("s")[0].text).toBe("xz*w*");
  const spans = root.querySelectorAll("[data-run]"); spans[spans.length - 1].textContent = "w!"; root.dispatchEvent(new w.Event("input"));
  expect(c.layersOf("s")[0].text).toBe("xz*w!*");
});

test("tree Focus mode on a deep slide renders (top-row connector only joins top-level slides that are laid out)", async () => {
  const c = await treeDeck();
  c.setState({ treeFocus: true, cur: "b" }); expect(() => c.renderVals()).not.toThrow();
  c.nav("a1x", "jump"); expect(() => c.renderVals()).not.toThrow();                 // e.g. a link jumping deeper
  const v = c.renderVals(); expect(v.treeNodes.map((n: any) => n.full)).toContain("A1x");
});

test("Bullets is a built-in style: dot bullets with roomy lines", async () => {
  const c = await styledDeck();
  expect(c.styles().bullets).toMatchObject({ name: "Bullets", bullets: "disc", font: "grot" });
});

test("Size, Line height and Gap are number inputs; typed values override (or edit the style); invalid input is ignored", async () => {
  const c = await styledDeck(); c.setState({ layerSel: "c" });
  const f = (n: string) => c.renderVals().textFields.find((x: any) => x.label.startsWith(n));
  expect(["Size", "Line ht", "Gap"].map(n => [f(n).num, f(n).step, f(n).min])).toEqual([[true, 1, 1], [true, 0.05, 0.5], [true, 0.05, 0]]);
  expect(f("Weight").num).toBeFalsy(); expect(f("Weight").isSel).toBe(true);
  f("Size").onChange({ target: { value: "37" } }); expect(c.layersOf("s")[2].size).toBe(37);
  f("Gap").onChange({ target: { value: "0.3" } }); expect(c.layersOf("s")[2].gap).toBe(0.3);
  for (const bad of ["", "abc", "-2"]) f("Line ht").onChange({ target: { value: bad } }); expect(c.layersOf("s")[2].lh).toBeUndefined();
  c.setState({ layerSel: "a", styleTarget: "style" }); f("Size").onChange({ target: { value: "70" } }); expect(c.state.styles.h1.size).toBe(70);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('type="number" step="{{ tf.step }}" min="{{ tf.min }}"');
});

// ---- layouts ----
const lay = async () => (await mount("")).c.constructor.lay;
const LTX = (id: string, style: string | undefined, x: number, y: number, extra: object = {}) => ({ id, type: "text", text: id, x, y, w: 10, h: 10, ...(style ? { style } : {}), ...extra });
const TWO = (t: string) => `# ${t}\nslug: ${t.toLowerCase()}\n\nOne ${t}.\n\nTwo ${t}.\n\n`;
const layDeck = async (slides: Record<string, any[]>, extra: object = {}) => {
  const ids = Object.keys(slides);
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ids), ...Object.fromEntries(ids.map(k => [k, slideNode(k, k.toUpperCase(), [], { frames: [{ id: "f", layers: slides[k] }] })])) }, extra);
  return (await mount("?deck=talk")).c;
};

test("shapes count blocks; layouts match exactly; slots fill by key then reading order", async () => {
  const { BUILTIN_LAYOUTS, sigOf, sigKey, fillSlots } = await lay();
  const layers = [BL("t", "title"), BL("b2", "body", { x: 50, y: 50 }), BL("b1", "body", { y: 50 }), LTX("c", "body", 0, 0), BL("hid", "body", { hidden: true }),
    { id: "i", type: "image", block: "image", x: 0, y: 0, w: 1, h: 1 }, BL("src", "sources"), { id: "s", type: "shape", x: 0, y: 0, w: 1, h: 1 }];
  expect(sigOf(layers)).toEqual({ title: 1, body: 2, image: 1 });
  expect(sigKey({ title: 1, body: 2 })).toBe("body:2,title:1"); expect(sigKey({})).toBe("");
  const boxes = fillSlots(layers.slice(0, 3), BUILTIN_LAYOUTS["cols-2"]);
  expect(boxes).toEqual({ t: { x: 6, y: 6, w: 88, h: 14, rot: 0 }, b1: { x: 6, y: 24, w: 42, h: 66, rot: 0 }, b2: { x: 52, y: 24, w: 42, h: 66, rot: 0 } });
  for (const L of Object.values<any>(BUILTIN_LAYOUTS)) {
    for (const k in L.match) expect(L.slots[k].length).toBe(L.match[k]);
    for (const k in L.slots) for (const b of L.slots[k]) { expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= 100.01 && b.y + b.h <= 100.01).toBe(true); }
  }
});

test("effective layout: the slide's own if it still matches, else the deck default, else the first match; multi-frame counts as custom", async () => {
  await writeMd("talk", TWO("A") + "# Z\nslug: z\n", { version: 1, deck: { layoutDefaults: { "body:2,title:1": "cols-2" } }, slides: {} });
  const { c } = await mount("?deck=talk");
  expect(c.effectiveLayout("a").id).toBe("cols-2"); expect(layerOf(c, "a", "md-body-2")).toMatchObject({ x: 52, y: 24 });   // laid out by it on load
  c.setNode("a", { layout: "stacked-2" }); expect(c.effectiveLayout("a").id).toBe("stacked-2");
  c.setNode("a", { layout: "title" }); expect(c.effectiveLayout("a").id).toBe("cols-2");     // no longer matches → default
  c.setState({ layoutDefaults: {} }); expect(c.effectiveLayout("a").id).toBe("stacked-2");   // first match
  expect(c.effectiveLayout("z").id).toBe("title"); expect(c.effectiveLayout("ROOT")).toBeNull();
  expect(c.isCustom("a")).toBe(false); c.setNode("a", { frames: [{ id: "f", layers: [] }, { id: "g", layers: [] }] }); expect(c.isCustom("a")).toBe(true);
  expect(c.layouts()["cols-2"]).toMatchObject({ id: "cols-2", name: "Two columns" });
});

test("a hand edit to a slide's frames makes it an override (same undo step); layout and enrich commits, undo and title edits don't", async () => {
  await writeMd("talk", TWO("A")); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a" });
  c.setNode("a", { title: "Renamed" }); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined();
  await Bun.sleep(500);
  c.updLayer("a", "md-body-2", { x: 40 }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes.a.custom).toBe(true);
  c.undo(); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined(); expect(layerOf(c, "a", "md-body-2").x).toBe(6);   // one undo step
  await Bun.sleep(500);
  c.addLayer("shape"); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBe(true);                // an extra is an override
  c.undo(); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined(); expect(c.hasExtras("a")).toBe(false);
  const nodes = { ...c.state.nodes, a: { ...c.state.nodes.a, frames: [{ id: "f", layers: c.layersOf("a").map((l: any) => l.id === "md-title" ? { ...l, y: 50 } : l) }] } };
  c.allowLayout(nodes); c.setState({ nodes }); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined();
  c.setMd(TWO("A") + "More.\n"); c.reenrich(); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined();
});

test("layout actions: apply, apply to all (default slides only), reset, save as, update from, rename, delete", async () => {
  await writeMd("talk", ["A", "B", "D", "M", "X"].map(TWO).join(""));
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  const at = (id: string) => layerOf(c, id, "md-body-2");
  expect(at("b")).toMatchObject({ x: 6, y: 58, w: 88, h: 32 });                                                    // stacked-2: its shape's first match
  c.setNode("d", { custom: true }); c.setNode("m", { frames: [{ id: "f", layers: c.layersOf("m") }, { id: "g", layers: c.layersOf("m") }] }); c.componentDidUpdate(); await Bun.sleep(500);
  c.applyLayout("a", "cols-2"); c.componentDidUpdate();
  expect(at("a")).toMatchObject({ x: 52, y: 24, w: 42, h: 66 }); expect(c.state.nodes.a).toMatchObject({ layout: "cols-2", custom: true });   // not its shape's layout: an override
  c.setState({ cur: "x" }); c.addLayer("shape"); c.componentDidUpdate(); c.applyLayout("x", "stacked-2"); expect(c.state.nodes.x.custom).toBe(true);   // extras keep it an override
  await Bun.sleep(500);
  c.applyToAll("cols-2"); c.componentDidUpdate();
  expect(c.state.layoutDefaults["body:2,title:1"]).toBe("cols-2"); expect(c.state.note).toBe("Updated 1 slide · kept 4 custom");
  expect(at("b")).toMatchObject({ x: 52, y: 24 }); expect(at("d")).toMatchObject({ x: 6, y: 58 });                // custom kept
  c.setMd(c.state.md + "More.\n"); c.reenrich(); expect(at("b")).toMatchObject({ x: 52, y: 24 });             // the default holds through an enrich
  c.undo(); c.componentDidUpdate(); expect(at("b")).toMatchObject({ x: 6, y: 58 }); expect(c.state.layoutDefaults?.["body:2,title:1"]).toBeUndefined();   // one undo step, default and all
  c.redo(); c.componentDidUpdate(); expect(at("b")).toMatchObject({ x: 52, y: 24 }); expect(c.state.layoutDefaults["body:2,title:1"]).toBe("cols-2");
  c.resetToDefault("d"); expect(c.state.nodes.d.custom).toBeUndefined(); expect(at("d")).toMatchObject({ x: 52 });
  c.updLayer("a", "md-body-2", { x: 70, y: 70, w: 20, h: 20 }); c.componentDidUpdate();
  const lid = c.saveAsLayout("a");
  expect(c.layouts()[lid]).toMatchObject({ name: "Layout 1", match: { title: 1, body: 2 } }); expect(c.layouts()[lid].slots.body[1]).toMatchObject({ x: 70, y: 70 });
  expect(c.state.nodes.a).toMatchObject({ layout: lid }); expect(c.state.nodes.a.custom).toBeUndefined();
  c.applyToAll(lid); c.componentDidUpdate(); c.updLayer("a", "md-body-2", { x: 72 }); c.componentDidUpdate(); c.updateLayoutFrom("a");
  expect(c.layouts()[lid].slots.body[1].x).toBe(72); expect(at("b").x).toBe(72);
  c.renameLayout("cols-2", "Side by side"); expect(c.layouts()["cols-2"].name).toBe("Side by side"); expect(c.state.layouts["cols-2"].slots).toBeTruthy();
  c.deleteLayout("cols-2"); expect(c.layouts()["cols-2"]).toBeTruthy();                                            // built-ins stay
  c.deleteLayout(lid); expect(c.layouts()[lid]).toBeUndefined();
  expect(c.state.nodes.b).toMatchObject({ custom: true }); expect(c.state.nodes.b.layout).toBeUndefined(); expect(at("b").x).toBe(72);
});

test("Layout panel: shape chips, status, matching tiles with default star, counts and jump lists, actions, all layouts", async () => {
  await writeMd("talk", TWO("A") + TWO("B"), { version: 1, deck: { layoutDefaults: { "body:2,title:1": "cols-2" } }, slides: {} });
  const { c } = await mount("?deck=talk");
  c.setState({ cur: "a", stab: "layout" }); let v = c.renderVals();
  expect(v.layChips).toEqual(["Body ×2", "Title ×1"]); expect(v.layStatus).toBe("Default · Two columns");
  expect(v.layTiles.map((t: any) => [t.id, t.star, t.count])).toEqual([["stacked-2", false, "0 slides"], ["cols-2", true, "2 slides"]]);
  expect(v.layTiles[1].layers.find((l: any) => l.id === "md-body-2")).toMatchObject({ x: 52, _lines: expect.anything() });   // preview: this slide's content, resolved
  v.layTiles[1].onToggle(); v = c.renderVals(); expect(v.layTiles[1].slides.map((s: any) => s.name)).toEqual(["A", "B"]);
  v.layTiles[1].slides[1].onClick(); expect(c.state.cur).toBe("b"); expect(c.state.stab).toBe("layout");
  c.setNode("b", { custom: true }); c.setState({ cur: "b" }); v = c.renderVals(); expect(v.layStatus).toBe("This slide · Two columns"); expect(v.layCustom).toBe(true);
  v.layTiles[0].onApplyAll(); expect(c.state.layoutDefaults["body:2,title:1"]).toBe("stacked-2");
  expect(c.renderVals().layAll.length).toBeGreaterThanOrEqual(13); expect(c.renderVals().layCanUpdate).toBe(true);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ layTiles }}", "{{ layStatus }}", "{{ onLaySave }}", "{{ onLayUpdate }}", "{{ layAll }}"]) expect(html).toContain(h);
});

test("layouts: multi-frame slides show status only; the full-bleed slot goes to the back", async () => {
  await writeMd("talk", "# A\nslug: a\n\n![pic](p.png)\n"); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  expect(c.effectiveLayout("a").id).toBe("image-full");
  expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["md-image-1", "md-title"]);                            // the image doesn't cover the title
  c.applyLayout("a", "image-full"); expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["md-image-1", "md-title"]);
  c.setNode("a", { frames: [{ id: "f", layers: c.layersOf("a") }, { id: "g", layers: [] }] }); c.setState({ cur: "a" });
  expect(c.renderVals().layEditable).toBe(false);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-if value="{{ layEditable }}">'); expect(html).toContain("{{ layNoTiles }}");
});

test("right panel: Slide and Canvas tabs; spacing settings are a Spacing section in Canvas; an old saved 'layout' tab opens Canvas", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  let v = c.renderVals(); expect(v.rTabs.map((t: any) => t.label)).toEqual(["Slide", "Canvas"]);
  c.setState({ rtab: "layout" }); v = c.renderVals(); expect(v.tabCanvas).toBe(true); expect(v.tabSlide).toBe(false);
  expect(v.sec.spacing.open).toBe(true); v.sec.spacing.toggle(); expect(c.renderVals().sec.spacing.open).toBe(false);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const canvas = html.slice(html.indexOf('<sc-if value="{{ tabCanvas }}">'));
  expect(canvas).toContain('onClick="{{ sec.spacing.toggle }}"'); expect(canvas).toContain('value="{{ rowStep }}"'); expect(html).not.toContain("{{ tabLayout }}");
});

test("present: Max/Fit sizing (button and F), Jump to lives in the header, header auto-hides and shows on hover or search", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  let v = c.renderVals(); expect(v.hdrShown).toBe(true);                                   // build mode: always shown
  c.setState({ mode: "present" }); v = c.renderVals();
  expect(v.hdrShown).toBe(false); expect(v.isMax).toBe(false); expect(v.stagePad).toBe("136px 66px 60px");
  v.viewItems.find((i: any) => i.label === "Max size").onClick(); v = c.renderVals(); expect(v.isMax).toBe(true); expect(v.stagePad).toBe("0");
  c.onKey({ key: "f", target: {}, preventDefault() {} }); expect(c.renderVals().isMax).toBe(false);
  c.renderVals().onHdrEnter(); expect(c.renderVals().hdrShown).toBe(true);
  c.renderVals().onHdrLeave(); await Bun.sleep(450); expect(c.renderVals().hdrShown).toBe(false);
  c.renderVals().onSearchFocus(); expect(c.renderVals().hdrShown).toBe(true);
  c.renderVals().onSearchBlur(); expect(c.renderVals().hdrShown).toBe(false);
  c.setState({ query: "x" }); expect(c.renderVals().hdrShown).toBe(true);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  expect(header).toContain('ref="{{ searchRef }}"'); expect(header).toContain('onMouseEnter="{{ onHdrEnter }}"'); expect(header).toContain("{{ onViewMenu }}");
  expect(html).toContain("padding:{{ stagePad }}");
});

test("present View menu: layout (Slides / Tree / Radial), breadcrumbs, max size; keys T/B/F; map views jump on click; zoom", async () => {
  const c = await treeDeck(); c.setState({ mode: "present", cur: "a1" });
  let v = c.renderVals(); v.onViewMenu(); v = c.renderVals(); expect(v.viewMenuOpen).toBe(true);
  expect(v.viewItems.map((i: any) => i.label)).toEqual(["Slides", "Tree", "Radial", "Max size"]);
  expect(v.viewItems.map((i: any) => i.on)).toEqual([true, false, false, false]);
  expect(v.crumbModes.map((o: any) => o.l)).toEqual(["Off", "1s", "2s", "3s", "4s", "5s", "On"]); expect(v.crumbMode).toBe("on");
  v.onCrumbMode({ target: { value: "off" } }); expect(c.renderVals().crumbsOn).toBe(false);
  c.renderVals().onCrumbMode({ target: { value: "3" } }); v = c.renderVals();
  expect([v.crumbMode, c.state.crumbFade]).toEqual(["3", 3]); expect(v.crumbFadeCss).toContain("opacity:1");   // fade: shown on change, then hidden
  c.setState({ crumbLit: false }); expect(c.renderVals().crumbFadeCss).toContain("opacity:0");
  c.setState({ cur: "a2" }); c.componentDidUpdate(); expect(c.state.crumbLit).toBe(true); c.setState({ cur: "a1" });
  c.renderVals().viewItems[3].onClick(); expect(c.renderVals().isMax).toBe(true);
  c.onKey({ key: "b", target: {}, preventDefault() {} }); expect(c.renderVals().crumbsOn).toBe(false);   // B: fade → off
  c.onKey({ key: "b", target: {}, preventDefault() {} }); c.onKey({ key: "f", target: {}, preventDefault() {} });
  v = c.renderVals(); expect([v.crumbsOn, v.isMax]).toEqual([true, false]);
  c.onKey({ key: "Escape", target: {}, preventDefault() {} }); expect(c.renderVals().viewMenuOpen).toBe(false); expect(c.state.mode).toBe("present");
  c.onKey({ key: "t", target: {}, preventDefault() {} }); v = c.renderVals();
  expect(v.showMap).toBe(true); expect(v.showStage).toBe(false); expect(v.showWire).toBe(false);
  const at = (n: string) => v.mapCards.find((m: any) => m.name === n);
  expect(v.mapCards.map((m: any) => m.name)).toEqual(["A", "A1", "A1x", "A2", "B"]);
  expect(at("A").x).toBeCloseTo((at("A1").x + at("A2").x) / 2); expect(at("A1").x).toBeCloseTo(at("A1x").x);   // parents centred over children
  expect(at("A1").y).toBeGreaterThan(at("A").y); expect(at("A1").outline).toContain("#d9432b");
  expect(v.mapCards.every((m: any) => m.layers.length > 0)).toBe(true); expect(v.mapEdges.length).toBe(3);
  c.onKey({ key: "t", target: {}, preventDefault() {} }); v = c.renderVals();
  const ctr = (m: any) => [m.x + v.mapCardW / 2 - v.mapW / 2, m.y + v.mapCardH / 2 - v.mapH / 2], r = (m: any) => Math.hypot(...ctr(m));
  expect(r(at("A"))).toBeCloseTo(r(at("B"))); expect(r(at("A1"))).toBeCloseTo(r(at("A2"))); expect(r(at("A1x"))).toBeGreaterThan(r(at("A1")));
  expect(r(at("A1"))).toBeGreaterThan(r(at("A")));
  c.setState({ mapZoom: 0.05 }); c.renderVals().onMapZoomOut(); expect(c.state.mapZoom).toBeLessThan(0.05);
  c.setState({ mapZoom: null, viewMenu: true }); expect(c.renderVals().hdrStyle).toContain("transform:none");   // a transform would trap the menu's fixed outside-click overlay inside the header
  c.setState({ viewMenu: false }); v = c.renderVals();
  const z0 = v.mapZoom; v.onMapZoomIn(); expect(c.renderVals().mapZoom).toBeGreaterThan(z0); c.renderVals().onMapFit(); expect(c.state.mapZoom).toBeNull();
  at("B").onClick(); expect(c.state.cur).toBe("b"); expect(c.renderVals().showMap).toBe(false);
  c.setState({ presentView: "tree" }); c.onKey({ key: "Escape", target: {}, preventDefault() {} }); expect(c.renderVals().showMap).toBe(false);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ onViewMenu }}", "{{ viewItems }}", "{{ mapCards }}", "{{ mapEdges }}", "{{ onMapZoomIn }}", "{{ onCrumbMode }}", '<sc-if value="{{ crumbsOn }}">']) expect(html).toContain(h);
});

test("defaults: 30% row and column steps; H1 centred vertically; Body has a container on", async () => {
  const c = await treeDeck(); const v = c.renderVals();
  expect(v.rowStepLabel).toBe("30% of a slide"); expect(v.gapLabel).toBe("30% of a slide");
  const S = c.styles(); expect(S.h1.valign).toBe("middle");
  expect(S.body).toMatchObject({ card: "custom", box: { bg: "#0b1220", bgOpacity: 0.6, blur: 3, border: 0, radius: 12, pad: 12 } });
});

// ---- sequences ----
test("add as sequence: start frame hides the items, one frame per item in reading order, each reveal eases out; later frames kept", async () => {
  const fl = { f0: { x: { move: { ease: "both" } } } };
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s"]), s: slideNode("s", "S", [], { ftrans: fl, frames: [
    { id: "f0", layers: [TL("x", { y: 60, opacity: 0.8 }), TL("y1", { y: 10 }), TL("z", { y: 35, x: 20 }), TL("w")] }, { id: "fz", layers: [TL("w", { x: 40 })] }] }) });
  const c = (await mount("?deck=talk")).c; c.setState({ cur: "s", fi: 0 }); await Bun.sleep(150);   // history starts recording after load
  expect(c.renderVals().seqOn).toBe(false);
  c.setSelection(["x", "y1", "z"]); let v = c.renderVals(); expect(v.seqOn).toBe(true);
  expect(v.seqKinds.map((k: any) => k.l)).toEqual(["Fade in", "Slide up", "Slide from left", "Cascade"]);
  v.onSeqKind({ target: { value: "cascade" } }); c.renderVals().onAddSequence(); c.componentDidUpdate();
  const n = c.state.nodes.s, F = n.frames, L = (f: number, id: string) => F[f].layers.find((l: any) => l.id === id);
  expect(F.length).toBe(5); expect(F[0].id).toBe("f0"); expect(F[4].id).toBe("fz");
  // start frame: all three hidden; cascade starts each item at the previous one's spot (the first in place)
  expect([L(0, "y1").opacity, L(0, "z").opacity, L(0, "x").opacity]).toEqual([0, 0, 0]);
  expect([L(0, "y1").y, L(0, "z").y, L(0, "z").x, L(0, "x").y]).toEqual([10, 10, 5, 35]);
  expect(L(0, "w").opacity).toBeUndefined();
  // frame k reveals item k (reading order y1, z, x) at its final place and opacity
  expect([L(1, "y1").opacity ?? 1, L(1, "z").opacity]).toEqual([1, 0]);
  expect([L(2, "z").opacity ?? 1, L(2, "z").y, L(2, "z").x, L(2, "x").opacity, L(2, "x").y]).toEqual([1, 35, 20, 0, 35]);
  expect([L(3, "x").opacity, L(3, "x").y]).toEqual([0.8, 60]);
  expect(n.ftrans[F[1].id].z).toMatchObject({ move: { ease: "out" }, fade: { ease: "out" } });
  expect(n.ftrans[F[0].id].y1.fade.ease).toBe("out");
  expect(n.ftrans[F[3].id]).toEqual(fl.f0);   // the old f0 → fz settings now sit on the last new frame → fz
  c.undo(); c.componentDidUpdate(); expect(c.state.nodes.s.frames.length).toBe(2);
  // slide up: start 6% below, in place horizontally
  c.setSelection(["x", "y1"]); c.renderVals().onSeqKind({ target: { value: "up" } }); c.renderVals().onAddSequence();
  const G = c.state.nodes.s.frames; expect(G.length).toBe(4); expect(G[0].layers.find((l: any) => l.id === "y1")).toMatchObject({ y: 16, x: 5, opacity: 0 });
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text(); for (const h of ["{{ onAddSequence }}", "{{ seqKinds }}"]) expect(html).toContain(h);
});

// ---- layouts by markdown block ----
const BL = (id: string, block: string, extra: object = {}) => ({ id, type: "text", text: id, x: 0, y: 0, w: 10, h: 10, block, ...extra });

test("shape: sources and layers without a block don't count", async () => {
  const { sigOf, sigKey } = await lay();
  expect(sigKey(sigOf([BL("t", "title"), BL("b", "body"), BL("s", "sources")], {}))).toBe("body:1,title:1");
  expect(sigKey(sigOf([BL("t", "title"), LTX("x", "h1", 0, 0), BL("h", "body", { hidden: true })], {}))).toBe("title:1");
});

test("layouts: stacked-2 is the first match for body:2; list built-ins", async () => {
  const { BUILTIN_LAYOUTS, sigKey } = await lay();
  expect(Object.values<any>(BUILTIN_LAYOUTS).find(L => sigKey(L.match) === "body:2,title:1").name).toBe("Stacked 2");
  expect(BUILTIN_LAYOUTS["text-list"].slots.list[0]).toMatchObject({ x: 52, y: 24, w: 42, h: 66 });
});

test("fillSlots: sources default box, and a layout's own sources region wins", async () => {
  const { BUILTIN_LAYOUTS, fillSlots } = await lay();
  const s = BL("s", "sources");
  expect(fillSlots([BL("t", "title"), s], BUILTIN_LAYOUTS.title, {}).s).toEqual({ x: 6, y: 89, w: 88, h: 5, rot: 0 });
  expect(fillSlots([s], { slots: { sources: [{ x: 1, y: 2, w: 3, h: 4 }] } }, {}).s).toMatchObject({ x: 1, y: 2 });
});

test("renameRegion stores names beside slots", async () => {
  const c = await layDeck({ a: [BL("t", "title"), BL("b", "body")] });
  c.renameRegion("stacked-1", "body", 0, "Main");
  expect(c.layouts()["stacked-1"].names).toEqual({ body: ["Main"] });
  expect(c.layouts()["stacked-1"].slots.body.length).toBe(1);
});

// ---- markdown pane ----
test("pane: input updates md and re-enriches", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk");
  const v = c.renderVals(); expect(v.mdText).toBe(TALK);
  v.onMdInput({ target: { value: TALK + "\n# Last\nslug: last\n" } });
  await Bun.sleep(250); expect(c.state.nodes.last.title).toBe("Last");
  expect(c.renderVals().mdText).toContain("# Last");
});

test("pane: copy", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk"); let got = "";
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { got = t; } } });
  c.renderVals().onCopyMd(); await Bun.sleep(5);
  expect(got).toBe(TALK); expect(c.state.note).toBe("Markdown copied");
});

test("pane: download names", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk"); const got: string[] = [];
  c.download = (name: string) => got.push(name);
  c.renderVals().onDownload();
  expect(got).toEqual(["talk.md", "talk-layout.json"]);
});

test("pane: issues text, one line per issue; slide change scrolls the textarea to its heading", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk");
  c.setState({ mdIssues: [{ line: 3, msg: "bad" }, { line: 7, msg: "worse" }] });
  expect(c.renderVals().mdIssuesText).toBe("line 3: bad\nline 7: worse");
  const ta: any = { scrollTop: 0 }; c.mdRef.current = ta;
  c.nav("next", "jump"); c.componentDidUpdate();
  expect(ta.scrollTop).toBe((c.state.nodes.next._line - 1) * 20);
  expect(c.state.nodes.next._line).toBeGreaterThan(1);
});

test("tree: no add/delete controls; Enter in build mode doesn't change nodes", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk");
  const n = c.renderVals().treeNodes[0]; expect(n.onBefore).toBeUndefined(); expect(n.onDelete).toBeUndefined();
  const before = c.state.nodes;
  for (const k of ["Enter", "Tab", "Backspace"]) key(c, k);
  expect(c.state.nodes).toBe(before);
});

test("md layer not editable on slide; an extra text layer still is", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk");
  c.startEdit("md-title"); expect(c.state.editing ?? null).toBeNull();
  c.setLayers("intro", (ls: any[]) => [...ls, { id: "x1", type: "text", text: "hi", x: 0, y: 0, w: 10, h: 10 }]);
  c.startEdit("x1"); expect(c.state.editing).toBe("x1");
});

// ---- apply choice and warning badges ----
const WARN = "Not placed by this slide's layout — click to add a region for it";
const FIVE = (t: string) => `# ${t}\nslug: ${t.toLowerCase()}\n\n` + [1, 2, 3, 4, 5].map(i => `P${i} ${t}.\n\n`).join("");   // no layout fits body ×5

test("apply: layout mode updates shared layout", async () => {
  await writeMd("talk", TWO("A") + TWO("B")); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a" }); c.renderVals().applyItems[1].onClick(); expect(c.state.applyTo).toBe("layout");
  c.updLayer("a", "md-body-2", { x: 70 }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.layouts()["stacked-2"].slots.body[1].x).toBe(70); expect(layerOf(c, "b", "md-body-2").x).toBe(70);
  expect(c.state.nodes.a.custom).toBeUndefined(); expect(c.state.nodes.b.custom).toBeUndefined();
  c.undo(); c.componentDidUpdate(); expect(layerOf(c, "b", "md-body-2").x).toBe(6); expect(c.state.layouts?.["stacked-2"]).toBeUndefined();   // one undo step
});

test("apply: slide mode makes an override", async () => {
  await writeMd("talk", TWO("A") + TWO("B")); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a", stab: "layout" }); let v = c.renderVals();
  expect(v.applyItems.map((b: any) => b.label)).toEqual(["This slide", "Layout"]); expect(c.state.applyTo).toBe("slide");
  c.updLayer("a", "md-body-2", { x: 70 }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes.a.custom).toBe(true); expect(layerOf(c, "b", "md-body-2").x).toBe(6); expect(c.state.layouts?.["stacked-2"]).toBeUndefined();
  expect(c.renderVals().layStatus).toBe("This slide · Stacked 2");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ applyItems }}", "{{ warnBadges }}"]) expect(html).toContain(h);
});

test("warn: badge shown and claim on custom slide clears it", async () => {
  const T = (x: number) => ({ id: "md-title", type: "text", block: "title", x, y: 6, w: 88, h: 14 });
  await writeMd("talk", "# A\nslug: a\n\nOne.\n\nTwo.\n", { version: 1, deck: {}, slides: { a: { custom: true, frames: [{ id: "f1", layers: [T(6), { id: "md-body-1", type: "text", block: "body", x: 50, y: 30, w: 40, h: 40 }] }] } } });
  const { c } = await mount("?deck=talk"); c.setState({ cur: "a" });
  const b2 = layerOf(c, "a", "md-body-2"); let v = c.renderVals();
  expect(v.warnBadges.length).toBe(1); expect(v.warnBadges[0]).toMatchObject({ x: b2.x, y: b2.y, title: WARN });
  c.setState({ mode: "present" }); expect(c.renderVals().warnBadges).toEqual([]); c.setState({ mode: "build" });
  v.warnBadges[0].onClick();
  expect(layerOf(c, "a", "md-body-2")._warn).toBeUndefined(); expect(c.renderVals().warnBadges).toEqual([]);
  expect(c.constructor.md.layoutOf(c.state.nodes).slides.a.frames[0].layers.map((l: any) => l.id)).toContain("md-body-2");   // the override records it
});

test("warn: a hand edit of an unplaced block clears its warning, so the override keeps it", async () => {
  await writeMd("talk", FIVE("A")); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a" }); expect(c.renderVals().warnBadges.length).toBe(5);
  c.updLayer("a", "md-body-3", { x: 40 }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes.a.custom).toBe(true); expect(layerOf(c, "a", "md-body-3")._warn).toBeUndefined(); expect(layerOf(c, "a", "md-body-1")._warn).toBe(true);
  c.reenrich(); expect(layerOf(c, "a", "md-body-3")).toMatchObject({ x: 40 }); expect(layerOf(c, "a", "md-body-3")._warn).toBeUndefined();
});

test("warn: claim on unmatched shape in This slide mode makes an override; no layout, other slides still warn", async () => {
  await writeMd("talk", FIVE("A") + FIVE("B")); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a" }); c.renderVals().warnBadges[2].onClick(); c.componentDidUpdate();
  expect(c.state.layouts || {}).toEqual({}); expect(c.state.nodes.a.custom).toBe(true);
  expect(layerOf(c, "a", "md-body-3")._warn).toBeUndefined(); expect(layerOf(c, "a", "md-body-1")._warn).toBe(true);
  expect(c.layersOf("b").filter((l: any) => l._warn).length).toBe(5);
  c.reenrich(); expect(layerOf(c, "a", "md-body-3")._warn).toBeUndefined();   // the override keeps it
});

test("warn: claim on unmatched shape in Layout mode saves a layout and clears all same-shape warnings", async () => {
  await writeMd("talk", FIVE("A") + FIVE("B")); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a", applyTo: "layout" }); const v = c.renderVals(); expect(v.warnBadges.length).toBe(5);
  v.warnBadges[2].onClick(); c.componentDidUpdate();
  const L = Object.values<any>(c.state.layouts || {}); expect(L.length).toBe(1); expect(L[0].match).toEqual({ title: 1, body: 5 });
  for (const k of ["a", "b"]) { expect(c.layersOf(k).some((l: any) => l._warn)).toBe(false); expect(c.state.nodes[k].custom).toBeUndefined(); }
  expect(c.renderVals().warnBadges).toEqual([]);
});

// ---- linked children ----
const HOST = "# A\nslug: a\n<!-- children: ./team.md -->\n\nHost body.\n\n# B\nslug: b\n<!-- children: ./missing.md -->\n\n# C\nslug: c\n<!-- children: ./page.md -->\n";
const TEAM = "# Costs\nslug: costs\n\nSee [link:plan][Plan] or [link:a][Home].\n\n# Plan\nslug: plan\n";
const titleAt = (x: number) => ({ custom: true, frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", block: "title", x, y: 2, w: 50, h: 10 }] }] });
async function linked(team = TEAM, hostLayout: any = null) {
  const hits: Record<string, number> = {};
  const files: Record<string, () => Response> = { "https://h/host.md": () => reply(HOST, "text/markdown"), "https://h/team.md": () => reply(team, "text/markdown"),
    "https://h/team-layout.json": () => reply(JSON.stringify({ version: 1, deck: {}, slides: { costs: titleAt(20), plan: titleAt(21) } }), "application/json"),
    "https://h/page.md": () => reply("<!doctype html><p>hi</p>", "text/html") };
  if (hostLayout) files["https://h/host-layout.json"] = () => reply(JSON.stringify(hostLayout), "application/json");
  const { c } = await mount("?src=https://h/host.md", { fetch: u => { if (!u.startsWith("https://")) return undefined; hits[u] = (hits[u] || 0) + 1; return files[u] ? files[u]() : reply("", "text/plain", 404); } });
  return { c, hits };
}
const down = async (c: any, from: string) => { c.setState({ cur: from }); c.go("down"); await until(() => c.state.cur !== from && !c.state.loading); c.componentDidUpdate(); };

test("linked: not loaded until navigating down", async () => {
  const { c, hits } = await linked();
  expect(hits["https://h/team.md"]).toBeUndefined(); expect(c.state.nodes["a.costs"]).toBeUndefined();
  expect(c.renderVals().treeNodes.find((n: any) => n.title === "A").toggleLabel).toBe("▸ more");
  await down(c, "a");
  expect(hits["https://h/team.md"]).toBe(1);
  expect(c.state.cur).toBe("a.costs"); expect(c.state.nodes.a.children).toEqual(["a.costs", "a.plan"]);
  expect(c.renderVals().treeNodes.find((n: any) => n.title === "A").toggleLabel).not.toBe("▸ more");
  c.setState({ cur: "a" }); c.go("down"); expect(c.state.cur).toBe("a.costs"); expect(hits["https://h/team.md"]).toBe(1);   // cached
});

test("linked: ids namespaced and _from set", async () => {
  const { c } = await linked(); await down(c, "a");
  expect(c.state.nodes["a.costs"]._from).toBe("https://h/team.md"); expect(c.state.nodes["a.plan"]._from).toBe("https://h/team.md");
  expect(c.state.nodes.a._from).toBeUndefined();
  expect(layerOf(c, "a.costs", "md-body-1").text).toBe("See [Plan]{link=a.plan} or [Home]{link=a}.");
  expect(layerOf(c, "a.plan", "md-title").x).toBe(21);   // the linked file's own override
  const v = c.renderVals(); expect(v.fromDeck).toBe("https://h/team.md"); expect(v.fromHref).toBe("?src=" + encodeURIComponent("https://h/team.md"));
});

test("linked: host override beats linked layout file", async () => {
  const { c } = await linked(TEAM, { version: 1, deck: {}, slides: { "a.costs": titleAt(33) } }); await down(c, "a");
  expect(layerOf(c, "a.costs", "md-title").x).toBe(33);
  expect(c.constructor.md.layoutOf(c.state.nodes, c.state, c._linkedOv).slides["a.costs"].frames[0].layers[0].x).toBe(33);   // saving keeps it
});

test("linked: loop shows error slide", async () => {
  const { c } = await linked("# Costs\nslug: costs\n<!-- children: ./host.md -->\n");
  await down(c, "a"); await down(c, "a.costs");
  const e = c.state.nodes["a.costs.!error"];
  expect(c.state.cur).toBe("a.costs.!error"); expect(e.title).toBe("Can't link https://h/host.md"); expect(e.body).toMatch(/loop/); expect(e._from).toBe("https://h/host.md");
});

test("linked: 404 shows error slide titled \"Can't link https://h/missing.md\"", async () => {
  const { c } = await linked(); await down(c, "b");
  expect(c.state.nodes["b.!error"]).toMatchObject({ title: "Can't link https://h/missing.md", body: "HTTP 404" });
  await down(c, "c"); expect(c.state.nodes["c.!error"]).toMatchObject({ title: "Can't link https://h/page.md", body: "not a markdown file" });
  expect(c.state.nodes.a.children).toEqual([]);   // the rest of the deck is untouched
});

test("linked: link into unloaded file loads it", async () => {
  const { c, hits } = await linked();
  c.nav("a.plan", "jump"); await until(() => c.state.cur === "a.plan");
  expect(hits["https://h/team.md"]).toBe(1);
  c.nav("a.nope", "jump"); await Bun.sleep(20); expect(c.state.cur).toBe("a.plan");   // still missing: nothing happens
});

test("linked: survives host markdown edit", async () => {
  const { c, hits } = await linked(); await down(c, "a");
  c.setMd(HOST.replace("Host body.", "Edited.") + "\n# D\nslug: d\n"); c.reenrich(); c.componentDidUpdate();
  expect(c.state.nodes.d).toBeDefined(); expect(c.state.nodes.a.children).toEqual(["a.costs", "a.plan"]);
  expect(c.state.nodes["a.costs"]._from).toBe("https://h/team.md"); expect(c.state.cur).toBe("a.costs");
  expect(hits["https://h/team.md"]).toBe(1);
});

test("linked: read-only", async () => {
  const { c } = await linked(); await down(c, "a");
  const x0 = layerOf(c, "a.costs", "md-title").x;
  nudge(c, "a.costs", "md-title", 5);
  expect(layerOf(c, "a.costs", "md-title").x).toBe(x0);
  expect(c.state.note).toBe("This slide comes from https://h/team.md: open it to edit");
  expect(c.constructor.md.layoutOf(c.state.nodes, c.state).slides["a.costs"]).toBeUndefined();
});

test("linked: read-only revert settles when setState is deferred", async () => {
  const { c } = await linked(); await down(c, "a");
  const real = c.setState.bind(c), q: any[] = []; c.setState = (u: any, cb?: () => void) => { q.push([u, cb]); };   // React: applied after componentDidUpdate
  const x0 = layerOf(c, "a.costs", "md-title").x, n = c._past.length;
  c.setLayers("a.costs", (ls: any[]) => ls.map(l => l.id === "md-title" ? { ...l, x: l.x + 5 } : l));
  for (let i = 0; i < 10 && q.length; i++) { for (const [u, cb] of q.splice(0)) real(u, cb); c.componentDidUpdate(); }
  expect(q.length).toBe(0);
  expect(layerOf(c, "a.costs", "md-title").x).toBe(x0); expect(c._past.length).toBe(n);
});

test("linked: going down or stepping waits for the load, from the same slide", async () => {
  const { c } = await linked();
  c.setState({ cur: "a" }); c.step(1); await until(() => c.state.cur !== "a"); expect(c.state.cur).toBe("a.costs");   // next into a first child is going down
  for (const move of [() => c.go("down"), () => c.step(1)]) {
    c.setState({ cur: "b" }); move(); c.nav("c", "jump");   // moved away while b's file loads
    await until(() => !c.state.loading); await Bun.sleep(20);
    expect(c.state.cur).toBe("c"); expect(c.state.nodes["c.!error"]).toBeUndefined();
    delete c._linked.b; c.reenrich();
  }
});

// ---- final review fixes ----
test("md layers keep their web link and list bullets through a markdown edit and a save/reload", async () => {
  const md = "# A\nslug: a\n\n- x\n- y\n";
  await writeMd("talk", md);
  const { c } = await mount("?deck=talk"); c.setState({ cur: "a" });
  expect(layerOf(c, "a", "md-list-1").bullets).toBe("disc");
  c.setLayers("a", (ls: any[]) => ls.map(l => l.id === "md-title" ? { ...l, link: { type: "url", url: "https://e.com" } } : l.id === "md-list-1" ? { ...l, bullets: "none" } : l)); c.componentDidUpdate();
  c.setMd(md + "\nMore.\n"); c.reenrich(); c.componentDidUpdate();
  expect(layerOf(c, "a", "md-title").link).toEqual({ type: "url", url: "https://e.com" }); expect(layerOf(c, "a", "md-list-1").bullets).toBe("none");
  await c.save();
  const { c: c2 } = await mount("?deck=talk");
  expect(layerOf(c2, "a", "md-title").link).toEqual({ type: "url", url: "https://e.com" }); expect(layerOf(c2, "a", "md-list-1").bullets).toBe("none");
  expect(layerOf(c2, "a", "md-list-1").text).toBe("x\ny");
});

test("a slide's override survives typing its slug a letter at a time", async () => {
  const md = "# Intro\nslug: intro\n\nHello.\n\n# B\nslug: b\n";
  await writeMd("talk", md);
  const { c } = await mount("?deck=talk"); c.setState({ cur: "intro" });
  nudge(c, "intro", "md-title", 7); const x = layerOf(c, "intro", "md-title").x;
  expect(c.state.nodes.intro.custom).toBe(true);
  for (const s of ["slug: ", "slug: i", "slug: in", "slug: intro"]) { c.setMd(md.replace("slug: intro", s)); c.reenrich(); c.componentDidUpdate(); }
  expect(c.state.nodes.intro.custom).toBe(true); expect(layerOf(c, "intro", "md-title").x).toBe(x);
});

test("browsing into a linked child (batched setState) writes no draft, and reload doesn't ask", async () => {
  const files: Record<string, string> = { "https://y/a.md": "# A\nslug: a\n<!--\nchildren:\n  ./kid.md\n-->\n\nHi.\n\n# B\nslug: b\n", "https://y/kid.md": "# K\nslug: k\n\nKid.\n" };
  const fetch = (u: string) => files[u] ? reply(files[u], "text/markdown") : u.startsWith("https://") ? reply("", "text/plain", 404) : undefined;
  const { c, store } = await mount("?src=https://y/a.md", { fetch, batched: true }); await Bun.sleep(5);
  await c.loadChildren("a"); await Bun.sleep(5);
  expect(c.state.nodes["a.k"]).toBeDefined(); expect(c.isDirty()).toBe(false);
  expect(Object.keys(store).filter(k => k.startsWith("strata-draft"))).toEqual([]);
  const { c: c1 } = await mount("?src=https://y/a.md", { fetch, batched: true, store }); await Bun.sleep(5);
  expect(c1.state.draftPrompt).toBeFalsy();
  c1.reenrich(); await Bun.sleep(5);   // same markdown, re-laid out: the draft the app writes equals the remote deck
  expect(store["strata-draft:https://y/a.md"]).toBeDefined();
  const { c: c2 } = await mount("?src=https://y/a.md", { fetch, batched: true, store }); await Bun.sleep(5);
  expect(c2.state.draftPrompt).toBeFalsy();   // compared with the remote deck as laid out, not the raw layout file
});

test("linked slides don't scroll the markdown (their lines are another file's)", async () => {
  const { c } = await linked(); const ta: any = { scrollTop: 0 }; c.mdRef.current = ta;
  await down(c, "a"); const top = ta.scrollTop;   // the host's slide a scrolled it
  c.nav("a.plan", "jump"); c.componentDidUpdate();
  expect(c.state.cur).toBe("a.plan"); expect(ta.scrollTop).toBe(top);
});

test("src: a url not ending in .md has no layout file; a non-https url is refused", async () => {
  const got: string[] = [];
  const { c } = await mount("?src=https://x/deck", { fetch: u => { got.push(u); return u === "https://x/deck" ? reply("# Hi\nslug: hi\n", "text/plain") : reply("", "text/plain", 404); } });
  expect(got).toEqual(["https://x/deck"]); expect(c.state.note).toBeFalsy(); expect(c.state.nodes.hi).toBeDefined();
  const store = { "strata-v8": JSON.stringify({ md: "# Mine\nslug: mine\n", layout: null }) };
  const { c: c2 } = await mount("?src=http://x/a.md", { store, deckMode: false });
  expect(c2.state.saveMsg).toBe("Can't load http://x/a.md: must be https:"); expect(c2.state.nodes.mine).toBeUndefined();
  c2.componentDidUpdate(); expect(JSON.parse(store["strata-v8"]).md).toBe("# Mine\nslug: mine\n");   // the scratch deck is left alone
});

test("linked: a child url that isn't https is an error slide", async () => {
  const { c } = await linked("# Costs\nslug: costs\n<!-- children: http://e/x.md -->\n");
  await down(c, "a"); await down(c, "a.costs");
  expect(c.state.nodes["a.costs.!error"]).toMatchObject({ title: "Can't link http://e/x.md", body: "must be https:" });
});
