// Parses a markdown outline into a slide tree. Pure: no I/O, no imports.
export type Issue = { line: number; msg: string };
export type Chip = { label: string; ref: string; line: number; target?: string };
export type Source = { text: string; url: string };
export type Section = {
  slug: string; title: string; line: number; depth: number;
  body: string;          // raw markdown body (slide notes)
  text: string;          // display text for the md-body layer
  bulletsOnly: boolean;  // body is entirely list items → render with bullets
  links: Chip[]; sources: Source[]; children: Section[];
};

const SLUG_RE = /^[a-z0-9-]+$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SLUG_LINE = /^slug:\s*(\S*)\s*$/;
const ITEM = /^\s*[-*]\s+(.*)$/;
const CHIP_ONLY = /^\[link:([^\]]+)\]\[([^\]]*)\]$/;
const CHIP = /\[link:([^\]]+)\]\[([^\]]*)\]/g;
const EXT = /\[([^\]]+)\]\(([^)\s]+)\)/g;
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
      .replace(EXT, (_, txt, url) => { sources.push({ text: txt, url }); return txt; })
      .replace(/\*\*/g, "");
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

  type Raw = { level: number; title: string; slug: string; line: number; body: Line[] };
  const raws: Raw[] = [];
  for (; i < lines.length; i++) {
    const h = HEADING.exec(lines[i]);
    if (h) {
      const r: Raw = { level: h[1].length, title: h[2].replace(/\*\*/g, ""), slug: "", line: i + 1, body: [] };
      const s = SLUG_LINE.exec(lines[i + 1] ?? "");
      if (s) { i++; r.slug = s[1]; if (!SLUG_RE.test(s[1])) errors.push({ line: i + 1, msg: `invalid slug "${s[1]}" (use a-z, 0-9 and -)` }); }
      else { r.slug = slugify(r.title) || `section-${r.line}`; warnings.push({ line: r.line, msg: `no slug line; using "${r.slug}"` }); }
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
    const sec: Section = { slug: r.slug, title: r.title, line: r.line, depth, ...parseBody(r.body), children: [] };
    stack.length = Math.min(stack.length, depth - 1);
    (stack.length ? stack[stack.length - 1].children : top).push(sec);
    stack.push(sec);
  }

  const bySlug = new Map<string, Section>();
  const index = (ss: Section[]) => ss.forEach(s => { if (!bySlug.has(s.slug)) bySlug.set(s.slug, s); index(s.children); });
  index(top);
  const resolve = (ref: string) => {
    if (!ref.includes(".")) return bySlug.get(ref)?.slug;
    let list = top, hit: Section | undefined;
    for (const part of ref.split(".")) { hit = list.find(s => s.slug === part); if (!hit) return undefined; list = hit.children; }
    return hit?.slug;
  };
  const check = (ss: Section[]) => ss.forEach(s => {
    s.links.forEach(l => { l.target = resolve(l.ref); if (!l.target) errors.push({ line: l.line, msg: `link target "${l.ref}" not found` }); });
    check(s.children);
  });
  check(top);
  errors.sort((a, b) => a.line - b.line);
  return { sections: top, errors, warnings };
}
