// Parses a markdown outline into a slide tree. Pure: no I/O, no imports.
export type Issue = { line: number; msg: string };
export type Chip = { label: string; ref: string; line: number; target?: string; into?: string; path?: string[]; via?: string };
export type Source = { text: string; url: string };
export type BlockKey = "body" | "list" | "links" | "sources" | "image";
export type Block = { key: BlockKey; text: string; line: number; endLine: number; items?: number[]; group?: boolean; url?: string; alt?: string };   // lines are 1-based, endLine inclusive; items: a list's item lines (one per text line); group: from <!-- block -->; url/alt for image; text is inline markup
export type Section = {
  slug: string; title: string; line: number; depth: number;
  body: string;          // raw markdown body (slide notes)
  blocks: Block[];       // one per paragraph, list, group, image; all chips / all sources collapse into one block each
  links: Chip[]; sources: Source[]; children: Section[];
  inline: Chip[];        // {link=…} refs inside the text (mid-sentence chips become these); resolved and rewritten to slide ids
  childSrc: string[];    // raw URLs from a `children:` comment, unresolved
};

const SLUG_RE = /^[a-z0-9-]+$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*(?<!\\)#*\s*$/;   // closing #s go; an escaped one (C\#) stays in the title
const untitle = (t: string) => t.replace(/<\\!--/g, "<!--").replace(/\\#$/, "#");   // a title's own escapes (what writeBlock adds)
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
// A body line's own escapes (what writeBlock adds): a leading \ before - # ! or slug: keeps it from being a list item, heading, image or slug line; <\!-- (in any text) isn't a comment.
const unline = (t: string) => t.trim().replace(/^\\(?=[-#!]|slug:)/, "");
// A line ending in an unescaped \ is a hard break (as in CommonMark): the paragraph keeps a line break there.
const hardBreak = (t: string) => /(^|[^\\])(\\\\)*\\$/.test(t);

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
    const text = raw.replace(/<\\!--/g, "<!--")
      .replace(CHIP, (_, ref, label) => `[${label.trim()}]{link=${ref.trim()}}`)   // a chip mid-sentence is an inline link
      .replace(EXT, (_, txt, url) => `[${txt}]{href=${url}}`);                       // so is a web link; inline markup is kept for the app to render
    for (const m of text.matchAll(/\]\{([^}]*)\}/g)) for (const tok of m[1].split(/\s+/)) { const k = /^link=(\S+)$/.exec(tok); if (k) inline.push({ ref: k[1], label: "", line }); }
    return text;
  };
  // A chip-only or source-only entry joins the links / sources block instead of the text.
  const special = (t: string, line: number, end = line) => {
    const only = CHIP_ONLY.exec(t), spanOnly = /^\[((?:\\.|[^\]\\])*)\]\{link=([^}\s]+)\}$/.exec(t);   // a line that is only an inline slide link is a chip too
    const chip = only ? { ref: only[1].trim(), label: only[2].trim(), line } : spanOnly ? { ref: spanOnly[2], label: spanOnly[1].replace(/\\([*[\]{}\\])/g, "$1"), line } : null;
    if (chip) { links.push(chip); if (!lb) blocks.push(lb = { key: "links", text: "", line, endLine: end }); lb.endLine = end; lb.text = links.map(l => l.label).join("\n"); return true; }
    const exts = [...t.matchAll(EXT)];
    if (!exts.length || t.replace(EXT, "").replace(/[·|,;\s]/g, "")) return false;
    exts.forEach(m => sources.push({ text: m[1], url: m[2] }));
    if (!sb) blocks.push(sb = { key: "sources", text: "", line, endLine: end }); sb.endLine = end;
    sb.text = sources.map(s => `[${s.text}]{href=${s.url}}`).join("\n");
    return true;
  };
  const para = (blk: Line[]) => {
    if (blk.every(l => ITEM.test(l.text))) {
      const items: string[] = [], at: number[] = [];
      blk.forEach(l => { const t = ITEM.exec(l.text)![1].trim(); if (!special(t, l.line)) { items.push(rewrite(t, l.line)); at.push(l.line); } });
      if (items.length) blocks.push({ key: "list", text: items.join("\n"), line: blk[0].line, endLine: blk[blk.length - 1].line, items: at });
      return;
    }
    let txt: Line[] = [];
    const flushText = () => {
      const t = txt.map((l, k) => { const u = unline(l.text), h = hardBreak(u); return (h ? u.slice(0, -1) : u) + (k === txt.length - 1 ? "" : h ? "\n" : " "); }).join("");
      if (txt.length && !special(t, txt[0].line, txt[txt.length - 1].line)) blocks.push({ key: "body", text: rewrite(t, txt[0].line), line: txt[0].line, endLine: txt[txt.length - 1].line });
      txt = [];
    };
    for (const l of blk) {
      const im = IMG.exec(l.text.trim());
      if (im) { flushText(); blocks.push({ key: "image", text: im[1], line: l.line, endLine: l.line, url: im[2], alt: im[1] }); } else txt.push(l);
    }
    flushText();
  };
  const group = (g: Line[]) => {
    const full = g.filter(l => l.text.trim());
    if (full.length) blocks.push({ key: "body", text: g.map(l => { const u = unline(l.text); return rewrite(hardBreak(u) ? u.slice(0, -1) : u, l.line); }).join("\n").trim(), line: full[0].line, endLine: full[full.length - 1].line, group: true });
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
      const r: Raw = { level: h[1].length, title: untitle(h[2]), slug: "", line: i + 1, body: [], childSrc: [] };
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

// Inserts a new slide heading into md, after the slide whose heading is on `line` (its whole subtree) as a sibling, or as its last child ("below").
// line 0 (no slide, e.g. the title page) appends a top-level slide. Returns the new md and the new slide's id.
export function insertSlide(md: string, line: number, where: "after" | "below"): { md: string; slug: string } {
  const flat: Section[] = [], walk = (ss: Section[]) => ss.forEach(s => { flat.push(s); walk(s.children); });
  walk(parseMarkdown(md).sections);
  const lines = md.split(/\r?\n/), at = flat.findIndex(s => s.line === line), cur = flat[at];
  const level = (s: Section) => HEADING.exec(lines[s.line - 1])![1].length;
  const end = cur ? flat.slice(at + 1).find(s => s.depth <= cur.depth) : undefined;   // first heading past the subtree
  const hashes = cur ? Math.min(6, level(cur) + (where === "below" ? 1 : 0)) : flat.length ? Math.min(...flat.map(level)) : 1;
  const taken = new Set(flat.map(s => s.slug)); let slug = "new-slide", n = 2;
  while (taken.has(slug)) slug = `new-slide-${n++}`;
  const block = ["#".repeat(hashes) + " New slide", `slug: ${slug}`, ""];
  if (end) { lines.splice(end.line - 1, 0, ...block); return { md: lines.join("\n"), slug }; }
  const body = md.replace(/\s*$/, "");
  return { md: (body ? body + "\n\n" : "") + block.join("\n"), slug };
}

// Whether lines line..endLine hold an HTML comment: a <!-- in them, or one still open from above (then their --> closes it). A --> with nothing open is just text.
export function hasComment(md: string, line: number, endLine: number): boolean {
  const lines = md.split(/\r?\n/); let open = false;
  for (let i = 0; i < endLine; i++) {
    if (!open && HEADING.test(lines[i])) continue;   // a heading line is never a comment (as in parseMarkdown)
    if (i >= line - 1 && (open || lines[i].includes("<!--"))) return true;
    for (let t = lines[i]; ;) { const k = t.indexOf(open ? "-->" : "<!--"); if (k < 0) break; t = t.slice(k + (open ? 3 : 4)); open = !open; }
  }
  return false;
}
// Writes an in-place edit back: `text` (inline markup, lines split on \n) replaces lines line..endLine of md.
// title: the heading line, keeping its #s (one line; empty is refused: null). item: one list line per text line, keeping marker and indent; empty lines go.
// body: one markdown line per text line, joined by hard breaks (a trailing \); a line that would parse as something else is escaped. group (<!-- block -->): its lines as they are.
// An emptied body, group or item is removed, with one blank line if that would leave two. <!-- is always written <\!--; a title's trailing # is written \#; a bullet that
// would parse as a chip or source is wrapped [...]{}. A body/group row the edit didn't change keeps its source line exactly. Other lines are untouched; written lines keep the file's line ending.
export function writeBlock(md: string, kind: "title" | "body" | "group" | "item", line: number, endLine: number, text: string): string | null {
  const lines = md.split("\n"), cr = md.includes("\r\n") ? "\r" : "", old = (lines[line - 1] ?? "").replace(/\r$/, ""), rows = text.split("\n").map(r => r.trim());
  let put: string[];
  if (kind === "title") {
    const t = rows.filter(Boolean).join(" ");
    if (!plainText(t).trim()) return null;
    put = [(/^#{1,6}/.exec(old)?.[0] ?? "#") + " " + t.replace(/<!--/g, "<\\!--").replace(/#$/, "\\#")];   // a trailing # would read as a closing one
  } else if (kind === "item") put = rows.filter(Boolean).map(r => { r = r.replace(/<!--/g, "<\\!--");
    if (parseBody([{ text: "- " + r, line: 1 }]).blocks[0]?.key !== "list") r = "[" + r + "]{}";   // a lone chip or source link: an empty span keeps it a bullet
    return (/^\s*[-*]\s+/.exec(old)?.[0] ?? "- ") + r; });
  else {
    while (rows.length && !rows[0]) rows.shift();
    while (rows.length && !rows[rows.length - 1]) rows.pop();
    const underHeading = HEADING.test(lines[line - 2] ?? "");   // no slug line: a "slug:" first line would become one
    // The block as it is now, one row per source line? Then a row the edit didn't change keeps its line as written (indent, spacing).
    const src = lines.slice(line - 1, endLine).map(l => l.replace(/\r$/, ""));
    const was = parseBody((kind === "group" ? ["<!-- block -->", ...src, "<!-- /block -->"] : src).map(text => ({ text, line: 1 }))).blocks;
    const oldRows = was.length === 1 && was[0].key === "body" && was[0].text.split("\n").length === src.length ? was[0].text.split("\n") : null;
    put = rows.map((r, k) => {
      if (oldRows && k < oldRows.length && r === oldRows[k].trim() && (kind === "group" || (k === rows.length - 1) === (k === oldRows.length - 1))) return src[k];   // a body row's trailing \ (a break) must still match
      r = r.replace(/<!--/g, "<\\!--").replace(/^(?=\\([-#!]|slug:)|#{1,6}(\s|$))/, "\\");   // a \ the parser would drop, a heading: escaped (headings are found even in groups)
      if (hardBreak(r)) r += "\\";   // a line ending in \ keeps it
      if (kind === "group") return r;
      if (/^([-*](\s|$)|!\[)/.test(r) || (!k && underHeading && SLUG_LINE.test(r))) r = "\\" + r;
      return r + (k < rows.length - 1 ? "\\" : "");
    });
    const probe = parseBody(put.map(text => ({ text, line: 1 }))).blocks;
    if (kind === "body" && put.length === 1 && probe[0]?.key !== "body") put[0] = "[" + put[0] + "]{}";   // a lone chip or source link: an empty span keeps it text
  }
  put = put.map(r => r + cr);
  const gap = !put.length && kind !== "title" && !lines[line - 2]?.trim() && !lines[endLine]?.trim() && endLine < lines.length - 1 ? 1 : 0;   // don't leave two blank lines
  lines.splice(line - 1, endLine - line + 1 + gap, ...put);
  return lines.join("\n");
}
