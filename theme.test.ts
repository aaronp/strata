import { test, expect } from "bun:test";
import { resolveTheme, tokenColor, fontFor, fontsHref, PALETTES, FONTS } from "./theme";

test("defaults to Dusk / midnight / technical", () => {
  const r = resolveTheme({});
  expect(r.palette.id).toBe("midnight");
  expect(r.fonts.id).toBe("technical");
  expect(r.bg.css).toContain("#1E1B4B");
});
test("scheme recolours the background", () => expect(resolveTheme({ background: "dusk", scheme: "plum" }).bg.css).toContain("#1A0B2E"));
test("custom scheme colours; bad ones fall back to original", () => {
  expect(resolveTheme({ scheme: { deep: "#010101", mid: "#020202", accent: "#030303" } }).bg.css).toContain("#010101");
  expect(resolveTheme({ scheme: { deep: "red" } as any }).bg.css).toContain("#1E1B4B");
});
test("unknown ids fall back and never throw", () => {
  expect(resolveTheme({ background: "nope", palette: "nope", surface: "x" as any })).toEqual(resolveTheme({}));
  expect(() => resolveTheme(null as any)).not.toThrow();
});
test("image backgrounds and motion", () => {
  expect(resolveTheme({ background: "image:london" }).bg.image).toBe("london");
  expect(resolveTheme({ background: "aurora" }).bg.motion).toBe("flow");
});
test("tokenColor", () => {
  expect(tokenColor("impact", PALETTES[0])).toBe("#FBBF24");
  expect(tokenColor("#123456", PALETTES[0])).toBe("#123456");
  expect(tokenColor("name", PALETTES[0])).toBe("name");
  for (const k of ["toString", "__proto__"]) expect(tokenColor(k, PALETTES[0])).toBe(k);
  expect(tokenColor(null, PALETTES[0])).toBeNull();
});
test("fonts", () => {
  expect(fontFor("head", FONTS[0])).toBe("'Space Grotesk', sans-serif");
  expect(fontsHref(FONTS[0])).toBe("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap");
});
test("schemeOf: colours, choice and luminance tone", async () => {
  const { schemeOf } = await import("./theme");
  expect(schemeOf({ background: "paper" })).toMatchObject({ choice: "original", name: "Original", pairs: "paper", tone: "light" });
  expect(schemeOf({ background: "paper", scheme: "plum" })).toMatchObject({ choice: "plum", tone: "dark", colours: { deep: "#1A0B2E" } });
  expect(schemeOf({ background: "ink", scheme: { deep: "#FFFFFF", mid: "#FFFFFF", accent: "#000000" } })).toMatchObject({ choice: "custom", pairs: null, tone: "light" });
});
test("motion: defaults, overrides, bad values and the effect view", async () => {
  const { motionOf, effectView } = await import("./theme");
  expect(motionOf({ background: "dusk" })).toBeNull(); expect(effectView({ background: "dusk" }).cls).toBe("");
  expect(motionOf({ background: "gears" })).toEqual({ speedIdx: 8, opacity: 35, count: 4, size: "medium" });
  expect(motionOf({ background: "aurora", motion: { speedIdx: 99 } })!.speedIdx).toBe(9);
  for (const bad of ["length", "1", 1.5]) expect(motionOf({ background: "aurora", motion: { speedIdx: bad } })!.speedIdx).toBe(9);   // only an integer index
  for (const size of ["constructor", "__proto__"]) expect(effectView({ background: "gears", motion: { size } }).gearScale).toBe(1);
  expect(effectView({ background: "aurora", motion: { speedIdx: 11 } })).toMatchObject({ cls: "anim", dur: "8.0s" });
  expect(effectView({ background: "sunset" })).toMatchObject({ cls: "sky", isSunset: true, sunOn: true, opacity: 0.9 });
  expect(effectView({ background: "bubbles", motion: { count: 6 } }).bubbles.length).toBe(6);
  expect(effectView({ background: "gears", motion: { count: 999 } }).gearGroups.length).toBe(2);   // out of range: the default 4 gears, in two corners
});
test("effects lay out across the whole canvas (w × h stage sizes), not once per stage", async () => {
  const { effectView, resolveTheme } = await import("./theme");
  const canvas = { w: 2.9, h: 1 };                                                   // 4 flat slides at the default gap
  expect(effectView({ background: "bubbles" }).bubbles.length).toBe(18);           // one stage: as set
  const b = effectView({ background: "bubbles" }, canvas).bubbles;
  expect(b.length).toBe(Math.round(18 * 2.9));                                      // same density per stage
  expect(Math.max(...b.map(u => parseFloat(u.left))) * canvas.w / 100).toBeGreaterThan(1.5);   // spread beyond the first stage
  const xs = effectView({ background: "gears" }, canvas).gearGroups.map(g => parseFloat(g.left) * canvas.w / 100);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);                     // gear groups span more than one stage width
  expect(effectView({ background: "gears" }).gearGroups.map(g => g.left)).toEqual(["5.000%", "90.000%"]);   // one stage: the old corners
  expect(resolveTheme({ background: "dusk" }).bg.deep).toBe("#1E1B4B");
});
test("effects are resolution-independent: sizes in cqw of the canvas (a 900px-wide stage = 100cqw / canvas.w), positions in %", async () => {
  const { effectView } = await import("./theme");
  const cq = (s: string) => { expect(s).toMatch(/^-?[\d.]+cqw$/); return parseFloat(s); };
  // one stage: the old px look, with the stage as 100cqw (900px wide, as the prototype's stage)
  const sun1 = effectView({ background: "sunset" }), sun3 = effectView({ background: "sunset" }, { w: 3, h: 2 });
  expect(sun1.sunSize).toBe("28.889cqw"); expect(sun1.sunHalf).toBe("-14.444cqw");                 // was 260px, -130px
  expect(cq(sun3.sunSize)).toBeCloseTo(28.889 / 3, 3);                                               // same disc on a 3-stage-wide canvas
  const g1 = effectView({ background: "gears", motion: { count: 1 } }).gearGroups[0].gears[0];
  expect(g1).toMatchObject({ w: "33.333cqw", x: "-16.667cqw", y: "-16.667cqw" });                    // R 150: was 300px wide at -150px
  const gl = effectView({ background: "gears", motion: { count: 1, size: "large" } }, { w: 2, h: 1 }).gearGroups[0].gears[0];
  expect(cq(gl.w)).toBeCloseTo(33.333 * 1.4 / 2, 3);                                                // the size option scales it; half the share of a 2-wide canvas
  const b1 = effectView({ background: "bubbles" }).bubbles, b2 = effectView({ background: "bubbles" }, { w: 2, h: 1 }).bubbles;
  for (const u of b1) { const s = cq(u.size); expect(s).toBeGreaterThanOrEqual(8 / 9); expect(s).toBeLessThanOrEqual(36 / 9); expect(u.left).toMatch(/%$/); }   // 8–36px
  expect(cq(b2[0].size)).toBeCloseTo(cq(b1[0].size) / 2, 2);
  for (const v of [sun1, effectView({ background: "gears" }), effectView({ background: "bubbles" })]) expect(JSON.stringify(v)).not.toMatch(/\dpx/);
});
