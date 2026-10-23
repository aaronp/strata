// Parses a markdown outline into a slide tree. Pure: no I/O, no imports.
export type Issue = { line: number; msg: string };
export type Chip = { label: string; ref: string; line: number; target?: string; into?: string; path?: string[]; via?: string };
export type Source = { text: string; url: string };
export type BlockKey = "body" | "list" | "links" | "sources" | "image";
export type Block = { key: BlockKey; text: string; line: number; url?: string; alt?: string };   // url/alt for image; text is inline markup
export type Section = {
  slug: string; title: string; line: number; depth: number;
  body: string;          // raw markdown body (slide notes)
  blocks: Block[];       // one per paragraph, list, group, image; all chips / all sources collapse into one block each
  links: Chip[]; sources: Source[]; children: Section[];
  inline: Chip[];        // {link=…} refs inside the text (mid-sentence chips become these); resolved and rewritten to slide ids
  childSrc: string[];    // raw URLs from a `children:` comment, unresolved
};

const SLUG_RE = /^[a-z0-9-]+$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SLUG_LINE = /^slug:\s*(\S*)\s*$/;
const IMG = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
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
  const links: Chip[] = [], inline: Chip[] = [], sources: Source[] = [], blocks: Block[] = [];
  let lb: Block | undefined, sb: Block | undefined;   // the one links / sources block, placed at first use
  // Drop HTML comments; block markers survive as "\0" / "\0/" lines.
  const clean: Line[] = []; let inC = false;
  for (const l of lines) {
    const mk = inC ? null : /^\s*<!--\s*(\/?)block\s*-->\s*$/.exec(l.text);
    if (mk) { clean.push({ text: "\0" + mk[1], line: l.line }); continue; }
    let t = l.text, out = "";
    while (t) {
      if (inC) { const e = t.indexOf("-->"); if (e < 0) break; t = t.slice(e + 3); inC = false; }
      else { const s = t.indexOf("<!--"); if (s < 0) { out += t; break; } out += t.slice(0, s); t = t.slice(s + 4); inC = true; }
    }
    clean.push({ text: out, line: l.line });
  }
  const rewrite = (raw: string, line: number) => {
    const text = raw
      .replace(CHIP, (_, ref, label) => `[${label.trim()}]{link=${ref.trim()}}`)   // a chip mid-sentence is an inline link
      .replace(EXT, (_, txt, url) => `[${txt}]{href=${url}}`);                       // so is a web link; inline markup is kept for the app to render
    for (const m of text.matchAll(/\]\{([^}]*)\}/g)) for (const tok of m[1].split(/\s+/)) { const k = /^link=(\S+)$/.exec(tok); if (k) inline.push({ ref: k[1], label: "", line }); }
    return text;
  };
  // A chip-only or source-only entry joins the links / sources block instead of the text.
  const special = (t: string, line: number) => {
    const only = CHIP_ONLY.exec(t), spanOnly = /^\[((?:\\.|[^\]\\])*)\]\{link=([^}\s]+)\}$/.exec(t);   // a line that is only an inline slide link is a chip too
    const chip = only ? { ref: only[1].trim(), label: only[2].trim(), line } : spanOnly ? { ref: spanOnly[2], label: spanOnly[1].replace(/\\([*[\]{}\\])/g, "$1"), line } : null;
    if (chip) { links.push(chip); if (!lb) blocks.push(lb = { key: "links", text: "", line }); lb.text = links.map(l => l.label).join("\n"); return true; }
    const exts = [...t.matchAll(EXT)];
    if (!exts.length || t.replace(EXT, "").replace(/[·|,;\s]/g, "")) return false;
    exts.forEach(m => sources.push({ text: m[1], url: m[2] }));
    if (!sb) blocks.push(sb = { key: "sources", text: "", line });
    sb.text = sources.map(s => `[${s.text}]{href=${s.url}}`).join("\n");
    return true;
  };
  const para = (blk: Line[]) => {
    if (blk.every(l => ITEM.test(l.text))) {
      const items: string[] = [];
      blk.forEach(l => { const t = ITEM.exec(l.text)![1].trim(); if (!special(t, l.line)) items.push(rewrite(t, l.line)); });
      if (items.length) blocks.push({ key: "list", text: items.join("\n"), line: blk[0].line });
      return;
    }
    let txt: Line[] = [];
    const flushText = () => {
      const t = txt.map(l => l.text.trim()).join(" ");
      if (txt.length && !special(t, txt[0].line)) blocks.push({ key: "body", text: rewrite(t, txt[0].line), line: txt[0].line });
      txt = [];
    };
    for (const l of blk) {
      const im = IMG.exec(l.text.trim());
      if (im) { flushText(); blocks.push({ key: "image", text: im[1], line: l.line, url: im[2], alt: im[1] }); } else txt.push(l);
    }
    flushText();
  };
  const group = (g: Line[]) => {
    const first = g.find(l => l.text.trim());
    if (first) blocks.push({ key: "body", text: g.map(l => rewrite(l.text.trim(), l.line)).join("\n").trim(), line: first.line });
  };
  let cur: Line[] = [], grp: Line[] | null = null;
  const flush = () => { if (cur.length) para(cur); cur = []; };
  for (const l of clean) {
    if (l.text === "\0") { flush(); grp = []; }
    else if (l.text === "\0/") { if (grp) group(grp); grp = null; }
    else if (grp) grp.push(l);
    else if (l.text.trim()) cur.push(l); else flush();
  }
  flush(); if (grp) group(grp);   // an unclosed group runs to the end of the section
  return { body: lines.map(l => l.text).join("\n").trim(), blocks, links, inline, sources };
}

export function parseMarkdown(md: string): { sections: Section[]; errors: Issue[]; warnings: Issue[] } {
  const lines = md.split(/\r?\n/);
  const errors: Issue[] = [], warnings: Issue[] = [];
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trimStart().startsWith("<!--")) { while (i < lines.length && !lines[i].includes("-->")) i++; i++; }

  type Raw = { level: number; title: string; slug: string; line: number; body: Line[]; childSrc: string[] };
  const raws: Raw[] = [];
  const inComment = (t: string, c: boolean) => { for (;;) { const k = t.indexOf(c ? "-->" : "<!--"); if (k < 0) return c; t = t.slice(k + (c ? 3 : 4)); c = !c; } };
  let inC = false;   // a heading inside an HTML comment is commented out
  for (; i < lines.length; i++) {
    const h = inC ? null : HEADING.exec(lines[i]);
    if (h) {
      const r: Raw = { level: h[1].length, title: h[2], slug: "", line: i + 1, body: [], childSrc: [] };
      const s = SLUG_LINE.exec(lines[i + 1] ?? "");
      if (s?.[1]) { i++; r.slug = s[1]; if (!SLUG_RE.test(s[1])) errors.push({ line: i + 1, msg: `invalid slug "${s[1]}" (use a-z, 0-9 and -)` }); }
      else { if (s) i++; r.slug = slugify(plainText(r.title)) || `section-${r.line}`; warnings.push({ line: r.line, msg: `no slug line; using "${r.slug}"` }); }
      if (lines[i + 1]?.trimStart().startsWith("<!--")) {   // a comment right under the heading may list the child decks
        let j = i + 1; while (j < lines.length - 1 && !lines[j].includes("-->")) j++;
        const c = /<!--\s*children:([\s\S]*?)-->/.exec(lines.slice(i + 1, j + 1).join("\n"));
        if (c) { r.childSrc = c[1].split("\n").map(u => u.trim()).filter(Boolean); i = j; }
      }
      raws.push(r);
      continue;
    }
    if (raws.length) raws[raws.length - 1].body.push({ text: lines[i], line: i + 1 });
    else if (lines[i].trim()) warnings.push({ line: i + 1, msg: "text before the first heading is ignored" });
    inC = inComment(lines[i], inC);
  }
  if (!raws.length) return { sections: [], errors: [{ line: 1, msg: "no headings found" }], warnings: [] };

  const seen = new Set<string>();
  for (const r of raws) {
    if (seen.has(r.slug)) {
      let n = 2; while (seen.has(`${r.slug}-${n}`)) n++;
      const old = r.slug; r.slug = `${old}-${n}`;
      warnings.push({ line: r.line, msg: `duplicate slug "${old}"; using "${r.slug}"` });
    }
    seen.add(r.slug);
  }

  const min = Math.min(...raws.map(r => r.level));
  const top: Section[] = [], stack: Section[] = [];
  for (const r of raws) {
    const depth = r.level - min + 1;
    if (depth > stack.length + 1) errors.push({ line: r.line, msg: `heading skips a level (${"#".repeat(r.level)} under ${stack.length ? "#".repeat(stack.length + min - 1) : "start of file"})` });
    const sec: Section = { slug: r.slug, title: r.title, line: r.line, depth, ...parseBody(r.body), childSrc: r.childSrc, children: [] };
    stack.length = Math.min(stack.length, depth - 1);
    (stack.length ? stack[stack.length - 1].children : top).push(sec);
    stack.push(sec);
  }

  const bySlug = new Map<string, Section>();
  const index = (ss: Section[]) => ss.forEach(s => { if (!bySlug.has(s.slug)) bySlug.set(s.slug, s); index(s.children); });
  index(top);
  // Dotted refs: the first segment is found anywhere (like a bare ref), the rest walks children. A ref that doesn't resolve here is left for enrichment.
  const resolve = (ref: string): string | undefined => {
    const parts = ref.split(".");
    let hit = bySlug.get(parts[0]);
    for (let n = 1; hit && n < parts.length; n++) hit = hit.children.find(s => s.slug === parts[n]);
    return hit?.slug;
  };
  const check = (ss: Section[]) => ss.forEach(s => {
    s.links.forEach(l => { l.target = resolve(l.ref); });
    s.inline.forEach(l => { l.target = resolve(l.ref);
      if (l.target && l.target !== l.ref) s.blocks.forEach(b => { b.text = b.text.split(`link=${l.ref}`).join(`link=${l.target}`); }); });   // dotted paths → slide ids
    check(s.children);
  });
  check(top);
  errors.sort((a, b) => a.line - b.line);
  return { sections: top, errors, warnings };
}
