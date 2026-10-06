// Unit tests for design/Layers.dc.html's logic class (pure: props in, render values out).
import { test, expect } from "bun:test";
import { join } from "node:path";

const html = await Bun.file(join(import.meta.dir, "design/Layers.dc.html")).text();
const js = html.split(/<script type="text\/x-dc" data-dc-script[^>]*>/)[1].split("</script>")[0];
const Component = new Function("DCLogic", js + "\nreturn Component;")(class { props: any; constructor(p: any) { this.props = p; } });
const render = (props: any) => new Component(props).renderVals();

const txt = (extra = {}) => ({ id: "t", type: "text", text: "Hi", x: 0, y: 0, w: 10, h: 10, ...extra });
const shape = { id: "s", type: "shape", x: 0, y: 0, w: 10, h: 10 };
const CARD = { color: "#0b1220", opacity: 0.5, blur: 6 };

test("no deck card: text is drawn as before", () => {
  const v = render({ layers: [txt()], shadow: "0 1px 2px #000" });
  expect(v.items[0]).toMatchObject({ cardBg: "transparent", cardBlur: "none", shadow: "0 1px 2px #000" });
  expect(v.slideCard).toBe(false);
});

test("'behind text' cards every text layer and drops its shadow, not shapes", () => {
  const v = render({ layers: [txt(), shape], shadow: "0 1px 2px #000", card: { mode: "text", ...CARD } });
  expect(v.items[0]).toMatchObject({ cardBg: "rgba(11,18,32,0.5)", cardBlur: "blur(6px)", shadow: "none" });
  expect(v.items[1].cardBg).toBeUndefined();
  expect(v.slideCard).toBe(false);
});

test("a layer's own card setting overrides the deck", () => {
  expect(render({ layers: [txt({ card: "off" })], card: { mode: "text", ...CARD } }).items[0].cardBg).toBe("transparent");
  expect(render({ layers: [txt({ card: "on" })], card: { mode: "none", ...CARD } }).items[0].cardBg).toBe("rgba(11,18,32,0.5)");
});

test("'whole slide' draws one overlay under all layers", () => {
  const v = render({ layers: [txt()], card: { mode: "slide", ...CARD } });
  expect(v).toMatchObject({ slideCard: true, slideBg: "rgba(11,18,32,0.5)", slideBlur: "blur(6px)" });
  expect(v.items[0].cardBg).toBe("transparent");
  expect(html).toContain('<sc-if value="{{ slideCard }}">');
});
