// Parses a markdown outline into a slide tree. Pure: no I/O, no imports.
export type Issue = { line: number; msg: string };
export type Chip = { label: string; ref: string; line: number; target?: string; into?: string; path?: string[]; via?: string };
export type Source = { text: string; url: string };
export type Section = {
  slug: string; title: string; line: number; depth: number;
  body: string;          // raw markdown body (slide notes)
  text: string;          // display text for the md-body layer
  bulletsOnly: boolean;  // body is entirely list items → render with bullets
  links: Chip[]; sources: Source[]; children: Section[];
  include?: string;      // a linked slide: its children are this deck's slides
};

const SLUG_RE = /^[a-z0-9-]+$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SLUG_LINE = /^slug:\s*(\S*)\s*$/;
const INC_LINE = /^include:\s*(.*?)\s*$/;
const ITEM = /^\s*[-*]\s+(.*)$/;
const CHIP_ONLY = /^\[link:([^\]]+)\]\[([^\]]*)\]$/;
const CHIP = /\[link:([^\]]+)\]\[([^\]]*)\]/g;
const EXT = /\[([^\]]+)\]\(([^)\s]+)\)/g;
// Inline markup → plain text (a regex mirror of the app's parser for titles and slugs): spans keep their words, ** and * markers go, escapes become literal.
export function plainText(t: string): string {
  let s = String(t ?? ""), prev;
  do { prev = s; s = s.replace(/\[([^\[\]]*)\]\{[^}]*\}/g, "$1"); } while (s !== prev);   // innermost spans first
  return s.replace(/\*\*\*(?=\S)(.+?)\*\*\*/g, "$1").replace(/\*\*(?=\S)(.+?)\*\*/g, "$1").replace(/(^|[^*])\*(?=\S)([^*]+?)\*/g, "$1$2").replace(/\\([*[\]{}\\])/g, "$1");
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type Line = { text: string; line: number };

function parseBody(lines: Line[]) {
  const links: Chip[] = [], sources: Source[] = [], out: { text: string; item: boolean; block: number }[] = [];
  const blocks: Line[][] = []; let cur: Line[] = [];
  for (const l of lines) { if (l.text.trim()) cur.push(l); else if (cur.length) { blocks.push(cur); cur = []; } }
  if (cur.length) blocks.push(cur);
  const entry = (raw: string, line: number, item: boolean, block: number) => {
    const t = raw.trim();
    const only = CHIP_ONLY.exec(t);
    if (only) { links.push({ ref: only[1].trim(), label: only[2].trim(), line }); return; }
    const exts = [...t.matchAll(EXT)];
    if (exts.length && !t.replace(EXT, "").replace(/[·|,;\s]/g, "")) { exts.forEach(m => sources.push({ text: m[1], url: m[2] })); return; }
    const text = t
      .replace(CHIP, (_, ref, label) => { links.push({ ref: ref.trim(), label: label.trim(), line }); return label.trim(); })
      .replace(EXT, (_, txt, url) => { sources.push({ text: txt, url }); return txt; });   // inline markup (**, *, [..]{..}) is kept for the app to render
    out.push({ text, item, block });
  };
  blocks.forEach((blk, bi) => {
    if (blk.every(l => ITEM.test(l.text))) blk.forEach(l => entry(ITEM.exec(l.text)![1], l.line, true, bi));
    else entry(blk.map(l => l.text.trim()).join(" "), blk[0].line, false, bi);
  });
  const bulletsOnly = out.length > 0 && out.every(o => o.item);
  const text = out.map((o, i) => (i && out[i - 1].block !== o.block ? "\n" : "") + (o.item && !bulletsOnly ? "• " : "") + o.text).join("\n");
  return { body: lines.map(l => l.text).join("\n").trim(), text, bulletsOnly, links, sources };
}

export function parseMarkdown(md: string): { sections: Section[]; errors: Issue[]; warnings: Issue[] } {
  const lines = md.split(/\r?\n/);
  const errors: Issue[] = [], warnings: Issue[] = [];
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trimStart().startsWith("<!--")) { while (i < lines.length && !lines[i].includes("-->")) i++; i++; }

  type Raw = { level: number; title: string; slug: string; line: number; body: Line[]; include?: string };
  const raws: Raw[] = [];
  for (; i < lines.length; i++) {
    const h = HEADING.exec(lines[i]);
    if (h) {
      const r: Raw = { level: h[1].length, title: h[2], slug: "", line: i + 1, body: [] };
      const s = SLUG_LINE.exec(lines[i + 1] ?? "");
      if (s) { i++; r.slug = s[1]; if (!SLUG_RE.test(s[1])) errors.push({ line: i + 1, msg: `invalid slug "${s[1]}" (use a-z, 0-9 and -)` }); }
      else { r.slug = slugify(plainText(r.title)) || `section-${r.line}`; warnings.push({ line: r.line, msg: `no slug line; using "${r.slug}"` }); }
      const inc = INC_LINE.exec(lines[i + 1] ?? "");
      if (inc) {
        i++; r.include = inc[1];
        if (!s) errors.push({ line: i + 1, msg: "a linked slide needs a slug line" });
        else if (!SLUG_RE.test(inc[1])) errors.push({ line: i + 1, msg: `invalid deck slug "${inc[1]}"` });
      }
      raws.push(r);
    } else if (raws.length) raws[raws.length - 1].body.push({ text: lines[i], line: i + 1 });
    else if (lines[i].trim()) warnings.push({ line: i + 1, msg: "text before the first heading is ignored" });
  }
  if (!raws.length) return { sections: [], errors: [{ line: 1, msg: "no headings found" }], warnings: [] };

  const seen = new Map<string, number>();
  for (const r of raws) {
    if (seen.has(r.slug)) errors.push({ line: r.line, msg: `duplicate slug "${r.slug}" (first used on line ${seen.get(r.slug)})` });
    else seen.set(r.slug, r.line);
  }

  const min = Math.min(...raws.map(r => r.level));
  const top: Section[] = [], stack: Section[] = [];
  for (const r of raws) {
    const depth = r.level - min + 1;
    if (depth > stack.length + 1) errors.push({ line: r.line, msg: `heading skips a level (${"#".repeat(r.level)} under ${stack.length ? "#".repeat(stack.length + min - 1) : "start of file"})` });
    const sec: Section = { slug: r.slug, title: r.title, line: r.line, depth, ...parseBody(r.body), children: [], ...(r.include ? { include: r.include } : {}) };
    stack.length = Math.min(stack.length, depth - 1);
    const parent = stack[stack.length - 1];
    if (parent?.include) errors.push({ line: r.line, msg: `a linked slide's slides come from ${parent.include}; it can't have its own` });
    (stack.length ? stack[stack.length - 1].children : top).push(sec);
    stack.push(sec);
  }

  const bySlug = new Map<string, Section>();
  const index = (ss: Section[]) => ss.forEach(s => { if (!bySlug.has(s.slug)) bySlug.set(s.slug, s); index(s.children); });
  index(top);
  // Dotted refs: the first segment is found anywhere (like a bare ref), the rest walks children; entering a linked section hands the rest to the importer.
  const resolve = (ref: string): Partial<Chip> | undefined => {
    const parts = ref.split(".");
    let hit = bySlug.get(parts[0]);
    for (let n = 1; hit && n < parts.length; n++) {
      if (hit.include) return { target: [hit.slug, ...parts.slice(n)].join("."), into: hit.include, path: parts.slice(n), via: hit.slug };
      const next: Section | undefined = hit.children.find(s => s.slug === parts[n]); hit = next;
    }
    return hit && { target: hit.slug };
  };
  const check = (ss: Section[]) => ss.forEach(s => {
    s.links.forEach(l => { const r = resolve(l.ref); if (r) Object.assign(l, r); else errors.push({ line: l.line, msg: `link target "${l.ref}" not found` }); });
    check(s.children);
  });
  check(top);
  errors.sort((a, b) => a.line - b.line);
  return { sections: top, errors, warnings };
}

// The reverse: a slide and its subtree as markdown that parseMarkdown reads back (for a fresh deck, not a merge).
// Bodies come from each slide's first-frame text layers in reading order; images, shapes and styling don't travel.
// Slide links outside the branch become plain text, else the new deck wouldn't import.
export function toMarkdown(nodes: Record<string, any>, id: string, meta: { deck: string; date: string }): string {
  const inBranch = new Set<string>(), walk = (k: string) => { inBranch.add(k); nodes[k].children.forEach(walk); };
  walk(id);
  if (nodes[id]._from) throw new Error(`"${nodes[id].title}" belongs to deck "${nodes[id]._from}": open that deck to export it`);
  const height = (k: string): number => 1 + (nodes[k].include ? 0 : Math.max(0, ...nodes[k].children.map(height)));
  const levels = id === "ROOT" ? height(id) - 1 : height(id);
  if (levels > 6) throw new Error(`"${nodes[id].title}" is ${levels} levels deep; markdown headings stop at 6 levels`);
  const one = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
  const safe = (s: string) => /^#{1,6}\s/.test(s) ? " " + s : s;   // a leading space keeps a text line from parsing as a heading
  const body = (n: any): string[] => {
    const layers = n.frames?.[0]?.layers ?? n.layers;
    if (!layers) return n.body ? [n.body.trim()] : [];                     // never edited: the app shows the notes as its default body
    const blocks: string[] = [];
    [...layers].filter(l => l.type === "text" && !l.hidden && one(l.text) && one(l.text) !== one(n.title))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach(l => {
        const lk = l.link;
        if (lk?.type === "slide") { const label = one(l.text).replace(/\s*→$/, ""); blocks.push(inBranch.has(lk.id) ? `- [link:${lk.id}][${label}]` : safe(label)); return; }
        if (lk?.type === "url") { blocks.push(`[${one(l.text).replace(/\s*↗$/, "")}](${lk.url})`); return; }
        let items: string[] = [];
        const flush = () => { if (items.length) blocks.push(items.join("\n")); items = []; };
        String(l.text).split("\n").map(s => s.trim()).filter(Boolean).forEach(s => {
          const dot = /^[•*-]\s+(.*)$/.exec(s);
          if (l.bullets && l.bullets !== "none") items.push("- " + s);
          else if (dot) items.push("- " + dot[1]);
          else { flush(); blocks.push(safe(s)); }
        });
        flush();
      });
    return blocks;
  };
  const out = [`<!-- Exported from deck "${meta.deck}", ${id === "ROOT" ? "whole deck" : `slide "${one(nodes[id].title)}" (${id})`}, ${meta.date} -->`];
  const emit = (k: string, depth: number) => {
    const n = nodes[k];
    out.push(`${"#".repeat(depth)} ${one(n.title) || "Untitled"}\nslug: ${k}` + (n.include ? `\ninclude: ${n.include}` : ""), ...body(n));
    if (!n.include) n.children.forEach((c: string) => emit(c, depth + 1));   // a linked node's children are its deck's
  };
  if (id === "ROOT") nodes.ROOT.children.forEach((c: string) => emit(c, 1)); else emit(id, 1);
  return out.join("\n\n") + "\n";
}
