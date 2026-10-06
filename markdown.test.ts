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
