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

test("an included deck's slides are grafted under the including slide", async () => {
  await deckB(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  const N = c.state.nodes;
  expect(N.t.children).toEqual(["b:x"]);
  expect(N["b:x"]).toMatchObject({ _inc: "b", children: ["b:y"] });
  expect(N["b:x"].frames[0].layers[0].link.id).toBe("b:y");
  expect(N["b:x"].frames[0].layers[1].imgKey).toBe("b:im1");
  expect(c.state.images["b:im1"]).toBe("../decks/b/img/a.png");
  expect(c.isDirty()).toBe(false);
});

test("edits to included slides are reverted; the including slide stays editable", async () => {
  await deckB(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  // The stub doesn't re-render on setState; the second componentDidUpdate() mimics React re-rendering after the revert.
  c.setState({ nodes: { ...c.state.nodes, "b:x": { ...c.state.nodes["b:x"], title: "hacked" } } }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes["b:x"].title).toBe("Bx");
  expect(c.state.note).toContain('"b"');
  c.setState({ nodes: { ...c.state.nodes, t: { ...c.state.nodes.t, children: [] } } }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual(["b:x"]);
  c.setState({ nodes: { ...c.state.nodes, t: { ...c.state.nodes.t, title: "New intro" } } }); c.componentDidUpdate();
  expect(c.state.nodes.t.title).toBe("New intro");
});

test("saving keeps included slides and images out of the including deck", async () => {
  await deckB(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  c.setState({ title: "changed" }); await c.save();
  const d = await onDisk();
  expect(Object.keys(d.nodes).sort()).toEqual(["ROOT", "t"]);
  expect(d.nodes.t).toMatchObject({ include: "b", children: [] });
  expect(d.images).toEqual({});
  expect(c.state.images["b:im1"]).toBe("../decks/b/img/a.png");
});

test("a missing deck, an include loop, or a second include of the same deck shows an error slide", async () => {
  await deckTalk({ include: "nope" });
  let { c } = await mount("?deck=talk");
  expect(c.state.nodes["t!err"]).toMatchObject({ title: "Can't include nope" });
  expect(c.state.nodes.t.children).toEqual(["t!err"]);

  await writeDeck("b", { ROOT: slideNode("ROOT", "", ["x"]), x: slideNode("x", "Bx", [], { include: "talk" }) });
  await deckTalk({ include: "b" });
  ({ c } = await mount("?deck=talk"));
  expect(c.state.nodes["b:x!err"].body).toContain("loop");

  await deckB(); await deckTalk({ include: "b" }, ["u"]);
  ({ c } = await mount("?deck=talk"));
  expect(c.state.nodes.t.children).toEqual(["b:x"]);
  expect(c.state.nodes["u!err"].body).toContain("already included");
});

test("an included deck with no slides adds nothing", async () => {
  await writeDeck("b", { ROOT: slideNode("ROOT", "", []) }); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  expect(c.state.nodes.t.children).toEqual([]);
});

test("choosing a deck in the Include dropdown grafts it and autosaves the include", async () => {
  await deckB(); await deckTalk();
  const { c } = await mount("?deck=talk");
  await c.setInclude("t", "b"); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual(["b:x"]);
  await Bun.sleep(1200);
  expect((await onDisk()).nodes.t).toMatchObject({ include: "b", children: [] });
  await c.setInclude("t", ""); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual([]);
  expect(c.state.decks.map((d: any) => d.slug)).toEqual(["b", "talk"]);
});

test("Slide tab template has the Include dropdown and the read-only notice", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<select value="{{ incVal }}" onChange="{{ onInclude }}"');
  expect(html).toContain('<a href="{{ incHref }}">');
});

test("builder saves keep the deck's markdown source", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t"]), t: slideNode("t", "Intro") }, { source: "notes/talk.md" });
  const { c } = await mount("?deck=talk");
  c.setState({ title: "edited" }); await c.save();
  expect((await onDisk()).source).toBe("notes/talk.md");
});

test("an including slide can be deleted, taking its grafts with it", async () => {
  await deckB(); await deckTalk({ include: "b" }, []);
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t", "keep"]), t: slideNode("t", "Intro", [], { include: "b" }), keep: slideNode("keep", "Keep") });
  const { c } = await mount("?deck=talk");
  c.remove("t"); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes.t).toBeUndefined();
  expect(c.state.nodes["b:x"]).toBeUndefined();
  expect(c.state.note ?? null).toBeNull();
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
