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

// ---- export: a slide and its subtree back to markdown ----
import { toMarkdown } from "./markdown";
import { importInto } from "./importer";

const outline = (ss: any[]): any[] => ss.map(s => ({ slug: s.slug, title: s.title, links: s.links.map((l: any) => l.target), children: outline(s.children) }));

test("export round-trips the example: re-imports as a new deck with the same tree, titles and link targets", async () => {
  const src = parseMarkdown(await Bun.file(import.meta.dir + "/examples/current-situation.md").text());
  const deck = importInto(null, src.sections);
  const md = toMarkdown(deck.nodes, "ROOT", { deck: "current-situation", date: "2026-10-07" });
  const back = parseMarkdown(md);
  expect(back.errors).toEqual([]); expect(back.warnings).toEqual([]);
  expect(outline(back.sections)).toEqual(outline(src.sections));
});

const T = (id: string, text: string, y: number, extra: object = {}) => ({ id, type: "text", text, x: 5, y, w: 50, h: 10, ...extra });
const node = (id: string, title: string, children: string[], layers: any[] | null, body = "") => ({ id, title, body, children, ...(layers ? { frames: [{ id: "f", layers }] } : {}) });

test("a builder slide exports from its layers in reading order: title skipped, bullets, paragraphs, links", () => {
  const nodes = {
    ROOT: node("ROOT", "", ["s1", "far"], null),
    s1: node("s1", "Plan", ["s2"], [
      T("chip", "See details →", 60, { link: { type: "slide", id: "s2" } }),
      T("t", "Plan", 5),
      T("b", "One\nTwo", 30, { bullets: "disc" }),
      T("p", "A paragraph.\n• dotted line", 45),
      T("u", "Source ↗", 80, { link: { type: "url", url: "https://e.x/a" } }),
      T("away", "Elsewhere →", 70, { link: { type: "slide", id: "far" } }),
      { id: "img", type: "image", imgKey: "k", x: 0, y: 0, w: 10, h: 10 },
      T("gone", "Hidden", 50, { hidden: true }),
      T("hash", "# not a heading", 52),
    ]),
    s2: node("s2", "Details", [], null, "Plain notes become the body."),
    far: node("far", "Far", [], null),
  };
  expect(toMarkdown(nodes, "s1", { deck: "d", date: "2026-10-07" })).toBe(
`<!-- Exported from deck "d", slide "Plan" (s1), 2026-10-07 -->

# Plan
slug: s1

- One
- Two

A paragraph.

- dotted line

 # not a heading

- [link:s2][See details]

Elsewhere

[Source](https://e.x/a)

## Details
slug: s2

Plain notes become the body.
`);
});

test("export refuses a branch deeper than markdown's six heading levels", () => {
  const nodes: any = { ROOT: node("ROOT", "", ["n0"], null) };
  for (let i = 0; i < 7; i++) nodes["n" + i] = node("n" + i, "N" + i, i < 6 ? ["n" + (i + 1)] : [], null);
  expect(() => toMarkdown(nodes, "n0", { deck: "d", date: "x" })).toThrow(/6 levels/);
  expect(() => toMarkdown(nodes, "n1", { deck: "d", date: "x" })).not.toThrow();
});
