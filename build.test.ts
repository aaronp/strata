import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "./build";

test("build copies app + decks, writes index, injects static flag", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), '<head>\n<script src="./support.js"></script>\n</head>');
  await Bun.write(join(root, "decks/talk/deck.json"), JSON.stringify({ nodes: { ROOT: { children: ["a"] }, a: { title: "T" } } }));
  await Bun.write(join(root, "decks/talk/img/x.png"), "png");
  const out = join(root, "dist");
  await build(root, out);
  const app = await Bun.file(join(out, "design/strata.dc.html")).text();
  expect(app).toContain('<script>window.STRATA_STATIC=true</script>\n<script src="./support.js">');
  expect(await Bun.file(join(out, "decks/talk/img/x.png")).text()).toBe("png");
  expect(await Bun.file(join(out, "decks/index.json")).json()).toEqual([{ slug: "talk", title: "T" }]);
  const index = await Bun.file(join(out, "index.html")).text();
  expect(index).toContain('href="design/strata.dc.html?deck=talk"');
  expect(index).not.toMatch(/href="\//);
  expect(index).not.toContain("<form");
});

test("build fails loudly if the static-flag injection point is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), "<head></head>");
  await expect(build(root, join(root, "dist"))).rejects.toThrow("support.js");
});

test("build with a deck publishes only that deck and opens it from the site root", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), '<head>\n<script src="./support.js"></script>\n</head>');
  for (const s of ["talk", "scratch"]) await Bun.write(join(root, `decks/${s}/deck.json`), JSON.stringify({ title: s, nodes: { ROOT: { children: [] } } }));
  const out = join(root, "dist");
  await build(root, out, "talk");
  expect(await Bun.file(join(out, "decks/talk/deck.json")).exists()).toBe(true);
  expect(await Bun.file(join(out, "decks/scratch/deck.json")).exists()).toBe(false);
  expect(await Bun.file(join(out, "decks/index.json")).json()).toEqual([{ slug: "talk", title: "talk" }]);
  const index = await Bun.file(join(out, "index.html")).text();
  expect(index).toContain('<meta http-equiv="refresh" content="0; url=design/strata.dc.html?deck=talk">');
  await expect(build(root, out, "missing")).rejects.toThrow('no deck "missing"');
});
