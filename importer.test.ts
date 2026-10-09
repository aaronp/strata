import { test, expect } from "bun:test";
import { parseMarkdown } from "./markdown";
import { importInto, layersFor, importFile, importMarkdown } from "./importer";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const md = (body = "Hello there.") => `# A\nslug: a\n\n${body}\n\n- [link:b][To B]\n\n[Src](https://s.com)\n\n## B\nslug: b\n`;
const imp = (deck: any, text: string) => importInto(deck, parseMarkdown(text).sections);
const layer = (deck: any, node: string, id: string, fi = 0) => deck.nodes[node].frames[fi].layers.find((l: any) => l.id === id);

test("fresh import builds nodes, notes and md-* layers with links", () => {
  const d = imp(null, md());
  expect(d.nodes.ROOT.children).toEqual(["a"]);
  expect(d.nodes.a).toMatchObject({ id: "a", title: "A", children: ["b"] });
  expect(d.nodes.a.body).toContain("Hello there.");
  expect(d.nodes.a.frames.map((f: any) => f.id)).toEqual(["f1"]);
  expect(d.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["md-title", "md-body", "md-links", "md-src-0"]);
  expect(layer(d, "a", "md-links")).toMatchObject({ text: "[To B]{link=b}", style: "bullets", card: "custom", box: { bg: "#ffffff", bgOpacity: 0.75 } });
  expect(layer(d, "a", "md-src-0")).toMatchObject({ text: "Src ↗", link: { type: "url", url: "https://s.com" } });
  expect(d.title).toBe("A");
});

test("a heading with no body gets only a title layer", () => {
  expect(layersFor(parseMarkdown("# Only\nslug: only\n").sections[0]).map(l => l.id)).toEqual(["md-title"]);
});

test("re-import updates content but keeps builder layout, extra layers, frames and settings", () => {
  const d1 = imp(null, md());
  const f0 = d1.nodes.a.frames[0];
  const moved = f0.layers.map((l: any) => l.id === "md-body" ? { ...l, x: 50, size: 99 } : l.id === "md-src-0" ? { ...l, hidden: true } : l);
  const img = { id: "img1", type: "image", imgKey: "im1", x: 1, y: 1, w: 10, h: 10 };
  const edited = { ...d1, title: "My Title", bg: "ocean", nodes: { ...d1.nodes, a: { ...d1.nodes.a, include: "other", showFrames: true, ftrans: { f1: {} },
    frames: [{ ...f0, layers: [...moved, img] }, { id: "f2", layers: [...moved] }] } } };
  const d2 = imp(edited, md("Changed text."));
  for (const fi of [0, 1]) {
    expect(layer(d2, "a", "md-body", fi)).toMatchObject({ x: 50, size: 99, text: "Changed text." });
    expect(layer(d2, "a", "md-src-0", fi).hidden).toBe(true);
  }
  expect(layer(d2, "a", "img1")).toEqual(img);
  expect(d2.nodes.a).toMatchObject({ include: "other", showFrames: true, ftrans: { f1: {} } });
  expect(d2).toMatchObject({ title: "My Title", bg: "ocean" });
});

test("re-import removes sections and md layers that are gone, adds new ones", () => {
  const d1 = imp(null, md());
  const d2 = imp(d1, "# A\nslug: a\n\nNew body only.\n\n## C\nslug: c\n");
  expect(Object.keys(d2.nodes).sort()).toEqual(["ROOT", "a", "c"]);
  expect(d2.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["md-title", "md-body"]);
  expect(layer(d2, "a", "md-body").w).toBe(56);   // geometry kept from first import, not regenerated
});

test("a slide with legacy `layers` (no frames) becomes frame f0-<id>", () => {
  const legacy = { nodes: { ROOT: { id: "ROOT", children: ["a"] }, a: { id: "a", title: "A", body: "", children: [], layers: [{ id: "keep", type: "shape" }] } } };
  const d = imp(legacy, "# A\nslug: a\n");
  expect(d.nodes.a.layers).toBeUndefined();
  expect(d.nodes.a.frames[0].id).toBe("f0-a");
  expect(d.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["keep", "md-title"]);
});

test("importing the example produces 55 linked slides across 5 levels and records its source", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-imp-"));
  const r = await importFile(root, join(import.meta.dir, "examples/current-situation.md"));
  expect(r.errors).toEqual([]);
  expect(r.warnings).toEqual([]);
  expect(r.slug).toBe("current-situation");
  const d = await Bun.file(join(root, "decks/current-situation/deck.json")).json();
  const ids = Object.keys(d.nodes).filter(k => k !== "ROOT");
  expect(ids.length).toBe(55);
  expect(d.nodes.ROOT.children).toEqual(["current"]);
  expect(d.nodes["ai-authority"]).toBeDefined();             // level 5
  const targets = ids.flatMap(k => d.nodes[k].frames[0].layers).flatMap((l: any) => [...String(l.text ?? "").matchAll(/\{[^}]*\blink=([^\s}]+)/g)].map(m => m[1]));
  expect(targets.length).toBeGreaterThan(50);                    // inline slide links in the chip lists and bodies
  expect(targets.every((t: string) => d.nodes[t])).toBe(true);
  expect(d.source).toMatch(/examples\/current-situation\.md$/);
  expect(d.title).toBe("Current Situation");
});

test("an invalid file writes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-imp-"));
  await Bun.write(join(root, "bad.md"), "# A\nslug: a\n\n[link:nope][X]\n");
  const r = await importFile(root, join(root, "bad.md"));
  expect(r.deck).toBeNull();
  expect(r.errors[0].msg).toContain("nope");
  expect(await Bun.file(join(root, "decks/bad/deck.json")).exists()).toBe(false);
});

test("re-importing keeps layout edits made in deck.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-imp-"));
  await Bun.write(join(root, "t.md"), "# A\nslug: a\n\nBody.\n");
  await importFile(root, join(root, "t.md"), "talk");
  const p = join(root, "decks/talk/deck.json");
  const d = await Bun.file(p).json();
  d.nodes.a.frames[0].layers[1].x = 42;
  await Bun.write(p, JSON.stringify(d));
  await Bun.write(join(root, "t.md"), "# A\nslug: a\n\nNew body.\n");
  await importFile(root, join(root, "t.md"), "talk");
  expect((await Bun.file(p).json()).nodes.a.frames[0].layers[1]).toMatchObject({ x: 42, text: "New body." });
});

test("re-import keeps the link list's builder layout and container edits, and refreshes its links", () => {
  const d = imp(null, md());
  const edited = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a, frames: [{ ...d.nodes.a.frames[0], layers: d.nodes.a.frames[0].layers.map((l: any) =>
    l.id === "md-links" ? { ...l, x: 60, w: 34, card: "off", box: { ...l.box, bg: "#1f6fb8" } } : l) }] } } };
  expect(layer(imp(edited, md()), "a", "md-links")).toMatchObject({ x: 60, w: 34, card: "off", box: { bg: "#1f6fb8" }, text: "[To B]{link=b}" });
});

test("re-import keeps the title page: ROOT's title and frames, and the deck flags", () => {
  const deck = { titlePage: true, titleView: { zoom: 2, x: 0.5, y: 0.5 },
    nodes: { ROOT: { id: "ROOT", title: "Big", body: "", children: ["a"], frames: [{ id: "fr", layers: [{ id: "t", type: "text" }] }] }, a: { id: "a", title: "A", body: "", children: [] } } };
  const d = imp(deck, "# A\nslug: a\n");
  expect(d.titlePage).toBe(true); expect(d.titleView.zoom).toBe(2);
  expect(d.nodes.ROOT.title).toBe("Big"); expect(d.nodes.ROOT.frames[0].id).toBe("fr");
});

const deckFile = (root: string, slug: string, nodes: object) => Bun.write(join(root, `decks/${slug}/deck.json`), JSON.stringify({ nodes }));

test("import writes include onto the linked node; a re-import without the line keeps a link made in the builder", () => {
  const d = imp(null, "# W\nslug: w\ninclude: dw\n\nWhy.\n");
  expect(d.nodes.w).toMatchObject({ include: "dw", children: [] });
  expect(imp(d, "# W\nslug: w\n\nWhy.\n").nodes.w.include).toBe("dw");
  expect(imp(d, "# W\nslug: w\ninclude: other\n").nodes.w.include).toBe("other");
});

test("links into a linked deck are checked on import: warnings, never errors; chains are followed", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-inc-"));
  await deckFile(root, "dw", { ROOT: { id: "ROOT", children: ["costs", "fut"] }, costs: { id: "costs", title: "Costs", children: [] }, fut: { id: "fut", title: "F", include: "df", children: [] } });
  await deckFile(root, "df", { ROOT: { id: "ROOT", children: ["y"] }, y: { id: "y", title: "Y", children: [] } });
  const md = (ref: string, deck = "dw") => `# Top\nslug: top\n\n[link:${ref}][Go]\n\n## W\nslug: w\ninclude: ${deck}\n`;
  for (const ok of ["w.costs", "w.fut.y"]) { const r = await importMarkdown(root, "t", md(ok)); expect(r.errors).toEqual([]); expect(r.warnings).toEqual([]); }
  expect((await importMarkdown(root, "t", md("w.nope"))).warnings).toEqual([{ line: 4, msg: 'link target "w.nope" not found in deck dw' }]);
  const gone = await importMarkdown(root, "t2", md("w.costs", "missing"));
  expect(gone.deck).toBeTruthy();
  expect(gone.warnings).toEqual([{ line: 4, msg: 'deck "missing" not found (linked from "w")' }]);
});

test("links into a linked deck use its flat graft ids: w.deep (at any depth) resolves, a tree path w.top.deep doesn't", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-inc-"));
  await deckFile(root, "b", { ROOT: { id: "ROOT", children: ["top"] }, top: { id: "top", title: "Top", children: ["deep"] }, deep: { id: "deep", title: "Deep", children: [] } });
  const md = (ref: string) => `# H\nslug: h\n\n[link:${ref}][Go]\n\n## W\nslug: w\ninclude: b\n`;
  expect((await importMarkdown(root, "t", md("w.deep"))).warnings).toEqual([]);
  expect((await importMarkdown(root, "t", md("w.top.deep"))).warnings).toEqual([{ line: 4, msg: 'link target "w.top.deep" not found in deck b' }]);
});

test("fresh import: md-title is an H1 layer and md-body a Body layer, keeping only content-driven overrides", () => {
  const d = imp(null, "# Hello\nslug: hello\n\n- one\n- two\n");
  const L = d.nodes.hello.frames[0].layers, t = L.find((l: any) => l.id === "md-title"), b = L.find((l: any) => l.id === "md-body");
  expect(t.style).toBe("h1"); for (const k of ["font", "size", "weight", "valign", "lh", "align", "color"]) expect(t[k]).toBeUndefined();
  expect(b.style).toBe("body"); expect(b.bullets).toBe("disc"); expect(typeof b.size).toBe("number"); expect(b.weight).toBeUndefined(); expect(b.lh).toBeUndefined();
});

test("re-import respects styled md layers: a removed override stays removed, and a layer set to Custom stays Custom", () => {
  const d = imp(null, "# A\nslug: a\n\nBody.\n");
  const L = d.nodes.a.frames[0].layers;
  delete L.find((l: any) => l.id === "md-body").size;                                       // ↺ on Size: follow Body
  Object.assign(L.find((l: any) => l.id === "md-title"), { style: "", size: 64, weight: 800, valign: "bottom", lh: 1.05, font: "grot" });   // chosen Custom
  const again = imp(d, "# A\nslug: a\n\nBody.\n").nodes.a.frames[0].layers;
  expect(again.find((l: any) => l.id === "md-body").size).toBeUndefined();
  expect(again.find((l: any) => l.id === "md-title")).toMatchObject({ style: "", size: 64, weight: 800 });
});

test("import: md-title keeps the heading's markup, the node title is plain", () => {
  const d = imp(null, "# The **big** idea\nslug: big\n");
  expect(d.nodes.big.title).toBe("The big idea");
  expect(d.nodes.big.frames[0].layers.find((l: any) => l.id === "md-title").text).toBe("The **big** idea");
});

test("a slide's chips become one bulleted text layer of inline links (style Bullets), replacing old per-chip layers", () => {
  const md = "# Top\nslug: top\n\nIntro.\n\n- [link:a][Go to A]\n- [link:b][B*star*]\n\n## A\nslug: a\n\n## B\nslug: b\n";
  const d = imp(null, md), L = d.nodes.top.frames[0].layers;
  expect(L.filter((l: any) => String(l.id).startsWith("md-link-"))).toEqual([]);
  const ls = L.find((l: any) => l.id === "md-links");
  expect(ls).toMatchObject({ type: "text", style: "bullets", text: "[Go to A]{link=a}\n[B\\*star\\*]{link=b}", card: "custom" });
  expect(d.nodes.a.frames[0].layers.find((l: any) => l.id === "md-links")).toBeUndefined();     // no chips, no list
  const old = { nodes: { ...d.nodes, top: { ...d.nodes.top, frames: [{ id: "f1", layers: [...L.filter((l: any) => l.id !== "md-links"), { id: "md-link-0", type: "text", text: "Go →" }] }] } } };
  expect(imp(old, md).nodes.top.frames[0].layers.map((l: any) => l.id)).not.toContain("md-link-0");
});

test("imported layers take bullets from their style unless the content itself is a list (so style edits show)", () => {
  const d = imp(null, "# A\nslug: a\n\nProse.\n\n- [link:b][Go]\n\n## B\nslug: b\n\n- one\n- two\n");
  expect(layer(d, "a", "md-links").bullets).toBeUndefined();          // follows the Bullets style
  expect(layer(d, "a", "md-body").bullets).toBeUndefined();           // prose follows Body
  expect(layer(d, "b", "md-body").bullets).toBe("disc");              // a list body is a list by content
});
