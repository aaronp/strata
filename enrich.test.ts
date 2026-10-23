// Enrichment (markdown + layout file -> nodes) and layoutOf, through the app's statics.
import { test, expect } from "bun:test";
import { join } from "node:path";
import { parseMarkdown } from "./markdown";

const js = (await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text()).split('<script type="text/x-dc" data-dc-script>')[1].split("</script>")[0];
const g = { location: { search: "" }, window: { StrataMd: await import("./markdown"), addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: () => null, setItem() {} } };
const C = new Function("DCLogic", "React", ...Object.keys(g), js + "\nreturn Component;")(class {}, { createRef: () => ({ current: null }) }, ...Object.values(g));
const { enrich, layoutOf } = C.md, { BUILTIN_LAYOUTS } = C.lay;
const run = (md: string, layouts: any[] = [], opts: any = {}) => enrich(parseMarkdown(md).sections, layouts, opts);
const layer = (n: any, id: string) => n.frames[0].layers.find((l: any) => l.id === id);
const LF = (slides: any = {}, deck: any = {}) => ({ version: 1, deck, slides });

test("enrich: stacked by default", () => {
  const n = run("# T\nslug: t\n\nA.\n\nB.").nodes.t, [s1, s2] = BUILTIN_LAYOUTS["stacked-2"].slots.body;
  expect(n.layout).toBe("stacked-2");
  expect(layer(n, "md-body-1")).toMatchObject({ x: s1.x, y: s1.y, w: s1.w, h: s1.h, text: "A." });
  expect(layer(n, "md-body-2")).toMatchObject({ x: s2.x, y: s2.y, w: s2.w, h: s2.h, text: "B." });
  expect(n.frames[0].layers.some((l: any) => l._warn)).toBe(false);
});

test("enrich: heading styles by depth", () => {
  const { nodes } = run("# A\nslug: a\n## B\nslug: b\n### C\nslug: c\n#### D\nslug: d");
  expect(["a", "b", "c", "d"].map(k => layer(nodes[k], "md-title").style)).toEqual(["h1", "h2", "h3", "h3"]);
  expect(nodes.a.children).toEqual(["b"]);
});

test("enrich: override wins and new block warns", () => {
  const ov = { frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", style: "h1", block: "title", x: 6, y: 6, w: 88, h: 14 }, { id: "md-body-1", type: "text", style: "body", block: "body", x: 50, y: 30, w: 40, h: 40 }] }] };
  const r = run("# T\nslug: t\n\nA.\n\nB.", [LF({ t: ov })]), n = r.nodes.t;
  expect(n.custom).toBe(true);
  expect(layer(n, "md-body-1")).toMatchObject({ x: 50, text: "A." });
  expect(layer(n, "md-body-2")._warn).toBe(true);
  expect(r.warnings).toEqual([{ id: "t", block: "body-2" }]);
});

test("enrich: removed block kept in override, absent from frames", () => {
  const ov = { frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", block: "title", x: 6, y: 6, w: 88, h: 14 }, { id: "md-body-1", type: "text", block: "body", x: 6, y: 24, w: 40, h: 40 }, { id: "md-body-2", type: "text", block: "body", x: 50, y: 24, w: 40, h: 40 }] }] };
  const { nodes } = run("# T\nslug: t\n\nA.", [LF({ t: ov })]);
  expect(layer(nodes.t, "md-body-2")).toBeUndefined();
  const L = layoutOf(nodes, {});
  expect(L.slides.t.frames[0].layers.map((l: any) => l.id)).toContain("md-body-2");
  expect(layer(run("# T\nslug: t\n\nA.\n\nB.", [L]).nodes.t, "md-body-2")).toMatchObject({ x: 50, text: "B." });   // it comes back
});

test("enrich: no layout match warns", () => {
  const { nodes, warnings } = run("# T\nslug: t\n\n![a](a.png)\n\n- x\n\n![b](b.png)\n\n* y");
  const L = nodes.t.frames[0].layers;
  expect(L.map((l: any) => l.block).sort()).toEqual(["image", "image", "list", "list", "title"]);
  for (const l of L) expect(!!l._warn).toBe(l.block !== "title");
  expect(layer(nodes.t, "md-title")).toMatchObject({ x: 6, y: 6, w: 88, h: 14 });
  for (const l of L.filter((l: any) => l.block !== "title")) { expect(l.w).toBe(88); expect(l.y).toBeGreaterThanOrEqual(24); expect(l.y + l.h).toBeLessThanOrEqual(88.01); }
  expect(warnings.length).toBe(4);
});

test("enrich: prefix and fallback chain", () => {
  const ov = (x: number) => ({ frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", block: "title", x, y: 6, w: 50, h: 14 }] }] });
  const md = "# X\nslug: x\n\n[link:y][Go]\n\n# Y\nslug: y";
  const r = run(md, [LF(), LF({ x: ov(20) })], { prefix: "a.", depth0: 2, from: "https://h/t.md" });
  expect(r.nodes["a.x"]._from).toBe("https://h/t.md");
  expect(layer(r.nodes["a.x"], "md-title")).toMatchObject({ x: 20, style: "h2" });
  expect(layer(r.nodes["a.x"], "md-links").text).toBe("[Go]{link=a.y}");
  expect(r.nodes.ROOT.children).toEqual(["a.x", "a.y"]);
  expect(layer(run(md, [LF({ "a.x": ov(30) }), LF({ x: ov(20) })], { prefix: "a." }).nodes["a.x"], "md-title").x).toBe(30);
  expect(layer(run(md, [LF({ x: ov(30) }), LF({ x: ov(20) })], { prefix: "a." }).nodes["a.x"], "md-title").x).toBe(20);   // the host is keyed by full id
  expect(layer(run("# X\nslug: x\n\n[link:nope][Go]").nodes.x, "md-links").text).toBe("[Go]{link=nope}");
  expect(layer(run("# X\nslug: x\n\nSee [link:y][Y] or [link:z][Z].\n\n# Y\nslug: y", [], { prefix: "a." }).nodes["a.x"], "md-body-1").text).toBe("See [Y]{link=a.y} or [Z]{link=z}.");
});

test("enrich: shape layouts from the layout file, defaults first", () => {
  const mine = { name: "Mine", match: { title: 1, body: 2 }, slots: { title: [{ x: 1, y: 1, w: 9, h: 9 }], body: [{ x: 1, y: 20, w: 9, h: 9 }, { x: 1, y: 40, w: 9, h: 9 }] } };
  const md = "# T\nslug: t\n\nA.\n\nB.";
  expect(run(md, [LF({}, { layouts: { mine } })]).nodes.t.layout).toBe("mine");
  expect(run(md, [LF({}, { layouts: { mine }, layoutDefaults: { "body:2,title:1": "cols-2" } })]).nodes.t.layout).toBe("cols-2");
  expect(run(md, [LF(), LF({}, { layouts: { mine } })]).nodes.t.layout).toBe("mine");
});

test("enrich: linked component layers dropped", () => {
  const ov = { frames: [{ id: "f1", layers: [{ id: "md-title", type: "text", block: "title", x: 6, y: 6, w: 88, h: 14 }, { id: "c1", type: "component", x: 0, y: 0, w: 10, h: 10 }] }] };
  expect(layer(run("# X\nslug: x", [LF(), LF({ x: ov })], { prefix: "a." }).nodes["a.x"], "c1")).toBeUndefined();
  expect(layer(run("# X\nslug: x", [LF({ x: ov })]).nodes.x, "c1")).toBeDefined();
});

test("layoutOf: strips content", () => {
  const { nodes } = run("# T\nslug: t\n\nA.\n\n- x\n\n[link:t][Me]\n\n[S](https://s)\n\n![c](c.png)", [], { src: "https://h/a.md" });
  const n = nodes.t, extra = { id: "e1", type: "text", text: "Mine", x: 0, y: 0, w: 5, h: 5 };
  const L = layoutOf({ ...nodes, t: { ...n, custom: true, frames: [{ ...n.frames[0], layers: [...n.frames[0].layers, extra] }] } },
    { title: "x", nodes: {}, source: "s", bg: "plain", images: { im1: "data:x", "md:https://h/c.png": "https://h/c.png" } });
  const ls = L.slides.t.frames[0].layers;
  for (const l of ls.filter((l: any) => l.id.startsWith("md-"))) { expect(l.text).toBeUndefined(); expect(l.link).toBeUndefined(); expect(l.src).toBeUndefined(); expect(l.imgKey).toBeUndefined(); }
  expect(ls.find((l: any) => l.id === "e1").text).toBe("Mine");
  expect(L.slides.t).not.toHaveProperty("title"); expect(L.slides.t).not.toHaveProperty("body"); expect(L.slides.t).not.toHaveProperty("children");
  expect(L.version).toBe(1);
  expect(L.deck).toEqual({ bg: "plain", images: { im1: "data:x" } });
  expect(L.slides.ROOT).toMatchObject({ id: "ROOT" });
  expect(Object.keys(L.slides).sort()).toEqual(["ROOT", "t"]);   // non-custom slides aren't stored
  expect(Object.keys(layoutOf({ ...nodes, t: { ...n, custom: true, _from: "u" } }, {}).slides)).toEqual(["ROOT"]);
});

test("enrich: markdown image resolves against src", () => {
  const r = run("# T\nslug: t\n\n![c](img/c.png)", [], { src: "https://h/d/a.md" });
  expect(r.images["md:https://h/d/img/c.png"]).toBe("https://h/d/img/c.png");
  expect(layer(r.nodes.t, "md-image-1")).toMatchObject({ type: "image", imgKey: "md:https://h/d/img/c.png" });
});

test("enrich: empty markdown", () => {
  expect(run("").nodes.ROOT.children).toEqual([]);
  expect(run("# T", [], { root: { id: "ROOT", title: "Deck", body: "", children: ["old"] } }).nodes.ROOT).toMatchObject({ title: "Deck", children: ["t"] });
});
