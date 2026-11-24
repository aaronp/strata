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

async function mount(search: string, opts: { href?: string; batched?: boolean; isStatic?: boolean; settle?: boolean; deckMode?: boolean; fetch?: (u: string) => Response | undefined; store?: Record<string, string> } = {}) {
  opts = { deckMode: /(deck=[a-z0-9-]+|src=)/.test(search), ...opts };
  const store: Record<string, string> = opts.store ?? {}, listeners: Record<string, Function> = {};
  const g = {
    location: { search, href: opts.href }, window: { StrataMd: await import("./markdown"), StrataTheme: await import("./theme"), StrataBuilds: await import("./builds"), StrataSanitize: await import("./layout-sanitize"), STRATA_STATIC: !!opts.isStatic, addEventListener: (t: string, f: Function) => (listeners[t] = f), removeEventListener() {} },
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
  await writeMd("talk", TALK, { version: 2, deck: { theme: { background: "image:space" }, styles: { h1: { size: 80 } } },
    slides: { intro: { custom: true, layers: [{ id: "md-title", type: "text", block: "title", x: 1, y: 2, w: 50, h: 10 }, { id: "x1", type: "shape", x: 0, y: 0, w: 5, h: 5 }] } } });
  const { c } = await mount("?deck=talk");
  expect(c.state.md).toBe(TALK);
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "next"]);
  expect(c.state.nodes.intro.children).toEqual(["detail"]);
  expect(c.state.theme).toEqual({ background: "image:space" }); expect(c.state.styles).toEqual({ h1: { size: 80 } });
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

test("app: + adds a slide after or below the current one, in the markdown, and goes to it", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk");
  c.nav("intro", "jump"); c.addSlide("after");
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "new-slide", "next"]);
  expect(c.state.cur).toBe("new-slide");
  c.addSlide("below");
  expect(c.state.nodes["new-slide"].children).toEqual(["new-slide-2"]);
  expect(c.state.cur).toBe("new-slide-2");
  expect(c.state.md).toContain("## New slide\nslug: new-slide-2");
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
  c.setTheme({ background: "image:space" }); c.setState({ images: { ...c.state.images, im1: "data:image/png;base64," + Buffer.from("png").toString("base64") } });
  await c.save();
  expect(await Bun.file(deckDir("talk") + "talk.md").text()).toBe(md);
  const L = await Bun.file(deckDir("talk") + "talk-layout.json").json();
  expect(L.deck.theme.background).toBe("image:space"); expect(L.deck.images.im1).toMatch(/^img\/[0-9a-f]{12}\.png$/);
  expect(L.slides.intro.custom).toBe(true); expect(L.slides.next).toBeUndefined();
  expect(c.state.images.im1).toMatch(/^\.\.\/decks\/talk\/img\/[0-9a-f]{12}\.png$/);
  expect(c.isDirty()).toBe(false);
});

test("app: src loads https url", async () => {
  const files: Record<string, Response> = { "https://x/a.md": reply("# Remote\nslug: r\n\n![pic](img/p.png)\n", "text/markdown"),
    "https://x/a-layout.json": reply(JSON.stringify({ version: 2, deck: { theme: { background: "image:space" }, images: { im1: "img/a.png", im2: "data:image/png;base64,AA" }, customBg: "img/bg.jpg" }, slides: {} }), "application/json") };
  const { c } = await mount("?src=https://x/a.md", { fetch: u => files[u] });
  expect(c.state.saveMsg).toBeFalsy();
  expect(c.state.nodes.r.title).toBe("Remote"); expect(c.state.theme.background).toBe("image:space");
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

test("file menu: New/Open/Save/Download/Copy items; decks load on first open and link by slug, current one bold, plus the tour", async () => {
  await writeMd("talk", TALK); await writeMd("other", "# Other\n");
  const { c } = await mount("?deck=talk");
  expect(c.renderVals().fileItems.map((m: any) => m.label)).toEqual(["New…", "Open file…", "Open URL…", "Save", "Download", "Copy markdown"]);
  c.renderVals().toggleFileMenu(); expect(c.state.fileMenu).toBe(true);
  await until(() => !!c.state.decks);
  const ds = c.renderVals().deckItems;
  expect(ds.map((d: any) => d.href)).toEqual(["?deck=other", "?deck=talk", expect.stringContaining("?src=https%3A%2F%2Fgithub.com")]);
  expect(ds.find((d: any) => d.href === "?deck=talk").weight).toBe(700);
  const got: string[] = []; c.download = (name: string) => got.push(name);
  c.renderVals().fileItems.find((m: any) => m.label === "Download").pick();
  expect(got).toEqual(["talk.md", "talk-layout.json"]); expect(c.state.fileMenu).toBe(false);
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
    const { id: _i, title, body, children: _c, layers, ...rest } = nodes[k];
    md += `${"#".repeat(d)} ${title || k}\nslug: ${k}\n\n${body ? body + "\n\n" : ""}`;
    if (layers) slides[k] = { ...rest, layers, custom: true }; else if (Object.keys(rest).length) slides[k] = rest;
    walk(k, d + 1); } };
  walk("ROOT", 1);
  return writeMd(slug, md, { version: 2, deck: { images: {}, customBg: null, ...extra }, slides });
};
const deckTalk = (t: object = {}) => writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t"]), t: slideNode("t", "Intro", [], t) });

test("a new deck starts with one blank slide named after its slug", async () => {
  const { c } = await mount("?deck=my-talk");
  expect(await Bun.file(deckDir("my-talk") + "my-talk.md").text()).toBe("# My talk\n");
  expect(c.state.nodes.ROOT.children.length).toBe(1);
  expect(c.state.nodes[c.state.nodes.ROOT.children[0]]).toMatchObject({ title: "My talk", children: [] });
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
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a"]), a: slideNode("a", "A", [], { layers: L3 }) });
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
  expect([...heads].filter(h => !(h in vals) && h !== "true").sort()).toEqual([]);   // {{ true }} is a literal
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
    a: slideNode("a", "Alpha", [], { layers: [{ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, code: "" }, { id: "x1", type: "shape", x: 60, y: 0, w: 5, h: 5 }, { id: "x2", type: "shape", x: 70, y: 0, w: 5, h: 5 }],
      steps: { x1: 1, x2: 2 } }),
    b: slideNode("b", "Beta") });
  const { c, listeners } = await mount("?deck=talk");
  const win: any = { posted: [] as any[], postMessage(m: any) { this.posted.push(m); } };
  c.stageRef.current = { clientHeight: 0, querySelectorAll: (q: string) => q === '[data-stage="main"] iframe[data-lid]' ? [{ dataset: { lid: "c1" }, contentWindow: win }] : [] };
  const send = (data: object, source: any = win) => listeners.message({ source, data: { strata: 1, ...data } });
  return { c, win, send };
}

test("hello is answered with enter (step, steps, mode, slide); step changes are posted with the build's duration", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "hello" });
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "enter", step: 0, steps: 2, mode: "build", slide: { id: "a", title: "Alpha" } });
  c.componentDidUpdate();                                  // React runs an update after the load; the stub harness doesn't
  c.setState({ mode: "present" }); key(c, "ArrowRight"); c.componentDidUpdate();
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "step", n: 1, steps: 2, duration: 500 });
  c.setNode("a", { build: { dur: 900 } }); key(c, "ArrowRight"); c.componentDidUpdate();
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "step", n: 2, steps: 2, duration: 900 });
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
  expect(c.state.at).toBe(0);
  send({ type: "ack" });
  key(c, "ArrowRight");                                   // acknowledged → forwarded again
  expect(win.posted.filter((m: any) => m.type === "next").length).toBe(2);
  send({ type: "done" });                                 // component finished → deck moves (next step)
  expect(c.state.at).toBe(1);
  key(c, "ArrowRight");                                   // forwarded, never acknowledged…
  key(c, "ArrowRight");                                   // …so this one bypasses the component
  expect(c.state.at).toBe(2);
});

test("Present: ← and Shift+Space go to the component as prev; back moves the deck back", async () => {
  const { c, win, send } = await compDeck();
  c.setState({ mode: "present", at: 1 });
  send({ type: "ready", steps: true });
  key(c, " ", { shiftKey: true });
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "prev" });
  send({ type: "back" });
  expect(c.state.at).toBe(0);
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
  c.setState({ cur: "a", at: 0 });
  send({ type: "done" });
  expect(c.state.at).toBe(1);
  send({ type: "nav", dir: "right" }); send({ type: "nav", dir: "right" });   // the last step, then the next slide
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

// ---- steps: one layer set per slide, revealed by build step ----
const STEPPED = { version: 2, deck: {}, slides: { intro: { layers: [{ id: "md-title", type: "text", block: "title", x: 6, y: 6, w: 88, h: 14 },
  { id: "md-body-1", type: "text", block: "body", x: 6, y: 30, w: 88, h: 20 }, { id: "x1", type: "shape", x: 0, y: 0, w: 5, h: 5 }],
  steps: { "md-body-1": 1, x1: 3 }, trans: { 1: "rise", 3: "pop" } } } };

test("a v2 layout's steps load; in Present → walks the steps, then the slides; ← lands on the last step, ↓/↑/jump on 0", async () => {
  await writeMd("talk", TALK, STEPPED);
  const { c } = await mount("?deck=talk");
  expect(c.state.nodes.intro).toMatchObject({ custom: true, steps: { "md-body-1": 1, x1: 3 }, trans: { 1: "rise", 3: "pop" } });
  expect(layerOf(c, "intro", "x1")).toBeDefined(); expect(c.stepsOf("intro")).toEqual([1, 3]);
  c.setState({ mode: "present", cur: "intro", at: 0 });
  const body = () => c.renderVals().stageLayers.find((l: any) => l.id === "md-body-1");
  expect(body().build).toMatchObject({ opacity: 0, transform: "translateY(3cqw)" });       // rise, not yet revealed
  key(c, "ArrowRight"); expect(c.state.at).toBe(1); expect(body().build).toMatchObject({ opacity: 1, transform: "none" });
  key(c, "ArrowRight"); expect(c.state.at).toBe(3); expect(c.state.cur).toBe("intro");
  key(c, "ArrowRight"); expect(c.state.cur).toBe("next"); expect(c.state.at).toBe(0);
  key(c, "ArrowLeft"); expect(c.state.cur).toBe("intro"); expect(c.state.at).toBe(3);
  key(c, "ArrowDown"); expect(c.state.cur).toBe("detail"); expect(c.state.at).toBe(0);
  c.setState({ at: 1, cur: "intro" }); key(c, "ArrowDown"); key(c, "ArrowUp"); expect([c.state.cur, c.state.at]).toEqual(["intro", 0]);
  c.setState({ at: 3 }); c.nav("next", "jump"); c.nav("intro", "jump"); expect(c.state.at).toBe(0);
  c.setState({ mode: "build" }); expect(body().build).toBeUndefined();                     // the editor shows every layer
  c.setState({ preview: true }); expect(body().build).toMatchObject({ opacity: 0 });       // unless a preview is playing
});

test("in build mode (no preview) → and Space move between slides and leave at alone; stepBuild still works directly", async () => {
  await writeMd("talk", TALK, STEPPED);
  const { c } = await mount("?deck=talk"); c.setState({ mode: "build", cur: "intro", at: 0 });
  key(c, "ArrowRight"); expect(c.state.cur).toBe("next"); expect(c.state.at).toBe(0);
  c.setState({ cur: "intro", at: 0 }); c.step(1); expect(c.state.cur).toBe("detail"); expect(c.state.at).toBe(0);
  c.setState({ cur: "intro", at: 0 }); expect(c.stepBuild(1)).toBe(true); expect(c.state.at).toBe(1);
  c.setState({ preview: true, at: 0 }); key(c, "ArrowRight"); expect([c.state.cur, c.state.at]).toEqual(["intro", 1]);
});

test("Shift+Space back into a parent opens it on its last step; leaving Present resets at, so the arrows mean slides", async () => {
  await writeMd("talk", TALK, STEPPED);
  const { c } = await mount("?deck=talk"); c.setState({ mode: "present", cur: "detail", at: 0 });
  key(c, " ", { shiftKey: true }); expect([c.state.cur, c.state.at]).toEqual(["intro", 3]);   // up a level, still at the end
  key(c, "Escape"); expect(c.state.mode).toBe("build"); expect(c.state.at).toBe(0);
  c.setState({ at: 3 }); const v = c.renderVals();                                            // even with a stale at, build mode's arrows are slides
  expect(v.hasLeft).toBe(false); expect(v.hasRight).toBe(true); expect(v.rightTitle).toBe("Next");
  c.renderVals().modeTabs[1].onClick(); expect(c.state.at).toBe(0);
});

test("steps with gaps walk 1 → 3 → 7; stepBuild is false at either end", async () => {
  await writeMd("talk", "# A\nslug: a\n\n- one\n- two\n- three\n");
  const { c } = await mount("?deck=talk");
  c.setNode("a", { steps: { "md-list-1-1": 1, "md-list-1-2": 3, "md-list-1-3": 7 } }); c.setState({ cur: "a", at: 0 });
  expect(c.stepBuild(-1)).toBe(false);
  const seen = []; while (c.stepBuild(1)) seen.push(c.state.at);
  expect(seen).toEqual([1, 3, 7]); expect(c.stepBuild(1)).toBe(false);
  expect(c.stepBuild(-1)).toBe(true); expect(c.state.at).toBe(3);
  c.goStep(0); expect(c.state.at).toBe(0);
  expect(c.buildOf("a")).toEqual({ dur: 500, ease: "cubic-bezier(0.2, 0.7, 0.2, 1)", earlier: "dim", replace: true });
  c.setNode("a", { build: { dur: 250 } }); expect(c.buildOf("a").dur).toBe(250);
});

test("removing a bullet drops its step; the current step clamps to the highest remaining one", async () => {
  await writeMd("talk", "# A\nslug: a\n\n- one\n- two\n- three\n");
  const { c } = await mount("?deck=talk");
  c.setNode("a", { steps: { "md-list-1-1": 1, "md-list-1-2": 2, "md-list-1-3": 3 } }); c.setState({ cur: "a", at: 3 });
  c.setMd("# A\nslug: a\n\n- one\n- two\n"); c.reenrich();
  expect(c.state.nodes.a.steps).toEqual({ "md-list-1-1": 1, "md-list-1-2": 2 }); expect(c.state.at).toBe(2);
  expect(c.state.nodes.a.custom).toBeUndefined();                                          // steps alone don't make a slide custom
});

test("a non-v2 layout file is treated as empty", async () => {
  await writeMd("talk", TALK, { version: 1, deck: { theme: { background: "image:space" } }, slides: { intro: { custom: true, frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", block: "title", x: 1, y: 2, w: 50, h: 10 }] }] } } });
  const { c } = await mount("?deck=talk");
  expect(c.state.theme).toEqual(DEFAULT_THEME);
  expect(layerOf(c, "intro", "md-title").x).not.toBe(1); expect(c.state.nodes.intro.frames).toBeUndefined();
});

test("saving writes a version 2 file: no frames, ftrans or tdef; a slide's steps are kept without a layer override", async () => {
  await writeMd("talk", TALK, STEPPED);
  const { c } = await mount("?deck=talk");
  c.setNode("next", { steps: { "md-title": 1 }, trans: { 1: "fade" } }); await c.save();
  const d = await onDisk(), txt = JSON.stringify(d);
  expect(d.version).toBe(2); for (const k of ['"frames"', '"ftrans"', '"tdef"']) expect(txt).not.toContain(k);
  expect(d.slides.intro).toMatchObject({ steps: { "md-body-1": 1, x1: 3 }, trans: { 1: "rise", 3: "pop" } }); expect(d.slides.intro.layers.length).toBe(3);
  expect(d.slides.next).toEqual({ steps: { "md-title": 1 }, trans: { 1: "fade" } });
  const { c: c2 } = await mount("?deck=talk"); expect(c2.state.nodes.next).toMatchObject({ steps: { "md-title": 1 } }); expect(c2.state.nodes.next.custom).toBeUndefined();
});

test("undo restores steps and trans edits", async () => {
  await writeMd("talk", TALK); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setNode("intro", { steps: { "md-body-1": 1 }, trans: { 1: "rise" } }); c.componentDidUpdate();
  c.undo(); c.componentDidUpdate(); expect(c.state.nodes.intro.steps).toBeUndefined(); expect(c.state.nodes.intro.trans).toBeUndefined();
  c.redo(); c.componentDidUpdate(); expect(c.state.nodes.intro).toMatchObject({ steps: { "md-body-1": 1 }, trans: { 1: "rise" } });
});

test("Present draws step dots when the slide has steps and showSteps is on", async () => {
  await writeMd("talk", TALK, STEPPED);
  const { c } = await mount("?deck=talk"); c.setState({ cur: "intro", mode: "present" });
  expect(c.renderVals().showStepDots).toBe(false);
  c.setNode("intro", { showSteps: true }); const v = c.renderVals();
  expect(v.showStepDots).toBe(true); expect(v.stepDots.length).toBe(3);
  v.stepDots[2].onClick(); expect(c.state.at).toBe(3);
});

// ---- Builds tab: click-to-order, transitions, play ----
const LIST = "# A\nslug: a\n\n- one\n- two\n- three\n";
test("ordering: clicks join the current step, Next step starts the next; each click is one undo step; titles can't be assigned", async () => {
  await writeMd("talk", LIST); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a", rtab: "builds" }); c.componentDidUpdate();
  c.startOrdering(); expect(c.state).toMatchObject({ ordering: true, orderStep: 1 });
  c.assignStep("md-list-1-1"); c.componentDidUpdate(); c.nextOrderStep(); c.assignStep("md-list-1-2"); c.componentDidUpdate();
  expect(c.state.nodes.a.steps).toEqual({ "md-list-1-1": 1, "md-list-1-2": 2 }); expect(c.state.nodes.a.trans).toEqual({ 1: "fade", 2: "fade" });
  c.assignStep("md-title"); expect(c.state.nodes.a.steps["md-title"]).toBeUndefined();
  const v = c.renderVals(); expect(v.bElements.map((e: any) => e.badge)).toEqual(["–", "1", "2", "–"]);
  expect(v.bElements[2].badgeBg).toBe("#FBBF24"); expect(v.bElements[1].meta).toBe("Fade"); expect(v.bElements[0].meta).toBe("Always visible");
  c.undo(); c.componentDidUpdate(); expect(c.state.nodes.a.steps).toEqual({ "md-list-1-1": 1 });
  c.setState({ selStep: 1 }); c.renderVals().bTransOpts.find((o: any) => o.label === "Pop").pick(); expect(c.state.nodes.a.trans[1]).toBe("pop");
  c.assignStep("md-list-1-2"); c.setState({ selStep: 2 }); c.renderVals().bTransOpts.find((o: any) => o.label === "Pop").pick(); expect(c.state.nodes.a.trans[2]).toBe("pop");
  const o3 = c.renderVals().overlays.find((o: any) => o.lid === "md-list-1-3"); expect(o3.showBadge).toBe(true);
  o3.onDown({ stopPropagation() {}, button: 0 }); expect(c.state.nodes.a.steps["md-list-1-3"]).toBe(2); expect(c.state.layerSel).toBeFalsy();   // a stage click assigns, doesn't select
  c.finishOrdering(); expect(c.state).toMatchObject({ ordering: false, at: 2 });
  c.startOrdering(); c.clearOrder(); expect(c.stepsOf("a")).toEqual([]); expect(c.state.orderStep).toBe(1);
  c.setState({ rtab: "content" }); c.componentDidUpdate(); expect(c.state.ordering).toBe(false);   // leaving the tab ends ordering
});

test("ordering a list + detail slide: one stacked detail shows at a time; the Stacked here chips assign and reveal the others", async () => {
  await writeMd("talk", "# A\nslug: a\n\n- one\n- two\n\nFirst.\n\nSecond.\n"); const { c } = await mount("?deck=talk");
  c.setState({ cur: "a", rtab: "builds" }); c.startOrdering();
  const shown = () => c.renderVals().stageLayers.filter((l: any) => l.kind === "detail").map((l: any) => [l.id, l.build ? l.build.opacity : 1]);
  let v = c.renderVals(); expect(v.hasPeek).toBe(true); expect(v.peekChips.map((p: any) => p.short)).toEqual(["D1", "D2"]);
  expect(shown()).toEqual([["md-body-1", 1], ["md-body-2", 0]]); expect(v.overlays.some((o: any) => o.lid === "md-body-2")).toBe(false);
  c.nextOrderStep(); v.peekChips[1].click(); expect(c.state.nodes.a.steps["md-body-2"]).toBe(2); expect(shown()).toEqual([["md-body-1", 0], ["md-body-2", 1]]);
  expect(c.renderVals().bElements.find((e: any) => e.badge === "2").meta).toBe("Fade · replaced by next");
});

test("play walks the steps with preview on, then stops at the end with preview off", async () => {
  await writeMd("talk", LIST); const { c } = await mount("?deck=talk");
  c.setNode("a", { steps: { "md-list-1-1": 1, "md-list-1-2": 3 } }); c.setState({ cur: "a", rtab: "builds", at: 0 });
  c.togglePlay(); expect(c.state).toMatchObject({ playing: true, preview: true, at: 1 });
  c.playTick(); expect(c.state.at).toBe(3);
  c.playTick(); expect(c.state).toMatchObject({ playing: false, preview: false, at: 3 }); expect(c._play).toBeNull();
  const v = c.renderVals(); expect(v.bFrames.map((f: any) => [f.n, f.trans])).toEqual([[1, "Fade"], [3, "Fade"]]);
  v.bFrames[0].pick(); expect(c.state).toMatchObject({ at: 1, preview: true, selStep: 1 });
  key(c, "Escape"); expect(c.state.preview).toBe(false);
});

test("timing and list behaviour write the slide's build; showSteps toggles step dots", async () => {
  await writeMd("talk", LIST); const { c } = await mount("?deck=talk"); c.setState({ cur: "a", rtab: "builds" });
  const v = c.renderVals();
  v.bDurOpts.find((o: any) => o.label === "Slow").pick(); v.bEaseOpts.find((o: any) => o.label === "Springy").pick();
  v.bEarlierOpts.find((o: any) => o.label === "Keep").pick(); v.bReplaceOpts.find((o: any) => o.label === "Build up").pick();
  expect(c.buildOf("a")).toEqual({ dur: 900, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)", earlier: "keep", replace: false });
  c.renderVals().bOnShowSteps({ target: { checked: true } }); expect(c.state.nodes.a.showSteps).toBe(true);
});

test("linked slides refuse ordering and transition picks, but preview works", async () => {
  const { c } = await linked(); await down(c, "a"); c.setState({ rtab: "builds" });
  c.setNode(c.state.cur, { steps: { "md-title": 1 }, trans: { 1: "fade" } });
  c.startOrdering(); expect(c.state.ordering).toBe(false); expect(c.state.note).toBe("Linked slides are read-only here: change them in their own markdown file");
  c.renderVals().bTransOpts[6].pick(); expect(c.state.nodes[c.state.cur].trans[1]).toBe("fade");
  c.renderVals().bNext(); expect(c.state).toMatchObject({ at: 1, preview: true });
});

test("the component AI guide speaks of steps, not frames", async () => {
  await writeMd("talk", TALK); const { c } = await mount("?deck=talk"); let got = "";
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { got = t; } } });
  c.renderVals().onCopyCompGuide(); await Bun.sleep(5);
  expect(got).toContain("step"); expect(got).not.toContain("'frame'");
});

// ---- component review fixes ----
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
  expect(c.state.at).toBe(1);
});

test("while editing, a component can't navigate unless Interact is on for it", async () => {
  const { c, send } = await compDeck();
  send({ type: "done" });
  expect(c.state.cur).toBe("a");
  expect(c.state.at).toBe(0);
  expect(c.state.note).toContain("Interact");
  c.setState({ interact: "c1", layerSel: "c1" });
  send({ type: "jumpTo", slug: "b" });
  expect(c.state.cur).toBe("b");
});

test("a hidden component can't claim the keys", async () => {
  const { c, send } = await compDeck();
  c.setState({ nodes: { ...c.state.nodes, a: { ...c.state.nodes.a, layers: c.state.nodes.a.layers.map((l: any) => ({ ...l, hidden: true })) } } });
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
  expect((html.match(/cards="true"/g) || []).length).toBe(2);   // tree, present tree view
});

test("regression: every tree node carries its selection, thumbnail framing and layers", async () => {
  const c = await treeDeck();
  const n = c.renderVals().treeNodes.find((t: any) => t.title === "A");
  expect(n).toMatchObject({ selected: true, outline: "2px solid #7AA2FF", full: "A" });
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

test("the wireframe title rect is clamped to the canvas, so all four dashed edges show at Fit", async () => {
  const c = await titleDeck();
  const f = c.renderVals().titleFrame;
  expect(+f.t).toBeGreaterThanOrEqual(0); expect(+f.t + +f.h).toBeLessThanOrEqual(100.001);
  expect(+f.l).toBeGreaterThanOrEqual(0);
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
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s"]), s: slideNode("s", "S", [], { layers }) }, extra);
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

test("choosing a style clears overrides; Custom writes the resolved values back; each is one undo step", async () => {
  const c = await styledDeck(); await Bun.sleep(150);
  c.chooseStyle("s", "b", "h2"); c.componentDidUpdate();
  expect(c.layersOf("s")[1]).toMatchObject({ style: "h2" }); expect(c.layersOf("s")[1].size).toBeUndefined();
  c.undo(); c.componentDidUpdate(); expect(c.layersOf("s")[1]).toMatchObject({ style: "h1", size: 50 });
  c.chooseStyle("s", "a", ""); c.componentDidUpdate();
  const a = c.layersOf("s")[0]; expect(a.style).toBeFalsy(); expect(a).toMatchObject({ size: 64, weight: 800, valign: "middle" });
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
  expect(a._lines).toEqual([[{ text: "x " }, { text: "y", size: 41, weight: 700, color: "#93C5FD", font: "'Space Grotesk', sans-serif", ls: 0 }, { text: " " }, { text: "z", b: true }]]);   // H2's theme tokens, resolved
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



// ---- inline links ----
test("inline links: parsed into runs, broken targets flagged, followed in present mode, and set from the bar", async () => {
  const { parseRich } = await rich();
  expect(parseRich("see [the costs]{link=costs} or [r]{href=https://e.x/r?a=b}")).toEqual([{ text: "see " }, { text: "the costs", link: "costs" }, { text: " or " }, { text: "r", href: "https://e.x/r?a=b" }]);
  expect(parseRich("[x]{href=javascript:alert(1)}")).toEqual([{ text: "x" }]);              // only http(s)/mailto
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { layers: [TL("a", { text: "go [here]{link=costs} or [there]{link=gone}" })] }), costs: slideNode("costs", "Costs") });
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
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { layers: [TL("a", { text: "see [the costs]{link=costs} now" })] }), costs: slideNode("costs", "Costs") });
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
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { layers: [TL("a", { text: "see [the costs]{link=costs} now", y: 8 })] }), costs: slideNode("costs", "Costs") });
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
  expect(c.styles().bullets).toMatchObject({ name: "Bullets", bullets: "disc", font: "body", color: "text" });
});

// ---- layouts ----
const lay = async () => (await mount("")).c.constructor.lay;
const LTX = (id: string, style: string | undefined, x: number, y: number, extra: object = {}) => ({ id, type: "text", text: id, x, y, w: 10, h: 10, ...(style ? { style } : {}), ...extra });
const TWO = (t: string) => `# ${t}\nslug: ${t.toLowerCase()}\n\nOne ${t}.\n\nTwo ${t}.\n\n`;
const layDeck = async (slides: Record<string, any[]>, extra: object = {}) => {
  const ids = Object.keys(slides);
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ids), ...Object.fromEntries(ids.map(k => [k, slideNode(k, k.toUpperCase(), [], { layers: slides[k] })])) }, extra);
  return (await mount("?deck=talk")).c;
};

test("shapes count blocks (a list once); layouts match exactly; slots fill by key then reading order", async () => {
  const { BUILTIN_LAYOUTS, sigOf, sigKey, fillSlots } = await lay();
  const layers = [BL("t", "title"), BL("b2", "body", { x: 50, y: 50 }), BL("b1", "body", { y: 50 }), LTX("c", "body", 0, 0), BL("hid", "body", { hidden: true }),
    { id: "i", type: "image", block: "image", x: 0, y: 0, w: 1, h: 1 }, BL("src", "sources"), { id: "s", type: "shape", x: 0, y: 0, w: 1, h: 1 },
    BL("l1", "list", { list: 1, item: 1 }), BL("l2", "list", { list: 1, item: 2 }), { id: "gen-number", type: "text", text: "01", x: 0, y: 0, w: 1, h: 1 }];
  expect(sigOf(layers)).toEqual({ title: 1, body: 2, image: 1, list: 1 });
  expect(sigKey({ title: 1, body: 2 })).toBe("body:2,title:1"); expect(sigKey({})).toBe("");
  const boxes = fillSlots(layers.slice(0, 3), BUILTIN_LAYOUTS["stacked-2"]);
  expect(boxes).toEqual({ t: { x: 6, y: 6, w: 88, h: 14, rot: 0 }, b1: { x: 6, y: 24, w: 88, h: 32, rot: 0 }, b2: { x: 6, y: 58, w: 88, h: 32, rot: 0 } });
  for (const L of Object.values<any>(BUILTIN_LAYOUTS)) {
    for (const k in L.match) expect(L.slots[k].length).toBe(L.match[k] === "items" ? 1 : L.match[k]);
    for (const k in L.slots) for (const b of L.slots[k]) { expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= 100.01 && b.y + b.h <= 100.01).toBe(true); }
  }
});

test("templates: one layer per bullet, stacked inside the list region", async () => {
  const { enrich } = (await mount("")).c.constructor.md, { sigOf, sigKey } = await lay(), MDp = await import("./markdown");
  const n = enrich(MDp.parseMarkdown("# T\n- a\n- b\n- c\n").sections, []).nodes.t, ls = n.layers, items = ["md-list-1-1", "md-list-1-2", "md-list-1-3"].map(id => ls.find((l: any) => l.id === id));
  expect(items.map((l: any) => [l.text, l.block, l.list, l.item, l.kind, l.bullets])).toEqual([["a", "list", 1, 1, "item", "disc"], ["b", "list", 1, 2, "item", "disc"], ["c", "list", 1, 3, "item", "disc"]]);
  expect(sigKey(sigOf(ls))).toBe("list:1,title:1"); expect(n.layout).toBe("list");
  const h = (66 - 4) / 3;
  items.forEach((l: any, k: number) => { expect(l).toMatchObject({ x: 6, w: 88 }); expect(l.y).toBeCloseTo(24 + k * (h + 2)); expect(l.h).toBeCloseTo(h); });
  expect(items[2].y + items[2].h).toBeCloseTo(90);
});

test("templates: list + detail pairs bodies with bullets (t-split); a mismatch warns; section numbers", async () => {
  const { enrich } = (await mount("")).c.constructor.md, { BUILTIN_LAYOUTS, fitsTemplate } = await lay(), MDp = await import("./markdown");
  const run = (md: string, layouts: any[] = []) => enrich(MDp.parseMarkdown(md).sections, layouts).nodes;
  const at = (n: any, id: string) => n.layers.find((l: any) => l.id === id);
  const s = run("# T\n- a\n- b\n\nA.\n\nB.\n").t;
  expect(s.layout).toBe("t-split"); expect(fitsTemplate(s.layers, BUILTIN_LAYOUTS["t-split"])).toBe(true);
  const d1 = at(s, "md-body-1"), d2 = at(s, "md-body-2");
  expect(d1.kind).toBe("detail"); expect(d2.kind).toBe("detail");
  expect([d2.x, d2.y, d2.w, d2.h]).toEqual([d1.x, d1.y, d1.w, d1.h]); expect(d1).toMatchObject(BUILTIN_LAYOUTS["t-split"].slots.body[0]);
  const w = run("# T\n- a\n- b\n- c\n\nA.\n\nB.\n").t;
  expect(w.layout).toBeUndefined(); expect(fitsTemplate(w.layers, BUILTIN_LAYOUTS["t-split"])).toBe(false);
  for (const l of w.layers) expect(!!l._warn).toBe(l.id !== "md-title");
  const sec = run("# A\n# B\n", [{ deck: { layoutDefaults: { "title:1": "t-section" } } }]);
  expect(sec.b.layout).toBe("t-section"); expect(at(sec.b, "gen-number")).toMatchObject({ text: "02", color: "impact" }); expect(at(sec.a, "gen-number").text).toBe("01");
  expect(run("# A\n").a.layers.some((l: any) => l.id === "gen-number")).toBe(false);   // the plain title layout has no number
  expect(BUILTIN_LAYOUTS["t-statement"].match).toEqual({ title: 1, body: 2 });
  expect(Object.keys(BUILTIN_LAYOUTS).filter(k => k.startsWith("t-"))).toEqual(["t-title", "t-title-sub", "t-bar", "t-split", "t-two", "t-cards", "t-section", "t-statement", "t-shapes"]);
});

test("effective layout: the slide's own (even one that doesn't fit), else the deck default, else the first match", async () => {
  await writeMd("talk", TWO("A") + "# Z\nslug: z\n", { version: 2, deck: { layoutDefaults: { "body:2,title:1": "cols-2" } }, slides: {} });
  const { c } = await mount("?deck=talk");
  expect(c.effectiveLayout("a").id).toBe("cols-2"); expect(layerOf(c, "a", "md-body-2")).toMatchObject({ x: 52, y: 24 });   // laid out by it on load
  c.setNode("a", { layout: "stacked-2" }); expect(c.effectiveLayout("a").id).toBe("stacked-2");
  c.setNode("a", { layout: "title" }); expect(c.effectiveLayout("a").id).toBe("title");      // an explicit choice wins, fit or not
  c.setNode("a", { layout: undefined }); expect(c.effectiveLayout("a").id).toBe("cols-2");   // none → the default
  c.setState({ layoutDefaults: {} }); expect(c.effectiveLayout("a").id).toBe("stacked-2");   // first match
  expect(c.effectiveLayout("z").id).toBe("title"); expect(c.effectiveLayout("ROOT")).toBeNull();
  expect(c.isCustom("a")).toBe(false); c.setNode("a", { custom: true }); expect(c.isCustom("a")).toBe(true);
  expect(c.layouts()["cols-2"]).toMatchObject({ id: "cols-2", name: "Two columns" });
});

test("a hand edit to a slide's layers makes it an override (same undo step); layout and enrich commits, undo and title edits don't", async () => {
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
  const nodes = { ...c.state.nodes, a: { ...c.state.nodes.a, layers: c.layersOf("a").map((l: any) => l.id === "md-title" ? { ...l, y: 50 } : l) } };
  c.allowLayout(nodes); c.setState({ nodes }); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined();
  c.setMd(TWO("A") + "More.\n"); c.reenrich(); c.componentDidUpdate(); expect(c.state.nodes.a.custom).toBeUndefined();
});

test("layout actions: apply, apply to all (default slides only), reset, save as, update from, rename, delete", async () => {
  await writeMd("talk", ["A", "B", "D", "M", "X"].map(TWO).join(""));
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  const at = (id: string) => layerOf(c, id, "md-body-2");
  expect(at("b")).toMatchObject({ x: 6, y: 58, w: 88, h: 32 });                                                    // stacked-2: its shape's first match
  c.setNode("d", { custom: true }); c.setNode("m", { custom: true }); c.componentDidUpdate(); await Bun.sleep(500);
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

test("Slides tab: templates that fit this slide come first, then the rest; thumbnails draw a template's icon or its slot boxes", async () => {
  await writeMd("talk", "# T\nslug: t\n\n- a\n- b\n");
  const { c } = await mount("?deck=talk"); c.setState({ cur: "t", rtab: "slides" }); const v = c.renderVals();
  const fits = v.tplFits.map((t: any) => t.id), rest = v.tplOthers.map((t: any) => t.id);
  expect(fits).toEqual(["list", "t-bar"]);
  for (const id of fits) expect(c.constructor.lay.fitsTemplate(c.layersOf("t"), c.layouts()[id])).toBe(true);
  for (const id of rest) expect(c.constructor.lay.fitsTemplate(c.layersOf("t"), c.layouts()[id])).toBe(false);
  expect([...fits, ...rest].sort()).toEqual(Object.keys(c.layouts()).sort());
  expect(v.tplFits[0]).toMatchObject({ name: "Title + list", on: true }); expect(v.tplFits[1].on).toBe(false);
  expect(v.tplFits[1].rects[0]).toMatchObject({ l: 0, t: 0, w: 100, h: 24 });                                       // t-bar: the prototype's icon
  expect(v.tplFits[0].rects.map((r: any) => [r.l, r.t, r.w, r.h])).toEqual([[6, 6, 88, 14], [6, 24, 88, 66]]);      // list: its slots
  expect(v.layStatus).toBe("Default · Title + list"); expect(v.tplName).toBe("Title + list");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ tplFits }}", "{{ tplOthers }}", "{{ onLaySave }}", "{{ onLayUpdate }}", "{{ onLayApplyAll }}", "{{ applyItems }}", "{{ placeholders }}"]) expect(html).toContain(h);
  expect(html).not.toMatch(/\bstab\b/);
});

test("Slides tab: clicking a template applies it; the title bar option draws or removes the generated band; list side mirrors List + detail", async () => {
  await writeMd("talk", "# T\nslug: t\n\n- a\n- b\n\n# S\nslug: s\n\n- a\n- b\n\nA.\n\nB.\n");
  const { c } = await mount("?deck=talk"); c.setState({ cur: "t", rtab: "slides" });
  c.renderVals().tplFits.find((t: any) => t.id === "t-bar").pick(); c.componentDidUpdate();
  expect(c.state.nodes.t.layout).toBe("t-bar"); expect(layerOf(c, "t", "gen-bar")).toMatchObject({ type: "shape", x: 0, y: 0, w: 100 });
  let v = c.renderVals();
  expect(v.hasBarOpt).toBe(true); expect(v.hasSideOpt).toBe(false); expect(v.barOpts.map((o: any) => [o.label, o.on])).toEqual([["Band", true], ["Underline", false], ["None", false]]);
  expect(v.layerRows.length).toBe(c.layersOf("t").length - 1); expect(v.overlays.some((o: any) => o.lid === "gen-bar")).toBe(false);   // generated: not a stage object
  v.barOpts[2].pick(); c.componentDidUpdate();
  expect(c.state.nodes.t.barStyle).toBe("none"); expect(layerOf(c, "t", "gen-bar")).toBeUndefined();
  c.renderVals().barOpts[1].pick(); c.componentDidUpdate(); expect(layerOf(c, "t", "gen-bar")).toMatchObject({ token: "primary" });
  c.reenrich(); expect(c.state.nodes.t.barStyle).toBe("rule"); expect(layerOf(c, "t", "gen-bar")).toMatchObject({ token: "primary" });   // kept with the slide
  expect(JSON.stringify(c.constructor.md.layoutOf(c.state.nodes))).not.toContain("gen-bar");
  c.setState({ cur: "s" }); v = c.renderVals(); expect(c.state.nodes.s.layout).toBe("t-split"); expect(v.hasSideOpt).toBe(true);
  expect(v.sideOpts.map((o: any) => o.label)).toEqual(["List left", "List right"]);
  v.sideOpts[1].pick(); c.componentDidUpdate();
  expect(c.state.nodes.s.side).toBe("right"); expect(layerOf(c, "s", "md-list-1-1").x).toBe(69); expect(layerOf(c, "s", "md-body-1").x).toBe(4);
  c.reenrich(); expect(layerOf(c, "s", "md-list-1-1").x).toBe(69);
});

test("Slides tab: the template's placeholders; clicking one opens Content; a markdown layer on the stage leaves the tab alone", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n\nTwo.\n");
  const { c } = await mount("?deck=talk"); c.setState({ cur: "t", rtab: "slides" }); c.applyLayout("t", "t-two");
  let v = c.renderVals(); expect(v.placeholders.map((p: any) => p.name)).toEqual(["Title", "Body 1", "Body 2"]);
  v.placeholders[1].pick(); expect(c.state.rtab).toBe("content");
  c.setState({ rtab: "slides" }); c.stageRef.current = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  c.renderVals().overlays.find((o: any) => o.lid === "md-title").onDown({ stopPropagation() {}, button: 0, clientX: 5, clientY: 5 });
  expect(c.state.rtab).toBe("slides"); expect(c.state.layerSel).toBe("md-title");
  c.setState({ rtab: "theme" }); c.renderVals().overlays.find((o: any) => o.lid === "md-body-1").onDown({ stopPropagation() {}, button: 0, clientX: 5, clientY: 5 });
  expect(c.state.rtab).toBe("theme"); expect(c.state.layerSel).toBe("md-body-1");
  c.addLayer("text", { x: 10, y: 10, w: 20, h: 10 }); const own = c.state.layerSel; c.setState({ rtab: "theme", layerSel: null });
  c.renderVals().overlays.find((o: any) => o.lid === own).onDown({ stopPropagation() {}, button: 0, clientX: 5, clientY: 5 });
  expect(c.state.rtab).toBe("slides"); expect(c.state.layerSel).toBe(own);   // not a markdown layer: its properties show
});

// ---- picking a template: placeholder text for its empty regions, written into the slide's markdown ----
const pickTpl = (c: any, id: string, cdu = true) => { const v = c.renderVals(); [...v.tplFits, ...v.tplOthers].find((t: any) => t.id === id).pick(); if (cdu) c.componentDidUpdate(); };   // batched: the flush runs componentDidUpdate, as React does
const PICK = "# T\nslug: t\n\nOne.\n\n# U\nslug: u\n";
test("template pick: stacked-3 adds two ##Text## to the slide's markdown, all placed; stacked-1 removes them again", async () => {
  for (const batched of [false, true]) {
    await writeMd("talk", PICK); const { c } = await mount("?deck=talk", { batched }); await Bun.sleep(150); c.setState({ cur: "t", rtab: "slides" }); await Bun.sleep(0); c.componentDidUpdate();
    pickTpl(c, "stacked-3", !batched); await Bun.sleep(0);
    expect(c.state.md).toBe("# T\nslug: t\n\nOne.\n\n##Text##\n\n##Text##\n\n# U\nslug: u\n");
    expect(c.state.nodes.t.layout).toBe("stacked-3");
    const bodies = c.layersOf("t").filter((l: any) => l.block === "body");
    expect(bodies.map((l: any) => l.text)).toEqual(["One.", "##Text##", "##Text##"]); expect(c.layersOf("t").some((l: any) => l._warn)).toBe(false);
    expect(bodies.map((l: any) => l.y)).toEqual([24, 46.67, 69.33]);
    pickTpl(c, "stacked-1", !batched); await Bun.sleep(0);
    expect(c.state.md).toBe(PICK); expect(c.state.nodes.t.layout).toBe("stacked-1"); expect(c.layersOf("t").some((l: any) => l._warn)).toBe(false);
  }
});

test("template pick: one undo step restores markdown and layout; redo brings both back", async () => {
  await writeMd("talk", PICK); const { c } = await mount("?deck=talk"); await Bun.sleep(150); c.setState({ cur: "t", rtab: "slides" });
  pickTpl(c, "t-two"); const past = c._past.length;
  expect(c.state.md).toContain("One.\n\n##Text##\n\n# U"); expect(c.state.nodes.t.layout).toBe("t-two");
  pickTpl(c, "stacked-3"); expect(c._past.length).toBe(past + 1);
  c.undo(); c.componentDidUpdate();
  expect(c.state.md).toContain("One.\n\n##Text##\n\n# U"); expect(c.state.nodes.t.layout).toBe("t-two");
  c.undo(); c.componentDidUpdate(); expect(c.state.md).toBe(PICK); expect(c.state.nodes.t.layout).toBe("stacked-1");
  c.redo(); c.componentDidUpdate(); expect(c.state.md).toContain("##Text##"); expect(c.state.nodes.t.layout).toBe("t-two");
});

test("template pick: an edited placeholder is real content and survives a later switch", async () => {
  await writeMd("talk", PICK); const { c } = await mount("?deck=talk"); await Bun.sleep(150); c.setState({ cur: "t", rtab: "slides" });
  pickTpl(c, "stacked-3"); c.setMd(c.state.md.replace("##Text##", "Mine.")); c.reenrich(); c.componentDidUpdate();
  pickTpl(c, "stacked-1");
  expect(c.state.md).toBe("# T\nslug: t\n\nOne.\n\nMine.\n\n# U\nslug: u\n");
});

test("template pick: List + detail adds a ##Detail## per bullet; a title-only slide picking a list gets three ##Point##; the subtitle", async () => {
  await writeMd("talk", "# S\nslug: s\n\n- a\n- b\n- c\n\n# T\nslug: t\n\n# U\nslug: u\n");
  const { c } = await mount("?deck=talk"); await Bun.sleep(150); c.setState({ cur: "s", rtab: "slides" });
  pickTpl(c, "t-split");
  expect(c.state.md).toContain("- c\n\n##Detail##\n\n##Detail##\n\n##Detail##\n\n# T"); expect(c.layersOf("s").some((l: any) => l._warn)).toBe(false);
  c.setState({ cur: "t" }); pickTpl(c, "list");
  expect(c.state.md).toContain("# T\nslug: t\n\n- ##Point##\n- ##Point##\n- ##Point##\n\n# U");
  expect(c.layersOf("t").filter((l: any) => l.block === "list").length).toBe(3); expect(c.layersOf("t").some((l: any) => l._warn)).toBe(false);
  c.setState({ cur: "u" }); pickTpl(c, "t-title-sub"); expect(c.state.md.endsWith("# U\nslug: u\n\n##Subtitle##\n")).toBe(true);
  pickTpl(c, "image-right"); expect(c.state.md.endsWith("# U\nslug: u\n\n##Text##\n")).toBe(true);   // no placeholder for an image
});

test("template pick: a step on a block after a removed placeholder stays on that block (body and bullet)", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n\n##Text##\n\nMine.\n\n# U\nslug: u\n\n- a\n- ##Point##\n- c\n");
  const { c } = await mount("?deck=talk"); await Bun.sleep(150); c.setState({ cur: "t", rtab: "slides" });
  c.setNode("t", { steps: { "md-body-2": 1, "md-body-3": 2 }, trans: { 1: "fade", 2: "fade" } }); c.componentDidUpdate();
  pickTpl(c, "t-two");
  expect(c.state.md).toContain("# T\nslug: t\n\nOne.\n\nMine.\n\n# U");
  expect(layerOf(c, "t", "md-body-2").text).toBe("Mine."); expect(c.state.nodes.t.steps).toEqual({ "md-body-2": 2 });   // the placeholder's own step goes
  c.setState({ cur: "u" }); c.setNode("u", { steps: { "md-list-1-3": 1 }, trans: { 1: "fade" } }); c.componentDidUpdate();
  pickTpl(c, "list");
  expect(c.state.md.endsWith("# U\nslug: u\n\n- a\n- c\n")).toBe(true);
  expect(layerOf(c, "u", "md-list-1-2").text).toBe("c"); expect(c.state.nodes.u.steps).toEqual({ "md-list-1-2": 1 });
});

test("template pick: a custom per-slide box on a block after a removed placeholder stays on that block", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n\n##Text##\n\nMine.\n\n# U\nslug: u\n");
  const { c } = await mount("?deck=talk"); await Bun.sleep(150); c.setState({ cur: "t", rtab: "slides" });
  const box = { bg: "#ff0000", bgOpacity: 1, blur: 0, border: 0, borderColor: "#ffffff", radius: 4, pad: 8 };
  c.updLayer("t", "md-body-3", { card: "custom", box }); c.componentDidUpdate(); expect(c.state.nodes.t.custom).toBe(true);
  pickTpl(c, "t-two");
  expect(layerOf(c, "t", "md-body-2")).toMatchObject({ text: "Mine.", card: "custom", box });
  expect(layerOf(c, "t", "md-body-1").box).toMatchObject({ bg: "surface", borderOpacity: 0.22 });   // the template's own card, not the user's
});

test("template pick: an open in-place edit is committed first, then the pick lands", async () => {
  await writeMd("talk", PICK); const { c } = await mount("?deck=talk"); await Bun.sleep(150); c.setState({ cur: "t", rtab: "slides" });
  c.startEdit("md-body-1"); c.updLayer("t", "md-body-1", { text: "One typed." }); c.componentDidUpdate();
  pickTpl(c, "stacked-3");
  expect(c.state.editing).toBeNull();
  expect(c.state.md).toBe("# T\nslug: t\n\nOne typed.\n\n##Text##\n\n##Text##\n\n# U\nslug: u\n"); expect(c.state.nodes.t.layout).toBe("stacked-3");
});

test("template pick: a linked slide's markdown isn't written; its layout applies as before", async () => {
  const { c } = await linked(); await down(c, "a"); const md = c.state.md;
  c.setState({ cur: "a.plan", rtab: "slides" }); pickTpl(c, "stacked-2");
  expect(c.state.md).toBe(md);
});

test("placeholder text renders dimmed and italic on md layers only", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/Layers.dc.html")).text();
  const js2 = html.split(/<script type="text\/x-dc" data-dc-script[^>]*>/)[1].split("</script>")[0];
  const C2 = new Function("DCLogic", "window", js2 + "\nreturn Component;")(class { props: any; constructor(p: any) { this.props = p; } }, { StrataSanitize: await import("./layout-sanitize") });
  const it = (id: string, text: string) => new C2({ layers: [{ id, type: "text", text, x: 0, y: 0, w: 9, h: 9 }] }).renderVals().items[0];
  expect(it("md-body-2", "##Text##")).toMatchObject({ op: 0.5 }); expect(it("md-body-2", "##Text##").lines[0].runs[0].fst).toBe("italic");
  expect(it("md-body-2", "##Text## more").op).toBe(1); expect(it("x1", "##Text##").op).toBe(1);
});

const STAGE100 = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
const drag = (c: any, listeners: any, tool: string, a: number[], b: number[], shiftKey = false) => {
  c.setState({ tool }); c.renderVals().onStageDown({ button: 0, clientX: a[0], clientY: a[1], shiftKey });
  listeners.pointermove({ clientX: b[0], clientY: b[1], shiftKey }); listeners.pointerup({ clientX: b[0], clientY: b[1], shiftKey });
};

test("shape tool: drawing an ellipse adds a shape layer with the drawn bounds and the defaults, then goes back to Select; Fill is a theme token", async () => {
  await deckTalk(); const { c, listeners } = await mount("?deck=talk"); c.stageRef.current = STAGE100;
  let v = c.renderVals();
  expect(v.tools.map((t: any) => t.label)).toEqual(["Select (V)", "Text (T)", "Rectangle (R)", "Rounded rectangle", "Ellipse (O)", "Line (L)", "Arrow (A)"]);
  v.tools[4].pick(); expect(c.state.tool).toBe("ellipse"); v = c.renderVals();
  expect(v.toolHint).toBe("Drag to draw · Shift for a circle"); expect(v.tools[4].on).toBe(true);
  drag(c, listeners, "ellipse", [10, 10], [30, 40]);
  const l = c.layersOf("t").at(-1);
  expect(l).toMatchObject({ type: "shape", x: 10, y: 10, w: 20, h: 30, kind: "ellipse", token: "primary", fillOpacity: 35, opacity: 1, border: { width: 2, style: "solid" }, blend: "screen" });
  expect(c.state.tool).toBe("select"); expect(c.state.layerSel).toBe(l.id);
  v = c.renderVals(); expect(v.lyIsShape).toBe(true);
  expect(v.fillOpts.map((o: any) => o.label)).toEqual(["Primary", "Secondary", "Tertiary", "Impact", "Text", "None"]);
  v.fillOpts[1].pick();
  const P = c.theme().palette; expect(c.resolveLayer(c.layersOf("t").at(-1), "t")).toMatchObject({ fill: P.secondary + "59", stroke: P.secondary, opacity: 1 });
  expect(c.layersOf("t").at(-1).fillOpacity).toBe(35);
  v = c.renderVals(); v.setShapeOpacity({ target: { value: "100" } }); expect(c.layersOf("t").at(-1)).toMatchObject({ fillOpacity: 100, opacity: 1 }); expect(c.resolveLayer(c.layersOf("t").at(-1), "t").fill).toBe(P.secondary + "ff");
  v = c.renderVals();
  expect(v.kindOpts.map((o: any) => o.label)).toEqual(["Ellipse", "Rounded", "Rectangle"]); v.kindOpts[1].pick(); expect(c.layersOf("t").at(-1).kind).toBe("round");
  v = c.renderVals(); expect(v.widthOpts.map((o: any) => o.label)).toEqual(["None", "Thin", "Medium", "Thick"]); v.widthOpts[3].pick(); expect(c.layersOf("t").at(-1).border).toEqual({ width: 5, style: "solid" });
  v = c.renderVals(); v.borderStyleOpts[2].pick(); expect(c.layersOf("t").at(-1).border).toEqual({ width: 5, style: "dotted" });
  v = c.renderVals(); expect(v.blendOpts.map((o: any) => o.label)).toEqual(["Stack", "Blend colours"]); v.blendOpts[0].pick(); expect(c.layersOf("t").at(-1).blend).toBe("normal");
  v = c.renderVals(); v.fillOpts[5].pick(); expect(c.resolveLayer(c.layersOf("t").at(-1), "t").fill).toBe("transparent");
});

test("shape tool: Shift draws a circle; lines keep the drag direction; the Text tool adds a Body text layer where clicked", async () => {
  await deckTalk(); const { c, listeners } = await mount("?deck=talk"); c.stageRef.current = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) };
  drag(c, listeners, "ellipse", [20, 10], [60, 30], true);
  expect(c.layersOf("t").at(-1)).toMatchObject({ x: 10, y: 10, w: 20, h: 40 });                                    // 40px × 40px
  drag(c, listeners, "line", [20, 40], [60, 10]);
  expect(c.layersOf("t").at(-1)).toMatchObject({ kind: "line", x: 10, y: 10, w: 20, h: 30, flip: true });              // up-right
  drag(c, listeners, "arrow", [60, 40], [20, 10]);
  expect(c.layersOf("t").at(-1)).toMatchObject({ kind: "arrow", x: 10, y: 10, w: 20, h: 30, back: true }); expect(c.layersOf("t").at(-1).flip).toBeFalsy();   // up-left
  drag(c, listeners, "text", [100, 50], [100, 50]);
  expect(c.layersOf("t").at(-1)).toMatchObject({ type: "text", style: "body", x: 40, y: 50, w: 60, h: 14 }); expect(c.state.tool).toBe("select");   // kept inside the slide
  drag(c, listeners, "rect", [150, 50], [300, 150]);
  expect(c.layersOf("t").at(-1)).toMatchObject({ kind: "rect", x: 75, y: 50, w: 25, h: 50 });                         // clamped to the slide
  const n = c.layersOf("t").length; drag(c, listeners, "rect", [20, 10], [120, 10]); expect(c.layersOf("t").length).toBe(n);   // no height: nothing
  drag(c, listeners, "line", [20, 10], [120, 10]); expect(c.layersOf("t").at(-1)).toMatchObject({ kind: "line", w: 50, h: 0 });   // a flat line is fine
});

test("tool keys V/T/R/O/L/A pick a tool in build mode, never while typing or in Present", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const key = (k: string, target: any = { tagName: "DIV" }) => c.onKey({ key: k, target, preventDefault() {} });
  for (const [k, t] of [["r", "rect"], ["O", "ellipse"], ["l", "line"], ["a", "arrow"], ["t", "text"], ["v", "select"]]) { key(k); expect(c.state.tool).toBe(t); }
  key("r", { tagName: "INPUT" }); key("r", { tagName: "TEXTAREA" }); key("r", { tagName: "SELECT" }); key("r", { tagName: "DIV", isContentEditable: true }); expect(c.state.tool).toBe("select");
  c.setState({ mode: "present" }); key("r"); expect(c.state.tool).toBe("select");
});

test("layer settings: an extra text layer gets the style picker and token colours; the layers list sits under them", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const l = c.addLayer("text"); c.setState({ editing: null }); let v = c.renderVals();
  expect(v.lyIsText).toBe(true); expect(v.lyStyle).toBe("body"); expect(v.lyStyleShow).toBe(true);
  expect(v.swatches.map((s: any) => s.title)).toEqual(["Deck default", "Primary", "Secondary", "Tertiary", "Impact", "Text", "Muted"]);
  v.swatches[4].onClick(); expect(layerOf(c, "t", l.id).color).toBe("impact"); expect(c.renderVals().colorHex).toBe(c.theme().palette.impact);   // the picker shows the token's colour
  v = c.renderVals(); expect(v.lySize).toBe(32); expect(v.lySizeOver).toBe(false);
  v.onLySize({ target: { value: "48" } }); expect(layerOf(c, "t", l.id).size).toBe(48); v.onLySize({ target: { value: "abc" } }); expect(layerOf(c, "t", l.id).size).toBe(48);
  v = c.renderVals(); expect(v.lySizeOver).toBe(true); v.onLySizeReset(); expect(layerOf(c, "t", l.id).size).toBeUndefined(); expect(c.resolveLayer(layerOf(c, "t", l.id), "t").size).toBe(32);
  c.setState({ layerSel: "md-title" }); expect(c.renderVals().lyStyleShow).toBe(false);   // markdown layers take their style from the markdown
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).not.toContain("{{ textFields }}"); expect(html).toContain("{{ layerRows }}");
});

test("layouts: the full-bleed slot goes to the back", async () => {
  await writeMd("talk", "# A\nslug: a\n\n![pic](p.png)\n"); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  expect(c.effectiveLayout("a").id).toBe("image-full");
  expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["md-image-1", "md-title"]);                            // the image doesn't cover the title
  c.applyLayout("a", "image-full"); expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["md-image-1", "md-title"]);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-if value="{{ layEditable }}">');
});

test("right panel: Content, Theme, Slides and Builds tabs; Canvas content (spacing) lives in Theme; any other saved tab opens Content", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  let v = c.renderVals(); expect(v.rTabs.map((t: any) => t.label)).toEqual(["Content", "Theme", "Slides", "Builds"]);
  for (const [i, k] of [[1, "tabTheme"], [2, "tabSlides"], [3, "tabBuilds"], [0, "tabContent"]] as const) {
    c.renderVals().rTabs[i].onClick(); v = c.renderVals();
    expect(c.state.rtab).toBe(["content", "theme", "slides", "builds"][i]); expect(v[k]).toBe(true);
    expect(["tabContent", "tabTheme", "tabSlides", "tabBuilds"].filter(t => v[t])).toEqual([k]);
  }
  c.setState({ rtab: "theme" }); v = c.renderVals();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const theme = html.slice(html.indexOf('<sc-if value="{{ tabTheme }}">'));
  expect(theme).toContain('<sc-if value="{{ ttCanvas }}">'); expect(theme).toContain('value="{{ rowStep }}"'); expect(html).not.toContain("{{ tabCanvas }}");
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
  expect(at("A1").y).toBeGreaterThan(at("A").y); expect(at("A1").outline).toContain("#7AA2FF");
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

test("defaults: 30% row and column steps; H1 centred vertically; built-in styles take theme tokens and have no container", async () => {
  const c = await treeDeck(); const v = c.renderVals();
  expect(v.rowStepLabel).toBe("30% of a slide"); expect(v.gapLabel).toBe("30% of a slide");
  const S = c.styles(); expect(S.h1.valign).toBe("middle");
  expect(S.body).toMatchObject({ font: "body", color: "text" }); expect(S.body.card).toBeUndefined(); expect(S.body.box).toBeUndefined();
  expect(S.h1).toMatchObject({ font: "head", color: "text" });
});

// ---- layouts by markdown block ----
const BL = (id: string, block: string, extra: object = {}) => ({ id, type: "text", text: id, x: 0, y: 0, w: 10, h: 10, block, ...extra });

test("shape: sources and layers without a block don't count", async () => {
  const { sigOf, sigKey } = await lay();
  expect(sigKey(sigOf([BL("t", "title"), BL("b", "body"), BL("s", "sources")], {}))).toBe("body:1,title:1");
  expect(sigKey(sigOf([BL("t", "title"), LTX("x", "h1", 0, 0), BL("h", "body", { hidden: true })], {}))).toBe("title:1");
});

test("layouts: stacked-2 is the first match for body:2; list built-ins; templates after them", async () => {
  const { BUILTIN_LAYOUTS, sigKey, fitsTemplate } = await lay();
  expect(Object.values<any>(BUILTIN_LAYOUTS).find(L => sigKey(L.match) === "body:2,title:1").name).toBe("Stacked 2");
  expect(Object.values<any>(BUILTIN_LAYOUTS).find(L => sigKey(L.match) === "body:2").name).toBe("Two texts");
  expect(BUILTIN_LAYOUTS["text-list"].slots.list[0]).toMatchObject({ x: 52, y: 24, w: 42, h: 66 });
  expect(BUILTIN_LAYOUTS["t-statement"].slots.body[1].color).toBe("impact");
  expect(BUILTIN_LAYOUTS["t-split"]).toMatchObject({ icon: "split", opts: ["bar", "side"], match: { title: 1, list: 1, body: "items" } });
  const L3 = [BL("t", "title"), ...[1, 2, 3].map(i => BL("l" + i, "list", { list: 1, item: i }))];
  expect(fitsTemplate(L3, BUILTIN_LAYOUTS.list)).toBe(true); expect(fitsTemplate(L3, BUILTIN_LAYOUTS["t-split"])).toBe(false);
  expect(fitsTemplate([...L3, BL("a", "body"), BL("b", "body"), BL("c", "body")], BUILTIN_LAYOUTS["t-split"])).toBe(true);
});

test("fillSlots: sources default box, and a layout's own sources region wins; a list region splits among its items; slotsOf keeps the region", async () => {
  const { BUILTIN_LAYOUTS, fillSlots, slotsOf } = await lay();
  const s = BL("s", "sources");
  expect(fillSlots([BL("t", "title"), s], BUILTIN_LAYOUTS.title, {}).s).toEqual({ x: 6, y: 89, w: 88, h: 5, rot: 0 });
  expect(fillSlots([s], { slots: { sources: [{ x: 1, y: 2, w: 3, h: 4 }] } }, {}).s).toMatchObject({ x: 1, y: 2 });
  const items = [BL("b", "list", { list: 1, item: 2, y: 5 }), BL("a", "list", { list: 1, item: 1, y: 9 })];
  const bx = fillSlots(items, { slots: { list: [{ x: 10, y: 10, w: 50, h: 42 }] } });
  expect(bx.a).toMatchObject({ x: 10, y: 10, w: 50, h: 20 }); expect(bx.b).toMatchObject({ x: 10, y: 32, w: 50, h: 20 });
  expect(slotsOf(items.map(l => ({ ...l, ...bx[l.id] })))).toEqual({ list: [{ x: 10, y: 10, w: 50, h: 42, rot: 0 }] });
});

test("templates: applying a layout leaves exactly its template props (detail kind, impact colour, kicker font)", async () => {
  await writeMd("talk", "# T\nslug: t\n\n- a\n- b\n\nA.\n\nB.\n\n# S\nslug: s\n\nOne.\n\nTwo.\n");
  const { c } = await mount("?deck=talk");
  expect(c.state.nodes.t.layout).toBe("t-split"); expect(layerOf(c, "t", "md-body-1").kind).toBe("detail");
  c.applyLayout("t", "text-list");
  expect(layerOf(c, "t", "md-body-1").kind).toBeUndefined(); expect(layerOf(c, "t", "md-body-2").kind).toBeUndefined(); expect(layerOf(c, "t", "md-list-1-1").kind).toBe("item");
  c.applyLayout("t", "t-split"); expect(layerOf(c, "t", "md-body-2").kind).toBe("detail");
  expect(c.state.nodes.s.layout).toBe("stacked-2");
  c.applyLayout("s", "t-statement");
  expect(layerOf(c, "s", "md-body-2").color).toBe("impact"); expect(layerOf(c, "s", "md-body-1").color).toBeUndefined(); expect(layerOf(c, "s", "md-title")).toMatchObject({ font: "mono", y: 14.2 });
  c.applyLayout("s", "stacked-2");
  expect(layerOf(c, "s", "md-body-2").color).toBeUndefined(); expect(layerOf(c, "s", "md-title").font).toBeUndefined();
});

test("templates: Update layout from a statement slide keeps the slots' impact colour and kicker style through an enrich", async () => {
  await writeMd("talk", "# S\nslug: s\n\nOne.\n\nTwo.\n");
  const { c } = await mount("?deck=talk"); c.setState({ cur: "s" });
  c.applyToAll("t-statement"); c.componentDidUpdate();
  c.updLayer("s", "md-body-1", { x: 10 }); c.componentDidUpdate(); c.updateLayoutFrom("s");
  expect(c.state.layouts["t-statement"].slots.body[0].x).toBe(10); expect(c.state.layouts["t-statement"].slots.body[1].color).toBe("impact");
  c.reenrich(); c.componentDidUpdate();
  expect(layerOf(c, "s", "md-body-1").x).toBe(10); expect(layerOf(c, "s", "md-body-2").color).toBe("impact");
  expect(layerOf(c, "s", "md-title")).toMatchObject({ font: "mono", size: 15, weight: 500, valign: "top" });
});

test("templates: generated layers aren't on the stage or in the layers list, and can't be selected, edited, dragged, deleted or duplicated", async () => {
  await writeMd("talk", "# A\nslug: a\n\n# B\nslug: b\n", { version: 2, deck: { layoutDefaults: { "title:1": "t-section" } }, slides: {} });
  const { c } = await mount("?deck=talk"); c.setState({ cur: "b" });
  expect(layerOf(c, "b", "gen-number").text).toBe("02");
  let v = c.renderVals();
  expect(v.layerRows.length).toBe(1); expect(v.overlays.length).toBe(1);
  c.setSelection(["gen-number"]); expect(c.state.layerSel).toBeNull(); expect(c.selIds()).toEqual([]);
  c.setState({ layerSel: "gen-number" }); expect(c.selIds()).toEqual([]); expect(c.renderVals().hasLayer).toBe(false);
  c.startDrag({ stopPropagation() {}, button: 0, clientX: 0, clientY: 0 }, "gen-number", "move"); expect(c.state.layerSel).toBe("gen-number");   // ignored: no drag started
  c.startEdit("gen-number"); expect(c.state.editing).toBeFalsy();
  c.delLayer("gen-number"); c.dupLayer("gen-number"); c.delSel(); c.dupSel();
  expect(c.layersOf("b").filter((l: any) => l.id.startsWith("gen-") || l.text === "02").length).toBe(1);
  expect(c.marqueeHits({ x: 0, y: 0, w: 100, h: 100 })).toEqual(["md-title"]);
});

test("renameRegion stores names beside slots", async () => {
  const c = await layDeck({ a: [BL("t", "title"), BL("b", "body")] });
  c.renameRegion("stacked-1", "body", 0, "Main");
  expect(c.layouts()["stacked-1"].names).toEqual({ body: ["Main"] });
  expect(c.layouts()["stacked-1"].slots.body.length).toBe(1);
});

// ---- Content tab (the markdown) ----
test("content tab: first and the default; holds the textarea and issues; no separate pane; opening it scrolls to the slide", async () => {
  await writeMd("talk", TALK);
  const { c, store } = await mount("?deck=talk");
  expect(c.state.rtab).toBe("content"); let v = c.renderVals();
  expect(v.rTabs.map((t: any) => t.label)).toEqual(["Content", "Theme", "Slides", "Builds"]); expect(v.tabContent).toBe(true); expect(v.tabSlides).toBe(false);
  for (const k of ["showMd", "mdW", "onMdResize", "onToggleMd", "mdBtnBg"]) expect(v[k]).toBeUndefined();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const tab = html.split('<sc-if value="{{ tabContent }}">')[1].split('<sc-if value="{{ tabSlides }}">')[0];
  expect(tab).toContain('value="{{ mdText }}"'); expect(tab).toContain("{{ mdIssuesText }}");
  expect(html.split('value="{{ mdText }}"').length).toBe(2); expect(html).not.toContain("{{ onToggleMd }}"); expect(html).not.toContain("{{ onMdResize }}");
  c.componentDidUpdate(); expect(JSON.parse(store["strata-ui"]).mdOpen).toBeUndefined();
  c.setState({ rtab: "slides" }); c.componentDidUpdate();
  const ta: any = { scrollTop: 0 }; c.mdRef.current = ta; c.setState({ cur: "next" }); c.componentDidUpdate(); ta.scrollTop = 0;
  v = c.renderVals(); v.rTabs[0].onClick(); c.componentDidUpdate();
  expect(ta.scrollTop).toBe((c.state.nodes.next._line - 1) * 20);
});

// ---- markdown editing ----
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

// ---- in-place markdown editing ----
const INL = "# Intro **big**\nslug: intro\n<!-- children: ./x.md -->\n\nFirst line\nsecond line.\n\n- one\n  * two\n- three\n\n[link:next][Next]\n\n# Next\nslug: next\n";
// Opens the in-place editor on an md layer, types `text` (what the editor's saveWys does) and commits by ending editing.
const inPlace = (c: any, id: string, lid: string, text: string) => {
  c.setState({ cur: id }); c.startEdit(lid); expect(c.state.editing).toBe(lid);
  c.updLayer(id, lid, { text }); c.componentDidUpdate();
  c.setState({ editing: null }); c.componentDidUpdate();
};
test("in place: a title edit rewrites only its heading line (level, slug and children comment kept), at once, as one undo step", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  const n = c._past.length;
  inPlace(c, "intro", "md-title", "Hello *there*");
  expect(c.state.md).toBe(INL.replace("# Intro **big**", "# Hello *there*"));
  expect(c.state.nodes.intro.title).toBe("Hello there");   // re-enriched straight away
  expect(c.state.nodes.intro.custom).toBeUndefined();       // a words edit isn't a layout edit
  expect(c._past.length).toBe(n + 1);
  c.undo(); c.componentDidUpdate();
  expect(c.state.md).toBe(INL); expect(layerOf(c, "intro", "md-title").text).toBe("Intro **big**");
  c.redo(); c.componentDidUpdate(); expect(c.state.md).toContain("# Hello *there*");
});
test("in place: a paragraph edit rewrites its lines; Enter in it is a line break; emptied it goes", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk");
  inPlace(c, "intro", "md-body-1", "New **words**\nnext");
  expect(c.state.md).toBe(INL.replace("First line\nsecond line.", "New **words**\\\nnext"));   // a hard break: one paragraph, two lines
  expect(layerOf(c, "intro", "md-body-1").text).toBe("New **words**\nnext"); expect(layerOf(c, "intro", "md-body-2")).toBeUndefined();
  inPlace(c, "intro", "md-body-1", "");
  expect(c.state.md).toBe(INL.replace("First line\nsecond line.\n\n", ""));
});
test("in place: a bullet edit rewrites only its line (marker and indent kept); Enter adds a bullet; emptied it goes; steps elsewhere survive", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk");
  c.setNode("intro", { steps: { "md-list-1-3": 2 } }); c.componentDidUpdate();
  inPlace(c, "intro", "md-list-1-2", "TWO");
  expect(c.state.md).toBe(INL.replace("  * two", "  * TWO"));
  expect(c.state.nodes.intro.steps).toEqual({ "md-list-1-3": 2 });
  inPlace(c, "intro", "md-list-1-1", "one\nnew");
  expect(c.state.md).toBe(INL.replace("  * two", "- new\n  * TWO"));
  expect(layerOf(c, "intro", "md-list-1-2").text).toBe("new"); expect(layerOf(c, "intro", "md-list-1-4").text).toBe("three");
  inPlace(c, "intro", "md-list-1-2", "");
  expect(c.state.md).toBe(INL.replace("  * two", "  * TWO"));
});
test("in place: paragraph lines that would parse as something else are escaped, and show unescaped", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk");
  const rows = ["- dash", "\\* star", "+ plus", "1. one", "# hash", "![a](b.png)", "x <!-- c --> y"];
  inPlace(c, "intro", "md-body-1", rows.join("\n"));
  expect(c.state.md).toContain("\\- dash\\\n\\* star\\\n+ plus\\\n1. one\\\n\\# hash\\\n\\![a](b.png)\\\nx <\\!-- c --> y\n");
  expect(c.state.nodes.intro.children).toEqual([]);                                       // no heading made
  expect(layerOf(c, "intro", "md-body-1").text).toBe("- dash\n\\* star\n+ plus\n1. one\n# hash\n![a]{href=b.png}\nx <!-- c --> y");   // \\* is the app's own escape: shown as *
  expect(layerOf(c, "intro", "md-image-1")).toBeUndefined(); expect(layerOf(c, "intro", "md-list-1-1").text).toBe("one");   // still one paragraph, the list untouched
  inPlace(c, "intro", "md-body-1", "[Next]{link=next}");                                      // a lone slide link stays a paragraph, not a chip
  expect(c.state.md).toContain("\n[[Next]{link=next}]{}\n"); expect(layerOf(c, "intro", "md-body-1").text).toBe("[[Next]{link=next}]{}");
  expect(c.constructor.rich.textOf(c.constructor.rich.linesOf("[[Next]{link=next}]{}"))).toBe("[Next]{link=next}");   // the empty span is no format
});
test("in place: a markdown edit still waiting to re-enrich is applied before editing starts and before the write-back", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk"); c.setState({ cur: "intro" });
  c.setMd(INL.replace("First line", "Top\n\nFirst line"));                                      // a paragraph above: body lines move down
  inPlace(c, "intro", "md-body-2", "Edited");
  expect(c.state.md).toBe(INL.replace("First line\nsecond line.", "Top\n\nEdited"));
  c.startEdit("md-list-1-3"); c.updLayer("intro", "md-list-1-3", { text: "THREE" });
  c.setMd(c.state.md.replace("Top", "Top\nmore"));                                                // typed in Content while the editor is open: the list moves down a line
  c.setState({ editing: null }); c.componentDidUpdate();
  expect(c.state.md).toBe(INL.replace("First line\nsecond line.", "Top\nmore\n\nEdited").replace("- three", "- THREE"));
});
test("in place: CRLF markdown keeps CRLF on replaced and added lines", async () => {
  const CR = INL.replace(/\n/g, "\r\n");
  await writeMd("talk", CR); const { c } = await mount("?deck=talk");
  inPlace(c, "intro", "md-title", "T");
  inPlace(c, "intro", "md-body-1", "a\nb");
  inPlace(c, "intro", "md-list-1-1", "one\nnew");
  expect(c.state.md).toBe(INL.replace("# Intro **big**", "# T").replace("First line\nsecond line.", "a\\\nb").replace("- one", "- one\n- new").replace(/\n/g, "\r\n"));
});
const zKey = (c: any, shift = false) => c.onKey({ key: "z", metaKey: true, shiftKey: shift, target: { isContentEditable: true, tagName: "DIV" }, preventDefault() {} });
test("in place: ⌘Z in the editor undoes its own text only; app undo commits the edit first", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  inPlace(c, "intro", "md-body-1", "One"); const md1 = c.state.md, n = c._past.length;
  c.startEdit("md-body-1"); c.updLayer("intro", "md-body-1", { text: "One A" }); c.componentDidUpdate(); c.updLayer("intro", "md-body-1", { text: "One AB" }); c.componentDidUpdate();
  zKey(c); c.componentDidUpdate(); expect(layerOf(c, "intro", "md-body-1").text).toBe("One A");
  zKey(c); zKey(c); zKey(c); c.componentDidUpdate();
  expect(layerOf(c, "intro", "md-body-1").text).toBe("One"); expect(c.state.md).toBe(md1); expect(c.state.editing).toBe("md-body-1");   // never past the editor's start, never into app history
  zKey(c, true); c.componentDidUpdate(); expect(layerOf(c, "intro", "md-body-1").text).toBe("One A");
  c.undo(); c.componentDidUpdate();                                                       // the toolbar's undo: commits "One A", then undoes that commit
  expect(c.state.editing).toBeNull(); expect(c.state.md).toBe(md1); expect(c._past.length).toBe(n); expect(c._future.length).toBe(1);
  c.redo(); c.componentDidUpdate(); expect(c.state.md).toBe(md1.replace("One", "One A"));
});
test("in place: if the markdown changed under the editor so the id is another block, the edit is not saved", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk"); c.setState({ cur: "intro" });
  c.startEdit("md-body-1"); c.updLayer("intro", "md-body-1", { text: "Mine" });
  const other = INL.replace("First line\nsecond line.\n\n", "Other para\n\n"); c.setMd(other);
  c.setState({ editing: null }); c.componentDidUpdate();
  expect(c.state.md).toBe(other); expect(c.state.note).toBe("The slide changed while you were editing — edit not saved"); expect(layerOf(c, "intro", "md-body-1").text).toBe("Other para");
});
test("in place: text with a comment in its lines doesn't open the editor (goes to Content); a lone --> is just text", async () => {
  const MDC = "# A\nslug: a\n\nx <!-- note --> y\n\n- b <!-- c -->\n- d\n\n<!-- start\nend --> tail\n\n<!-- block -->\np\n<!-- mid -->\nq\n<!-- /block -->\n\nA --> B\n";
  await writeMd("talk", MDC); const { c } = await mount("?deck=talk"); c.setState({ cur: "a", rtab: "slides" });
  for (const lid of ["md-body-1", "md-list-1-1", "md-body-2", "md-body-3"]) {
    c.setState({ rtab: "slides", note: null }); c.startEdit(lid);
    expect(c.state.editing ?? null).toBeNull(); expect(c.state.note).toBe("This text has a comment in it: edit it in Content"); expect(c.state.rtab).toBe("content");
  }
  inPlace(c, "a", "md-list-1-2", "D"); inPlace(c, "a", "md-body-4", "A --> C");
  expect(c.state.md).toBe(MDC.replace("- d", "- D").replace("A --> B", "A --> C"));
});
test("in place: <!-- typed into a bullet stays text and every later slide stays", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk");
  inPlace(c, "intro", "md-list-1-1", "use <!-- for comments");
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "next"]); expect(layerOf(c, "intro", "md-list-1-1").text).toBe("use <!-- for comments");
  expect(layerOf(c, "intro", "md-list-1-3").text).toBe("three");
});
test("in place: a group edit writes its lines plainly", async () => {
  const G = "# A\nslug: a\n\n<!-- block -->\n- a\nsome words\n\nC:\\ \\- x\n<!-- /block -->\n";
  await writeMd("talk", G); const { c } = await mount("?deck=talk");
  const t = layerOf(c, "a", "md-body-1").text; expect(t).toBe("- a\nsome words\n\nC:\\ \\- x");
  inPlace(c, "a", "md-body-1", t.replace("some", "few"));
  expect(c.state.md).toBe(G.replace("some", "few"));
});
test("in place: an emptied heading is refused; an unchanged commit leaves the markdown alone", async () => {
  const MD0 = "# A\nslug: a\n\nSee [x](https://e.org).\n";
  await writeMd("talk", MD0); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  const n = c._past.length;
  inPlace(c, "a", "md-title", "  ");
  expect(c.state.md).toBe(MD0); expect(layerOf(c, "a", "md-title").text).toBe("A");
  expect(c.state.note).toBe("A slide needs a title — delete it in Content"); expect(c._past.length).toBe(n);
  c.setState({ cur: "a" }); c.startEdit("md-body-1"); c.setState({ editing: null }); c.componentDidUpdate();   // shown as [x]{href=…}: not written back untouched
  expect(c.state.md).toBe(MD0); expect(c._past.length).toBe(n);
});
test("in place: Enter in a heading is ignored", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk");
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  c.setState({ cur: "intro" }); c.startEdit("md-title"); c.componentDidUpdate();
  c.constructor.rich.setOffsets(root, 2, 2);
  const ev = new w.InputEvent("beforeinput", { inputType: "insertParagraph", cancelable: true }); root.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true); expect(layerOf(c, "intro", "md-title").text).toBe("Intro **big**");
});
test("in place: links block, sources, images, gen layers and linked slides don't open the editor; an extra text layer still does", async () => {
  await writeMd("talk", INL + "\n![i](p.png)\n\n[S](https://s.org)\n"); const { c } = await mount("?deck=talk"); c.setState({ cur: "intro" });
  c.startEdit("md-links"); expect(c.state.editing ?? null).toBeNull();
  c.setState({ cur: "next" }); for (const l of ["md-image-1", "md-sources"]) { c.startEdit(l); expect(c.state.editing ?? null).toBeNull(); }
  c.setLayers("next", (ls: any[]) => [...ls, { id: "x1", type: "text", text: "hi", x: 0, y: 0, w: 10, h: 10 }]);
  c.startEdit("x1"); expect(c.state.editing).toBe("x1");
  const { c: h } = await linked(); await down(h, "a");
  h.startEdit("md-title"); expect(h.state.editing ?? null).toBeNull(); expect(h.state.note).toBe("Linked slides are read-only here: change them in their own markdown file");
});
test("in place: line positions aren't saved to the layout file", async () => {
  await writeMd("talk", INL); const { c } = await mount("?deck=talk");
  expect(layerOf(c, "intro", "md-list-1-2")).toMatchObject({ line: 9, endLine: 9 });
  nudge(c, "intro", "md-title", 3);
  const saved = c.constructor.md.layoutOf(c.state.nodes, c.state).slides.intro.layers;
  expect(saved.some((l: any) => "line" in l || "endLine" in l)).toBe(false);
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
  await writeMd("talk", "# A\nslug: a\n\nOne.\n\nTwo.\n", { version: 2, deck: {}, slides: { a: { custom: true, layers: [T(6), { id: "md-body-1", type: "text", block: "body", x: 50, y: 30, w: 40, h: 40 }] } } });
  const { c } = await mount("?deck=talk"); c.setState({ cur: "a" });
  const b2 = layerOf(c, "a", "md-body-2"); let v = c.renderVals();
  expect(v.warnBadges.length).toBe(1); expect(v.warnBadges[0]).toMatchObject({ x: b2.x, y: b2.y, title: WARN });
  c.setState({ mode: "present" }); expect(c.renderVals().warnBadges).toEqual([]); c.setState({ mode: "build" });
  v.warnBadges[0].onClick();
  expect(layerOf(c, "a", "md-body-2")._warn).toBeUndefined(); expect(c.renderVals().warnBadges).toEqual([]);
  expect(c.constructor.md.layoutOf(c.state.nodes).slides.a.layers.map((l: any) => l.id)).toContain("md-body-2");   // the override records it
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
const titleAt = (x: number) => ({ custom: true, layers: [{ id: "md-title", type: "text", block: "title", x, y: 2, w: 50, h: 10 }] });
async function linked(team = TEAM, hostLayout: any = null) {
  const hits: Record<string, number> = {};
  const files: Record<string, () => Response> = { "https://h/host.md": () => reply(HOST, "text/markdown"), "https://h/team.md": () => reply(team, "text/markdown"),
    "https://h/team-layout.json": () => reply(JSON.stringify({ version: 2, deck: {}, slides: { costs: titleAt(20), plan: titleAt(21) } }), "application/json"),
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
  const { c } = await linked(TEAM, { version: 2, deck: {}, slides: { "a.costs": titleAt(33) } }); await down(c, "a");
  expect(layerOf(c, "a.costs", "md-title").x).toBe(33);
  expect(c.constructor.md.layoutOf(c.state.nodes, c.state, c._linkedOv).slides["a.costs"].layers[0].x).toBe(33);   // saving keeps it
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
  expect(layerOf(c, "a", "md-list-1-1").bullets).toBe("disc");
  c.setLayers("a", (ls: any[]) => ls.map(l => l.id === "md-title" ? { ...l, link: { type: "url", url: "https://e.com" } } : l.id === "md-list-1-1" ? { ...l, bullets: "none" } : l)); c.componentDidUpdate();
  c.setMd(md + "\nMore.\n"); c.reenrich(); c.componentDidUpdate();
  expect(layerOf(c, "a", "md-title").link).toEqual({ type: "url", url: "https://e.com" }); expect(layerOf(c, "a", "md-list-1-1").bullets).toBe("none");
  await c.save();
  const { c: c2 } = await mount("?deck=talk");
  expect(layerOf(c2, "a", "md-title").link).toEqual({ type: "url", url: "https://e.com" }); expect(layerOf(c2, "a", "md-list-1-1").bullets).toBe("none");
  expect(layerOf(c2, "a", "md-list-1-1").text).toBe("x"); expect(layerOf(c2, "a", "md-list-1-2").text).toBe("y");
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

// ---- sharing: github links, start slide ----
test("src: a github blob url is fetched raw (markdown and layout file)", async () => {
  const got: string[] = [];
  const { c } = await mount("?src=https://github.com/o/r/blob/main/d/a.md", { fetch: u => { got.push(u); return u.endsWith(".md") ? reply("# Hi\nslug: hi\n", "text/plain") : reply("", "text/plain", 404); } });
  expect(got).toEqual(["https://raw.githubusercontent.com/o/r/main/d/a.md", "https://raw.githubusercontent.com/o/r/main/d/a-layout.json"]);
  expect(c.state.nodes.hi).toBeDefined();
});

test("linked: a github blob children: url is fetched raw", async () => {
  const got: string[] = [];
  const files: Record<string, string> = { "https://h/host.md": "# A\nslug: a\n<!-- children: https://github.com/o/r/blob/main/k.md -->\n", "https://raw.githubusercontent.com/o/r/main/k.md": "# K\nslug: k\n" };
  const { c } = await mount("?src=https://h/host.md", { fetch: u => { got.push(u); return files[u] ? reply(files[u], "text/markdown") : reply("", "text/plain", 404); } });
  await down(c, "a");
  expect(got).toContain("https://raw.githubusercontent.com/o/r/main/k.md"); expect(c.state.cur).toBe("a.k");
  expect(c.state.nodes["a.k"]._from).toBe("https://raw.githubusercontent.com/o/r/main/k.md");
});

const SHARE: Record<string, string> = { "https://s/a.md": "# A\nslug: a\n<!-- children: ./kid.md -->\n\n# B\nslug: b\n", "https://s/kid.md": "# K\nslug: k\n\n# L\nslug: l\n" };
const shareFetch = (u: string) => SHARE[u] ? reply(SHARE[u], "text/markdown") : reply("", "text/plain", 404);
test("src: &slide= opens on that slide", async () => {
  const { c } = await mount("?src=https://s/a.md&slide=b", { fetch: shareFetch });
  await until(() => c.state.cur === "b");
});

test("src: &slide= into a linked file loads it and opens there", async () => {
  const { c } = await mount("?src=https://s/a.md&slide=a.l", { fetch: shareFetch });
  await until(() => c.state.cur === "a.l"); expect(c.state.nodes.a.children).toEqual(["a.k", "a.l"]);
});

test("src: an unknown &slide= stays on the first slide with a note", async () => {
  const { c } = await mount("?src=https://s/a.md&slide=a.nope", { fetch: shareFetch });
  await until(() => !!c.state.note);
  expect(c.state.note).toBe('No slide "a.nope"'); expect(c.state.cur).toBe("a");
});

test("example: the Strata tour loads from the dev server; going down chains three files, each resolved against its own url", async () => {
  const got: string[] = [], S = "?src=/examples/strata-tour/strata-tour.md";
  const { c } = await mount(S, { href: "http://x/design/strata.dc.html" + S, fetch: u => { got.push(u); return handler(import.meta.dir)(new Request(new URL(u, "http://x/design/strata.dc.html"))) as any; } });
  expect(c.state.saveMsg).toBeFalsy(); expect(c.state.theme.background).toBe("image:sky"); expect(c.state.titlePage).toBe(false); expect(c.state.cur).toBe("tour");
  expect(c.state.mdIssues.filter((i: any) => i.level === "error")).toEqual([]);
  await down(c, "stitching");
  expect(c.state.cur).toBe("stitching.another-file"); expect(c.state.nodes["stitching.another-file"]._from).toBe("http://x/examples/strata-tour/linked/children.md");
  await down(c, "stitching.joining");
  expect(c.state.cur).toBe("stitching.joining.three-deep"); expect(c.state.nodes["stitching.joining.three-deep"]._from).toBe("http://x/examples/strata-tour/linked/deeper.md");
  expect(got).toContain("http://x/examples/strata-tour/linked/deeper.md");
});

test("opening local files: a .md with its layout becomes the scratch deck; a lone layout file restyles it", async () => {
  const { c, listeners, store } = await mount("");
  await c.openFiles([new File([TALK], "talk.md"), new File([JSON.stringify({ version: 2, deck: { theme: { background: "image:space" } } })], "talk-layout.json")]);
  expect(c.state.nodes.ROOT.children).toEqual(["intro", "next"]); expect(c.state.theme.background).toBe("image:space");
  c.componentDidUpdate(); expect(JSON.parse(store["strata-v8"]).md).toBe(TALK);
  await c.openFiles([new File([JSON.stringify({ version: 2, deck: { theme: { background: "image:forest" } } })], "other-layout.json")]);
  expect(c.state.md).toBe(TALK); expect(c.state.theme.background).toBe("image:forest");
  await c.openFiles([new File(["x"], "pic.png")]); expect(c.state.note).toMatch(/\.md file/);
  let prevented = false;   // a file dropped anywhere opens too
  listeners.drop({ defaultPrevented: false, preventDefault: () => (prevented = true), dataTransfer: { files: [new File(["# Dropped\n"], "d.md")] } });
  await until(() => c.state.md === "# Dropped\n"); expect(prevented).toBe(true);
});



test("dark chrome: select shares the font/colour reset; every template input/select sets a background", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toMatch(/input,select,textarea,button\{font:inherit;color:inherit\}/);
  const tpl = html.slice(0, html.indexOf("<script type=\"text/x-dc\"") > 0 ? html.indexOf("<script type=\"text/x-dc\"") : html.length);
  const bare = [...tpl.matchAll(/<(?:input|select)\b[^>]*>/g)].map(m => m[0]).filter(t => !/type="(checkbox|range|radio|file)"/.test(t) && !/background/.test(t));
  expect(bare).toEqual([]);
});

// ---- theme ----
const { DEFAULT_THEME, PALETTES: TH_PALETTES } = await import("./theme");
const titleOf = (c: any, id: string) => c.resolveLayer(layerOf(c, id, "md-title"), id);

test("theme: a new deck starts on the default theme", async () => {
  const { c } = await mount("?deck=fresh");
  expect(c.state.theme).toEqual(DEFAULT_THEME);
});

test("theme: picking a palette restyles headings with no layer edit; fonts follow the font set", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const stored = JSON.stringify(c.layersOf("t"));
  expect(titleOf(c, "t").color).toBe("#F1F5F9"); expect(titleOf(c, "t").font).toBe("'Space Grotesk', sans-serif");
  c.renderVals().palList.find((p: any) => p.id === "ember").pick();
  expect(c.state.theme.palette).toBe("ember"); expect(titleOf(c, "t").color).toBe("#FFF7ED");
  c.renderVals().fontList.find((f: any) => f.id === "elegant").pick();
  expect(titleOf(c, "t").font).toBe("'Playfair Display', serif");
  expect(JSON.stringify(c.layersOf("t"))).toBe(stored);
});

test("theme: round-trips through save and reload", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const t = { background: "bubbles", scheme: { deep: "#010101", mid: "#020202", accent: "#030303" }, palette: "ember", fonts: "elegant", surface: "card", motion: { speedIdx: 4, count: 20, opacity: 50 } };
  c.setTheme(t); await c.save();
  expect((await onDisk()).deck.theme).toEqual(t);
  const { c: c2 } = await mount("?deck=talk"); expect(c2.state.theme).toEqual(t);
});

test("theme: an image background uses the backdrop and its controls", async () => {
  const { c } = await mount("?deck=fresh");
  expect(c.bgInfo().src).toBeNull(); expect(c.renderVals().hasBgImage).toBe(false);
  c.setTheme({ background: "image:london" });
  expect(c.bgInfo()).toEqual({ src: "backdrops/london.png", aspect: 1 });
  const v = c.renderVals(); expect(v.isImageBg).toBe(true); expect(v.hasBgImage).toBe(true);
  v.kinds.find((k: any) => k.label === "Image").pick();
  expect(c.renderVals().bgList.map((b: any) => b.name)).toEqual(["Balloons", "London", "Under the sea", "Space", "Forest", "Sky", "Ocean"]);
  expect(c.renderVals().bgList.find((b: any) => b.name === "London").on).toBe(true);
  for (const [id, src] of [["balloons", "backdrops/countryside-balloons.png"], ["sea", "backdrops/under-the-sea.png"], ["space", "backdrops/space.png"], ["forest", "backdrops/forest.png"]]) {
    c.setTheme({ background: "image:" + id }); expect(c.bgInfo().src).toBe(src);
    expect(await Bun.file(join(import.meta.dir, "design", src)).exists()).toBe(true);
  }
  c.setState({ customBg: "data:image/png;base64,AA", customAspect: 2 }); c.setTheme({ background: "image:custom" });
  expect(c.bgInfo()).toEqual({ src: "data:image/png;base64,AA", aspect: 2 });
});

test("theme: token colours on shapes and icons resolve to the palette; hex stays", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const p = TH_PALETTES.find(x => x.id === "midnight")!;
  expect(c.resolveLayer({ id: "s", type: "shape", fill: "impact" }, "t").fill).toBe(p.impact);
  expect(c.resolveLayer({ id: "i", type: "icon", fill: "primary" }, "t").fill).toBe(p.primary);
  expect(c.resolveLayer({ id: "s", type: "shape", fill: "#123456" }, "t").fill).toBe("#123456");
  expect(c.resolveLayer({ id: "x", type: "text", text: "a [b]{color=impact}", color: "#abcdef" }, "t")).toMatchObject({ color: "#abcdef", _lines: [[{ text: "a " }, { text: "b", color: p.impact }]] });
});

test("theme: a linked child's own deck.theme is ignored", async () => {
  const files: Record<string, () => Response> = { "https://h/host.md": () => reply("# A\nslug: a\n<!-- children: ./team.md -->\n", "text/markdown"), "https://h/team.md": () => reply(TEAM, "text/markdown"),
    "https://h/team-layout.json": () => reply(JSON.stringify({ version: 2, deck: { theme: { palette: "ember", fonts: "elegant" } }, slides: {} }), "application/json") };
  const { c } = await mount("?src=https://h/host.md", { fetch: u => u.startsWith("https://") ? (files[u] ? files[u]() : reply("", "text/plain", 404)) : undefined });
  await down(c, "a");
  expect(c.state.cur).toBe("a.costs"); expect(c.state.theme).toEqual(DEFAULT_THEME);
  expect(titleOf(c, "a.costs")).toMatchObject({ color: "#93C5FD", font: "'Space Grotesk', sans-serif" });
});

test("theme: the Theme tab is a vertical rail of Background, Colours, Theme, Typography and Canvas, one section at a time", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const tab = html.slice(html.indexOf('<sc-if value="{{ tabTheme }}">'), html.indexOf('<sc-if value="{{ tabBuilds }}">'));
  const sect = (flag: string) => tab.split(`<sc-if value="{{ ${flag} }}">`).slice(1).join("\n");
  for (const h of ["{{ kinds }}", "{{ bgList }}", "{{ ms.speedLabel }}"]) expect(sect("ttBg")).toContain(h);
  for (const h of ["{{ schemeOpts }}", "{{ customSlots }}", "{{ resetColours }}"]) expect(sect("ttColours")).toContain(h);
  for (const h of ["{{ palList }}", "{{ surfaces }}"]) expect(sect("ttTheme")).toContain(h);
  for (const h of ["{{ fontList }}", "{{ styleRows }}"]) expect(sect("ttType")).toContain(h);
  for (const h of ["{{ spacingBtns }}", 'value="{{ rowStep }}"', "{{ onSpeed }}", "{{ onTitlePage }}"]) expect(sect("ttCanvas")).toContain(h);
  expect(tab).toContain('aria-orientation="vertical"');
  await deckTalk(); const { c } = await mount("?deck=talk"); c.setState({ rtab: "theme" });
  let v = c.renderVals(); expect(v.themeTabs.map((t: any) => t.label)).toEqual(["Background", "Colours", "Theme", "Typography", "Canvas"]);
  expect([v.ttBg, v.ttColours, v.ttTheme, v.ttType, v.ttCanvas]).toEqual([true, false, false, false, false]);
  v.themeTabs[4].pick(); v = c.renderVals(); expect(c.state.ttab).toBe("canvas"); expect([v.ttBg, v.ttCanvas]).toEqual([false, true]);
  c.setState({ ttab: "nope" }); expect(c.renderVals().ttBg).toBe(true);
  for (const gone of ["{{ themeBtns }}", "{{ baseSwatches }}", "{{ cardModes }}", "{{ toneBtns }}", "{{ boxModes }}"]) expect(html).not.toContain(gone);
});

test("theme: surface draws through Layers' whole-slide card; moving backgrounds animate at the chosen speed", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  expect(c.renderVals().surface).toBeNull();
  c.setTheme({ surface: "frosted" }); expect(c.renderVals().surface).toEqual({ bg: "rgba(15,18,32,0.35)", blur: "blur(8px)" });
  c.setTheme({ surface: "card" }); expect(c.renderVals().surface).toEqual({ bg: "rgba(15,18,32,0.85)", blur: "none" });
  c.setTheme({ palette: "paper" }); expect(c.renderVals().surface).toEqual({ bg: "rgba(255,255,255,0.9)", blur: "none" });
  c.setTheme({ background: "aurora" }); let v = c.renderVals();
  expect(v.canvasBg.cls).toBe("anim"); expect(v.canvasBg.dur).toBe("16.0s"); expect(v.isMotion).toBe(true);
  v.setSpeed({ target: { value: "7" } }); v = c.renderVals(); expect(v.canvasBg.dur).toBe("32.0s"); expect(c.state.theme.motion.speedIdx).toBe(7);
  c.setTheme({ background: "bubbles" }); v = c.renderVals();
  expect(c.state.theme.motion).toBeUndefined(); expect(v.fx.isBubbles).toBe(true); expect(v.fx.bubbles.length).toBe(Math.round(18 * (+v.cam.w / 100) * (+v.cam.h / 100)));   // 18 per stage, across the canvas
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html.match(/<dc-import name="Layers"[^>]*>/g)!.every(t => t.includes('surface="{{ surface }}"'))).toBe(true);
});

test("theme: the font set loads through its own <link>, updated when the set changes", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const w = new Window({ settings: { disableCSSFileLoading: true } }); (globalThis as any).document = w.document;
  try {
    c.syncThemeFonts(); const link = w.document.getElementById("strata-theme-fonts")!;
    expect(link.getAttribute("rel")).toBe("stylesheet"); expect(link.getAttribute("href")).toContain("Space+Grotesk");
    c.setTheme({ fonts: "elegant" }); c.syncThemeFonts();
    expect(w.document.querySelectorAll("#strata-theme-fonts").length).toBe(1); expect(link.getAttribute("href")).toContain("Playfair+Display");
  } finally { delete (globalThis as any).document; }
});

test("Text styles list: size, weight and line height edit the style, so every layer using it follows", async () => {
  await writeMd("talk", "# T\nslug: t\n"); const { c } = await mount("?deck=talk");
  const h1 = () => c.renderVals().styleRows.find((r: any) => r.id === "h1"), title = () => c.resolveLayer(layerOf(c, "t", "md-title"), "t");
  expect(layerOf(c, "t", "md-title").style).toBe("h1"); expect(h1()).toMatchObject({ size: 64, weight: "800", lh: 1.05 });
  h1().onSize({ target: { value: "90" } }); expect(title().size).toBe(90); expect(c.state.styles.h1.size).toBe(90);
  h1().onWeight({ target: { value: "600" } }); h1().onLh({ target: { value: "1.3" } }); expect(title()).toMatchObject({ weight: 600, lh: 1.3 });
  h1().onSize({ target: { value: "" } }); expect(title().size).toBe(90);   // invalid input is ignored
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ sr.onSize }}", "{{ sr.onWeight }}", "{{ sr.onLh }}", "{{ onLySizeReset }}"]) expect(html).toContain(h);
});

test("the title-bar band follows the palette tone: a dark scrim on dark palettes, a light one on light", async () => {
  await writeMd("talk", "# T\nslug: t\n\n- a\n- b\n"); const { c } = await mount("?deck=talk"); c.applyLayout("t", "t-bar");
  const band = () => c.resolveLayer(layerOf(c, "t", "gen-bar"), "t").fill;
  c.setTheme({ palette: "midnight" }); expect(band()).toBe("rgba(10,12,30,0.45)");
  c.setTheme({ palette: "paper" }); expect(band()).toBe("rgba(255,255,255,0.55)");
});

test("Update template from a List-right slide records unmirrored boxes, so List-left and List-right slides both keep their sides", async () => {
  await writeMd("talk", ["S", "U"].map(t => `# ${t}\nslug: ${t.toLowerCase()}\n\n- a\n- b\n\nA.\n\nB.\n\n`).join(""));
  const { c } = await mount("?deck=talk"); c.setState({ cur: "s" });
  c.setTemplateOpt("s", { side: "right" }); c.componentDidUpdate();
  expect(layerOf(c, "s", "md-list-1-1").x).toBe(69); expect(layerOf(c, "u", "md-list-1-1").x).toBe(3);
  c.updateLayoutFrom("s"); c.componentDidUpdate();
  expect(c.state.layouts["t-split"].slots.list[0].x).toBe(3);
  expect(c.state.nodes.s.side).toBe("right"); expect(layerOf(c, "s", "md-list-1-1").x).toBe(69); expect(layerOf(c, "u", "md-list-1-1").x).toBe(3);
});

test("picking a template that doesn't fit applies it: regions take blocks by key and reading order, the rest warn; Your templates lists user templates", async () => {
  await writeMd("talk", "# T\nslug: t\n\n- a\n- b\n"); const { c } = await mount("?deck=talk"); c.setState({ cur: "t", rtab: "slides" });
  c.renderVals().tplOthers.find((t: any) => t.id === "t-two").pick(); c.componentDidUpdate();
  expect(c.state.md).toBe("# T\nslug: t\n\n- a\n- b\n\n##Text##\n\n##Text##\n");   // its two bodies get placeholders; the list has no region
  expect(c.state.nodes.t).toMatchObject({ layout: "t-two", custom: true }); expect(c.effectiveLayout("t").id).toBe("t-two");
  expect(layerOf(c, "t", "md-title")).toMatchObject({ x: 5, y: 6, w: 90, h: 12 }); expect(layerOf(c, "t", "md-title")._warn).toBeFalsy();
  for (const id of ["md-list-1-1", "md-list-1-2"]) expect(layerOf(c, "t", id)._warn).toBe(true);
  let v = c.renderVals(); expect(v.warnBadges.length).toBe(2); expect(v.layCanUpdate).toBe(false); expect(v.hasMyTpls).toBe(false);
  c.renderVals().tplOthers.find((t: any) => t.id === "list").pick(); expect(layerOf(c, "t", "md-list-1-1")._warn).toBeFalsy();   // a fitting one places them again
  expect(c.state.md).toBe("# T\nslug: t\n\n- a\n- b\n");
  const lid = c.saveAsLayout("t"); v = c.renderVals(); expect(v.hasMyTpls).toBe(true); expect(v.myTpls.map((t: any) => t.id)).toEqual([lid]);
  v.myTpls[0].onName({ target: { value: "Mine" } }); expect(c.layouts()[lid].name).toBe("Mine");
  c.renderVals().myTpls[0].onName({ target: { value: "  " } }); expect(c.layouts()[lid].name).toBe("Mine");   // an empty name is ignored
  c.renderVals().myTpls[0].onDelete(); expect(c.layouts()[lid]).toBeUndefined(); expect(c.renderVals().myTpls).toEqual([]);
});

test("tool keys only on an own slide in Slide view; Escape puts the tool back to Select; lines have no None border; shape names follow kind", async () => {
  await deckTalk(); const { c } = await mount("?deck=talk");
  const key = (k: string) => c.onKey({ key: k, target: { tagName: "DIV" }, preventDefault() {} });
  c.setState({ view: "wire" }); key("r"); expect(c.state.tool).toBeUndefined();
  c.setState({ view: "slide" }); key("r"); expect(c.state.tool).toBe("rect"); key("Escape"); expect(c.state.tool).toBe("select");
  c.setNode("t", { _from: "other.md" }); key("o"); expect(c.state.tool).toBe("select"); c.setNode("t", { _from: undefined });
  const l = c.addLayer("shape", { kind: "arrow" }); let v = c.renderVals();
  expect(v.widthOpts.map((o: any) => o.label)).toEqual(["Thin", "Medium", "Thick"]); expect(v.lyLabel).toBe("Arrow");
  c.updLayer("t", l.id, { kind: "round" }); v = c.renderVals(); expect(v.widthOpts[0].label).toBe("None"); expect(v.lyLabel).toBe("Rounded rectangle");
});

// ---- final review fixes ----
const hasSemi = (o: any): boolean => typeof o === "string" ? o.includes(";") : o && typeof o === "object" ? Object.values(o).some(hasSemi) : false;
test("layout-file values that could inject CSS resolve to safe defaults (font, colours, blend, border)", async () => {
  const bad = { font: "x;background:url(http://t)", color: "red;top:0", blend: "x;y", x: "1;background:url(http://t)", weight: "700;top:0", align: "x;y", valign: "x;y",
    rot: "1deg);x", size: "9;x", lh: "1;x", ls: "1;x", gap: "1;x", opacity: "1;x", card: "custom", box: { bg: "#fff", bgOpacity: "1);x", borderColor: "red;x", pad: "1;x" } }, SH = { type: "shape", x: 0, y: 0, w: 10, h: 10, kind: "rect" };
  const c = await styledDeck({ styles: { evil: { name: "Evil", color: "red;top:0", font: "x;y" } } }, [TL("a", bad), TL("e", { style: "evil", text: "[w]{style=evil} ok" }),
    { id: "s1", ...SH, fill: "a;b", stroke: "red;x", border: { width: 99, style: "x;y" }, blend: "x;y" }, { id: "s2", ...SH, token: "x;y", border: { width: "3;x", style: "dashed" } }, { id: "s3", ...SH, border: "1px;x" }]);
  const [t, e, s1, s2, s3] = c.layersOf("s").map((l: any) => c.resolveLayer(l, "s"));
  for (const k of ["font", "color", "blend", "weight", "align", "valign", "rot", "size", "lh", "ls", "gap", "opacity"]) expect(t[k]).toBeUndefined();
  expect(t).toMatchObject({ x: 0, y: 5, w: 50, h: 20 }); expect(t.box).toEqual({ bg: "#fff" });
  expect(c.resolveLayer(TL("n", { x: "12", weight: 700, align: "center", valign: "bottom" }), "s")).toMatchObject({ x: 12, weight: 700, align: "center", valign: "bottom" });
  c.setState({ cur: "s", mode: "build", view: "slide" }); expect(hasSemi(c.renderVals().overlays.map((o: any) => [o.l, o.t, o.w, o.h, o.rot]))).toBe(false);   // the stage's own boxes too
  expect(e.color).toBeUndefined(); expect(e.font).toBeUndefined(); for (const k of ["color", "font"]) expect(e._lines[0][0][k]).toBeUndefined();   // the style is cleaned on load, the run guarded on display
  expect(s1.border).toEqual({ width: 10, style: "solid" }); for (const k of ["fill", "stroke", "blend"]) expect(s1[k]).toBeUndefined();
  expect(s2.border).toEqual({ width: 0, style: "dashed" }); expect(s2.token).toBeUndefined(); expect(s3.border).toBeUndefined();   // not an object: dropped on load (safeLayer would default it)
  for (const r of [t, e, s1, s2, s3]) expect(hasSemi({ ...r, text: "" })).toBe(false);
  const P = c.theme(); expect(c.resolveLayer(TL("b", { font: "head", color: "impact", blend: "screen" }), "s")).toMatchObject({ font: P.fonts.head, color: P.palette.impact, blend: "screen" });
  expect(c.resolveLayer(TL("b", { font: "serif", color: "#abc" }), "s")).toMatchObject({ font: "serif", color: "#abc" });
});

test("the rich editor draws runs as the stage does: palette tokens and the theme's fonts", async () => {
  const c = await styledDeck({ theme: { background: "dusk", palette: "paper", fonts: "elegant" } }, [TL("a", { text: "[x]{color=impact font=head} [y]{font=mono}" })]);
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  c.setState({ editing: "a", layerSel: "a" }); c.componentDidUpdate();
  const css = [...root.querySelectorAll("[data-run]")].map((s: any) => s.getAttribute("style") || "");
  expect(css[0]).toContain("color:#DC2626"); expect(css[0]).toContain("font-family:'Playfair Display', serif");
  expect(css.at(-1)).toContain("font-family:'DM Mono', monospace");
});

test("Builds: ordering ignores select-all, nudge, delete, tool keys and image drops; the replay timer is cleared; the wire view ends Builds", async () => {
  await writeMd("talk", LIST + "\n# B\nslug: b\n"); const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ cur: "a", rtab: "builds" }); c.componentDidUpdate(); c.startOrdering(); c.assignStep("md-list-1-1"); c.componentDidUpdate();
  const k = (key: string, mods: object = {}) => c.onKey({ key, target: { tagName: "DIV" }, preventDefault() {}, ...mods });
  k("a", { metaKey: true }); expect(c.selIds()).toEqual([]);
  c.setState({ layerSel: "md-list-1-2" }); const before = layerOf(c, "a", "md-list-1-2");
  k("ArrowRight"); k("Backspace"); expect(layerOf(c, "a", "md-list-1-2")).toEqual(before); expect(c.state.cur).toBe("a");
  k("r"); expect(c.state.tool).toBeUndefined();
  let stopped = false; c.dropOn({ dataTransfer: { files: [{ type: "image/png" }] }, preventDefault() {}, stopPropagation() { stopped = true; } }, null);
  expect(stopped).toBe(true); expect(c.layersOf("a").some((l: any) => l.type === "image")).toBe(false);
  c.finishOrdering(); c.setState({ selStep: 1, layerSel: null }); c.replay(); expect(c.state.at).toBe(0); c.endBuilds(); await Bun.sleep(100); expect(c.state.at).toBe(0);   // Esc mid-replay
  c.replay(); c.setState({ cur: "b" }); c.componentDidUpdate(); await Bun.sleep(100); expect(c.state.at).toBe(0);                                                  // slide change mid-replay
  c.setState({ cur: "a" }); c.componentDidUpdate(); c.startOrdering(); c.componentDidUpdate(); expect(c.state.ordering).toBe(true);
  c.setState({ view: "wire" }); c.componentDidUpdate(); expect(c.state.ordering).toBe(false);
});

// ---- layout files are sanitized at the boundary ----
// Every string in o (renderVals output; functions skipped), found recursively. The hostile file says top:7px, which the app itself never writes.
const strings = (o: any, seen = new Set<any>(), out: string[] = []): string[] => {
  if (typeof o === "string") out.push(o);
  else if (o && typeof o === "object" && !seen.has(o)) { seen.add(o); for (const v of Object.values(o)) strings(v, seen, out); }
  return out;
};
const EVIL_BUILD = { transition: "x;background:url(http://t)", transform: "top:7px", clip: "x;top:7px", opacity: 1 };
const HOSTILE_LAYOUT = () => JSON.parse(JSON.stringify({ version: 2,
  deck: { opacity: "1;top:7px", customBg: "javascript:x", images: { k: 'data:x");top:7px;("' }, theme: { background: "image:custom" }, bogus: "top:7px",
    layouts: { evil: { name: "Evil", icon: "constructor", match: { title: 1, body: 1 }, bogus: "top:7px",
      slots: { title: [{ x: "1;top:7px", y: 0, w: 10, h: 10 }, { x: 6, y: 6, w: 88, h: 14, build: EVIL_BUILD, bogus: "top:7px" }], body: [{ x: 6, y: 24, w: 88, h: 60, build: EVIL_BUILD }] } } },
    layoutDefaults: { "body:1,title:1": "evil" } },
  slides: { s: { custom: true, bogus: "top:7px", layers: [{ id: "md-title", type: "text", block: "title", x: 6, y: 6, w: 88, h: 14, build: EVIL_BUILD, bogus: "top:7px" },
    { id: "w", type: "shape", x: "1;background:url(http://t)", y: "top:7px", w: 5, h: 5, _warn: true },
    { id: "a);background:url(http://t);x:(a", type: "shape", kind: "arrow", x: 0, y: 0, w: 5, h: 5 },
    { id: "im", type: "image", imgKey: "k", x: 0, y: 0, w: 5, h: 5, build: EVIL_BUILD }] } } })
  .replace("{", '{"__proto__":{"polluted":1},'));
const HOSTILE_MD = "# S\nslug: s\n\nBody.\n\n# T\nslug: t\n\nMore.\n";
// The stage renderer, as the app mounts it: its render values for the app's stageLayers.
const layersJs = (await Bun.file(join(import.meta.dir, "design/Layers.dc.html")).text()).split(/<script type="text\/x-dc" data-dc-script[^>]*>/)[1].split("</script>")[0];
const LayersC = new Function("DCLogic", "window", layersJs + "\nreturn Component;")(class { props: any; constructor(p: any) { this.props = p; } }, { StrataSanitize: await import("./layout-sanitize") });
const bad = (s: string) => s.includes("background:url(http://t") || s.includes("top:7px");
const leaks = (c: any, id: string) => { const v = c.renderVals(); return strings([v, c.shown(id, c.layersOf(id)), new LayersC({ layers: v.stageLayers, images: v.images, live: v.cur }).renderVals()]).filter(bad); };
test("a hostile layout file (deck, ?src= and linked) loads without throwing and none of its CSS reaches renderVals or the stage renderer", async () => {
  await writeMd("evil", HOSTILE_MD, HOSTILE_LAYOUT());
  const { c } = await mount("?deck=evil");
  expect(c.state.saveMsg).toBeFalsy(); expect(c.state.nodes.s).toBeDefined(); expect(({} as any).polluted).toBeUndefined();
  expect(c.layersOf("s").map((l: any) => l.id)).toEqual(["md-title", "w", "im", "md-body-1"]); expect(c.layersOf("s")[1]._warn).toBeUndefined(); expect(c.state.opacity).toBe(1); expect(c.state.customBg).toBeNull();
  c.setState({ cur: "s", mode: "build", view: "slide" }); expect(c.renderVals().warnBadges.length).toBe(1);
  expect(c.state.nodes.t.layout).toBe("evil"); expect(c.layersOf("t").find((l: any) => l.id === "md-body-1")).toMatchObject({ x: 6, y: 24 });   // the template applies, without its build
  for (const id of ["s", "t"]) for (const v of [{ mode: "build", view: "slide", rtab: "slides" }, { rtab: "theme" }, { layerSel: "im", rtab: "content" }, { mode: "present" }, { mode: "build", preview: true }]) {
    c.setState({ cur: id, preview: false, ...v }); expect([id, v, leaks(c, id)]).toEqual([id, v, []]); }
  const files: Record<string, string> = { "https://h/host.md": "# A\nslug: a\n<!-- children: ./kid.md -->\n", "https://h/kid.md": HOSTILE_MD, "https://h/kid-layout.json": JSON.stringify(HOSTILE_LAYOUT()) };
  const m = await mount("?src=https://h/host.md", { fetch: u => files[u] ? reply(files[u], "text/plain") : u.startsWith("https://") ? reply("", "text/plain", 404) : undefined });
  await down(m.c, "a"); expect(m.c.state.cur).toBe("a.s");
  for (const id of ["a.s", "a.t"]) { m.c.setState({ cur: id, mode: "build", view: "slide" }); expect(leaks(m.c, id)).toEqual([]); }
});

test("the editor draws no build styles: a layer's build is stripped outside Present and preview", async () => {
  await writeMd("talk", TALK);
  const { c } = await mount("?deck=talk"); c.setState({ cur: "intro", mode: "build", view: "slide" });
  c.setLayers("intro", (ls: any[]) => ls.map(l => ({ ...l, build: EVIL_BUILD })));
  expect(c.renderVals().stageLayers.some((l: any) => l.build)).toBe(false);
});

test("a normal deck (the Strata tour) round-trips unchanged through sanitize and save", async () => {
  const L = await Bun.file(join(import.meta.dir, "examples/strata-tour/strata-tour-layout.json")).text();
  await writeMd("tour", await Bun.file(join(import.meta.dir, "examples/strata-tour/strata-tour.md")).text(), L);
  const { c } = await mount("?deck=tour"); await c.save();
  const out = await Bun.file(deckDir("tour") + "tour-layout.json").json(); delete out.slides.ROOT;   // save always writes the tree root
  expect(out).toEqual(JSON.parse(L));
});

test("a deck using every feature (images, components, links, shapes, styles, templates, steps, theme) round-trips through sanitize: save → load → save is unchanged", async () => {
  await writeMd("full", "# Intro\nslug: intro\n\nHello.\n\n- one\n- two\n\n# Next\nslug: next\n");
  const { c } = await mount("?deck=full"); c.setState({ cur: "intro", mode: "build", view: "slide" });
  const im = c.addLayer("image"); c.setImage("intro", im.id, "data:image/avif;base64,AAAA"); c.componentDidUpdate();
  c.addLayer("component"); c.addLayer("shape", { kind: "arrow", flip: true, back: true }); c.addLayer("icon", { icon: "check", fill: "primary" });
  const tx = c.addLayer("text", { link: { type: "url", url: "example.com" }, color: "#ff0000", font: "serif", size: 30, card: "custom", box: { bg: "#ffffff", bgOpacity: 0.5, blur: 2, border: 1, borderColor: "#000000", radius: 8, pad: 4 } });
  c.addLayer("text", { link: { type: "slide", id: "next" }, hidden: true }); c.componentDidUpdate();
  c.newStyleFrom("intro", tx.id); c.componentDidUpdate();
  c.setNode("intro", { steps: { "md-list-1-1": 1, "md-list-1-2": 2 }, trans: { 1: "rise", 2: "wipe" }, build: { dur: 250, ease: "linear", earlier: "keep", replace: false }, showSteps: true }); c.componentDidUpdate();
  c.setState({ cur: "next" }); c.saveAsLayout("next"); c.componentDidUpdate();
  c.setTheme({ background: "aurora", scheme: { deep: "#000000", mid: "#111111", accent: "#222222" }, palette: "ember", fonts: "elegant", surface: "card", motion: { speedIdx: 3 } });
  c.setState({ bgScale: 1.5, bgRepeat: "xy", bgY: 0.2, spacing: "fit", titlePage: true, titleView: { zoom: 2, x: 0.3, y: 0.4 }, opacity: 0.8 }); c.componentDidUpdate();
  await c.save(); const A = await Bun.file(deckDir("full") + "full-layout.json").json();
  expect(Object.values(A.deck.images)[0]).toMatch(/^img\/\w+\.avif$/); expect(Object.keys(A.deck.layouts).length).toBe(1); expect(Object.keys(A.deck.styles).length).toBe(1);
  expect(A.slides.intro.layers.length).toBeGreaterThan(6);
  expect(JSON.parse(JSON.stringify((await import("./layout-sanitize")).sanitizeLayout(A)))).toEqual(A);
  const m = await mount("?deck=full"); await m.c.save();
  expect(await Bun.file(deckDir("full") + "full-layout.json").json()).toEqual(A);
  const draft = { md: "# X\n", layout: { ...A, deck: { ...A.deck, images: { a: "data:image/bmp;base64,AA", b: "data:image/x-icon;base64,AA" } } } };   // scratch decks keep data: uploads of any image type
  const s = await mount("", { store: { "strata-v8": JSON.stringify(draft) } }); expect(Object.keys(s.c.state.images).sort()).toEqual(["a", "b"]);
});

test("a click on the already-selected text box starts editing it; a first click or a drag only selects", async () => {
  await writeMd("talk", "# Intro\nslug: intro\n\nHello there.\n");
  const { c, listeners: on } = await mount("?deck=talk");
  c.stageRef.current = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const ev = { stopPropagation() {}, button: 0, clientX: 10, clientY: 10 };
  const click = (lid: string) => { c.startDrag(ev, lid, "move"); on.pointerup(); };
  click("md-body-1"); expect(c.state.layerSel).toBe("md-body-1"); expect(c.state.editing ?? null).toBeNull();   // first click selects
  click("md-body-1"); expect(c.state.editing).toBe("md-body-1");                                                // second click edits
  c.setState({ editing: null }); c._mdEdit = null;
  c.startDrag(ev, "md-body-1", "move"); on.pointermove({ clientX: 30, clientY: 30 }); on.pointerup();
  expect(c.state.editing ?? null).toBeNull();                                                                     // a drag never edits
  click("md-title"); expect(c.state.editing ?? null).toBeNull();                                                  // another layer: select first
});

test("the theme background and its effects belong to the canvas: effects pan inside the camera, the stage behind is plain", async () => {
  await writeMd("four", "# A\n\n# B\n\n# C\n\n# D\n");
  const { c } = await mount("?deck=four"); c.setTheme({ background: "gears" });
  const v = c.renderVals();
  expect(v.base).toBe("#12151A"); expect(v.base).not.toContain("gradient");   // the stage's own background: the theme's deep colour
  const w = +v.cam.w / 100, xs = v.fx.gearGroups.map((g: any) => parseFloat(g.left) * w / 100);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);                 // laid out across the canvas, not one stage
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const cam = html.indexOf("transform:{{ curCam }}"), opens = (s: string) => (s.match(/<div\b/g) || []).length - (s.match(/<\/div>/g) || []).length;
  for (const k of ["fx.isBubbles", "fx.isSunset", "fx.isGears"]) {
    const at = html.indexOf(k, cam); expect(at).toBeGreaterThan(cam);
    expect(opens(html.slice(html.lastIndexOf("<div", cam), at))).toBeGreaterThan(0);   // still inside the camera div
    expect(html.indexOf(k)).toBe(at);                                           // the first copy is the stage's
  }
});

test("the wireframe draws the whole background with its effects, from the same markup as the stage, under the slide outlines", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const block = (from: number) => { const a = html.indexOf('<div aria-hidden="true"', from), open = html.indexOf("fx.isBubbles", a);
    expect(open).toBeGreaterThan(a); let depth = 0, i = a;
    for (const m of html.slice(a).matchAll(/<div\b|<\/div>/g)) { depth += m[0] === "</div>" ? -1 : 1; if (!depth) { i = a + m.index! + 6; break; } }
    return { a, text: html.slice(a, i) }; };
  const stage = block(html.indexOf("transform:{{ curCam }}")), wireAt = html.indexOf('<sc-if value="{{ showWire }}">'), wire = block(wireAt);
  expect(wire.a).toBeGreaterThan(wireAt);
  expect(wire.text.replace(/\s+/g, " ")).toBe(stage.text.replace(/\s+/g, " "));   // one markup, any scale
  expect(stage.text).toContain("container-type:size");                          // sizes are cqw of the canvas
  expect(stage.text).not.toMatch(/\d\s*px|\{\{ fx.gearScale/);
  const canvas = html.lastIndexOf("aspect-ratio:{{ canvasRatio }}", wire.a);
  expect(canvas).toBeGreaterThan(wireAt);                                       // inside the wireframe's canvas element
  expect(html.indexOf("wireRects", wire.a)).toBeGreaterThan(wire.a);           // slide outlines come after: drawn above
  for (const k of ["fx.isBubbles", "fx.isSunset", "fx.isGears"]) expect(html.split(k).length - 1).toBe(2);   // stage + wireframe only
});

// ---- palette accents on text (theme tokens in the built-in text styles) ----
test("palette accents: H2/H3 and bullet markers take primary, H1 and body take text; a palette switch recolours them; a hex colour still wins", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n");
  const { c } = await mount("?deck=talk"), S = c.styles();
  expect([S.h1.color, S.h2.color, S.h3.color, S.body.color, S.bullets.color, S.bullets.markColor]).toEqual(["text", "primary", "primary", "text", "text", "primary"]);
  const h2 = { id: "x", type: "text", text: "Hi", style: "h2", x: 0, y: 0, w: 10, h: 10 }, li = { ...h2, style: "bullets" }, res = (l: any) => c.resolveLayer(l, "t");
  c.setTheme({ palette: "midnight" }); expect(res(h2).color).toBe("#93C5FD"); expect(res(li).markColor).toBe("#93C5FD"); expect(res(li).color).toBe("#F1F5F9");
  c.setTheme({ palette: "ember" }); expect(res(h2).color).toBe("#FDBA74"); expect(res(li).markColor).toBe("#FDBA74");
  expect(res({ ...h2, color: "#123456" }).color).toBe("#123456");                       // a user-set hex colour wins
  expect(c.resolveLayer(layerOf(c, "t", "md-title"), "t").color).toBe("#FFF7ED");        // H1: text
});

// ---- templates style their regions with theme tokens (Templates.dc.html looks) ----
const THREE = "# T\nslug: t\n\nOne.\n\nTwo.\n\nThree.\n";
const bodiesOf = (c: any, id: string) => c.layersOf(id).filter((l: any) => l.block === "body");
const gens = (c: any, id: string) => c.layersOf(id).filter((l: any) => l.id.startsWith("gen-"));
test("t-cards: three bodies on theme-token cards, numbered 01–03 in primary/secondary/tertiary; switching away removes both", async () => {
  await writeMd("talk", THREE); const { c } = await mount("?deck=talk"); c.setTheme({ palette: "midnight" });
  c.applyLayout("t", "t-cards");
  const bs = bodiesOf(c, "t"); expect(bs.length).toBe(3);
  for (const b of bs) { expect(b).toMatchObject({ card: "custom", box: { bg: "surface", bgOpacity: 0.07 } });
    expect(c.resolveLayer(b, "t").box).toMatchObject({ bg: "#FFFFFF", bgOpacity: 0.07 }); }
  const nums = ["gen-num-1", "gen-num-2", "gen-num-3"].map(k => layerOf(c, "t", k));
  expect(nums.map((l: any) => [l.text, l.color, l.font])).toEqual([["01", "primary", "mono"], ["02", "secondary", "mono"], ["03", "tertiaryInk", "mono"]]);
  expect(nums.map((l: any) => c.resolveLayer(l, "t").color)).toEqual(["#93C5FD", "#C4B5FD", "#5EEAD4"]);
  for (let i = 0; i < 3; i++) expect(nums[i].y + nums[i].h).toBeLessThanOrEqual(bs[i].y);   // above its card
  const v = c.renderVals(); expect(v.overlays.some((o: any) => o.lid.startsWith("gen-num"))).toBe(false);
  expect(v.layerRows.length).toBe(c.layersOf("t").length - gens(c, "t").length);   // generated: not selectable rows
  c.setTheme({ palette: "paper" }); expect(c.resolveLayer(bodiesOf(c, "t")[0], "t").box.bg).toBe("#000000");   // the light tone's surface
  c.applyLayout("t", "stacked-3");
  for (const b of bodiesOf(c, "t")) { expect(b.card).toBeUndefined(); expect(b.box).toBeUndefined(); }
  expect(gens(c, "t")).toEqual([]);
});

test("t-two: each column is a bordered card with a primary / secondary accent bar; the old Two/Three columns and grid get cards too", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n\nTwo.\n"); const { c } = await mount("?deck=talk"); c.setTheme({ palette: "midnight" });
  c.applyLayout("t", "t-two");
  for (const b of bodiesOf(c, "t")) expect(c.resolveLayer(b, "t")).toMatchObject({ card: "custom", box: { borderColor: "#FFFFFF", borderOpacity: 0.22, bgOpacity: 0 } });
  const acc = ["gen-accent-1", "gen-accent-2"].map(k => layerOf(c, "t", k));
  expect(acc.map((l: any) => c.resolveLayer(l, "t").fill)).toEqual(["#93C5FDff", "#C4B5FDff"]);
  expect(acc.map((l: any) => l.y)).toEqual(bodiesOf(c, "t").map((b: any) => b.y));   // on each column's top edge
  c.applyLayout("t", "cols-2"); expect(bodiesOf(c, "t")[0].box).toMatchObject({ borderColor: "surface" }); expect(layerOf(c, "t", "gen-accent-2")).toBeTruthy();
  c.applyLayout("t", "stacked-2"); expect(bodiesOf(c, "t")[0].card).toBeUndefined(); expect(gens(c, "t")).toEqual([]);
  await writeMd("t3", THREE); const m = (await mount("?deck=t3")).c;
  for (const lid of ["cols-3", "body-3"]) { m.applyLayout("t", lid); expect(bodiesOf(m, "t").every((b: any) => b.box && b.box.bgOpacity === 0.07)).toBe(true); }
});

test("t-split draws a list panel behind the list (tone-aware, mirrored with the list); t-title a primary rule; the subtitle is muted", async () => {
  await writeMd("talk", "# S\nslug: s\n\n- a\n- b\n\nA.\n\nB.\n\n# T\nslug: t\n\n# U\nslug: u\n\nSub.\n"); const { c } = await mount("?deck=talk");
  expect(c.state.nodes.s.layout).toBe("t-split"); c.setTheme({ palette: "midnight" });
  const panel = () => layerOf(c, "s", "gen-panel"), list = layerOf(c, "s", "md-list-1-1");
  expect(c.layersOf("s").indexOf(panel())).toBeLessThan(c.layersOf("s").indexOf(list));   // behind
  expect(panel().x).toBeLessThanOrEqual(list.x); expect(panel().x + panel().w).toBeGreaterThanOrEqual(list.x + list.w);
  expect(c.resolveLayer(panel(), "s").fill).toBe("rgba(10,12,30,0.35)");
  c.setTheme({ palette: "paper" }); expect(c.resolveLayer(panel(), "s").fill).toBe("rgba(0,0,0,0.12)");   // M3: visible on light backgrounds
  c.setTemplateOpt("s", { side: "right" }); c.componentDidUpdate(); expect(panel().x + panel().w).toBe(100);
  c.applyLayout("t", "t-title"); expect(layerOf(c, "t", "gen-rule")).toMatchObject({ token: "primary" });
  c.applyLayout("u", "t-title-sub"); expect(layerOf(c, "u", "gen-rule")).toBeTruthy(); expect(layerOf(c, "u", "md-body-1").color).toBe("muted");
  c.applyLayout("u", "stacked-1"); expect(layerOf(c, "u", "md-body-1").color).toBeUndefined(); expect(layerOf(c, "u", "gen-rule")).toBeUndefined();
});

test("a user-set colour or box on a body survives template switches; layoutOf saves neither gen layers nor template props, and a reload restores them", async () => {
  await writeMd("talk", "# U\nslug: u\n\nSub.\n\n# T\nslug: t\n\nOne.\n\nTwo.\n\nThree.\n"); const { c } = await mount("?deck=talk");
  c.applyLayout("u", "t-title-sub"); c.updLayer("u", "md-body-1", { color: "#ff0000" }); c.componentDidUpdate();
  c.applyLayout("u", "stacked-1"); expect(layerOf(c, "u", "md-body-1").color).toBe("#ff0000");
  c.applyLayout("u", "t-title-sub"); expect(layerOf(c, "u", "md-body-1").color).toBe("#ff0000");   // the template's muted doesn't replace it
  c.applyLayout("t", "t-cards"); c.updLayer("t", "md-body-2", { color: "#00ff00" }); c.componentDidUpdate();
  expect(c.state.nodes.t.custom).toBe(true);
  const saved = c.constructor.md.layoutOf(c.state.nodes, c.state), json = JSON.stringify(saved);
  expect(json).not.toContain("gen-"); expect(json).not.toContain('"bg":"surface"'); expect(json).not.toContain('"card"');
  expect(saved.slides.t.layers.find((l: any) => l.id === "md-body-2").color).toBe("#00ff00");
  c.reenrich(); expect(bodiesOf(c, "t").every((b: any) => b.card === "custom" && b.box.bg === "surface")).toBe(true);   // the template puts them back
  expect(layerOf(c, "t", "md-body-2").color).toBe("#00ff00"); expect(layerOf(c, "t", "gen-num-1")).toBeTruthy();
  c.applyLayout("t", "stacked-3"); expect(layerOf(c, "t", "md-body-2")).toMatchObject({ color: "#00ff00" }); expect(layerOf(c, "t", "md-body-2").box).toBeUndefined();
});

test("Save as layout keeps the template's region styling as its own slot extras, so a later switch still removes it", async () => {
  await writeMd("talk", THREE); const { c } = await mount("?deck=talk"); c.applyLayout("t", "t-cards");
  const lid = c.saveAsLayout("t"); c.componentDidUpdate();
  expect(c.state.layouts[lid].slots.body[0]).toMatchObject({ card: "custom", box: { bg: "surface" } });
  c.applyLayout("t", "stacked-3"); expect(bodiesOf(c, "t")[0].box).toBeUndefined();
});

// ---- template props: who owns a key (_tpl), named styles, builds, light tones ----
test("a named style beats a template's region props; a layer's own value beats both (I1)", async () => {
  await writeMd("talk", "# U\nslug: u\n\nSub.\n\n" + THREE.replace("# T", "# T")); const { c } = await mount("?deck=talk");
  c.setStyle("body", { color: "#ff0000" }); c.applyLayout("u", "t-title-sub");
  expect(c.resolveLayer(layerOf(c, "u", "md-body-1"), "u").color).toBe("#ff0000");
  c.setStyle("body", { card: "custom", box: { bg: "#ff0000", bgOpacity: 0.5 } }); c.applyLayout("t", "t-cards");
  expect(c.resolveLayer(layerOf(c, "t", "md-body-1"), "t").box).toMatchObject({ bg: "#ff0000", bgOpacity: 0.5 });
  c.setStyle("body", { card: undefined, box: undefined, color: undefined });
  expect(c.resolveLayer(layerOf(c, "t", "md-body-1"), "t").box).toMatchObject({ bg: "#FFFFFF", bgOpacity: 0.07 });   // back to the template's
});

test("the template's keys are recorded in an unsaved _tpl; a switch removes only those; a user edit makes a key the user's (I3)", async () => {
  await writeMd("talk", "# U\nslug: u\n\nSub.\n\n" + THREE); const { c } = await mount("?deck=talk");
  c.applyLayout("u", "t-title-sub"); expect(layerOf(c, "u", "md-body-1")._tpl).toEqual(["color"]);
  c.updLayer("u", "md-body-1", { color: "muted" }); c.componentDidUpdate(); expect(layerOf(c, "u", "md-body-1")._tpl).toBeUndefined();
  c.applyLayout("u", "stacked-1"); expect(layerOf(c, "u", "md-body-1").color).toBe("muted");   // picked by the user, though equal to the template's
  const mine = { bg: "#112233", bgOpacity: 0.5, blur: 0, border: 0, borderColor: "#ffffff", radius: 4, pad: 8 };
  c.applyLayout("t", "stacked-3"); c.updLayer("t", "md-body-1", { card: "custom", box: mine }); c.componentDidUpdate();
  c.applyLayout("t", "t-cards"); expect(layerOf(c, "t", "md-body-1")).toMatchObject({ card: "custom", box: mine });
  c.applyLayout("t", "stacked-3"); expect(layerOf(c, "t", "md-body-1")).toMatchObject({ card: "custom", box: mine });
  c.applyLayout("t", "t-cards"); c.updLayer("t", "md-body-2", { box: { ...layerOf(c, "t", "md-body-2").box, bgOpacity: 0.2 } }); c.componentDidUpdate();
  expect(layerOf(c, "t", "md-body-2")._tpl).toEqual(["card"]);
  const json = JSON.stringify(c.constructor.md.layoutOf(c.state.nodes, c.state)); expect(json).not.toContain("_tpl");
  expect(json).toContain('"bgOpacity":0.2');
  c.reenrich(); expect(layerOf(c, "t", "md-body-2")).toMatchObject({ card: "custom", box: { bgOpacity: 0.2 }, _tpl: ["card"] });
  c.applyLayout("t", "stacked-3"); expect(layerOf(c, "t", "md-body-2").card).toBeUndefined(); expect(layerOf(c, "t", "md-body-2").box).toMatchObject({ bgOpacity: 0.2 });
});

test("New style from a templated layer leaves the template's card out of the style (I2); choosing a style keeps template props alike in session and on reload (M1)", async () => {
  await writeMd("talk", THREE + "\n# U\nslug: u\n\nSolo.\n"); const { c } = await mount("?deck=talk");
  c.applyLayout("t", "t-cards"); const sid = c.newStyleFrom("t", "md-body-1"); c.componentDidUpdate();
  expect(c.styles()[sid].card).toBeUndefined(); expect(c.styles()[sid].box).toBeUndefined();
  expect(layerOf(c, "t", "md-body-1")).toMatchObject({ style: sid, card: "custom" });
  c.applyLayout("t", "stacked-3"); expect(c.resolveLayer(layerOf(c, "t", "md-body-1"), "t").card).toBeUndefined();
  c.applyLayout("t", "t-cards"); c.chooseStyle("t", "md-body-2", "body"); c.componentDidUpdate();
  const was = layerOf(c, "t", "md-body-2").card; c.reenrich(); expect(layerOf(c, "t", "md-body-2").card).toBe(was); expect(was).toBe("custom");
});

test("a bullet marker follows a user-chosen text colour unless markColor is set (M4)", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n"); const { c } = await mount("?deck=talk"); c.setTheme({ palette: "midnight" });
  const li = { id: "x", type: "text", text: "a", style: "bullets", x: 0, y: 0, w: 10, h: 10 }, res = (l: any) => c.resolveLayer(l, "t");
  expect(res(li).markColor).toBe("#93C5FD");
  expect(res({ ...li, color: "#ff0000" }).markColor).toBeUndefined();
  expect(res({ ...li, color: "#ff0000", markColor: "secondary" }).markColor).toBe("#C4B5FD");
  c.setStyle("bullets", { color: "#00ff00" }); expect(res(li).markColor).toBeUndefined();
});

test("card numbers and column accents take the step of the region they decorate (M2), and follow its box (M5)", async () => {
  await writeMd("talk", THREE); const { c } = await mount("?deck=talk"); c.applyLayout("t", "t-cards");
  c.setNode("t", { steps: { "md-body-2": 1 }, trans: { 1: "fade" } }); c.setState({ mode: "present", cur: "t", at: 0 });
  const op = (id: string) => { const l = c.renderVals().stageLayers.find((x: any) => x.id === id); return l.build.opacity; };
  expect([op("md-body-2"), op("gen-num-2"), op("gen-num-1")]).toEqual([0, 0, 1]);
  c.setState({ at: 1 }); expect(op("gen-num-2")).toBe(1);
  c.setState({ mode: "build" }); c.updLayer("t", "md-body-2", { x: 40, y: 35 }); c.componentDidUpdate();
  const n2 = c.resolveLayer(layerOf(c, "t", "gen-num-2"), "t"); expect([n2.x, n2.y]).toEqual([40, 35 - 4.4]);
  c.updLayer("t", "md-body-2", { hidden: true }); expect(c.resolveLayer(layerOf(c, "t", "gen-num-2"), "t").hidden).toBe(true);
  await writeMd("t2", "# T\nslug: t\n\nOne.\n\nTwo.\n", { version: 2, deck: { layouts: { "t-two": { name: "Two columns", opts: ["bar"], match: { title: 1, body: 2 },
    slots: { title: [{ x: 5, y: 6, w: 90, h: 12 }], body: [{ x: 5, y: 40, w: 40, h: 50 }, { x: 55, y: 40, w: 40, h: 50 }] } } } }, slides: { t: { layout: "t-two" } } });
  const m = (await mount("?deck=t2")).c; expect(m.state.nodes.t.layout).toBe("t-two");
  const a2 = m.resolveLayer(layerOf(m, "t", "gen-accent-2"), "t"); expect([a2.x, a2.y, a2.w]).toEqual([56, 40, 38]);   // the deck's own slots
});

// WCAG contrast of a colour (optionally translucent over the background) against the background.
const lum = (rgb: number[]) => { const l = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const rgbOf = (c: string): number[] => { const m = /^#([0-9a-f]{6})/i.exec(c); if (m) { const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
  const r = /rgba?\(([^)]+)\)/.exec(c)!; const p = r[1].split(",").map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
const over = (fg: number[], a: number, bg: number[]) => fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test("light palettes: card fill, frame border and list panel are visible (≥1.3:1) and card numbers readable (≥3:1) on their paired backgrounds (M3)", async () => {
  await writeMd("talk", "# S\nslug: s\n\n- a\n- b\n\nA.\n\nB.\n\n" + THREE + "\n# W\nslug: w\n\nOne.\n\nTwo.\n"); const { c } = await mount("?deck=talk");
  c.applyLayout("t", "t-cards"); c.applyLayout("w", "t-two"); expect(c.state.nodes.s.layout).toBe("t-split");
  for (const [palette, bgs] of [["paper", ["dots", "pinstripe"]], ["coastal", ["mist", "pearl", "fizz"]]] as const) for (const background of bgs) {
    c.setTheme({ palette, background }); const bg = rgbOf(c.theme().bg.deep!), r = (n: string, id: string) => c.resolveLayer(layerOf(c, n, id), n), why = palette + "/" + background;
    const card = r("t", "md-body-1").box; if (ratio(over(rgbOf(card.bg), card.bgOpacity, bg), bg) < 1.3) throw new Error(why);
    expect(ratio(over(rgbOf(card.bg), card.bgOpacity, bg), bg)).toBeGreaterThanOrEqual(1.3);
    const fr = r("w", "md-body-1").box, fa = fr.borderOpacity; expect(fa).toBeGreaterThanOrEqual(0.3); expect(ratio(over(rgbOf(fr.borderColor), fa, bg), bg)).toBeGreaterThanOrEqual(1.3);
    const p = rgbOf(r("s", "gen-panel").fill); expect(ratio(over(p, p[3], bg), bg)).toBeGreaterThanOrEqual(1.3);
    for (const k of [1, 2, 3]) expect(ratio(rgbOf(r("t", "gen-num-" + k).color), bg)).toBeGreaterThanOrEqual(3);
  }
});

// ---- the default layout and style picks with template keys ----
test("switching to the shape's default layout keeps a slide with the user's own edits custom, so they last (no data loss)", async () => {
  await writeMd("talk", THREE); const { c } = await mount("?deck=talk");
  c.applyLayout("t", "t-cards"); c.updLayer("t", "md-body-2", { color: "#00ff00" }); c.componentDidUpdate();
  c.applyLayout("t", "stacked-3"); expect(c.state.nodes.t.custom).toBe(true);
  c.reenrich(); expect(layerOf(c, "t", "md-body-2").color).toBe("#00ff00");
  expect(c.constructor.md.layoutOf(c.state.nodes, c.state).slides.t.layers.find((l: any) => l.id === "md-body-2").color).toBe("#00ff00");
  await writeMd("t2", THREE); const m = (await mount("?deck=t2")).c;
  m.applyLayout("t", "t-cards"); expect(m.state.nodes.t.custom).toBe(true);
  m.applyLayout("t", "stacked-3"); expect(m.state.nodes.t.custom).toBeFalsy();   // nothing of the user's: back to the default
});

test("Custom in the style picker makes the written values the user's; deleting a style writes its winning values as the user's (N3, N4)", async () => {
  await writeMd("talk", "# U\nslug: u\n\nSub.\n\n# V\nslug: v\n\nSub.\n"); const { c } = await mount("?deck=talk");
  c.setStyle("body", { color: "#ff0000" }); c.applyLayout("u", "t-title-sub"); c.chooseStyle("u", "md-body-1", ""); c.componentDidUpdate();
  expect(layerOf(c, "u", "md-body-1")).toMatchObject({ color: "#ff0000" }); expect(layerOf(c, "u", "md-body-1")._tpl).toBeUndefined();
  c.applyLayout("u", "stacked-1"); expect(layerOf(c, "u", "md-body-1").color).toBe("#ff0000");
  c.setStyle("mine", { name: "Mine", color: "#0000ff" }); c.applyLayout("v", "t-title-sub"); c.chooseStyle("v", "md-body-1", "mine"); c.componentDidUpdate();
  expect(c.resolveLayer(layerOf(c, "v", "md-body-1"), "v").color).toBe("#0000ff");
  c.deleteStyle("mine"); expect(layerOf(c, "v", "md-body-1").color).toBe("#0000ff"); expect(layerOf(c, "v", "md-body-1")._tpl).toBeUndefined();
  c.applyLayout("v", "stacked-1"); expect(layerOf(c, "v", "md-body-1").color).toBe("#0000ff");
});

test("Deck default text colour (null) leaves the bullet marker on its default", async () => {
  await writeMd("talk", "# T\nslug: t\n\nOne.\n"); const { c } = await mount("?deck=talk"); c.setTheme({ palette: "midnight" });
  expect(c.resolveLayer({ id: "x", type: "text", text: "a", style: "bullets", color: null, x: 0, y: 0, w: 10, h: 10 }, "t").markColor).toBe("#93C5FD");
});


test("in place: opening a ##placeholder## selects all of it, so typing replaces it; other text puts the cursor at the end", async () => {
  await writeMd("talk", "# Intro\nslug: intro\n\n##Text##\n\nHello there.\n");
  const { c } = await mount("?deck=talk");
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  const sel = () => c.constructor.rich.getOffsets(root);
  c.setState({ cur: "intro" }); c.startEdit("md-body-1"); c.componentDidUpdate();
  expect(sel()).toEqual({ start: 0, end: 8 });
  c.setState({ editing: null }); c._mdEdit = null; c.componentDidUpdate();
  c.startEdit("md-body-2"); c.componentDidUpdate();
  expect(sel()).toEqual({ start: 12, end: 12 });
});
