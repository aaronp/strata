import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "./build";

test("build copies app + decks, writes index, injects static flag", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), '<head>\n<script src="./support.js"></script>\n</head>');
  await Bun.write(join(root, "markdown.ts"), Bun.file("markdown.ts"));
  await Bun.write(join(root, "decks/talk/talk.md"), "# T\n");
  await Bun.write(join(root, "decks/talk/img/x.png"), "png");
  await Bun.write(join(root, "markdown.ts"), Bun.file("markdown.ts"));
  const out = join(root, "dist");
  await build(root, out);
  const app = await Bun.file(join(out, "design/strata.dc.html")).text();
  expect(await Bun.file(join(out, "design/md.js")).exists()).toBe(true);
  expect(app).toContain('<script>window.STRATA_STATIC=true</script>\n<script src="./support.js">');
  expect(await Bun.file(join(out, "decks/talk/img/x.png")).text()).toBe("png");
  expect(await Bun.file(join(out, "decks/index.json")).json()).toEqual([{ slug: "talk", title: "T" }]);
  const index = await Bun.file(join(out, "index.html")).text();
  expect(index).toContain('href="design/strata.dc.html?deck=talk"');
  expect(index).not.toMatch(/href="\//);
  expect(index).not.toContain("New deck"); expect(index).toContain(">Open</button>");
});

test("build fails loudly if the static-flag injection point is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), "<head></head>");
  await expect(build(root, join(root, "dist"))).rejects.toThrow("support.js");
});

test("build: copies all decks and md.js; deck arg redirects", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), '<head>\n<script src="./support.js"></script>\n</head>');
  await Bun.write(join(root, "markdown.ts"), Bun.file("markdown.ts"));
  for (const s of ["talk", "scratch"]) await Bun.write(join(root, `decks/${s}/${s}.md`), `# ${s}\n`);
  const out = join(root, "dist");
  await build(root, out, "talk");
  expect(await Bun.file(join(out, "decks/talk/talk.md")).exists()).toBe(true);
  expect(await Bun.file(join(out, "decks/scratch/scratch.md")).exists()).toBe(true);   // children: links may point at sibling decks
  expect(await Bun.file(join(out, "design/md.js")).exists()).toBe(true);
  const index = await Bun.file(join(out, "index.html")).text();
  expect(index).toContain('<meta http-equiv="refresh" content="0; url=design/strata.dc.html?deck=talk">');
  await expect(build(root, out, "missing")).rejects.toThrow('no deck "missing"');
});

test("build with no decks/ (CI) writes the landing page", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), '<head>\n<script src="./support.js"></script>\n</head>');
  await Bun.write(join(root, "markdown.ts"), Bun.file("markdown.ts"));
  const out = join(root, "dist");
  await build(root, out);
  expect(await Bun.file(join(out, "decks/index.json")).json()).toEqual([]);
  const index = await Bun.file(join(out, "index.html")).text();
  expect(index).toContain("No decks yet."); expect(index).toContain("location.replace(");
});
