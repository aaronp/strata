# Markdown Import and Deck Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make import MD=file.md` turns a markdown outline into a deck (headings → slide levels, `[link:…]` → slide-link layers). Re-import keeps builder layout. Any slide can live-include another deck.

**Architecture:**
- `markdown.ts` is a pure parser: text → section tree, with link refs resolved and every error/warning carrying a line number.
- `importer.ts` is a pure merge (`importInto`) plus a thin CLI (`importFile`) that writes through the existing `saveDeck`.
- Deck includes are handled entirely in the app (`design/strata.dc.html`):
  - after load, other decks are fetched and grafted under the including slide, with ids prefixed `<slug>:`;
  - a guard in `componentDidUpdate` reverts edits to grafted slides;
  - `save()` strips grafts.

**Tech Stack:** bun (runtime and `bun test`), no npm dependencies, the existing DC prototype runtime.

**Spec:** `docs/superpowers/specs/2026-10-06-markdown-import-design.md`

## Global Constraints

- No npm dependencies. bun built-ins and `node:` modules only.
- Slugs match `^[a-z0-9-]+$` (reuse `SLUG` from `server.ts`; the parser uses its own copy `SLUG_RE`, since `markdown.ts` must stay I/O-free and import-free).
- Layer links use the app's real shape: `{ type: 'slide', id }` and `{ type: 'url', url }`. **The spec's `kind` wording is wrong; the app reads `type`** (see `design/strata.dc.html`, where `linkSpots` uses `l.link.type`).
- Generated layer ids start with `md-`. Only these are markdown-owned. The content-owned fields of a generated layer are exactly `text`, `link` and `bullets`.
- New imported slides get one frame: `{ id: 'f1', layers }`. An existing slide that has only `layers` (no `frames`) is treated as one frame `{ id: 'f0-<id>', layers }`, which matches the app's `framesOfNode`.
- Grafted node ids are `<prefix><slug>:<id>`. Grafted nodes carry `_inc: '<slug>'`. Grafted image keys are prefixed the same way (and therefore contain `:`). Own image keys never contain `:`.
- Error slides for failed includes have id `<including-id>!err`.
- **Ruling against the spec:** the "short ref matches more than one slide" error is dropped. Slugs must be unique in the file (a duplicate is already an error), so a short ref can never be ambiguous.
- **Ruling:** `examples/current-situation.md` is committed, because it is the end-to-end test fixture.

## Review Focus

1. **CRLF line endings** (a markdown file saved on Windows): the parse must be identical to the LF version. Test in Task 1.
2. **A heading with no body** (just a heading and a slug, like a pure container section): no `md-body` layer and no crash. Test in Task 2.
3. **A builder user hides a generated layer** and then re-imports: `hidden` is builder-owned and must survive. Deleting is not how you suppress an `md-*` layer; hiding is. Test in Task 2.
4. **The same deck included at two slides of one deck** would collide (both graft to `b:x`). The second include must become an error slide, not corrupt the tree. Test in Task 4.
5. **An included deck with zero slides**: the including slide just has no children, with no crash. Test in Task 4.

---

### Task 1: Markdown parser

**Files:**
- Create: `markdown.ts`
- Create: `markdown.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Issue = { line: number; msg: string };
  export type Chip = { label: string; ref: string; line: number; target?: string };
  export type Source = { text: string; url: string };
  export type Section = { slug: string; title: string; line: number; depth: number; body: string; text: string; bulletsOnly: boolean; links: Chip[]; sources: Source[]; children: Section[] };
  export function parseMarkdown(md: string): { sections: Section[]; errors: Issue[]; warnings: Issue[] };
  ```
  `body` is the raw markdown body (it goes into slide notes). `text` is the display text for `md-body`. `Chip.target` is the resolved slug (set when it resolves).

- [ ] **Step 1: Write the failing tests** in `markdown.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseMarkdown } from "./markdown";

const MD = `<!--
metadata, ignored
# not a heading
-->

# Top
slug: top

Intro **bold** text.

- [link:kid-a][Go A]
- [link:top.kid-b][Go B]

## Kid A
slug: kid-a

- one
- two

### Grandkid
slug: grand

Deep. See [the doc](https://ex.com/doc) and [link:kid-a][Kid A].

[Source: X](https://x.com) · [Y](https://y.com)

## Kid B
slug: kid-b
`;

test("headings become a tree with slugs, in file order", () => {
  const { sections, errors, warnings } = parseMarkdown(MD);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
  expect(sections.map(s => s.slug)).toEqual(["top"]);
  expect(sections[0].children.map(s => s.slug)).toEqual(["kid-a", "kid-b"]);
  expect(sections[0].children[0].children.map(s => [s.slug, s.depth])).toEqual([["grand", 3]]);
});

test("a section's body excludes child sections; bold markers are dropped", () => {
  const top = parseMarkdown(MD).sections[0];
  expect(top.text).toBe("Intro bold text.");
  expect(top.body).toContain("[link:kid-a][Go A]");
  expect(top.body).not.toContain("Kid A");
});

test("link-only items become chips resolved by short or dotted ref", () => {
  const top = parseMarkdown(MD).sections[0];
  expect(top.links.map(l => [l.label, l.target])).toEqual([["Go A", "kid-a"], ["Go B", "kid-b"]]);
});

test("a body that is one list renders with bullets", () => {
  const a = parseMarkdown(MD).sections[0].children[0];
  expect(a.bulletsOnly).toBe(true);
  expect(a.text).toBe("one\ntwo");
});

test("inline links keep their text and also add a chip or source; link-only paragraphs become sources", () => {
  const g = parseMarkdown(MD).sections[0].children[0].children[0];
  expect(g.text).toBe("Deep. See the doc and Kid A.");
  expect(g.links.map(l => l.target)).toEqual(["kid-a"]);
  expect(g.sources).toEqual([{ text: "the doc", url: "https://ex.com/doc" }, { text: "Source: X", url: "https://x.com" }, { text: "Y", url: "https://y.com" }]);
});

test("CRLF input parses identically", () => {
  expect(parseMarkdown(MD.replace(/\n/g, "\r\n"))).toEqual(parseMarkdown(MD));
});

test("missing slug line generates one with a warning", () => {
  const { sections, warnings, errors } = parseMarkdown("# Hello, World!\n\nText");
  expect(errors).toEqual([]);
  expect(sections[0].slug).toBe("hello-world");
  expect(warnings).toEqual([{ line: 1, msg: 'no slug line; using "hello-world"' }]);
});

test("errors carry line numbers: duplicate slug, bad slug, skipped level, unresolved link, no headings", () => {
  const md = "# A\nslug: a\n\n[link:nope][X]\n\n### C\nslug: c\n\n# B\nslug: a\n\n# D\nslug: Bad_Slug\n";
  expect(parseMarkdown(md).errors).toEqual([
    { line: 4, msg: 'link target "nope" not found' },
    { line: 6, msg: "heading skips a level (### under #)" },
    { line: 9, msg: 'duplicate slug "a" (first used on line 1)' },
    { line: 13, msg: 'invalid slug "Bad_Slug" (use a-z, 0-9 and -)' },
  ]);
  expect(parseMarkdown("just text").errors).toEqual([{ line: 1, msg: "no headings found" }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test markdown.test.ts`
Expected: FAIL, "Cannot find module './markdown'"

- [ ] **Step 3: Implement `markdown.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun test markdown.test.ts`
Expected: 8 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add markdown.ts markdown.test.ts
git commit -m "Add markdown outline parser"
```

---

### Task 2: Import merge (`importInto`) and generated layers

**Files:**
- Create: `importer.ts`
- Create: `importer.test.ts`

**Interfaces:**
- Consumes: `parseMarkdown`, `Section` from Task 1.
- Produces:
  - `export function layersFor(s: Section): any[]`: the generated `md-*` layers for one slide.
  - `export function importInto(deck: any | null, sections: Section[]): any`: returns a new deck object and never mutates its input.

- [ ] **Step 1: Write the failing tests** in `importer.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseMarkdown } from "./markdown";
import { importInto, layersFor } from "./importer";

const md = (body = "Hello there.") => `# A\nslug: a\n\n${body}\n\n- [link:b][To B]\n\n[Src](https://s.com)\n\n## B\nslug: b\n`;
const imp = (deck: any, text: string) => importInto(deck, parseMarkdown(text).sections);
const layer = (deck: any, node: string, id: string, fi = 0) => deck.nodes[node].frames[fi].layers.find((l: any) => l.id === id);

test("fresh import builds nodes, notes and md-* layers with links", () => {
  const d = imp(null, md());
  expect(d.nodes.ROOT.children).toEqual(["a"]);
  expect(d.nodes.a).toMatchObject({ id: "a", title: "A", children: ["b"] });
  expect(d.nodes.a.body).toContain("Hello there.");
  expect(d.nodes.a.frames.map((f: any) => f.id)).toEqual(["f1"]);
  expect(d.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["md-title", "md-body", "md-linkbg-0", "md-link-0", "md-src-0"]);
  expect(layer(d, "a", "md-link-0")).toMatchObject({ text: "To B →", link: { type: "slide", id: "b" } });
  expect(layer(d, "a", "md-src-0")).toMatchObject({ text: "Src ↗", link: { type: "url", url: "https://s.com" } });
  expect(d.title).toBe("A");
});

test("a heading with no body gets only a title layer", () => {
  expect(layersFor(parseMarkdown("# Only\nslug: only\n").sections[0]).map(l => l.id)).toEqual(["md-title"]);
});

test("re-import updates content but keeps builder layout, extra layers, frames and settings", () => {
  const d1 = imp(null, md());
  const f0 = d1.nodes.a.frames[0];
  const moved = f0.layers.map((l: any) => l.id === "md-body" ? { ...l, x: 50, size: 99 } : l.id === "md-src-0" ? { ...l, hidden: true } : l);
  const img = { id: "img1", type: "image", imgKey: "im1", x: 1, y: 1, w: 10, h: 10 };
  const edited = { ...d1, title: "My Title", bg: "ocean", nodes: { ...d1.nodes, a: { ...d1.nodes.a, include: "other", showFrames: true, ftrans: { f1: {} },
    frames: [{ ...f0, layers: [...moved, img] }, { id: "f2", layers: [...moved] }] } } };
  const d2 = imp(edited, md("Changed text."));
  for (const fi of [0, 1]) {
    expect(layer(d2, "a", "md-body", fi)).toMatchObject({ x: 50, size: 99, text: "Changed text." });
    expect(layer(d2, "a", "md-src-0", fi).hidden).toBe(true);
  }
  expect(layer(d2, "a", "img1")).toEqual(img);
  expect(d2.nodes.a).toMatchObject({ include: "other", showFrames: true, ftrans: { f1: {} } });
  expect(d2).toMatchObject({ title: "My Title", bg: "ocean" });
});

test("re-import removes sections and md layers that are gone, adds new ones", () => {
  const d1 = imp(null, md());
  const d2 = imp(d1, "# A\nslug: a\n\nNew body only.\n\n## C\nslug: c\n");
  expect(Object.keys(d2.nodes).sort()).toEqual(["ROOT", "a", "c"]);
  expect(d2.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["md-title", "md-body"]);
  expect(layer(d2, "a", "md-body").w).toBe(56);   // geometry kept from first import, not regenerated
});

test("a slide with legacy `layers` (no frames) becomes frame f0-<id>", () => {
  const legacy = { nodes: { ROOT: { id: "ROOT", children: ["a"] }, a: { id: "a", title: "A", body: "", children: [], layers: [{ id: "keep", type: "shape" }] } } };
  const d = imp(legacy, "# A\nslug: a\n");
  expect(d.nodes.a.layers).toBeUndefined();
  expect(d.nodes.a.frames[0].id).toBe("f0-a");
  expect(d.nodes.a.frames[0].layers.map((l: any) => l.id)).toEqual(["keep", "md-title"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test importer.test.ts`
Expected: FAIL, "Cannot find module './importer'"

- [ ] **Step 3: Implement `importer.ts`** (pure part only; the CLI comes in Task 3):

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun test importer.test.ts`
Expected: 5 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add importer.ts importer.test.ts
git commit -m "Add markdown import merge with builder-owned layout"
```

---

### Task 3: Import CLI, `make import`, end-to-end on the example

**Files:**
- Modify: `importer.ts` (add `importFile` and the CLI)
- Modify: `importer.test.ts` (append)
- Modify: `Makefile` (add `import`)
- Add to git: `examples/current-situation.md` (already on disk, untracked)

**Interfaces:**
- Consumes: `parseMarkdown` (Task 1), `importInto` (Task 2), `saveDeck(root, slug, deck)` and `SLUG` from `server.ts`.
- Produces: `export async function importFile(root: string, file: string, slug?: string): Promise<{ sections; errors; warnings; slug: string; deck: any | null }>`. `deck` is null when `errors` is non-empty, and nothing is written in that case.

- [ ] **Step 1: Write the failing tests** (append to `importer.test.ts`; add the imports at the top of the file):

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importFile } from "./importer";

test("importing the example produces 55 linked slides across 5 levels and records its source", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-imp-"));
  const r = await importFile(root, join(import.meta.dir, "examples/current-situation.md"));
  expect(r.errors).toEqual([]);
  expect(r.warnings).toEqual([]);
  expect(r.slug).toBe("current-situation");
  const d = await Bun.file(join(root, "decks/current-situation/deck.json")).json();
  const ids = Object.keys(d.nodes).filter(k => k !== "ROOT");
  expect(ids.length).toBe(55);
  expect(d.nodes.ROOT.children).toEqual(["current"]);
  expect(d.nodes["ai-authority"]).toBeDefined();             // level 5
  const links = ids.flatMap(k => d.nodes[k].frames[0].layers).filter((l: any) => l.link?.type === "slide");
  expect(links.length).toBeGreaterThan(50);
  expect(links.every((l: any) => d.nodes[l.link.id])).toBe(true);
  expect(d.source).toMatch(/examples\/current-situation\.md$/);
  expect(d.title).toBe("Current Situation");
});

test("an invalid file writes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-imp-"));
  await Bun.write(join(root, "bad.md"), "# A\nslug: a\n\n[link:nope][X]\n");
  const r = await importFile(root, join(root, "bad.md"));
  expect(r.deck).toBeNull();
  expect(r.errors[0].msg).toContain("nope");
  expect(await Bun.file(join(root, "decks/bad/deck.json")).exists()).toBe(false);
});

test("re-importing keeps layout edits made in deck.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-imp-"));
  await Bun.write(join(root, "t.md"), "# A\nslug: a\n\nBody.\n");
  await importFile(root, join(root, "t.md"), "talk");
  const p = join(root, "decks/talk/deck.json");
  const d = await Bun.file(p).json();
  d.nodes.a.frames[0].layers[1].x = 42;
  await Bun.write(p, JSON.stringify(d));
  await Bun.write(join(root, "t.md"), "# A\nslug: a\n\nNew body.\n");
  await importFile(root, join(root, "t.md"), "talk");
  expect((await Bun.file(p).json()).nodes.a.frames[0].layers[1]).toMatchObject({ x: 42, text: "New body." });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test importer.test.ts`
Expected: the 3 new tests FAIL with "importFile is not a function" (or an export error)

- [ ] **Step 3: Implement.** Add to `importer.ts`:

```ts
import { basename, join, relative, resolve } from "node:path";
import { parseMarkdown } from "./markdown";
import { saveDeck, SLUG } from "./server";

export async function importFile(root: string, file: string, slug?: string) {
  const parsed = parseMarkdown(await Bun.file(file).text());
  const s = slug ?? basename(file).replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!SLUG.test(s)) parsed.errors.unshift({ line: 0, msg: `bad deck slug "${s}" (use a-z, 0-9 and -)` });
  if (parsed.errors.length) return { ...parsed, slug: s, deck: null };
  const path = join(root, "decks", s, "deck.json");
  const existing = (await Bun.file(path).exists()) ? await Bun.file(path).json() : null;
  const deck = await saveDeck(root, s, { ...importInto(existing, parsed.sections), source: relative(root, resolve(root, file)) });
  return { ...parsed, slug: s, deck };
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
```

(Merge the `import` lines with the existing `import type { Section }` at the top of the file.)

Add to `Makefile` (TAB-indented), and add `import` to `.PHONY`:

```make
import:
	@if [ -n "$(DECK)" ]; then bun importer.ts --deck $(DECK); else bun importer.ts $(MD) $(SLUG); fi
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: all pass (21 existing + 8 + 5 + 3 = 37), 0 fail

- [ ] **Step 5: Manual CLI check**

Run: `make import MD=examples/current-situation.md && make import DECK=current-situation && git status --short decks`
Expected: `Imported 55 slides into decks/current-situation/` printed twice, and `decks/current-situation/` appears as untracked. Then `rm -r decks/current-situation`, because the user decides whether to commit an imported deck.

- [ ] **Step 6: Commit**

```bash
git add importer.ts importer.test.ts Makefile examples/current-situation.md
git commit -m "Add make import CLI for markdown decks"
```

---

### Task 4: Live deck includes in the app

**Files:**
- Modify: `design/strata.dc.html`
  - module constants (after `const mapImgs = …`)
  - `loadDeck`, `save`, `componentDidUpdate`
  - new methods `fetchDeck`, `graft`, `setInclude`, `guardGrafts`
  - render values (`keyHint` and the new `inc*` values)
  - the Slide-tab template
- Modify: `app.test.ts` (append)

**Interfaces:**
- Consumes: `GET ../decks/<slug>/deck.json` (static) and `GET /api/decks` → `[{ slug, title }]` (dev server).
- Produces (app-internal): `graft(ownNodes) → Promise<{ nodes, images }>`, `setInclude(id, slug|'')`, `guardGrafts() → boolean`. Node field `include: '<slug>'` is persisted in deck.json, and `_inc` is never persisted.

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`):

```ts
const slideNode = (id: string, title: string, children: string[] = [], extra: object = {}) => ({ id, title, body: "", children, ...extra });
const writeDeck = (slug: string, nodes: Record<string, any>, extra: object = {}) =>
  Bun.write(join(root, `decks/${slug}/deck.json`), JSON.stringify({ nodes, images: {}, customBg: null, ...extra }));
const deckB = () => writeDeck("b", {
  ROOT: slideNode("ROOT", "", ["x"]),
  x: slideNode("x", "Bx", ["y"], { frames: [{ id: "f1", layers: [{ id: "l1", type: "text", text: "go", link: { type: "slide", id: "y" } }, { id: "l2", type: "image", imgKey: "im1" }] }] }),
  y: slideNode("y", "By"),
}, { images: { im1: "img/a.png" } });
const deckTalk = (t: object = {}, extraTop: string[] = []) =>
  writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t", ...extraTop]), t: slideNode("t", "Intro", [], t), ...Object.fromEntries(extraTop.map(k => [k, slideNode(k, k, [], { include: "b" })])) });

test("an included deck's slides are grafted under the including slide", async () => {
  await deckB(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  const N = c.state.nodes;
  expect(N.t.children).toEqual(["b:x"]);
  expect(N["b:x"]).toMatchObject({ _inc: "b", children: ["b:y"] });
  expect(N["b:x"].frames[0].layers[0].link.id).toBe("b:y");
  expect(N["b:x"].frames[0].layers[1].imgKey).toBe("b:im1");
  expect(c.state.images["b:im1"]).toBe("../decks/b/img/a.png");
  expect(c.isDirty()).toBe(false);
});

test("edits to included slides are reverted; the including slide stays editable", async () => {
  await deckB(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  // The stub doesn't re-render on setState; the second componentDidUpdate() mimics React re-rendering after the revert.
  c.setState({ nodes: { ...c.state.nodes, "b:x": { ...c.state.nodes["b:x"], title: "hacked" } } }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes["b:x"].title).toBe("Bx");
  expect(c.state.note).toContain('"b"');
  c.setState({ nodes: { ...c.state.nodes, t: { ...c.state.nodes.t, children: [] } } }); c.componentDidUpdate(); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual(["b:x"]);
  c.setState({ nodes: { ...c.state.nodes, t: { ...c.state.nodes.t, title: "New intro" } } }); c.componentDidUpdate();
  expect(c.state.nodes.t.title).toBe("New intro");
});

test("saving keeps included slides and images out of the including deck", async () => {
  await deckB(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  c.setState({ title: "changed" }); await c.save();
  const d = await onDisk();
  expect(Object.keys(d.nodes).sort()).toEqual(["ROOT", "t"]);
  expect(d.nodes.t).toMatchObject({ include: "b", children: [] });
  expect(d.images).toEqual({});
  expect(c.state.images["b:im1"]).toBe("../decks/b/img/a.png");
});

test("a missing deck, an include loop, or a second include of the same deck shows an error slide", async () => {
  await deckTalk({ include: "nope" });
  let { c } = await mount("?deck=talk");
  expect(c.state.nodes["t!err"]).toMatchObject({ title: "Can't include nope" });
  expect(c.state.nodes.t.children).toEqual(["t!err"]);

  await writeDeck("b", { ROOT: slideNode("ROOT", "", ["x"]), x: slideNode("x", "Bx", [], { include: "talk" }) });
  await deckTalk({ include: "b" });
  ({ c } = await mount("?deck=talk"));
  expect(c.state.nodes["b:x!err"].body).toContain("loop");

  await deckB(); await deckTalk({ include: "b" }, ["u"]);
  ({ c } = await mount("?deck=talk"));
  expect(c.state.nodes.t.children).toEqual(["b:x"]);
  expect(c.state.nodes["u!err"].body).toContain("already included");
});

test("an included deck with no slides adds nothing", async () => {
  await writeDeck("b", { ROOT: slideNode("ROOT", "", []) }); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  expect(c.state.nodes.t.children).toEqual([]);
});

test("choosing a deck in the Include dropdown grafts it and autosaves the include", async () => {
  await deckB(); await deckTalk();
  const { c } = await mount("?deck=talk");
  await c.setInclude("t", "b"); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual(["b:x"]);
  await Bun.sleep(1200);
  expect((await onDisk()).nodes.t).toMatchObject({ include: "b", children: [] });
  await c.setInclude("t", ""); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual([]);
  expect(c.state.decks.map((d: any) => d.slug)).toEqual(["b", "talk"]);
});

test("Slide tab template has the Include dropdown and the read-only notice", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('<select value="{{ incVal }}" onChange="{{ onInclude }}"');
  expect(html).toContain('<a href="{{ incHref }}">');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test app.test.ts`
Expected: the 7 new tests FAIL (no grafting yet: e.g. `N.t.children` is `[]`, and `c.setInclude` is not a function)

- [ ] **Step 3: Module helpers.** Replace the line `const absUrl = v => …;` with the following, and add the helpers after `const mapImgs = …;`:

```js
const deckUrl = (slug, v) => typeof v === 'string' && v && !/^(data:|blob:|https?:|\/)/.test(v) ? '../decks/' + slug + '/' + v : v;
const absUrl = v => DECK ? deckUrl(DECK, v) : v;
```

```js
// Deck includes: another deck's slides are grafted under the including slide with ids prefixed "<slug>:" and marked _inc.
const prefixLayer = (l, p) => ({ ...l, ...(l.link && l.link.type === 'slide' ? { link: { ...l.link, id: p + l.link.id } } : {}), ...(l.imgKey ? { imgKey: p + l.imgKey } : {}) });
const prefixNode = (n, p, from) => ({ ...n, id: p + n.id, _inc: from, children: (n.children || []).map(c => p + c),
  ...(n.frames ? { frames: n.frames.map(f => ({ ...f, layers: f.layers.map(l => prefixLayer(l, p)) })) } : {}),
  ...(n.layers ? { layers: n.layers.map(l => prefixLayer(l, p)) } : {}) });
const stripGrafts = N => { const o = {}; for (const k in N) { const v = N[k]; if (v._inc) continue; o[k] = v.include ? { ...v, children: v.children.filter(c => !(N[c] && N[c]._inc)) } : v; } return o; };
const ownImages = im => Object.fromEntries(Object.entries(im || {}).filter(([k]) => !k.includes(':')));
const graftImages = im => Object.fromEntries(Object.entries(im || {}).filter(([k]) => k.includes(':')));
```

- [ ] **Step 4: Methods.** Add after `isDirty() {…}`:

```js
  async fetchDeck(slug) {
    const r = await fetch('../decks/' + slug + '/deck.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'no deck called "' + slug + '"' : 'HTTP ' + r.status);
    const d = await r.json(); if (!d.nodes || !d.nodes.ROOT) throw new Error('not a deck'); return d;
  }
  async graft(own) {
    const out = { ...own }, images = {}, placed = {};
    const walk = async (id, prefix, chain) => {
      const n = out[id]; if (!n) return;
      if (n.include) {
        const B = n.include, p = prefix + B + ':'; let kids;
        try {
          if (chain.includes(B)) throw new Error('include loop ' + chain.concat(B).join(' → '));
          if (placed[p]) throw new Error('"' + B + '" is already included at "' + placed[p] + '"');
          placed[p] = n.title || id;
          const d = await this.fetchDeck(B);
          for (const k in d.nodes) if (k !== 'ROOT') out[p + k] = prefixNode(d.nodes[k], p, B);
          for (const k in d.images || {}) images[p + k] = deckUrl(B, d.images[k]);
          kids = d.nodes.ROOT.children.map(c => p + c);
          for (const k of kids) await walk(k, p, chain.concat(B));
        } catch (e) { out[id + '!err'] = { id: id + '!err', title: "Can't include " + B, body: e.message, children: [], _inc: B }; kids = [id + '!err']; }
        out[id] = { ...out[id], children: n.children.concat(kids) };
      }
      for (const c of n.children) await walk(c, prefix, chain);
    };
    await walk('ROOT', '', DECK ? [DECK] : []);
    return { nodes: out, images };
  }
  async setInclude(id, slug) {
    const own = stripGrafts(this.state.nodes); const n = { ...own[id] };
    if (slug) n.include = slug; else delete n.include;
    const g = await this.graft({ ...own, [id]: n });
    this._graftEdit = true;
    this.setState(s => ({ nodes: g.nodes, images: { ...ownImages(s.images), ...g.images } }));
  }
  // Included slides are read-only here: revert any nodes change that touches them or an including slide's children.
  guardGrafts() {
    const S = this.state, prev = this._lastNodes;
    if (this._graftEdit) { this._graftEdit = false; return false; }
    if (!prev || S.nodes === prev || this._restoring) return false;
    let hit = null;
    for (const k in prev) {
      const v = prev[k], cur = S.nodes[k];
      if (v._inc && cur !== v) { hit = v._inc; break; }
      if (v.include && (!cur || String(cur.children) !== String(v.children))) { hit = v.include; break; }
    }
    if (!hit) return false;
    this.restore(prev);
    clearTimeout(this._nt); this.setState({ note: 'Included from "' + hit + '": open it to edit' }); this._nt = setTimeout(() => this.setState({ note: null }), 3500);
    return true;
  }
```

- [ ] **Step 5: Wire in.**
  - **`loadDeck`:** as its first statement inside `try {`, add: `if (!STATIC) fetch('/api/decks').then(r => r.json()).then(decks => this.setState({ decks })).catch(() => {});`
  - **`loadDeck`:** replace
    ```js
          this._lastNodes = d.nodes;                               // don't record the load as an undo step
          this.setState({ ...pick, images: mapImgs(d.images, absUrl),
    ```
    with
    ```js
          const g = await this.graft(d.nodes);
          this._lastNodes = g.nodes;                               // don't record the load as an undo step
          this.setState({ ...pick, nodes: g.nodes, images: { ...mapImgs(d.images, absUrl), ...g.images },
    ```
  - **`save()`:** replace `body.images = mapImgs(S.images, relUrl);` with `body.nodes = stripGrafts(S.nodes); body.images = mapImgs(ownImages(S.images), relUrl);`
  - **`save()` success branch:** replace `images: mapImgs(d.images, absUrl)` with `images: { ...graftImages(S.images), ...mapImgs(d.images, absUrl) }`
  - **`componentDidUpdate`:** replace its first line `this.histTrack();` with `if (this.guardGrafts()) return;\n    this.histTrack();`
  - **`componentWillUnmount`:** add `clearTimeout(this._nt);` next to `clearTimeout(this._as);`
  - **Render values:** change `keyHint: S.saveMsg || (` to `keyHint: S.saveMsg || S.note || (`, and add next to `hasDeck: …`:
    ```js
          incFrom: nCur && nCur._inc || '', incHref: nCur && nCur._inc ? 'strata.dc.html?deck=' + nCur._inc : '',
          incShow: !!DECK && !STATIC && !(nCur && nCur._inc), incVal: (nCur && nCur.include) || '',
          incDisabled: !!(nCur && !nCur.include && nCur.children.length), onInclude: e => this.setInclude(this.curId(), e.target.value),
          incOpts: [{ v: '', l: 'None' }].concat((S.decks || []).filter(d => d.slug !== DECK).map(d => ({ v: d.slug, l: d.title + ' (' + d.slug + ')' }))),
    ```
    If `nCur` is not in scope at that point in `renderVals`, define `const nCur = N[this.curId()];` at the top of `renderVals` and record a Ruling.
  - **Template:** directly after the `</label>` that closes the "Slide name" input (the first `</label>` inside `<sc-if value="{{ tabSlide }}">`), insert:
    ```html
                <sc-if value="{{ incFrom }}">
                  <div style="padding:8px 10px;border:1px solid #d6e2ef;border-radius:8px;background:#eef3f9;font-size:12.5px;color:#1f4f80">Included from <b>{{ incFrom }}</b>: read-only here. <a href="{{ incHref }}">Open {{ incFrom }} →</a></div>
                </sc-if>
                <sc-if value="{{ incShow }}">
                  <label style="display:flex;flex-direction:column;gap:5px">
                    <span style="font-size:12px;color:#6b6458">Include deck · its slides appear under this one</span>
                    <select value="{{ incVal }}" onChange="{{ onInclude }}" disabled="{{ incDisabled }}" style="padding:7px 8px;border:1px solid #e0d9cb;border-radius:7px;background:#fff;outline:none;font-size:13px">
                      <sc-for list="{{ incOpts }}" as="o" hint-placeholder-count="2"><option value="{{ o.v }}">{{ o.l }}</option></sc-for>
                    </select>
                    <sc-if value="{{ incDisabled }}"><span style="font-size:11.5px;color:#6b6458">Remove child slides first</span></sc-if>
                  </label>
                </sc-if>
    ```

- [ ] **Step 6: Run tests**

Run: `bun test`
Expected: all pass (37 + 7 = 44), 0 fail

- [ ] **Step 7: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Live-include other decks at any slide (read-only grafts)"
```

---

### Task 5: README

**Files:**
- Modify: `README.md` (the Usage section)

- [ ] **Step 1:** In the Usage table, add a row after `make dev`:

```markdown
| `make import MD=notes.md [SLUG=name]` | Build `decks/<slug>/` from a markdown outline; re-run (or `make import DECK=<slug>`) after editing the markdown |
```

Then append to the Usage section:

```markdown
### Markdown decks
Headings become slides (`#` top level, `##` below it, …). Put `slug: <id>` on the line after each heading. `[link:<slug>][Label]` adds a clickable chip that jumps to that slide; dotted paths like `[link:top.child][…]` also work. Ordinary `[text](url)` links become source links. Re-importing rewrites text and links but keeps anything you moved, restyled, hid or added in the builder. See `examples/current-situation.md`.

### Composing decks
In the builder's Slide tab, **Include deck** shows another deck's slides under the current slide, live: re-importing that deck updates every deck that includes it. Included slides are read-only; use **Open <deck>** to edit them.
```

- [ ] **Step 2: Verify**

Run: `bun test && grep -c "make import" README.md`
Expected: all tests pass; count ≥ 2

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document markdown import and deck composition"
```
