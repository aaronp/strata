import { test, expect } from "bun:test";
import { parseMarkdown, plainText } from "./markdown";
import { join } from "node:path";

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

test("a section's body excludes child sections; bold markers are kept for the app to render", () => {
  const top = parseMarkdown(MD).sections[0];
  expect(top.blocks[0].text).toBe("Intro **bold** text.");
  expect(top.body).toContain("[link:kid-a][Go A]");
  expect(top.body).not.toContain("Kid A");
});

test("link-only items become chips resolved by short or dotted ref", () => {
  const top = parseMarkdown(MD).sections[0];
  expect(top.links.map(l => [l.label, l.target])).toEqual([["Go A", "kid-a"], ["Go B", "kid-b"]]);
});

test("mid-sentence links stay inline (slide links resolved to ids); link-only paragraphs become sources", () => {
  const g = parseMarkdown(MD).sections[0].children[0].children[0];
  expect(g.blocks[0].text).toBe("Deep. See [the doc]{href=https://ex.com/doc} and [Kid A]{link=kid-a}.");
  expect(g.links).toEqual([]); expect(g.inline.map(l => l.target)).toEqual(["kid-a"]);
  expect(g.sources).toEqual([{ text: "Source: X", url: "https://x.com" }, { text: "Y", url: "https://y.com" }]);
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

test("errors carry line numbers: bad slug, skipped level, no headings", () => {
  const md = "# A\nslug: a\n\n### C\nslug: c\n\n# D\nslug: Bad_Slug\n";
  expect(parseMarkdown(md).errors).toEqual([
    { line: 4, msg: "heading skips a level (### under #)" },
    { line: 8, msg: 'invalid slug "Bad_Slug" (use a-z, 0-9 and -)' },
  ]);
  expect(parseMarkdown("just text").errors).toEqual([{ line: 1, msg: "no headings found" }]);
});

const keys = (md: string) => parseMarkdown(md).sections[0].blocks;

test("parse: each paragraph and each list is its own block", () => {
  const b = keys("# T\nslug: t\n\nA.\n\nB.\n\n- x\n- y\n\nC.");
  expect(b.map(x => x.key)).toEqual(["body", "body", "list", "body"]);
  expect(b[2].text).toBe("x\ny");
});

test("parse: block comment groups", () => {
  const b = keys("# T\n\n<!-- block -->\nA.\n\nB.\n<!-- /block -->\n\nC.");
  expect(b.map(x => x.key)).toEqual(["body", "body"]);
  expect(b[0].text).toBe("A.\n\nB.");
});

test("parse: links and sources are one block each", () => {
  const s = parseMarkdown("# T\nslug: t\n\n- [link:t][Go]\n- [link:t][Go2]\n\n[S1](https://a) · [S2](https://b)").sections[0];
  expect(s.blocks.map(x => x.key)).toEqual(["links", "sources"]);
  expect(s.sources.length).toBe(2);
});

test("parse: image block", () => {
  const s = parseMarkdown("# T\nslug: t\n\n![Cat](img/cat.png)").sections[0];
  expect(s.blocks).toMatchObject([{ key: "image", url: "img/cat.png", alt: "Cat" }]);
  expect(s.sources).toEqual([]);
});

test("parse: children comment", () => {
  const s = parseMarkdown("## A\nslug: a\n<!--\nchildren:\n  https://x/y.md\n  ./z.md\n-->\n\nBody.").sections[0];
  expect(s.childSrc).toEqual(["https://x/y.md", "./z.md"]);
  expect(s.blocks).toMatchObject([{ key: "body", text: "Body." }]);
});

test("parse: other comments are dropped", () => {
  expect(keys("# T\nslug: t\n\n<!-- note -->\n\n<!-- multi\nline -->")).toEqual([]);
});

test("parse: raw html is literal", () => {
  expect(keys("# T\n\n<b>hi</b>")[0].text).toBe("<b>hi</b>");
});

test("parse: unresolved link is not an error", () => {
  const r = parseMarkdown("# T\nslug: t\n\n[link:team-a.costs][X]");
  expect(r.errors).toEqual([]);
  expect(r.sections[0].links[0].target).toBeUndefined();
});

test("parse: duplicate slugs", () => {
  const r = parseMarkdown("# A\nslug: a\n\n# B\nslug: a\n");
  expect(r.sections.map(s => s.slug)).toEqual(["a", "a-2"]);
  expect(r.warnings).toContainEqual({ line: 4, msg: 'duplicate slug "a"; using "a-2"' });
  expect(r.errors).toEqual([]);
});

test("markup survives parsing: bold, italic and spans in bodies and headings; slugs come from the plain title", () => {
  const r = parseMarkdown("# The **big** [idea]{size=80}\n\nSay **this** and *that* [loud]{color=#d9432b}.\n");
  expect(r.sections[0].title).toBe("The **big** [idea]{size=80}");
  expect(r.sections[0].slug).toBe("the-big-idea");
  expect(r.sections[0].blocks[0].text).toBe("Say **this** and *that* [loud]{color=#d9432b}.");
});

test("plainText (markdown.ts) matches the app's cases", () => {
  expect(plainText("a **b** [c]{size=9}\n\n*d* \\*e")).toBe("a b c\n\nd *e");
  expect(plainText("[a [b]{size=9} c]{size=20}")).toBe("a b c");
  expect(plainText("5 * 3 and [draft]")).toBe("5 * 3 and [draft]");
  expect(plainText("[t]{b i}")).toBe("t");
});

test("inline links: mid-sentence chips and URLs stay inline; chip-only lines stay chips; dotted paths become ids", () => {
  const r = parseMarkdown("# Top\nslug: top\n\nSee [link:kid][the kid] and [docs](https://d.x) now.\n\n- [link:kid][Go]\n\nAlso [this]{link=top.kid}.\n\n## Kid\nslug: kid\n");
  expect(r.errors).toEqual([]);
  const top = r.sections[0], txt = top.blocks.filter(b => b.key === "body").map(b => b.text).join("\n");
  expect(txt).toContain("See [the kid]{link=kid} and [docs]{href=https://d.x} now.");
  expect(txt).toContain("Also [this]{link=kid}.");
  expect(top.links.map((l: any) => l.label)).toEqual(["Go"]); expect(top.sources).toEqual([]);
});

test("a list item that is only an inline slide link counts as a chip, so exported link lists re-import as lists", () => {
  const r = parseMarkdown("# Top\nslug: top\n\n- [Go to A]{link=a}\n- [B\\*x]{link=a}\n\n## A\nslug: a\n");
  expect(r.errors).toEqual([]);
  expect(r.sections[0].links.map((l: any) => [l.label, l.target])).toEqual([["Go to A", "a"], ["B*x", "a"]]);
  expect(r.sections[0].blocks.map(b => b.key)).toEqual(["links"]);
});

test("a paragraph that is only an inline slide link counts as a chip too", () => {
  const r = parseMarkdown("# Top\nslug: top\n\n[Go to A]{link=a}\n\n[B]{link=a}\n\n## A\nslug: a\n");
  expect(r.sections[0].links.map((l: any) => l.label)).toEqual(["Go to A", "B"]); expect(r.sections[0].blocks.map(b => b.key)).toEqual(["links"]);
});

test("headings inside a multi-line comment are not slides", () => {
  const { sections } = parseMarkdown("# A\nslug: a\n\n<!--\n# Old slide\nDraft.\n-->\n\nKept.");
  expect(sections.map(s => s.slug)).toEqual(["a"]);
  expect(sections[0].children).toEqual([]);
  expect(sections[0].blocks.map(b => b.text)).toEqual(["Kept."]);
});

test("an empty slug line falls back to the generated slug", () => {
  const { sections, warnings, errors } = parseMarkdown("# Hello World\nslug: \n\nHi.");
  expect(sections[0].slug).toBe("hello-world");
  expect(warnings).toEqual([{ line: 1, msg: 'no slug line; using "hello-world"' }]);
  expect(errors).toEqual([]);
});

test("example decks parse without errors", async () => {
  for (const f of new Bun.Glob("examples/**/*.md").scanSync(import.meta.dir)) expect([f, parseMarkdown(await Bun.file(join(import.meta.dir, f)).text()).errors]).toEqual([f, []]);
});
