import { basename, join, relative, resolve } from "node:path";
import { parseMarkdown, type Section } from "./markdown";
import { saveDeck, SLUG } from "./server";

const text = (id: string, geo: object, txt: string, extra: object = {}) => ({
  id, type: "text", text: txt, font: "grot", size: 32, weight: 400, color: null, align: "left", valign: "top",
  lh: 1.3, bullets: "none", gap: 0.15, rot: 0, opacity: 1, ...geo, ...extra,
});
const CHIP_BOX = { bg: "#ffffff", bgOpacity: 0.75, blur: 0, border: 0, borderColor: "#ffffff", radius: 12, pad: 12 };   // link chips draw their own container
export const bodySize = (t: string) => Math.max(22, Math.min(40, Math.round(40 - (t.length - 120) / 20)));

export function layersFor(s: Section): any[] {
  const L: any[] = [text("md-title", { x: 6, y: 6, w: 88, h: 14 }, s.title, { size: 64, weight: 800, valign: "bottom", lh: 1.05 })];
  if (s.text) L.push(text("md-body", { x: 6, y: 24, w: s.links.length ? 56 : 88, h: 60 }, s.text,
    { size: bodySize(s.text), lh: 1.35, bullets: s.bulletsOnly ? "disc" : "none", gap: 0.35 }));
  const step = Math.min(11, 62 / Math.max(1, s.links.length));
  s.links.forEach((k, n) => {
    L.push(text(`md-link-${n}`, { x: 66, y: 24 + n * step, w: 28, h: Math.min(9, step - 1.5) }, k.label + " →",
      { size: 22, weight: 600, color: "#15171c", valign: "middle", lh: 1.1, link: { type: "slide", id: k.target }, card: "custom", box: CHIP_BOX }));
  });
  s.sources.forEach((r, n) => L.push(text(`md-src-${n}`, { x: 6 + (n % 3) * 30, y: 89 - Math.floor(n / 3) * 6, w: 28, h: 5 }, r.text + " ↗",
    { font: "mono", size: 16, valign: "middle", lh: 1.2, link: { type: "url", url: r.url } })));
  return L;
}

// Markdown owns the set of md-* layers and their text/link/bullets; everything else is the builder's.
// Generated style fields a layer doesn't have at all (e.g. a newer importer's chip container) are filled in, never overwritten.
const CONTENT = ["text", "link", "bullets"];
function mergeLayers(existing: any[], gen: any[]) {
  const byId = new Map(gen.map(g => [g.id, g]));
  const kept = existing.filter(l => !String(l.id).startsWith("md-") || byId.has(l.id)).map(l => {
    const g = byId.get(l.id); if (!g) return l;
    const u = { ...g, ...l }; for (const k of CONTENT) { if (k in g) u[k] = g[k]; else delete u[k]; } return u;
  });
  const have = new Set(kept.map(l => l.id));
  return kept.concat(gen.filter(g => !have.has(g.id)));
}

export function importInto(deck: any | null, sections: Section[]): any {
  const old = deck?.nodes ?? {};
  const nodes: Record<string, any> = { ROOT: { ...(old.ROOT ?? { id: "ROOT", title: "", body: "" }), children: sections.map(s => s.slug) } };
  const add = (s: Section) => {
    const prev = old[s.slug], gen = layersFor(s);
    const frames = prev?.frames ?? (prev?.layers ? [{ id: "f0-" + s.slug, layers: prev.layers }] : null);
    const { layers: _legacy, ...rest } = prev ?? {};
    nodes[s.slug] = { ...rest, id: s.slug, title: s.title, body: s.body, children: s.children.map(c => c.slug),
      frames: frames ? frames.map((f: any) => ({ ...f, layers: mergeLayers(f.layers, gen) })) : [{ id: "f1", layers: gen }] };
    s.children.forEach(add);
  };
  sections.forEach(add);
  return { ...(deck ?? { images: {}, customBg: null }), nodes, title: deck?.title || sections[0]?.title || "" };
}

// Shared by the CLI and POST /api/import: parse, merge into any existing deck, save. Writes nothing on errors.
export async function importMarkdown(root: string, slug: string, md: string, source?: string) {
  const parsed = parseMarkdown(md);
  if (!SLUG.test(slug)) parsed.errors.unshift({ line: 0, msg: `bad deck slug "${slug}" (use a-z, 0-9 and -)` });
  if (parsed.errors.length) return { ...parsed, slug, deck: null };
  const path = join(root, "decks", slug, "deck.json");
  const existing = (await Bun.file(path).exists()) ? await Bun.file(path).json() : null;
  const merged = importInto(existing, parsed.sections);
  const deck = await saveDeck(root, slug, source ? { ...merged, source } : merged);
  return { ...parsed, slug, deck };
}

export async function importFile(root: string, file: string, slug?: string) {
  const s = slug ?? basename(file).replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return importMarkdown(root, s, await Bun.file(file).text(), relative(root, resolve(root, file)));
}

if (import.meta.main) {
  const root = process.cwd();
  const [a, b] = process.argv.slice(2);
  let file: string | undefined = a, slug: string | undefined = b || undefined;
  if (a === "--deck") {
    slug = b;
    const p = join(root, "decks", b ?? "", "deck.json");
    file = (await Bun.file(p).exists()) ? (await Bun.file(p).json()).source : undefined;
    if (!file) { console.error(`decks/${b}: no recorded markdown source; use: make import MD=<file.md> SLUG=${b}`); process.exit(1); }
  }
  if (!file) { console.error("usage: make import MD=<file.md> [SLUG=<slug>]  |  make import DECK=<slug>"); process.exit(1); }
  const r = await importFile(root, resolve(root, file), slug);
  for (const w of r.warnings) console.warn(`${file}:${w.line}: warning: ${w.msg}`);
  for (const e of r.errors) console.error(`${file}:${e.line}: error: ${e.msg}`);
  if (!r.deck) process.exit(1);
  const count = (ss: any[]): number => ss.reduce((n, s) => n + 1 + count(s.children), 0);
  console.log(`Imported ${count(r.sections)} slides into decks/${r.slug}/`);
}
