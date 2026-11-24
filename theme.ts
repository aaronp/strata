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
export type Theme = { background: string; scheme: string | { deep: string; mid: string; accent: string }; palette: string; fonts: string; surface: "clear" | "frosted" | "card"; motion?: Record<string, number> };
export const DEFAULT_THEME: Theme = { background: "dusk", scheme: "original", palette: "midnight", fonts: "technical", surface: "clear" };

const pick = <T extends { id: string }>(list: T[], id: unknown, fallback: string): T => list.find((x) => x.id === id) ?? list.find((x) => x.id === fallback)!;
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

export function resolveTheme(t0: Partial<Theme> | null = {}) {
  const t: Partial<Theme> = t0 ?? {};
  const palette = pick(PALETTES, t.palette, DEFAULT_THEME.palette);
  const fonts = pick(FONTS, t.fonts, DEFAULT_THEME.fonts);
  const surface = SURFACES.some((s) => s.id === t.surface) ? (t.surface as string) : DEFAULT_THEME.surface;
  const tone = palette.tone as "light" | "dark";
  const id = typeof t.background === "string" ? t.background : "";
  if (id.startsWith("image:")) return { palette, fonts, surface, tone, bg: { css: "none", size: "cover", image: id.slice(6) } };
  const b = pick(BACKGROUNDS, id, DEFAULT_THEME.background);
  const s = t.scheme;
  const sch = typeof s === "string" ? SCHEMES.find((x) => x.id === s) : s && isHex(s.deep) && isHex(s.mid) && isHex(s.accent) ? s : undefined;
  const c = sch ? { deep: sch.deep, mid: sch.mid, accent: sch.accent } : b.original;
  const built = (STYLES as any)[b.style].build(c, tone);
  return { palette, fonts, surface, tone, bg: { css: built.css as string, size: built.size as string, ...("effect" in b ? { motion: b.effect as string } : {}) } as { css: string; size: string; image?: string; motion?: string } };
}

const TOKENS = ["primary", "secondary", "tertiary", "impact", "text", "muted", "onPrimary"];
// A palette token name gives its hex; any other CSS colour passes through.
export function tokenColor(v: string | null | undefined, p: Palette): string | null {
  if (v == null) return null;
  return TOKENS.includes(v) && Object.hasOwn(p, v) ? (p as any)[v] : v;
}

export const fontFor = (role: "head" | "body" | "mono", f: FontSet): string => f[role];

export function fontsHref(f: FontSet): string {
  const names = [...new Set([f.headName, f.bodyName, f.monoName])];
  return "https://fonts.googleapis.com/css2?" + names.map((n) => "family=" + n.replace(/ /g, "+") + ":wght@400;500;600;700").join("&") + "&display=swap";
}
