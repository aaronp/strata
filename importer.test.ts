import { test, expect } from "bun:test";
import { parseMarkdown } from "./markdown";
import { importInto, layersFor } from "./importer";

const md = (body = "Hello there.") => `# A\nslug: a\n\n${body}\n\n- [link:b][To B]\n\n[Src](https://s.com)\n\n## B\nslug: b\n`;
const imp = (deck: any, text: string) => importInto(deck, parseMarkdown(text).sections);
const layer = (deck: any, node: string, id: string, fi = 0) => deck.nodes[node].frames[fi].layers.find((l: any) => l.id === id);

test("fresh import builds nodes, notes and md-* layers with links", () => {
  const d = imp(null, md());
  expect(d.nodes.ROOT.children).toEqual(["a"]);
  expect(d.nodes.a).toMatchObject({ id: "a", title: "A", children: ["b"] });
  expect(d.nodes.a.body).toContain("Hello there.");
  expect(d.nodes.a.frames.map((f: any) => f.id)).toEqual(["f1"]);
  expect(d.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["md-title", "md-body", "md-linkbg-0", "md-link-0", "md-src-0"]);
  expect(layer(d, "a", "md-link-0")).toMatchObject({ text: "To B →", link: { type: "slide", id: "b" } });
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
