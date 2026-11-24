// Theme data and resolution for the slide editor. Pure: no I/O. Data copied from design/slides/theme/Main.dc.html.
// ---------- colour helpers ----------
function parseHex(hex: string) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error('bug: this should never happen — not a #RRGGBB colour: "' + hex + '"');
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(hex: string, alpha: number) {
  const c = parseHex(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
}
function luminance(hex: string) {
  const lin = parseHex(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// ---------- background styles ----------
// Each style turns three colour slots into CSS. `slots` = the slots this style actually uses, with the label shown in the Custom picker.
// deep = the dominant base colour, mid = the second colour, accent = the highlight / lines / effect colour.
export const STYLES = {
  solid: { slots: [['deep', 'Colour']], build: (c) => ({ css: c.deep, size: 'auto' }) },
  gradient: { slots: [['deep', 'Start'], ['mid', 'Middle'], ['accent', 'End']], build: (c) => ({ css: 'linear-gradient(135deg, ' + c.deep + ' 0%, ' + c.mid + ' 55%, ' + c.accent + ' 100%)', size: 'auto' }) },
  flow: { slots: [['deep', 'Base'], ['mid', 'Drift 1'], ['accent', 'Drift 2']], build: (c) => ({ css: 'linear-gradient(120deg, ' + c.deep + ', ' + c.mid + ', ' + c.accent + ', ' + c.mid + ', ' + c.deep + ')', size: '400% 400%' }) },
  bubbles: { slots: [['deep', 'Top'], ['mid', 'Bottom'], ['accent', 'Glow & bubbles']], build: (c, tone) => ({ css: 'radial-gradient(ellipse at 50% 120%, ' + hexA(c.accent, tone === 'dark' ? 0.9 : 0.25) + ' 0%, ' + hexA(c.accent, 0) + ' 60%), linear-gradient(180deg, ' + c.deep + ' 0%, ' + c.mid + ' 100%)', size: 'auto' }) },
  sunset: { slots: [['deep', 'Night sky'], ['mid', 'Dusk'], ['accent', 'Sunset glow']], build: (c) => ({ css: 'linear-gradient(180deg, ' + c.deep + ' 0%, ' + c.deep + ' 12%, ' + c.mid + ' 50%, ' + c.accent + ' 100%)', size: '100% 300%' }) },
  gears: { slots: [['deep', 'Base'], ['mid', 'Light spot'], ['accent', 'Gears']], build: (c) => ({ css: 'radial-gradient(ellipse at 30% 20%, ' + c.mid + ' 0%, ' + c.deep + ' 70%)', size: 'auto' }) },
  stripes: { slots: [['deep', 'Base'], ['mid', 'Stripe']], build: (c) => ({ css: 'repeating-linear-gradient(135deg, ' + c.mid + ' 0 14px, ' + c.deep + ' 14px 28px)', size: 'auto' }) },
  blueprint: { slots: [['deep', 'Base'], ['accent', 'Grid lines']], build: (c) => ({ css: 'linear-gradient(' + hexA(c.accent, 0.16) + ' 1px, transparent 1px), linear-gradient(90deg, ' + hexA(c.accent, 0.16) + ' 1px, transparent 1px), ' + c.deep, size: '40px 40px, 40px 40px, auto' }) },
  dots: { slots: [['deep', 'Base'], ['accent', 'Dots']], build: (c) => ({ css: 'radial-gradient(' + hexA(c.accent, 0.22) + ' 1.2px, transparent 1.5px), ' + c.deep, size: '22px 22px, auto' }) },
  pinstripe: { slots: [['deep', 'Base'], ['accent', 'Lines']], build: (c) => ({ css: 'repeating-linear-gradient(90deg, ' + hexA(c.accent, 0.09) + ' 0 1px, transparent 1px 18px), ' + c.deep, size: 'auto' }) },
};

// `original` = the background's own colours; `pairs` = the colour theme suggested with them.
export const BACKGROUNDS = [
  { id: 'ink', name: 'Ink', kind: 'solid', style: 'solid', pairs: 'midnight', original: { deep: '#0F172A', mid: '#1E293B', accent: '#94A3B8' } },
  { id: 'paper', name: 'Paper', kind: 'solid', style: 'solid', pairs: 'paper', original: { deep: '#F5F3EE', mid: '#E9E4D8', accent: '#8A7E66' } },
  { id: 'forest', name: 'Forest', kind: 'solid', style: 'solid', pairs: 'botanical', original: { deep: '#0E2620', mid: '#1F4D3A', accent: '#7FB069' } },
  { id: 'charcoal', name: 'Charcoal', kind: 'solid', style: 'solid', pairs: 'mono', original: { deep: '#18181B', mid: '#27272A', accent: '#A1A1AA' } },
  { id: 'dusk', name: 'Dusk', kind: 'gradient', style: 'gradient', pairs: 'midnight', original: { deep: '#1E1B4B', mid: '#4C1D95', accent: '#831843' } },
  { id: 'ocean', name: 'Ocean', kind: 'gradient', style: 'gradient', pairs: 'botanical', original: { deep: '#082F49', mid: '#0E7490', accent: '#065F46' } },
  { id: 'ember', name: 'Ember', kind: 'gradient', style: 'gradient', pairs: 'ember', original: { deep: '#1C1917', mid: '#7C2D12', accent: '#B45309' } },
  { id: 'mist', name: 'Mist', kind: 'gradient', style: 'gradient', pairs: 'coastal', original: { deep: '#EEF2FF', mid: '#F5F3FF', accent: '#FDF2F8' } },
  { id: 'aurora', name: 'Aurora', kind: 'motion', style: 'flow', effect: 'flow', pairs: 'midnight', original: { deep: '#0B1023', mid: '#1E3A8A', accent: '#0F766E' } },
  { id: 'lagoon', name: 'Lagoon', kind: 'motion', style: 'flow', effect: 'flow', pairs: 'botanical', original: { deep: '#04263A', mid: '#0E7490', accent: '#134E4A' } },
  { id: 'embers', name: 'Embers', kind: 'motion', style: 'flow', effect: 'flow', pairs: 'ember', original: { deep: '#1C1917', mid: '#7C2D12', accent: '#9F1239' } },
  { id: 'pearl', name: 'Pearl', kind: 'motion', style: 'flow', effect: 'flow', pairs: 'coastal', original: { deep: '#F8FAFC', mid: '#E0F2FE', accent: '#FCE7F3' } },
  { id: 'bubbles', name: 'Bubbles', kind: 'motion', style: 'bubbles', effect: 'bubbles', pairs: 'midnight', original: { deep: '#041C2C', mid: '#06354F', accent: '#0E7490' } },
  { id: 'fizz', name: 'Fizz', kind: 'motion', style: 'bubbles', effect: 'bubbles', pairs: 'coastal', original: { deep: '#F0FDFA', mid: '#E0F2FE', accent: '#0E7490' } },
  { id: 'sunset', name: 'Sunset', kind: 'motion', style: 'sunset', effect: 'sunset', pairs: 'ember', original: { deep: '#120A2A', mid: '#6B1D5C', accent: '#C76A12' } },
  { id: 'gears', name: 'Gears', kind: 'motion', style: 'gears', effect: 'gears', pairs: 'mono', original: { deep: '#12151A', mid: '#262B35', accent: '#E2E8F0' } },
  { id: 'stripes', name: 'Stripes', kind: 'pattern', style: 'stripes', pairs: 'mono', original: { deep: '#111827', mid: '#1A2131', accent: '#94A3B8' } },
  { id: 'blueprint', name: 'Blueprint', kind: 'pattern', style: 'blueprint', pairs: 'midnight', original: { deep: '#0B2545', mid: '#13315C', accent: '#93C5FD' } },
  { id: 'dots', name: 'Dot grid', kind: 'pattern', style: 'dots', pairs: 'paper', original: { deep: '#F5F3EE', mid: '#EAE6DC', accent: '#0F172A' } },
  { id: 'pinstripe', name: 'Pinstripe', kind: 'pattern', style: 'pinstripe', pairs: 'paper', original: { deep: '#FAFAF7', mid: '#F0F0EA', accent: '#0F172A' } },
];

// Named colour schemes that can be applied to any background. 'original' and 'custom' are handled separately.
export const SCHEMES = [
  { id: 'oxford', name: 'Oxford', pairs: 'midnight', deep: '#00152E', mid: '#002147', accent: '#7A9CC6' },
  { id: 'ember', name: 'Ember', pairs: 'ember', deep: '#1C1917', mid: '#7C2D12', accent: '#D97706' },
  { id: 'lagoon', name: 'Lagoon', pairs: 'botanical', deep: '#04263A', mid: '#0E7490', accent: '#2DD4BF' },
  { id: 'forest', name: 'Forest', pairs: 'botanical', deep: '#0B2018', mid: '#1F4D3A', accent: '#86B06A' },
  { id: 'plum', name: 'Plum', pairs: 'midnight', deep: '#1A0B2E', mid: '#4C1D95', accent: '#DB2777' },
  { id: 'graphite', name: 'Graphite', pairs: 'mono', deep: '#111317', mid: '#2A2F38', accent: '#A1A1AA' },
  { id: 'sand', name: 'Sand', pairs: 'paper', deep: '#FAF6EE', mid: '#F1E6D2', accent: '#A47C48' },
  { id: 'mistlight', name: 'Mist', pairs: 'coastal', deep: '#F5F7FF', mid: '#E6ECFF', accent: '#5B74C2' },
];

export const PALETTES = [
  { id: 'midnight', name: 'Midnight Signal', tone: 'dark', text: '#F1F5F9', muted: '#B6C0D0', primary: '#93C5FD', secondary: '#C4B5FD', tertiary: '#5EEAD4', impact: '#FBBF24', onPrimary: '#0B1530' },
  { id: 'ember', name: 'Ember Editorial', tone: 'dark', text: '#FFF7ED', muted: '#E7CBB4', primary: '#FDBA74', secondary: '#FCA5A5', tertiary: '#FDE68A', impact: '#FB7185', onPrimary: '#2A1405' },
  { id: 'botanical', name: 'Botanical', tone: 'dark', text: '#ECFDF5', muted: '#B5D6CA', primary: '#6EE7B7', secondary: '#A5F3FC', tertiary: '#FCD34D', impact: '#F472B6', onPrimary: '#052E22' },
  { id: 'mono', name: 'Mono Contrast', tone: 'dark', text: '#FAFAFA', muted: '#B4B4BC', primary: '#E4E4E7', secondary: '#A1A1AA', tertiary: '#71717A', impact: '#22D3EE', onPrimary: '#18181B' },
  { id: 'paper', name: 'Paper & Ink', tone: 'light', text: '#111827', muted: '#4B5563', primary: '#1D4ED8', secondary: '#0F766E', tertiary: '#9CA3AF', impact: '#DC2626', onPrimary: '#FFFFFF' },
  { id: 'coastal', name: 'Coastal', tone: 'light', text: '#0C2A3A', muted: '#3F5866', primary: '#0E7490', secondary: '#4F46E5', tertiary: '#94A3B8', impact: '#EA580C', onPrimary: '#FFFFFF' },
];

export const FONTS = [
  { id: 'technical', mood: 'Technical', headName: 'Space Grotesk', bodyName: 'Inter', monoName: 'JetBrains Mono', head: "'Space Grotesk', sans-serif", body: 'Inter, sans-serif', mono: "'JetBrains Mono', monospace" },
  { id: 'professional', mood: 'Professional', headName: 'IBM Plex Sans', bodyName: 'IBM Plex Sans', monoName: 'IBM Plex Mono', head: "'IBM Plex Sans', sans-serif", body: "'IBM Plex Sans', sans-serif", mono: "'IBM Plex Mono', monospace" },
  { id: 'elegant', mood: 'Elegant', headName: 'Playfair Display', bodyName: 'Source Sans 3', monoName: 'DM Mono', head: "'Playfair Display', serif", body: "'Source Sans 3', sans-serif", mono: "'DM Mono', monospace" },
  { id: 'editorial', mood: 'Editorial', headName: 'Fraunces', bodyName: 'Inter', monoName: 'IBM Plex Mono', head: 'Fraunces, serif', body: 'Inter, sans-serif', mono: "'IBM Plex Mono', monospace" },
  { id: 'geometric', mood: 'Geometric', headName: 'Sora', bodyName: 'Manrope', monoName: 'DM Mono', head: 'Sora, sans-serif', body: 'Manrope, sans-serif', mono: "'DM Mono', monospace" },
];

export const KINDS = [
  { id: 'all', label: 'All' }, { id: 'solid', label: 'Solid' }, { id: 'gradient', label: 'Gradient' },
  { id: 'motion', label: 'Moving' }, { id: 'pattern', label: 'Pattern' },
];

export const SURFACES = [{ id: 'clear', label: 'Clear' }, { id: 'frosted', label: 'Frosted' }, { id: 'card', label: 'Card' }];

// ---------- motion ----------
// Speed multipliers offered by the slider (index into this list is what the slider stores). 1 = the base cycle.
export const SPEEDS = [0.03, 0.05, 0.08, 0.12, 0.17, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];

// base = cycle length in seconds at ×1. controls = settings beyond speed.
export const MOTION = {
  aurora: { base: 16, controls: [], hint: 'Colours drift slowly behind the slides' },
  lagoon: { base: 16, controls: [], hint: 'Colours drift slowly behind the slides' },
  embers: { base: 16, controls: [], hint: 'Colours drift slowly behind the slides' },
  pearl: { base: 16, controls: [], hint: 'Colours drift slowly behind the slides' },
  bubbles: { base: 14, controls: ['count', 'opacity'], hint: 'Bubbles rise gently behind the slides' },
  fizz: { base: 14, controls: ['count', 'opacity'], hint: 'Bubbles rise gently behind the slides' },
  sunset: { base: 40, controls: ['opacity', 'sun'], hint: 'The sun rises from the left, arcs across and sets on the right' },
  gears: { base: 40, controls: ['count', 'opacity', 'size'], hint: 'Meshed gears turn slowly in the corners' },
};


export const IMAGE_BACKGROUNDS = ["balloons", "london", "sea", "space", "forest", "sky", "ocean", "custom"];

export type Palette = (typeof PALETTES)[number];
export type FontSet = (typeof FONTS)[number];
export type Theme = { background: string; scheme: string | { deep: string; mid: string; accent: string }; palette: string; fonts: string; surface: "clear" | "frosted" | "card"; motion?: Record<string, number | string> };
export const DEFAULT_THEME: Theme = { background: "dusk", scheme: "original", palette: "midnight", fonts: "technical", surface: "clear" };

const pick = <T extends { id: string }>(list: T[], id: unknown, fallback: string): T => list.find((x) => x.id === id) ?? list.find((x) => x.id === fallback)!;
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// The (non-image) background a theme names, and its colours under the theme's scheme. choice: 'original' | a scheme id | 'custom'.
// tone: light or dark by the colours' luminance (what the palette list and the motion tints follow).
export function schemeOf(t0: Partial<Theme> | null = {}) {
  const t: Partial<Theme> = t0 ?? {}, s = t.scheme;
  const b = pick(BACKGROUNDS, t.background, DEFAULT_THEME.background);
  const custom = s && typeof s === "object" && isHex(s.deep) && isHex(s.mid) && isHex(s.accent) ? s : undefined;
  const named = typeof s === "string" ? SCHEMES.find((x) => x.id === s) : undefined;
  const colours = custom ?? (named ? { deep: named.deep, mid: named.mid, accent: named.accent } : b.original);
  const slots = (STYLES as any)[b.style].slots as [string, string][];
  const lum = slots.some((x) => x[0] === "mid") ? (luminance(colours.deep) + luminance(colours.mid)) / 2 : luminance(colours.deep);
  return { b, colours: { deep: colours.deep, mid: colours.mid, accent: colours.accent }, slots, choice: custom ? "custom" : named ? named.id : "original",
    name: custom ? "Custom" : named ? named.name : "Original", pairs: custom ? null : named ? named.pairs : b.pairs, tone: (lum > 0.4 ? "light" : "dark") as "light" | "dark" };
}

export function resolveTheme(t0: Partial<Theme> | null = {}) {
  const t: Partial<Theme> = t0 ?? {};
  const palette = pick(PALETTES, t.palette, DEFAULT_THEME.palette);
  const fonts = pick(FONTS, t.fonts, DEFAULT_THEME.fonts);
  const surface = SURFACES.some((s) => s.id === t.surface) ? (t.surface as string) : DEFAULT_THEME.surface;
  const tone = palette.tone as "light" | "dark";
  const id = typeof t.background === "string" ? t.background : "";
  if (id.startsWith("image:")) return { palette, fonts, surface, tone, bg: { css: "none", size: "cover", image: id.slice(6) } };
  const { b, colours: c } = schemeOf(t);
  const built = (STYLES as any)[b.style].build(c, tone);
  return { palette, fonts, surface, tone, bg: { css: built.css as string, size: built.size as string, deep: c.deep, ...("effect" in b ? { motion: b.effect as string } : {}) } as { css: string; size: string; deep?: string; image?: string; motion?: string } };
}

const TOKENS = ["primary", "secondary", "tertiary", "impact", "text", "muted", "onPrimary"];
// A palette token name gives its hex; any other CSS colour passes through. surface: the tone's neutral (white on dark, black on light), for faint card fills and borders.
export function tokenColor(v: string | null | undefined, p: Palette): string | null {
  if (v == null) return null;
  if (v === "surface") return p.tone === "dark" ? "#FFFFFF" : "#000000";
  return TOKENS.includes(v) && Object.hasOwn(p, v) ? (p as any)[v] : v;
}

export const fontFor = (role: "head" | "body" | "mono", f: FontSet): string => f[role];

export function fontsHref(f: FontSet): string {
  const names = [...new Set([f.headName, f.bodyName, f.monoName])];
  return "https://fonts.googleapis.com/css2?" + names.map((n) => "family=" + n.replace(/ /g, "+") + ":wght@400;500;600;700").join("&") + "&display=swap";
}

// ---------- motion effects (ported from Main.dc.html) ----------
// A moving background's settings when the theme has none (theme.motion holds the user's, for the current background).
export const MOTION_DEFAULTS: Record<string, Record<string, number | string>> = {
  aurora: { speedIdx: 9 }, lagoon: { speedIdx: 9 }, embers: { speedIdx: 9 }, pearl: { speedIdx: 9 },
  bubbles: { speedIdx: 9, opacity: 60, count: 18 },
  fizz: { speedIdx: 9, opacity: 70, count: 18 },
  sunset: { speedIdx: 9, opacity: 90, sun: "show" },
  gears: { speedIdx: 8, opacity: 35, count: 4, size: "medium" },
};
export const COUNT_CONTROLS: Record<string, { label: string; min: number; max: number; step: number }> = {
  bubbles: { label: "Number of bubbles", min: 4, max: 60, step: 2 },
  gears: { label: "Number of gears", min: 1, max: 8, step: 1 },
};
export const EXTRA_CONTROLS: Record<string, { label: string; options: { value: string; label: string }[] }> = {
  sun: { label: "Sun", options: [{ value: "show", label: "Show" }, { value: "hide", label: "Hide" }] },
  size: { label: "Gear size", options: [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }] },
};
const GEAR_SCALE: Record<string, number> = { small: 0.65, medium: 1, large: 1.4 };
const GEAR_DEPTH = 14;
// Gear chains anchored to the corners of each stage-sized cell of the canvas (left/top: fractions of one stage). Each gear after the first meshes with the one before it, at `angle` degrees.
const GEAR_CHAINS: Record<string, { left: number; top: number; gears: { R: number; teeth: number; angle?: number }[] }> = {
  bl: { left: 0.05, top: 0.76, gears: [{ R: 150, teeth: 18 }, { R: 96, teeth: 12, angle: -28 }, { R: 60, teeth: 7, angle: 12 }] },
  tr: { left: 0.9, top: 0.14, gears: [{ R: 120, teeth: 14 }, { R: 60, teeth: 7, angle: 136 }] },
  br: { left: 0.95, top: 0.94, gears: [{ R: 110, teeth: 13 }, { R: 72, teeth: 9, angle: 200 }] },
  tl: { left: 0.03, top: 0.05, gears: [{ R: 84, teeth: 10 }] },
};
// The order gears are added as the count goes up: [chain, how many gears of that chain are then shown].
const GEAR_ORDER: [string, number][] = [["bl", 1], ["tr", 1], ["bl", 2], ["tr", 2], ["br", 1], ["bl", 3], ["br", 2], ["tl", 1]];

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// Effect sizes are drawn in cqw of the canvas-sized effects container (container-type:size), so one markup works at any scale (stage, wireframe).
// They were designed in px on a stage FX_REF_W px wide, as Layers' cqw sizes (px / 16 = cqw of one 1600px stage). Raise it to shrink every effect.
const FX_REF_W = 1600;
const cqw = (px: number, w: number) => (px / FX_REF_W * 100 / w).toFixed(3) + "cqw";   // px on one stage → cqw of a w-stage-wide canvas
// Canvas = w × h stages. count is per stage; the rise covers the canvas height in h × the time, so it moves at the same speed.
function makeBubbles(count: number, baseSeconds: number, factor: number, seed: number, w = 1, h = 1) {
  const rnd = seededRandom(seed), n = Math.min(Math.round(count * w * h), 600);   // ponytail: capped for the DOM; a huge canvas thins out past 600
  return Array.from({ length: n }, () => {
    const size = 8 + rnd() * 28, left = rnd() * (100 - 4 / w), dur = baseSeconds * (0.7 + rnd() * 0.6) * factor * h, delay = -(rnd() * dur);
    return { left: left.toFixed(1) + "%", size: cqw(size, w), dur: dur.toFixed(2) + "s", delay: delay.toFixed(2) + "s" };
  });
}
function gearPath(teeth: number, R: number, depth: number, hole: number) {
  const r = R - depth, a = (Math.PI * 2) / teeth, pts: string[] = [];
  const pt = (rad: number, ang: number) => (rad * Math.cos(ang)).toFixed(2) + " " + (rad * Math.sin(ang)).toFixed(2);
  for (let i = 0; i < teeth; i++) pts.push(pt(r, i * a), pt(R, (i + 0.15) * a), pt(R, (i + 0.45) * a), pt(r, (i + 0.6) * a));
  const h = hole.toFixed(2);
  return "M" + pts.join(" L") + " Z M" + h + " 0 A" + h + " " + h + " 0 1 0 -" + h + " 0 A" + h + " " + h + " 0 1 0 " + h + " 0 Z";
}
export const GEAR_SWATCH_PATH = gearPath(10, 46, 12, 13);
// The stage's corner groups, repeated in every stage-sized cell of a w × h canvas, so any view shows the same gears as one stage.
function layoutGears(count: number, baseSeconds: number, factor: number, w = 1, h = 1, scale = 1) {
  const shown: Record<string, number> = {};
  GEAR_ORDER.slice(0, count).forEach(([k, n]) => { shown[k] = n; });
  const groups = Object.keys(shown).map((key) => {
    const chain = GEAR_CHAINS[key]; let x = 0, y = 0;
    const gears = chain.gears.slice(0, shown[key]).map((g, i, list) => {
      if (i > 0) { const prev = list[i - 1], dist = prev.R + g.R - GEAR_DEPTH, rad = ((g.angle || 0) * Math.PI) / 180; x += dist * Math.cos(rad); y += dist * Math.sin(rad); }
      return { cls: i % 2 === 0 ? "spin" : "spinr", w: cqw(g.R * 2 * scale, w), vb: -g.R + " " + -g.R + " " + g.R * 2 + " " + g.R * 2,
        x: cqw((x - g.R) * scale, w), y: cqw((y - g.R) * scale, w), phase: i === 0 ? 0 : 180 / g.teeth,
        dur: (baseSeconds * factor * (g.teeth / 18)).toFixed(1) + "s", d: gearPath(g.teeth, g.R, GEAR_DEPTH, g.R * 0.28) };
    });
    return { chain, gears };
  });
  const out: { left: string; top: string; gears: typeof groups[number]["gears"] }[] = [];
  for (let i = 0; i < Math.ceil(w); i++) for (let j = 0; j < Math.ceil(h); j++)
    for (const g of groups) out.push({ left: ((i + g.chain.left) / w * 100).toFixed(3) + "%", top: ((j + g.chain.top) / h * 100).toFixed(3) + "%", gears: g.gears });
  return out;
}

// The motion settings of a theme's background (defaults under the theme's own), or null for a still one. Bad values fall back.
export function motionOf(t0: Partial<Theme> | null = {}) {
  const t: Partial<Theme> = t0 ?? {}, id = schemeOf(t).b.id;
  if (typeof t.background !== "string" || t.background !== id || !(id in MOTION)) return null;
  const m: Record<string, any> = { ...MOTION_DEFAULTS[id], ...(t.motion && typeof t.motion === "object" ? t.motion : {}) };
  if (!Number.isInteger(m.speedIdx) || !(SPEEDS[m.speedIdx] > 0)) m.speedIdx = MOTION_DEFAULTS[id].speedIdx;
  return m;
}
const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && v >= lo && v <= hi ? v : d);

// What the canvas draws for a theme's moving background: the background-position animation (cls, dur) and the bubbles/sunset/gears overlays.
// canvas: the camera plane's size in stage widths/heights; the overlays are laid out across all of it (they pan with the background).
export function effectView(t0: Partial<Theme> | null = {}, canvas: { w: number; h: number } = { w: 1, h: 1 }) {
  const cw = canvas.w >= 1 ? canvas.w : 1, ch = canvas.h >= 1 ? canvas.h : 1;
  const t: Partial<Theme> = t0 ?? {}, m = motionOf(t);
  const view = { cls: "", dur: "0s", isBubbles: false, isSunset: false, isGears: false, sunOn: false, opacity: 1, horizon: "transparent",
    bubbles: [] as ReturnType<typeof makeBubbles>, gearGroups: [] as ReturnType<typeof layoutGears>, gearScale: 1, gearFill: "transparent", gearStroke: "transparent",
    tintEdge: "transparent", tintHi: "transparent", tintLo: "transparent", edge: cqw(1, cw), sunSize: cqw(260, cw), sunHalf: cqw(-130, cw) };
  if (!m) return view;
  const sc = schemeOf(t), b = sc.b as any, c = sc.colours, spec = (MOTION as any)[b.id], factor = 1 / SPEEDS[m.speedIdx];
  Object.assign(view, { dur: (spec.base * factor).toFixed(1) + "s", opacity: spec.controls.includes("opacity") ? clampN(m.opacity, 0, 100, 100) / 100 : 1 });
  if (b.effect === "flow") view.cls = "anim";
  if (b.effect === "sunset") Object.assign(view, { cls: "sky", isSunset: true, sunOn: m.sun !== "hide", horizon: hexA(c.deep, 0.9) });
  if (b.effect === "bubbles") Object.assign(view, { isBubbles: true, bubbles: makeBubbles(clampN(m.count, 0, 60, 18), spec.base, factor, 7, cw, ch),
    tintEdge: sc.tone === "dark" ? "rgba(255,255,255,0.5)" : hexA(c.accent, 0.5), tintHi: sc.tone === "dark" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.9)", tintLo: hexA(c.accent, 0.08) });
  if (b.effect === "gears") { const gearScale = Object.hasOwn(GEAR_SCALE, m.size) ? GEAR_SCALE[m.size] : 1;
    Object.assign(view, { isGears: true, gearScale, gearGroups: layoutGears(clampN(m.count, 0, 8, 4), spec.base, factor, cw, ch, gearScale),
    gearFill: hexA(c.accent, 0.07), gearStroke: hexA(c.accent, 0.8) }); }
  return view;
}
