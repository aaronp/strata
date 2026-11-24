import { test, expect } from "bun:test";
import { join } from "node:path";
import { sanitizeLayout, safeImageUrl } from "./layout-sanitize";

const EVIL = "1;background:url(http://t)";
const hostile = () => JSON.parse(JSON.stringify({
  version: 2, constructor: { x: 1 },
  deck: {
    opacity: "1;top:0", gap: Infinity, offset: 0.5, bgRepeat: "x;top:0", spacing: "fit", titleView: { zoom: "2;x", x: 0.2, evil: "a;b" },
    customBg: "javascript:x", images: { k: 'data:x");top:0;("', ok: "data:image/png;base64,AA", rel: "img/a.png", web: "https://x/a.png", js: "javascript:alert(1)", sp: "https://x/a b.png" },
    theme: { background: "x;y", palette: "ember", fonts: "nope", scheme: { deep: "#000000", mid: "red;x", accent: "#ffffff" }, motion: { count: 4, size: "a;b" }, extra: "z" },
    styles: { evil: { name: "Evil", color: "red;top:0", font: "x;y", size: 40, _x: 1 }, constructor: { size: 1 } },
    layouts: {
      evil: { name: "x".repeat(81), icon: "constructor", match: { title: 1, body: "items", list: "x" }, opts: ["bar", "x;y"],
        slots: { title: [{ x: "1;top:0", y: 0, w: 10, h: 10 }, { x: 500, y: -90, w: 10, h: 10, color: "red;x" }], body: "nope" }, number: { x: 1, y: 2, w: 3, h: 4, font: "x;y" } },
      ok: { name: "Fine", icon: "split", match: { title: 1 }, slots: { title: [{ x: 6, y: 6, w: 88, h: 14, rot: 0 }] } },
    },
    layoutDefaults: { "title:1": "ok", "body:1": "a;b", x: "constructor" },
  },
  slides: {
    s: { custom: true, layout: "toString", _kept: [1], steps: { a: 1, b: 1.5, c: "2", d: 1000 }, trans: { 1: "rise", 2: "x;y", x: "fade" }, build: { dur: 500, ease: "x;top:0", earlier: "dim", replace: "yes", z: 1 },
      barStyle: "x", side: "right", showSteps: "yes",
      layers: [
        { id: "w", type: "shape", x: EVIL, y: 1, w: 2, h: 3, _warn: true, _lines: [] },
        { id: "a);background:url(http://t);x:(a", type: "shape", kind: "arrow", x: 0, y: 0, w: 5, h: 5 },
        { id: "i", type: "image", imgKey: "k;x", src: "javascript:x", x: 0, y: 0, w: 5, h: 5 },
        { id: "l1", type: "text", text: "t", link: { type: "url", url: "javascript:alert(1)" }, href: "https://ok.org" },
        { id: "l2", type: "text", text: "t", link: { type: "url", url: "example.com" } },
        { id: "l3", type: "text", text: "t", link: { type: "slide", id: "s" }, href: "data:x" },
        "not a layer", { type: "text" },
      ] },
  },
}));

test("sanitizeLayout: deck numbers, enums, theme and image urls", () => {
  const d = sanitizeLayout(hostile())!.deck;
  expect(d.opacity).toBeUndefined(); expect(d.gap).toBeUndefined(); expect(d.offset).toBe(0.5);
  expect(d.bgRepeat).toBeUndefined(); expect(d.spacing).toBe("fit"); expect(d.titleView).toEqual({ x: 0.2 });
  expect("customBg" in d).toBe(false);
  expect(d.images).toEqual({ ok: "data:image/png;base64,AA", rel: "img/a.png", web: "https://x/a.png" });
  expect(d.theme).toEqual({ palette: "ember", motion: { count: 4 } });
  expect(sanitizeLayout({ deck: { customBg: null } })!.deck.customBg).toBeNull();
  expect(d.styles).toEqual({ evil: { name: "Evil", size: 40 } });
});

test("sanitizeLayout: user templates", () => {
  const { layouts, layoutDefaults } = sanitizeLayout(hostile())!.deck;
  expect(layouts.evil).toEqual({ match: { title: 1, body: "items" }, opts: ["bar"], slots: { title: [{ x: 150, y: -50, w: 10, h: 10 }] }, number: { x: 1, y: 2, w: 3, h: 4 } });
  expect(layouts.ok).toEqual({ name: "Fine", icon: "split", match: { title: 1 }, slots: { title: [{ x: 6, y: 6, w: 88, h: 14, rot: 0 }] } });
  expect(layoutDefaults).toEqual({ "title:1": "ok" });
});

test("sanitizeLayout: slides, layers, steps, transitions and builds", () => {
  const out = sanitizeLayout(hostile())!, s = out.slides.s;
  expect(Object.keys(out.slides)).toEqual(["s"]); expect(Object.keys(out)).toEqual(["version", "deck", "slides"]);
  expect(({} as any).polluted).toBeUndefined();
  expect(s).toMatchObject({ custom: true, side: "right", steps: { a: 1 }, trans: { 1: "rise" }, build: { dur: 500, earlier: "dim" } });
  for (const k of ["layout", "_kept", "barStyle", "showSteps"]) expect(k in s).toBe(false);
  expect(s.layers.map((l: any) => l.id)).toEqual(["w", "i", "l1", "l2", "l3"]);
  const [w, i, l1, l2, l3] = s.layers;
  expect(w).toEqual({ id: "w", type: "shape", x: 0, y: 1, w: 2, h: 3 });   // _warn and _lines stripped, the bad x defaulted
  expect(i.imgKey).toBeUndefined(); expect(i.src).toBeUndefined();
  expect(l1.link).toBeUndefined(); expect(l1.href).toBe("https://ok.org");
  expect(l2.link).toEqual({ type: "url", url: "example.com" });
  expect(l3.link).toEqual({ type: "slide", id: "s" }); expect(l3.href).toBeUndefined();
  expect(JSON.stringify(out)).not.toMatch(/url\(|top:0|;x|x;/);
});

test("sanitizeLayout: __proto__ / constructor / prototype keys are ignored at every level", () => {
  const raw = JSON.parse('{"version":2,"__proto__":{"polluted":1},"prototype":1,"deck":{"__proto__":{"opacity":"1;top:0"},"images":{"__proto__":"x","constructor":"img/a.png"}},' +
    '"slides":{"__proto__":{"layers":[]},"s":{"__proto__":{"x":1},"layers":[{"id":"a","__proto__":{"x":"1;top:0"},"constructor":1}]}}}');
  const out = sanitizeLayout(raw)!, own = (o: any) => Object.getOwnPropertyNames(o);
  expect(own(out)).toEqual(["version", "deck", "slides"]); expect(own(out.deck)).toEqual(["images"]); expect(own(out.deck.images)).toEqual([]);
  expect(own(out.slides)).toEqual(["s"]); expect(own(out.slides.s)).toEqual(["layers"]); expect(own(out.slides.s.layers[0])).toEqual(["id"]);
  for (const o of [out, out.deck, out.slides, out.slides.s, out.slides.s.layers[0]]) expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
  expect(({} as any).polluted).toBeUndefined();
});

test("safeImageUrl", () => {
  for (const u of ["data:image/svg+xml;base64,PHN2Zz4=", "data:image/gif,AA%20", "blob:https://x/1", "http://x/a.png", "img/a.png"]) expect([u, safeImageUrl(u)]).toEqual([u, true]);
  for (const u of ["data:text/html,x", "data:image/png;charset=x,AA", "https://x/a(1).png", "https://x/a;b", "javascript:x", "img/a'.png", "", 5]) expect([u, safeImageUrl(u)]).toEqual([u, false]);
});

test("sanitizeLayout: not an object is null; the example decks come through unchanged", async () => {
  for (const v of [null, "x", [1], 3]) expect(sanitizeLayout(v)).toBeNull();
  for (const f of new Bun.Glob("examples/**/*-layout.json").scanSync(import.meta.dir)) {
    const L = await Bun.file(join(import.meta.dir, f)).json();
    expect([f, sanitizeLayout(L)]).toEqual([f, L]);
  }
});
