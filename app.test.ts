// Drives the app's logic class (design/strata.dc.html) with React/DOM stubbed out and fetch wired to the real dev-server handler.
import { test, expect, beforeEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler } from "./server";

const js = (await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text()).split('<script type="text/x-dc" data-dc-script>')[1].split("</script>")[0];
class DCLogic { state: any; setState(u: any, cb?: () => void) { this.state = { ...this.state, ...(typeof u === "function" ? u(this.state) : u) }; cb?.(); } forceUpdate() {} }

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "strata-app-")); });

const until = async (ok: () => boolean, ms = 3000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting for the app"); await Bun.sleep(5); } };

async function mount(search: string, opts: { isStatic?: boolean; settle?: boolean; deckMode?: boolean } = {}) {
  opts = { deckMode: /deck=[a-z0-9-]+/.test(search), ...opts };
  const store: Record<string, string> = {}, listeners: Record<string, Function> = {};
  const g = {
    location: { search }, window: { STRATA_STATIC: !!opts.isStatic, addEventListener: (t: string, f: Function) => (listeners[t] = f), removeEventListener() {} },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
    fetch: (u: string, o: RequestInit = {}) => handler(root)(new Request(new URL(u, "http://x/design/strata.dc.html"), o)),
    setTimeout, requestAnimationFrame: () => {},
  };
  const C = new Function("DCLogic", "React", ...Object.keys(g), js + "\nreturn Component;")(DCLogic, { createRef: () => ({ current: null }) }, ...Object.values(g));
  const c = new C(); c.componentDidMount();
  // Wait for the deck load (and a new deck's first save) to finish rather than sleeping a fixed time.
  if (opts.settle !== false) await until(() => (!!c._loaded || !!c.state.saveMsg || !opts.deckMode) && !c.state.saving);
  return { c, listeners };
}

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
  await Bun.write(join(root, "decks/talk/deck.json"), "<<<<<<< HEAD\n{ broken");
  const { c } = await mount("?deck=talk");
  expect(c.state.saveMsg).toContain("Could not load");
  await c.save();
  expect(await Bun.file(join(root, "decks/talk/deck.json")).text()).toStartWith("<<<<<<< HEAD");
  expect(c.state.saveMsg).toContain("Could not load");
});

test("save before the load finishes is a no-op", async () => {
  await Bun.write(join(root, "decks/talk/deck.json"), JSON.stringify({ nodes: { ROOT: { id: "ROOT", children: ["x"] }, x: { id: "x", title: "Real", body: "", children: [] } } }));
  const { c } = await mount("?deck=talk", { settle: false });
  await c.save();
  await Bun.sleep(30);
  expect((await Bun.file(join(root, "decks/talk/deck.json")).json()).nodes.x.title).toBe("Real");
});

test("leaving the page with unsaved deck edits asks first", async () => {
  const { c, listeners } = await mount("?deck=talk");
  c.setState({ title: "edited" });
  const ev = { prevented: false, preventDefault() { this.prevented = true; }, returnValue: undefined as any };
  listeners.beforeunload(ev);
  expect(ev.prevented).toBe(true);
  await c.save();
  const ev2 = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners.beforeunload(ev2);
  expect(ev2.prevented).toBe(false);
});

test("static mode presents and never saves", async () => {
  const saved = JSON.stringify({ nodes: { ROOT: { id: "ROOT", children: ["x"] }, x: { id: "x", title: "Real", body: "", children: [] } } });
  await Bun.write(join(root, "decks/talk/deck.json"), saved);
  const { c } = await mount("?deck=talk", { isStatic: true });
  expect(c.state.mode).toBe("present");
  c.setState({ title: "changed" }); c.componentDidUpdate();
  await c.save(); await Bun.sleep(1000);
  expect(await Bun.file(join(root, "decks/talk/deck.json")).text()).toBe(saved);
});

test("header logo links home to the deck list", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html.split("<header")[1].split("</header>")[0]).toMatch(/<a href="\.\.\/" title="← All decks"/);
});

const onDisk = () => Bun.file(join(root, "decks/talk/deck.json")).json();

test("a new deck is written to disk as soon as it opens", async () => {
  await mount("?deck=talk");
  expect((await onDisk()).nodes.ROOT).toBeDefined();
});

test("edits autosave after a pause, without pressing save", async () => {
  const { c } = await mount("?deck=talk");
  const a = c.state.nodes.ROOT.children[0];
  c.setState({ nodes: { ...c.state.nodes, [a]: { ...c.state.nodes[a], title: "Edited" } } });
  c.componentDidUpdate();
  expect((await onDisk()).nodes[a].title).not.toBe("Edited");   // debounced, not immediate
  await Bun.sleep(1200);
  expect((await onDisk()).nodes[a].title).toBe("Edited");
  expect(c.isDirty()).toBe(false);
});

test("deck title is saved and reloaded", async () => {
  let { c } = await mount("?deck=talk");
  c.setState({ title: "My Deck" });
  await c.save();
  expect((await onDisk()).title).toBe("My Deck");
  ({ c } = await mount("?deck=talk"));
  expect(c.state.title).toBe("My Deck");
});

test("header has an editable deck title", async () => {
  const header = (await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text()).split("<header")[1].split("</header>")[0];
  expect(header).toContain('value="{{ titleVal }}" onChange="{{ onTitle }}"');
});

const slideNode = (id: string, title: string, children: string[] = [], extra: object = {}) => ({ id, title, body: "", children, ...extra });
const writeDeck = (slug: string, nodes: Record<string, any>, extra: object = {}) =>
  Bun.write(join(root, `decks/${slug}/deck.json`), JSON.stringify({ nodes, images: {}, customBg: null, ...extra }));
const deckB = () => writeDeck("b", {
  ROOT: slideNode("ROOT", "", ["x"]),
  x: slideNode("x", "Bx", ["y"], { frames: [{ id: "f1", layers: [{ id: "l1", type: "text", text: "go", link: { type: "slide", id: "y" } }, { id: "l2", type: "image", imgKey: "im1" }] }] }),
  y: slideNode("y", "By"),
}, { images: { im1: "img/a.png" } });
const deckTalk = (t: object = {}, extraTop: string[] = []) =>
  writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t", ...extraTop]), t: slideNode("t", "Intro", [], t), ...Object.fromEntries(extraTop.map(k => [k, slideNode(k, k, [], { include: "b" })])) });

test("builder saves keep the deck's markdown source", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t"]), t: slideNode("t", "Intro") }, { source: "notes/talk.md" });
  const { c } = await mount("?deck=talk");
  c.setState({ title: "edited" }); await c.save();
  expect((await onDisk()).source).toBe("notes/talk.md");
});

test("a new deck starts with one blank slide named after its slug", async () => {
  await mount("?deck=my-talk");
  const d = await Bun.file(join(root, "decks/my-talk/deck.json")).json();
  expect(d.nodes.ROOT.children.length).toBe(1);
  expect(d.nodes[d.nodes.ROOT.children[0]]).toMatchObject({ title: "My talk", children: [] });
  expect(Object.keys(d.nodes).length).toBe(2);
});

test("the deck's readability card is saved", async () => {
  const { c } = await mount("?deck=talk");
  c.setState({ card: { mode: "text", color: "#ffffff", opacity: 0.6, blur: 10 } }); await c.save();
  expect((await onDisk()).card).toEqual({ mode: "text", color: "#ffffff", opacity: 0.6, blur: 10 });
});

test("every Layers render gets the deck card, and the card controls exist", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const imports = html.match(/<dc-import name="Layers"[^>]*>/g)!;
  expect(imports.every(t => t.includes('card="{{ deckCard }}"'))).toBe(true);
  expect(html).toContain('<sc-for list="{{ cardModes }}"');
  expect(html).toContain('<sc-for list="{{ boxFields }}"');
});

test("applying a layout keeps linked layers, shapes and icons; only plain text and images are rearranged", async () => {
  const chip = { id: "md-link-0", type: "text", text: "Go →", x: 67, y: 24, w: 26, h: 9, link: { type: "slide", id: "b" } };
  const bg = { id: "md-linkbg-0", type: "shape", x: 66, y: 24, w: 28, h: 9 };
  await writeDeck("talk", {
    ROOT: slideNode("ROOT", "", ["a", "b"]),
    a: slideNode("a", "A", [], { frames: [{ id: "f1", layers: [
      { id: "md-title", type: "text", text: "Title" }, { id: "md-body", type: "text", text: "Body line" }, bg, chip] }] }),
    b: slideNode("b", "B"),
  });
  const { c } = await mount("?deck=talk");
  c.setState({ cur: "a" });
  c.applyLayout("list");
  const ls = c.layersOf("a");
  expect(ls.find((l: any) => l.id === "md-link-0")).toEqual(chip);
  expect(ls.find((l: any) => l.id === "md-linkbg-0")).toEqual(bg);
  expect(ls.filter((l: any) => l.type === "text" && !l.link).map((l: any) => l.text).join("|")).not.toContain("Go →");
});

test("a layout keeps the replaced layers' ids, so a later markdown re-import doesn't duplicate them", async () => {
  const { importInto } = await import("./importer");
  const { parseMarkdown } = await import("./markdown");
  const md = "# A\nslug: a\n\nBody line\n";
  const fresh = importInto(null, parseMarkdown(md).sections);
  await writeDeck("talk", fresh.nodes);
  const { c } = await mount("?deck=talk");
  c.setState({ cur: "a" });
  c.applyLayout("list");
  expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["md-title", "md-body"]);
  const again = importInto({ nodes: c.state.nodes }, parseMarkdown(md).sections);
  expect(again.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["md-title", "md-body"]);
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
  expect(c.marqueeHits({ x: 5, y: 5, w: 16, h: 16 })).toEqual(["p", "q"]);
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
  expect(c.layersOf("a").length).toBe(5);
  expect(c.selIds().length).toBe(2);
  expect(c.selIds()).not.toContain("p");      // the copies are selected
  key(c, "Backspace");
  expect(c.layersOf("a").map((l: any) => l.id)).toEqual(["p", "q", "r"]);
  key(c, "a", { metaKey: true });
  expect(c.selIds()).toEqual(["p", "q", "r"]);
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

test("moving a slide: before, after, inside, across levels, carrying its subtree", async () => {
  const c = await treeDeck();
  c.moveNode("a2", "a1", "before");
  expect(kids(c, "a")).toEqual(["a2", "a1"]);
  c.moveNode("a1", "b", "after");
  expect(kids(c, "ROOT")).toEqual(["a", "b", "a1"]);
  expect(kids(c, "a1")).toEqual(["a1x"]);
  c.setState({ collapsed: { b: true } });
  c.moveNode("a2", "b", "child");
  expect(kids(c, "b")).toEqual(["a2"]);
  expect(kids(c, "a")).toEqual([]);
  expect(c.state.collapsed.b).toBe(false);                    // dropping inside expands the target
});

test("refused move: a slide can't go into its own subtree", async () => {
  const c = await treeDeck();
  const before = c.state.nodes;
  c.moveNode("a", "a1x", "child");
  expect(c.state.nodes).toBe(before);
});

test("a move is one undo step", async () => {
  const c = await treeDeck();
  await Bun.sleep(150);
  c.moveNode("b", "a", "before"); c.componentDidUpdate();
  expect(kids(c, "ROOT")).toEqual(["b", "a"]);
  c.undo(); c.componentDidUpdate();
  expect(kids(c, "ROOT")).toEqual(["a", "b"]);
});

test("drop zones: left third before, middle inside, right third after; invalid targets give nothing", async () => {
  const c = await treeDeck();
  c._tpos = { a: { x: 16, y: 18 }, a1: { x: 16, y: 110 }, b: { x: 112, y: 18 } };
  expect(c.treeDropAt(16 + 5, 30, "b")).toEqual({ id: "a", where: "before" });
  expect(c.treeDropAt(16 + 38, 30, "b")).toEqual({ id: "a", where: "child" });
  expect(c.treeDropAt(16 + 70, 30, "b")).toEqual({ id: "a", where: "after" });
  expect(c.treeDropAt(100, 300, "b")).toBeNull();
  expect(c.treeDropAt(112 + 38, 30, "b")).toBeNull();         // onto itself
  expect(c.treeDropAt(16 + 38, 120, "a")).toBeNull();         // into its own subtree
});

test("tree template has collapse toggles, drag start, and the drop marker", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('onPointerDown="{{ n.onDragStart }}"');
  expect(html).toContain('<sc-if value="{{ n.hasKids }}">');
  expect(html).toContain('<sc-if value="{{ tdMark.show }}">');
});

test("pressing a tree node blocks the browser's own text-selection drag (which cancels pointer events)", async () => {
  const c = await treeDeck();
  c.treeRef.current = { scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  let prevented = false;
  c.startTreeDrag({ clientX: 0, clientY: 0, button: 0, preventDefault() { prevented = true; } }, "a");
  expect(prevented).toBe(true);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toMatch(/top:\{\{ n\.y \}\}px;width:76px;opacity:\{\{ n\.opacity \}\};user-select:none/);
});


// ---- copy deck here (replaces live includes) ----
const deckBWithImage = async () => { await deckB(); await Bun.write(join(root, "decks/b/img/a.png"), "pngbytes"); };
const own = (c: any) => Object.values(c.state.nodes) as any[];

test("copying a deck adds its slides under the slide as ordinary slides: fresh ids, remapped links, inlined images", async () => {
  await deckBWithImage(); await deckTalk();
  const { c } = await mount("?deck=talk");
  await c.copyDeckHere("t", "b");
  const [x] = c.state.nodes.t.children.map((k: string) => c.state.nodes[k]);
  expect(x.title).toBe("Bx");
  const y = c.state.nodes[x.children[0]];
  expect(y.title).toBe("By");
  expect([x.id, y.id]).not.toContain("x");
  expect(x.frames[0].layers[0].link.id).toBe(y.id);
  const key = x.frames[0].layers[1].imgKey;
  expect(c.state.images[key]).toStartWith("data:image/png;base64,");
  expect(own(c).some(n => n._inc || n.include)).toBe(false);
  await c.save();
  const d = await onDisk();
  expect(d.nodes[x.id].title).toBe("Bx");
  expect(d.images[key]).toMatch(/^img\/[0-9a-f]{12}\.png$/);
});

test("copying the same deck twice gives two independent copies", async () => {
  await deckBWithImage(); await deckTalk();
  const { c } = await mount("?deck=talk");
  await c.copyDeckHere("t", "b"); await c.copyDeckHere("t", "b");
  const ks = c.state.nodes.t.children;
  expect(ks.length).toBe(2);
  expect(new Set(ks).size).toBe(2);
  expect(c.state.nodes[ks[0]].children[0]).not.toBe(c.state.nodes[ks[1]].children[0]);
});

test("a deck can't be copied into itself, and a missing deck changes nothing", async () => {
  await deckTalk();
  const { c } = await mount("?deck=talk");
  const before = c.state.nodes;
  await c.copyDeckHere("t", "talk");
  expect(c.state.nodes).toBe(before);
  expect(c.state.note).toContain("loop");
  await c.copyDeckHere("t", "nope");
  expect(c.state.nodes).toBe(before);
  expect(c.state.note).toContain("nope");
});

test("old live includes are converted to real copies when a deck is opened, then saved", async () => {
  await deckBWithImage(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  const [x] = c.state.nodes.t.children.map((k: string) => c.state.nodes[k]);
  expect(x.title).toBe("Bx");
  expect(c.state.nodes.t.include).toBeUndefined();
  expect(c.isDirty()).toBe(true);
  await c.save();
  const d = await onDisk();
  expect(d.nodes.t.include).toBeUndefined();
  expect(d.nodes.t.children).toEqual([x.id]);
  c.moveNode(x.id, "t", "after");                              // copies move like any slide
  expect(c.state.nodes.ROOT.children).toEqual(["t", x.id]);
});

test("Slide tab offers 'Copy deck here' and no longer has include/read-only UI", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('onChange="{{ onCopyDeck }}"');
  for (const gone of ["incFrom", "incShow", "guardGrafts", "stripGrafts"]) expect(html).not.toContain(gone);
});

// ---- delete dialog ----
test("deleting a slide without children happens immediately", async () => {
  const c = await treeDeck();
  c.remove("b");
  expect(c.state.nodes.b).toBeUndefined();
  expect(c.state.confirmDel ?? null).toBeNull();
});

test("deleting a slide with children asks first: delete all, keep children, or cancel", async () => {
  let c = await treeDeck();
  c.remove("a");
  expect(c.state.confirmDel).toEqual({ id: "a", count: 3 });
  expect(c.state.nodes.a).toBeDefined();
  c.confirmDelete("cancel");
  expect(c.state.confirmDel).toBeNull();
  expect(c.state.nodes.a).toBeDefined();

  c.remove("a"); c.confirmDelete("all");
  expect(Object.keys(c.state.nodes).sort()).toEqual(["ROOT", "b"]);

  c = await treeDeck();
  c.remove("a"); c.confirmDelete("keep");
  expect(c.state.nodes.a).toBeUndefined();
  expect(c.state.nodes.ROOT.children).toEqual(["a1", "a2", "b"]);
  expect(c.state.nodes.a1.children).toEqual(["a1x"]);

  c.remove("a1"); key(c, "Escape");
  expect(c.state.confirmDel).toBeNull();
  expect(c.state.nodes.a1).toBeDefined();
});

test("delete dialog is in the template", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-if value="{{ delDlg.show }}">');
  expect(html).toContain('<div onClick="{{ stopProp }}" role="dialog"');   // clicks inside the box don't reach the cancelling backdrop
});

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

test("copy deck 'Replace this slide': the copied slides take its place, subtree and all; one undo step", async () => {
  await deckBWithImage();
  const c = await treeDeck();
  await Bun.sleep(150);
  await c.copyDeckHere("b", "b", "replace"); c.componentDidUpdate();
  const [r0, r1] = c.state.nodes.ROOT.children;
  expect(r0).toBe("a");
  expect(c.state.nodes[r1].title).toBe("Bx");
  expect(c.state.nodes.b).toBeUndefined();
  expect(c.state.cur).toBe(r1);
  await c.copyDeckHere("a1", "b", "replace"); c.componentDidUpdate();
  const [x, a2] = c.state.nodes.a.children;
  expect(c.state.nodes[x].title).toBe("Bx");
  expect(a2).toBe("a2");
  expect(c.state.nodes.a1).toBeUndefined();
  expect(c.state.nodes.a1x).toBeUndefined();
  await Bun.sleep(500);                                         // let the undo burst window close
  c.undo(); c.componentDidUpdate();
  expect(c.state.nodes.a.children).toEqual(["a1", "a2"]);
  expect(c.state.nodes.a1x).toBeDefined();
});

test("Copy deck has an As children / Replace toggle", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<sc-for list="{{ copyModes }}"');
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
  expect(await onDisk()).toMatchObject({ bgScale: 0.5, bgRepeat: "xy", bgY: 0.3 });
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

test("dragging in a zoomed tree hit-tests in unzoomed tree coordinates", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a", "b"]), a: slideNode("a", "A"), b: slideNode("b", "B") });
  const { c, listeners } = await mount("?deck=talk");
  c.setState({ treeZoom: 0.5 });
  c._tpos = { a: { x: 16, y: 18 }, b: { x: 112, y: 18 } };
  c.treeRef.current = { scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  c.startTreeDrag({ clientX: 70, clientY: 15, button: 0, preventDefault() {} }, "b");
  listeners.pointermove({ clientX: (16 + 5) * 0.5, clientY: 15 });
  expect(c.state.treeDrag.drop).toEqual({ id: "a", where: "before" });
});

test("tree panel has zoom controls, a zoom wrapper and the Focus toggle", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const s of ['onClick="{{ treeZoomIn }}"', 'onClick="{{ treeZoomOut }}"', 'onClick="{{ treeZoomFit }}"', 'onClick="{{ toggleFocus }}"', "transform:scale({{ treeZoom }});transform-origin:0 0"])
    expect(html).toContain(s);
});

test("Insert deck is a collapsible section holding the mode toggle and deck chooser", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  const i = html.indexOf('<sc-if value="{{ copyShow }}">'), blk = html.slice(i, html.indexOf("</select>", i));
  expect(blk).toContain('onClick="{{ sec.insert.toggle }}"');
  expect(blk).toContain(">Insert deck<");
  expect(blk.indexOf('<sc-if value="{{ sec.insert.open }}">')).toBeLessThan(blk.indexOf('list="{{ copyModes }}"'));
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
  expect((html.match(/cards="true"/g) || []).length).toBe(3);   // tree, layout previews, frame strip
});
