// Trust boundary for layout files (-layout.json): a deck's own, a ?src= deck's, a linked `children:` deck's, an opened file or a draft can all come
// from anywhere, and their strings reach inline CSS (the DC runtime splits style strings on ';'). sanitizeLayout returns a cleaned copy:
// only values the app expects survive. Pure: no I/O. Bundled as window.StrataSanitize; the app's display guards (safeLayer) live here too.
import { BACKGROUNDS, SCHEMES, PALETTES, FONTS, SURFACES, IMAGE_BACKGROUNDS } from "./theme";
import { TRANSITIONS, DURATIONS, EASINGS } from "./builds";

type Obj = Record<string, any>;

// ---- display guards (also run on every layer the app draws) ----
export const FONT_KEYS = ["head", "body", "grot", "serif", "news", "mono", "hand"];
export const safeCol = (v: unknown) => typeof v === "string" && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(v);   // a token, a hex or a colour name
export const safeFont = (v: unknown) => typeof v === "string" && FONT_KEYS.includes(v);                     // head, body, mono or a font key
const NUM_KEYS = ["x", "y", "w", "h", "rot", "opacity", "fillOpacity", "radius", "size", "weight", "lh", "ls", "gap", "sw", "zoom", "focusX", "focusY"];
const GEO = { x: 0, y: 0, w: 10, h: 10 };   // a box with bad geometry still shows, small, at the top left
export const finite = (v: unknown) => typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v));
// Numbers become numbers (a numeric string too); anything else takes its default from def, or is dropped.
export const numsOnly = (r: Obj, keys: string[], def: Obj = {}) => { for (const k of keys) if (r[k] != null) { if (finite(r[k])) r[k] = Number(r[k]); else if (k in def) r[k] = def[k]; else delete r[k]; } return r; };
const dropUnsafe = (o: Obj) => { const r = numsOnly({ ...o }, NUM_KEYS, GEO); for (const k of ["color", "fill", "stroke", "token"]) if (r[k] != null && !safeCol(r[k])) delete r[k]; if (r.font != null && !safeFont(r.font)) delete r.font; return r; };
export function safeLayer(l: Obj) {
  const r = dropUnsafe(l);
  if (r.blend != null && !["normal", "screen"].includes(r.blend)) delete r.blend;
  if (r.align != null && !["left", "center", "right"].includes(r.align)) delete r.align;
  if (r.valign != null && !["top", "middle", "bottom"].includes(r.valign)) delete r.valign;
  if (r.box != null) { if (typeof r.box !== "object") delete r.box; else { const b = numsOnly({ ...r.box }, ["bgOpacity", "blur", "border", "radius", "pad"]); for (const k of ["bg", "borderColor"]) if (b[k] != null && !safeCol(b[k])) delete b[k]; r.box = b; } }
  if (r.border != null) r.border = typeof r.border === "object" ? { ...r.border, style: ["solid", "dashed", "dotted"].includes(r.border.style) ? r.border.style : "solid",
    width: Number.isFinite(r.border.width) ? Math.max(0, Math.min(10, r.border.width)) : 0 } : { width: 0, style: "solid" };
  if (r._lines) r._lines = r._lines.map((line: Obj[]) => line.map(dropUnsafe));
  return r;
}
// Template grid thumbnails: [left, top, width, height, colour, radius] in % of a 16:9 tile, from Templates.dc.html (a circle's height is its width × 16/9).
export const TPL_ICONS: Record<string, (string | number)[][]> = {
  title: [[12, 34, 60, 14, "#8A93A3", "2px"], [12, 56, 40, 7, "#5B6271", "2px"]],
  bar: [[0, 0, 100, 24, "#4A5263"], [10, 36, 70, 6, "#5B6271"], [10, 50, 60, 6, "#5B6271"], [10, 64, 65, 6, "#5B6271"]],
  split: [[0, 0, 36, 100, "#353A45"], [6, 18, 24, 10, "#7AA2FF", "2px"], [6, 36, 24, 8, "#5B6271"], [6, 52, 24, 8, "#5B6271"], [44, 20, 40, 12, "#8A93A3"], [44, 40, 48, 36, "#5B6271", "2px"]],
  two: [[8, 10, 50, 12, "#8A93A3"], [8, 32, 39, 54, "#4A5263", "2px"], [53, 32, 39, 54, "#4A5263", "2px"]],
  section: [[10, 40, 24, 30, "#FBBF24", "2px"], [10, 76, 50, 9, "#8A93A3"]],
  statement: [[12, 34, 64, 13, "#8A93A3"], [12, 52, 52, 13, "#FBBF24"]],
  venn: [[30, 14, 26, 46.2, "rgba(147,197,253,0.55)", "50%"], [44, 14, 26, 46.2, "rgba(196,181,253,0.55)", "50%"], [37, 40, 26, 46.2, "rgba(94,234,212,0.55)", "50%"]],
  cards: [[8, 10, 50, 12, "#8A93A3"], [8, 34, 26, 52, "#4A5263", "2px"], [37, 34, 26, 52, "#4A5263", "2px"], [66, 34, 26, 52, "#4A5263", "2px"]],
};

// ---- the boundary ----
const isPlain = (v: unknown): v is Obj => !!v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const okKey = (k: string) => !["__proto__", "constructor", "prototype"].includes(k) && !(k in Object.prototype);
const ID = /^[\w.:-]{1,80}$/;
const okId = (v: unknown): v is string => typeof v === "string" && ID.test(v) && okKey(v);
const NO_BREAK = /^[^"'\\()\s;]*$/;   // nothing that ends a url("…") or a CSS declaration
// An image: data:image/…, blob:, http(s), or a path relative to the deck (no scheme), as written by the dev server.
export function safeImageUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;
  const d = /^data:image\/(png|jpeg|gif|webp|svg\+xml)(;base64)?,/i.exec(v);
  if (d) return NO_BREAK.test(v.slice(d[0].length));
  return (/^(blob:|https?:\/\/)/i.test(v) || !v.includes(":")) && NO_BREAK.test(v);
}
const webLink = (v: unknown) => typeof v === "string" && /^[^\s"'\\<>]*$/.test(v) && (!/^[a-z][a-z0-9+.-]*:/i.test(v) || /^https?:\/\//i.test(v));   // as typed; the app opens it as https
// JSON-shaped data only: primitives, arrays and plain objects, without prototype keys. undefined = drop.
function clean(v: unknown): any {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) return v.map(clean).filter(x => x !== undefined);
  if (!isPlain(v)) return undefined;
  return mapObj(v, (_k, x) => clean(x));
}
// A plain object's own entries (prototype keys never), each mapped; undefined drops it. Not plain: undefined.
function mapObj(v: unknown, f: (k: string, x: any) => any, skip = (_k: string) => false): Obj | undefined {
  if (!isPlain(v)) return undefined;
  const o: Obj = {};
  for (const k of Object.keys(v)) { if (!okKey(k) || skip(k)) continue; const x = f(k, v[k]); if (x !== undefined) o[k] = x; }
  return o;
}
const oneOf = (list: unknown[]) => (v: unknown) => list.includes(v) ? v : undefined;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const bool = (v: unknown) => typeof v === "boolean" ? v : undefined;
const str = (n: number) => (v: unknown) => typeof v === "string" && v.length <= n ? v : undefined;

function sanitizeLayer(l: unknown): Obj | null {
  if (!isPlain(l) || !okId(l.id)) return null;
  const o = mapObj(l, (k, v) => {
    if (k === "imgKey") return typeof v === "string" && NO_BREAK.test(v) ? v : undefined;   // a key into images (md: keys hold a url)
    if (k === "src") return safeImageUrl(v) ? v : undefined;
    if (k === "href") return typeof v === "string" && /^https?:\/\//i.test(v) && webLink(v) ? v : undefined;
    if (k === "link") return isPlain(v) && v.type === "url" && webLink(v.url) ? { type: "url", url: v.url } : isPlain(v) && v.type === "slide" && okId(v.id) ? { type: "slide", id: v.id } : undefined;
    return clean(v);
  }, k => k.startsWith("_"))!;
  return safeLayer(o);
}
// A template slot box: numbers in −50…150 (else the box goes), its style extras as a layer's.
function sanitizeBox(b: unknown): Obj | undefined {
  const c = clean(b);
  if (!isPlain(c) || !["x", "y", "w", "h"].every(k => typeof c[k] === "number")) return undefined;
  const r = safeLayer(c);
  for (const k of ["x", "y", "w", "h"]) r[k] = Math.max(-50, Math.min(150, r[k]));
  return r;
}
const boxes = (v: unknown) => Array.isArray(v) ? v.map(sanitizeBox).filter(Boolean) : undefined;
function sanitizeTemplate(L: unknown) {
  return mapObj(L, (k, v) => {
    if (k === "name") return str(80)(v);
    if (k === "icon") return typeof v === "string" && Object.hasOwn(TPL_ICONS, v) ? v : undefined;
    if (k === "match") return mapObj(v, (_k, x) => num(x) ?? (x === "items" ? x : undefined));
    if (k === "slots") return mapObj(v, (_k, x) => boxes(x));
    if (k === "number") return sanitizeBox(v);
    if (k === "opts") return Array.isArray(v) ? v.filter(x => ["bar", "side"].includes(x)) : undefined;
    return clean(v);
  });
}
const BUILD: Record<string, (v: unknown) => unknown> = { dur: oneOf(DURATIONS.map(d => d.value)), ease: oneOf(EASINGS.map(e => e.value)), earlier: oneOf(["keep", "dim"]), replace: bool };
const SLIDE: Record<string, (v: unknown) => unknown> = {
  layers: v => Array.isArray(v) ? v.map(sanitizeLayer).filter(Boolean) : undefined,
  steps: v => mapObj(v, (_k, x) => Number.isInteger(x) && x >= 0 && x <= 999 ? x : undefined),
  trans: v => mapObj(v, (k, x) => /^\d{1,3}$/.test(k) ? oneOf(TRANSITIONS.map(t => t.id))(x) : undefined),
  build: v => mapObj(v, (k, x) => Object.hasOwn(BUILD, k) ? BUILD[k](x) : undefined),
  showSteps: bool, custom: bool, barStyle: oneOf(["band", "rule", "none"]), side: oneOf(["left", "right"]), layout: v => okId(v) ? v : undefined,
};
const sanitizeSlide = (n: unknown) => mapObj(n, (k, v) => Object.hasOwn(SLIDE, k) ? SLIDE[k](v) : clean(v), k => k.startsWith("_"));
const isHex = (v: unknown) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const ids = (list: { id: string }[]) => list.map(x => x.id);
const THEME: Record<string, (v: unknown) => unknown> = {
  background: oneOf([...ids(BACKGROUNDS), ...IMAGE_BACKGROUNDS.map(i => "image:" + i)]),
  scheme: v => typeof v === "string" ? oneOf(["original", ...ids(SCHEMES)])(v) : isPlain(v) && isHex(v.deep) && isHex(v.mid) && isHex(v.accent) ? { deep: v.deep, mid: v.mid, accent: v.accent } : undefined,
  palette: oneOf(ids(PALETTES)), fonts: oneOf(ids(FONTS)), surface: oneOf(ids(SURFACES)),
  motion: v => mapObj(v, (_k, x) => num(x) ?? (typeof x === "string" && /^[\w-]{1,20}$/.test(x) ? x : undefined)),
};
const DECK: Record<string, (v: unknown) => unknown> = {
  ...Object.fromEntries(["opacity", "offset", "gap", "rowGap", "speed", "customAspect", "bgScale", "bgY"].map(k => [k, num])),
  titleView: v => mapObj(v, (k, x) => ["zoom", "x", "y"].includes(k) ? num(x) : undefined),
  bgRepeat: oneOf(["x", "xy", "none"]), spacing: oneOf(["even", "fit"]), titlePage: bool, title: str(500), source: str(2000), nodes: () => undefined,
  theme: v => mapObj(v, (k, x) => Object.hasOwn(THEME, k) ? THEME[k](x) : undefined),
  customBg: v => v === null || safeImageUrl(v) ? v : undefined,
  images: v => mapObj(v, (_k, x) => safeImageUrl(x) ? x : undefined),
  styles: v => mapObj(v, (_k, s) => isPlain(s) ? safeLayer(mapObj(s, (_k2, x) => clean(x), k2 => k2.startsWith("_"))!) : undefined),
  layouts: v => mapObj(v, (_k, L) => sanitizeTemplate(L)),
  layoutDefaults: v => mapObj(v, (_k, x) => okId(x) ? x : undefined),
};

// A layout file → a cleaned copy (null if it isn't an object). Unknown keys are kept as plain data; they are never rendered.
export function sanitizeLayout(file: unknown): Obj | null {
  if (!isPlain(file)) return null;
  return mapObj(file, (k, v) => k === "deck" ? mapObj(v, (k2, x) => Object.hasOwn(DECK, k2) ? DECK[k2](x) : clean(x)) ?? {}
    : k === "slides" ? mapObj(v, (_k, n) => sanitizeSlide(n)) ?? {} : clean(v))!;
}
