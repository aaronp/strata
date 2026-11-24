// Unit tests for design/Layers.dc.html's logic class (pure: props in, render values out).
import { test, expect } from "bun:test";
import { join } from "node:path";

const html = await Bun.file(join(import.meta.dir, "design/Layers.dc.html")).text();
const js = html.split(/<script type="text\/x-dc" data-dc-script[^>]*>/)[1].split("</script>")[0];
const Component = new Function("DCLogic", js + "\nreturn Component;")(class { props: any; constructor(p: any) { this.props = p; } });
const render = (props: any) => new Component(props).renderVals();
const HELPER = new Function("DCLogic", js + "\nreturn HELPER;")(class {});

const txt = (extra = {}) => ({ id: "t", type: "text", text: "Hi", x: 0, y: 0, w: 10, h: 10, ...extra });
const shape = { id: "s", type: "shape", x: 0, y: 0, w: 10, h: 10 };
test("no surface: text is drawn as before", () => {
  const v = render({ layers: [txt()], shadow: "0 1px 2px #000" });
  expect(v.items[0]).toMatchObject({ cardBg: "transparent", cardBlur: "none", shadow: "0 1px 2px #000" });
  expect(v.slideCard).toBe(false);
});

test("a theme surface draws one whole-slide overlay under all layers", () => {
  const v = render({ layers: [txt()], surface: { bg: "rgba(15,18,32,0.35)", blur: "blur(8px)" } });
  expect(v).toMatchObject({ slideCard: true, slideBg: "rgba(15,18,32,0.35)", slideBlur: "blur(8px)" });
  expect(v.items[0].cardBg).toBe("transparent");
  expect(html).toContain('<sc-if value="{{ slideCard }}">');
});

test("theme fonts arrive as CSS families; the old font keys still map", () => {
  expect(render({ layers: [txt({ font: "'Space Grotesk', sans-serif" })] }).items[0].font).toBe("'Space Grotesk', sans-serif");
  expect(render({ layers: [txt({ font: "serif" })] }).items[0].font).toBe("'DM Serif Display',serif");
});

const BOX = { bg: "#ffffff", bgOpacity: 0.25, blur: 4, border: 2, borderColor: "#d9432b", radius: 16, pad: 24 };

test("a custom box styles the text layer's bounding box, in slide-relative units", () => {
  const v = render({ layers: [txt({ card: "custom", box: BOX })], shadow: "x", card: { mode: "none" } });
  expect(v.items[0]).toMatchObject({ cardBg: "rgba(255,255,255,0.25)", cardBlur: "blur(4px)", cardBorder: "0.125cqw solid #d9432b",
    cardRadius: "1cqw", cardPad: "1.5cqw", shadow: "none" });
  expect(html).toContain("border:{{ e.cardBorder }}");
});

test("custom box with zero blur and border draws neither", () => {
  const v = render({ layers: [txt({ card: "custom", box: { ...BOX, blur: 0, border: 0 } })] });
  expect(v.items[0]).toMatchObject({ cardBlur: "none", cardBorder: "none" });
});

test("Off wins over a stored custom box", () => {
  expect(render({ layers: [txt({ card: "off", box: BOX })] }).items[0]).toMatchObject({ cardBg: "transparent", cardBorder: "none" });
});

test("text boxes grow to fit their text and expose their layer id for measuring", () => {
  expect(html).toContain('data-lid="{{ e.lid }}"');
  expect(html).toMatch(/<div style="width:100%;min-height:100%;display:flex;flex-direction:column/);
  expect(render({ layers: [txt()] }).items[0].lid).toBe("t");
});

test("image layers: zoom about a focus point, which also pans a cropped image", () => {
  const img = (extra = {}) => ({ id: "i", type: "image", x: 0, y: 0, w: 10, h: 10, imgKey: "k", ...extra });
  const v = render({ layers: [img({ zoom: 2, focusX: 20, focusY: 80 })], images: { k: "data:x" } }).items[0];
  expect(v).toMatchObject({ hasImg: true, imgBg: 'url("data:x") 20% 80% / cover no-repeat', zoom: 2, focus: "20% 80%", boxBg: "transparent" });
  expect(render({ layers: [img({ fit: "contain" })], images: { k: "data:x" } }).items[0]).toMatchObject({ imgBg: 'url("data:x") 50% 50% / contain no-repeat', zoom: 1, focus: "50% 50%" });
  expect(render({ layers: [img()], images: {} }).items[0].hasImg).toBe(false);
  expect(html).toContain("transform:scale({{ e.zoom }});transform-origin:{{ e.focus }}");
});

const comp = (o = {}) => ({ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, name: "Demo", code: "<b>hi</b><script>strata.ready({steps:true})</script>", ...o });
const doc = (src: string) => decodeURIComponent(src.replace("data:text/html;charset=utf-8,", ""));

test("a live component renders a sandboxed iframe running the helper, then the snippet", () => {
  const it = render({ layers: [comp()], live: "s1" }).items[0];
  expect(it).toMatchObject({ isComponent: true, live: true, placeholder: false, name: "Demo", lid: "c1" });
  expect(it.src.startsWith("data:text/html;charset=utf-8,")).toBe(true);
  const d = doc(it.src);
  expect(d.indexOf("window.strata=")).toBeLessThan(d.indexOf("<b>hi</b>"));
  expect(d).toContain("<!-- strata s1 -->");
  expect(html).toContain('sandbox="allow-scripts"');
  expect(html).not.toContain("allow-same-origin");
});

test("the same component keeps an identical src across steps (no reload), but not across slides", () => {
  const a = render({ layers: [comp({ x: 0 })], live: "s1" }).items[0].src;
  expect(render({ layers: [comp({ x: 40, w: 20, opacity: 0.5 })], live: "s1" }).items[0].src).toBe(a);
  expect(render({ layers: [comp()], live: "s2" }).items[0].src).not.toBe(a);
});

test("not live: a name card in builder thumbnails (cards), nothing in the swipe/ghost planes", () => {
  expect(render({ layers: [comp()], cards: "true" }).items[0]).toMatchObject({ isComponent: true, live: false, placeholder: true, name: "Demo", src: "" });
  expect(render({ layers: [comp()] }).items[0]).toMatchObject({ isComponent: true, live: false, placeholder: false, src: "" });
});

test("a pasted full HTML document keeps the helper first", () => {
  const d = doc(render({ layers: [comp({ code: "<!doctype html><html><head><title>x</title></head><body><p>y</p></body></html>" })], live: "s1" }).items[0].src);
  expect(d.indexOf("window.strata=")).toBeLessThan(d.indexOf("<title>x</title>"));
});

test("the helper: forwards messages to handlers, acks next/prev, reports errors, says hello on load", () => {
  const posted: any[] = [], L: Record<string, Function> = {}, parent = { postMessage: (m: any) => posted.push(m) }, win: any = {};
  new Function("parent", "addEventListener", "window", HELPER)(parent, (t: string, f: Function) => (L[t] = f), win);
  const got: any[] = [];
  win.strata.on("next", (m: any) => got.push(m.type));
  L.message({ source: parent, data: { strata: 1, type: "next" } });
  L.message({ source: {}, data: { strata: 1, type: "next" } });          // not from the slide: ignored
  expect(got).toEqual(["next"]);
  expect(posted).toEqual([{ strata: 1, type: "ack" }]);
  win.strata.ready({ steps: true }); win.strata.done(); win.strata.jumpTo("intro"); win.strata.nav("up");
  L.error({ message: "boom", lineno: 3 }); L.DOMContentLoaded();
  expect(posted.slice(1)).toEqual([{ strata: 1, type: "ready", steps: true }, { strata: 1, type: "done" }, { strata: 1, type: "jumpTo", slug: "intro" },
    { strata: 1, type: "nav", dir: "up" }, { strata: 1, type: "error", message: "boom", line: 3 }, { strata: 1, type: "hello" },
    { strata: 1, type: "ready", steps: true }]);   // ready is replayed after hello: the host resets claims on hello
});

test("helper relays navigation keys pressed inside the component unless it handled them", async () => {
  const posted: any[] = [], L: Record<string, Function> = {}, parent = { postMessage: (m: any) => posted.push(m) }, win: any = {};
  new Function("parent", "addEventListener", "window", HELPER)(parent, (t: string, f: Function) => (L[t] = f), win);
  L.keydown({ key: "ArrowRight", shiftKey: false, defaultPrevented: false });
  L.keydown({ key: " ", shiftKey: true, defaultPrevented: false });
  L.keydown({ key: "ArrowLeft", defaultPrevented: true });
  L.keydown({ key: "a", defaultPrevented: false });
  await Bun.sleep(5);
  expect(posted).toEqual([{ strata: 1, type: "key", key: "ArrowRight", shiftKey: false }, { strata: 1, type: "key", key: " ", shiftKey: true }]);
});

test("a component that isn't showing in this step doesn't catch clicks", () => {
  expect(render({ layers: [comp()], live: "s1" }).items[0].pe).toBe("auto");
  expect(render({ layers: [comp({ opacity: 0 })], live: "s1" }).items[0].pe).toBe("none");
  expect(html).toContain("pointer-events:{{ e.pe }}");
});

test("text runs render as spans with their own weight, style, size, colour and font; plain text renders as one run", () => {
  const v = render({ layers: [txt({ text: "a b", _lines: [[{ text: "a " }, { text: "b", b: true, i: true, size: 32, color: "#ff0000", font: "serif" }]] })] });
  expect(v.items[0].lines[0].runs).toEqual([
    { text: "a ", fw: "", fst: "", fsz: "", col: "", fam: "", lsp: "", lnk: "", href: "", deco: "", pe: "", cur: "" },
    { text: "b", fw: "bolder", fst: "italic", fsz: "2cqw", col: "#ff0000", fam: "'DM Serif Display',serif", lsp: "", lnk: "", href: "", deco: "", pe: "", cur: "" }]);
  expect(render({ layers: [txt()] }).items[0].lines[0].runs).toEqual([{ text: "Hi", fw: "", fst: "", fsz: "", col: "", fam: "", lsp: "", lnk: "", href: "", deco: "", pe: "", cur: "" }]);
  const w = render({ layers: [txt({ text: "x", _lines: [[{ text: "x", b: true, weight: 300 }]] })] });
  expect(w.items[0].lines[0].runs[0].fw).toBe(300);                           // an explicit weight wins over bold
});

test("link runs are underlined and clickable only when links are live; broken ones are dashed and inert", () => {
  const L = [[{ text: "a", link: "s1" }, { text: "b", href: "https://x" }, { text: "c", link: "gone", broken: true }]];
  const live = render({ links: true, layers: [txt({ text: "abc", _lines: L })] }).items[0].lines[0].runs;
  expect(live.map((r: any) => [r.lnk, r.href, r.deco, r.pe])).toEqual([["s1", "", "underline", "auto"], ["", "https://x", "underline", "auto"], ["", "", "underline dashed", ""]]);
  const off = render({ layers: [txt({ text: "abc", _lines: L })] }).items[0].lines[0].runs;
  expect(off.map((r: any) => r.pe)).toEqual(["", "", ""]);
  expect(html).toContain('data-link="{{ r.lnk }}"');
});

test("a layer's build style (opacity, transform, clip, transition) goes on its outer div", () => {
  const b = { opacity: 0, transform: "scale(0.6)", clip: "inset(0 0 0 0)", transition: "none" };
  const it = render({ layers: [{ ...shape, rot: 5, build: b }] }).items[0];
  expect(it).toMatchObject({ op: 0, transform: "scale(0.6) rotate(5deg)", bclip: "inset(0 0 0 0)", tr: "none" });
  expect(render({ layers: [shape] }).items[0]).toMatchObject({ op: 1, transform: "rotate(0deg)", bclip: "none", tr: "none" });
  expect(html).toMatch(/data-lid="\{\{ e\.lid \}\}" style="[^"]*transform:\{\{ e\.transform \}\};[^"]*clip-path:\{\{ e\.bclip \}\};[^"]*transition:\{\{ e\.tr \}\}/);
  expect(html).not.toContain("e.tr2");
});

test("shapes: kind sets the corners, a border draws in the shape's stroke colour, and the blend mode goes on the layer", () => {
  const sh = (o = {}) => render({ layers: [{ ...shape, ...o }] }).items[0];
  expect(sh({ kind: "ellipse", fill: "#93c5fd59", stroke: "#93c5fd", border: { width: 2, style: "dashed" }, blend: "screen" }))
    .toMatchObject({ isShape: true, isLine: false, radius: "50%", fill: "#93c5fd59", border: "0.2cqw dashed #93c5fd", blend: "screen" });
  expect(sh({ kind: "round" }).radius).toBe("3cqw"); expect(sh({ kind: "rect" }).radius).toBe("0");
  expect(sh({ border: { width: 0, style: "solid" } }).border).toBe("0"); expect(sh().blend).toBe("normal");
  expect(html).toContain("mix-blend-mode:{{ e.blend }}"); expect(html).toContain("border:{{ e.border }}");
});

test("lines and arrows: an SVG line across the box in the drawn direction; arrows end in an arrowhead", () => {
  const ln = (o = {}) => render({ layers: [{ ...shape, id: "q", kind: "line", stroke: "#fff", border: { width: 5, style: "solid" }, ...o }] }).items[0];
  expect(ln()).toMatchObject({ isShape: false, isLine: true, x1: "0%", y1: "0%", x2: "100%", y2: "100%", sw: "0.5cqw", stroke: "#fff", mark: "none" });
  expect(ln({ flip: true })).toMatchObject({ x1: "0%", y1: "100%", x2: "100%", y2: "0%" });                  // dragged up-right
  expect(ln({ flip: true, back: true })).toMatchObject({ x1: "100%", y1: "0%", x2: "0%", y2: "100%" });     // dragged down-left
  expect(ln({ kind: "arrow" })).toMatchObject({ mark: "url(#ah-q)", mid: "ah-q" });
  expect(html).toContain('<sc-if value="{{ e.isLine }}">'); expect(html).toContain("marker-end:{{ e.mark }}");
});

test("unsafe values from a layout file never reach a style string: each falls back to the default", () => {
  const semi = (o: any): boolean => typeof o === "string" ? o.includes(";") : o && typeof o === "object" ? Object.values(o).some(semi) : false;
  const v = render({ ink: "#111111", layers: [
    txt({ font: "x;background:url(http://t)", color: "red;top:0", blend: "x;y", _lines: [[{ text: "Hi", color: "red;x", font: "a;b" }]] }),
    { ...shape, fill: "a;b", stroke: "red;x", border: { width: "3;x", style: "x;y" } },
    { ...shape, kind: "line", stroke: "red;x", border: { width: 99, style: "x;y" } },
    { id: "i", type: "icon", x: 0, y: 0, w: 10, h: 10, fill: "red;x" },
    txt({ card: "custom", box: { ...BOX, borderColor: "red;x" } }),
  ] });
  expect(semi(v.items)).toBe(false);
  expect(v.items[0]).toMatchObject({ font: "'Bricolage Grotesque',sans-serif", color: "#111111", blend: "normal" });
  expect(v.items[0].lines[0].runs[0]).toMatchObject({ col: "", fam: "" });
  expect(v.items[1]).toMatchObject({ fill: "#d9432b", border: "0" });
  expect(v.items[2]).toMatchObject({ stroke: "#111111", sw: "1cqw", dash: "none" });   // width clamped to 10
  expect(v.items[3].fill).toBe("#111111"); expect(v.items[4].cardBorder).toBe("0.125cqw solid #ffffff");
  expect(render({ layers: [{ ...shape, fill: "#d9432b59", border: { width: 2, style: "dashed" }, stroke: "#123" }] }).items[0]).toMatchObject({ fill: "#d9432b59", border: "0.2cqw dashed #123" });
});
