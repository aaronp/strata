import { basename, join, relative, resolve } from "node:path";
import { parseMarkdown, plainText, type Section } from "./markdown";
import { saveDeck, SLUG } from "./server";

const text = (id: string, geo: object, txt: string, extra: object = {}) => ({
  id, type: "text", text: txt, font: "grot", size: 32, weight: 400, color: null, align: "left", valign: "top",
  lh: 1.3, bullets: "none", gap: 0.15, rot: 0, opacity: 1, ...geo, ...extra,
});
const CHIP_BOX = { bg: "#ffffff", bgOpacity: 0.75, blur: 0, border: 0, borderColor: "#ffffff", radius: 12, pad: 12 };   // link chips draw their own container
export const bodySize = (t: string) => Math.max(22, Math.min(40, Math.round(40 - (t.length - 120) / 20)));

export function layersFor(s: Section): any[] {
  const L: any[] = [{ id: "md-title", type: "text", style: "h1", text: s.title, x: 6, y: 6, w: 88, h: 14, rot: 0, opacity: 1 }];
  if (s.text) L.push({ id: "md-body", type: "text", style: "body", text: s.text, x: 6, y: 24, w: s.links.length ? 56 : 88, h: 60, rot: 0, opacity: 1,
    size: bodySize(s.text), ...(s.bulletsOnly ? { bullets: "disc" } : {}) });   // content-driven overrides of Body: a list body is a list; prose follows the style
  // The slide's chips: one bulleted list of inline links, in a single card (style Bullets).
  const esc = (t: string) => t.replace(/[\\*[\]{}]/g, c => "\\" + c);
  if (s.links.length) L.push({ id: "md-links", type: "text", style: "bullets", text: s.links.map(k => `[${esc(k.label)}]{link=${k.target}}`).join("\n"),
    x: 66, y: 24, w: 28, h: Math.min(62, 4 + s.links.length * 8), rot: 0, opacity: 1, size: 22, weight: 600, color: "#15171c", card: "custom", box: CHIP_BOX });   // bullets come from the Bullets style
  s.sources.forEach((r, n) => L.push(text(`md-src-${n}`, { x: 6 + (n % 3) * 30, y: 89 - Math.floor(n / 3) * 6, w: 28, h: 5 }, r.text + " ↗",
    { font: "mono", size: 16, valign: "middle", lh: 1.2, link: { type: "url", url: r.url } })));
  return L;
}

// Markdown owns the set of md-* layers and their text/link/bullets; everything else is the builder's.
// Generated style fields a layer doesn't have at all (e.g. a newer importer's chip container) are filled in, never overwritten.
const CONTENT = ["text", "link", "bullets"];
const STYLE_KEYS = ["font", "size", "weight", "color", "align", "valign", "lh", "ls", "bullets", "gap", "card", "box"];   // as in the app
function mergeLayers(existing: any[], gen: any[]) {
  const byId = new Map(gen.map(g => [g.id, g]));
  const kept = existing.filter(l => !String(l.id).startsWith("md-") || byId.has(l.id)).map((l: any) => {
    const g = byId.get(l.id); if (!g) return l;
    // A styled layer's missing style setting means "follow the style", so only markdown-owned content is filled in from the generated layer.
    const base = l.style ? Object.fromEntries(Object.entries(g).filter(([k]) => !STYLE_KEYS.includes(k) || CONTENT.includes(k))) : g;
    const u = { ...base, ...l }; for (const k of CONTENT) { if (k in g) u[k] = g[k]; else delete u[k]; } return u;
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
    const { layers: _legacy, ...rest } = prev ?? {};   // a link made in the builder (include) survives a re-import without an include: line
    nodes[s.slug] = { ...rest, id: s.slug, title: plainText(s.title), body: s.body, children: s.children.map(c => c.slug), ...(s.include ? { include: s.include } : {}),
      frames: frames ? frames.map((f: any) => ({ ...f, layers: mergeLayers(f.layers, gen) })) : [{ id: "f1", layers: gen }] };
    s.children.forEach(add);
  };
  sections.forEach(add);
  return { ...(deck ?? { images: {}, customBg: null }), nodes, title: deck?.title || sections[0]?.title || "" };
}

// Where a link into a linked deck fails: null = found, "missing" = no such slide, else the problem (a missing deck).
// Graft ids are flat (<linked node>.<any slide of its deck>), so each segment is a node id in the current deck; a further segment needs a chained link.
async function linkProblem(root: string, deck: string, path: string[], seen: string[] = []): Promise<string | null> {
  const f = Bun.file(join(root, "decks", deck, "deck.json"));
  if (!(await f.exists())) return `deck "${deck}" not found`;
  const N = (await f.json()).nodes, node = path[0] !== "ROOT" ? N[path[0]] : null;
  if (!node) return "missing";
  if (path.length === 1) return null;
  if (!node.include || seen.includes(node.include)) return "missing";
  return linkProblem(root, node.include, path.slice(1), [...seen, deck]);
}

// Shared by the CLI and POST /api/import: parse, merge into any existing deck, save. Writes nothing on errors.
export async function importMarkdown(root: string, slug: string, md: string, source?: string) {
  const parsed = parseMarkdown(md);
  if (!SLUG.test(slug)) parsed.errors.unshift({ line: 0, msg: `bad deck slug "${slug}" (use a-z, 0-9 and -)` });
  if (parsed.errors.length) return { ...parsed, slug, deck: null };
  const checkInto = async (ss: Section[]): Promise<void> => { for (const s of ss) {
    for (const l of [...s.links, ...s.inline]) if (l.into) { const p = await linkProblem(root, l.into, l.path!);
      if (p) parsed.warnings.push({ line: l.line, msg: p === "missing" ? `link target "${l.ref}" not found in deck ${l.into}` : `${p} (linked from "${l.via}")` }); }
    await checkInto(s.children); } };
  await checkInto(parsed.sections);
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
