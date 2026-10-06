import type { Section } from "./markdown";

const text = (id: string, geo: object, txt: string, extra: object = {}) => ({
  id, type: "text", text: txt, font: "grot", size: 32, weight: 400, color: null, align: "left", valign: "top",
  lh: 1.3, bullets: "none", gap: 0.15, rot: 0, opacity: 1, ...geo, ...extra,
});
export const bodySize = (t: string) => Math.max(22, Math.min(40, Math.round(40 - (t.length - 120) / 20)));

export function layersFor(s: Section): any[] {
  const L: any[] = [text("md-title", { x: 6, y: 6, w: 88, h: 14 }, s.title, { size: 64, weight: 800, valign: "bottom", lh: 1.05 })];
  if (s.text) L.push(text("md-body", { x: 6, y: 24, w: s.links.length ? 56 : 88, h: 60 }, s.text,
    { size: bodySize(s.text), lh: 1.35, bullets: s.bulletsOnly ? "disc" : "none", gap: 0.35 }));
  const step = Math.min(11, 62 / Math.max(1, s.links.length));
  s.links.forEach((k, n) => {
    const geo = { x: 66, y: 24 + n * step, w: 28, h: Math.min(9, step - 1.5) };
    L.push({ id: `md-linkbg-${n}`, type: "shape", shape: "rect", fill: "rgba(255,255,255,0.75)", radius: 12, rot: 0, opacity: 1, ...geo });
    L.push(text(`md-link-${n}`, { ...geo, x: 67, w: 26 }, k.label + " →",
      { size: 22, weight: 600, color: "#15171c", valign: "middle", lh: 1.1, link: { type: "slide", id: k.target } }));
  });
  s.sources.forEach((r, n) => L.push(text(`md-src-${n}`, { x: 6 + (n % 3) * 30, y: 89 - Math.floor(n / 3) * 6, w: 28, h: 5 }, r.text + " ↗",
    { font: "mono", size: 16, valign: "middle", lh: 1.2, link: { type: "url", url: r.url } })));
  return L;
}

// Markdown owns the set of md-* layers and their text/link/bullets; everything else is the builder's.
const CONTENT = ["text", "link", "bullets"];
function mergeLayers(existing: any[], gen: any[]) {
  const byId = new Map(gen.map(g => [g.id, g]));
  const kept = existing.filter(l => !String(l.id).startsWith("md-") || byId.has(l.id)).map(l => {
    const g = byId.get(l.id); if (!g) return l;
    const u = { ...l }; for (const k of CONTENT) { if (k in g) u[k] = g[k]; else delete u[k]; } return u;
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
