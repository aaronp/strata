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
  expect(tokenColor(null, PALETTES[0])).toBeNull();
});
test("fonts", () => {
  expect(fontFor("head", FONTS[0])).toBe("'Space Grotesk', sans-serif");
  expect(fontsHref(FONTS[0])).toBe("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap");
});
