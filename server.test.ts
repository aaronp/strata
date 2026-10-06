import { test, expect, beforeEach } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler, deckList, indexHtml } from "./server";

let root: string;
const deck = (title = "Hello") => ({ nodes: { ROOT: { id: "ROOT", title: "", body: "", children: ["a"] }, a: { id: "a", title, body: "", children: [] } }, images: {}, customBg: null });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "strata-"));
  await mkdir(join(root, "design"));
  await Bun.write(join(root, "design/strata.dc.html"), "<x-dc>app</x-dc>");
  await Bun.write(join(root, "server.ts"), "secret");
  await Bun.write(join(root, "decks/talk/deck.json"), JSON.stringify(deck("My Talk")));
});

const get = (p: string) => handler(root)(new Request("http://x" + p));

test("serves design and deck files", async () => {
  expect(await (await get("/design/strata.dc.html")).text()).toContain("app");
  expect((await get("/decks/talk/deck.json")).status).toBe(200);
});

test("refuses paths outside design/ and decks/", async () => {
  expect((await get("/server.ts")).status).toBe(404);
  expect((await get("/decks/%2e%2e/server.ts")).status).toBe(404);
  expect((await get("/design/..%2Fserver.ts")).status).toBe(404);
});

test("index lists decks with relative links", async () => {
  const html = await (await get("/")).text();
  expect(html).toContain('href="design/strata.dc.html?deck=talk"');
  expect(html).toContain("My Talk");
});

test("deckList ignores folders without deck.json or with bad names", async () => {
  await mkdir(join(root, "decks/empty"), { recursive: true });
  await Bun.write(join(root, "decks/Bad Name/deck.json"), "{}");
  expect(await deckList(root)).toEqual([{ slug: "talk", title: "My Talk" }]);
});

test("GET /api/decks returns the list", async () => {
  expect(await (await get("/api/decks")).json()).toEqual([{ slug: "talk", title: "My Talk" }]);
});

const put = (slug: string, body: string) => handler(root)(new Request("http://x/api/decks/" + slug, { method: "PUT", body }));
const PNG = "data:image/png;base64," + Buffer.from("fakepng").toString("base64");
const SVG = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'/>");

test("PUT extracts data URLs to img/ and writes pretty deck.json", async () => {
  const res = await put("new-deck", JSON.stringify({ ...deck(), images: { im1: PNG, im2: PNG }, customBg: SVG }));
  expect(res.status).toBe(200);
  const out = await res.json();
  expect(out.images.im1).toMatch(/^img\/[0-9a-f]{12}\.png$/);
  expect(out.images.im2).toBe(out.images.im1);                      // same bytes, same file
  expect(out.customBg).toMatch(/^img\/[0-9a-f]{12}\.svg$/);
  expect(await Bun.file(join(root, "decks/new-deck", out.images.im1)).text()).toBe("fakepng");
  expect(await Bun.file(join(root, "decks/new-deck", out.customBg)).text()).toContain("<svg");
  const raw = await Bun.file(join(root, "decks/new-deck/deck.json")).text();
  expect(raw).toContain('\n  "nodes"');
  expect(raw.endsWith("\n")).toBe(true);
  expect(JSON.parse(raw)).toEqual(out);
});

test("PUT passes already-relative paths through unchanged", async () => {
  const first = await (await put("talk", JSON.stringify({ ...deck(), images: { im1: PNG } }))).json();
  const second = await (await put("talk", JSON.stringify(first))).json();
  expect(second.images.im1).toBe(first.images.im1);
});

test("PUT rejects bad slugs and bad bodies without writing", async () => {
  expect((await put("Bad", JSON.stringify(deck()))).status).toBe(400);
  expect((await put("..%2Fescape", JSON.stringify(deck()))).status).toBe(400);
  expect((await put("ok", "not json")).status).toBe(400);
  expect((await put("ok", JSON.stringify({ images: {} }))).status).toBe(400);
  expect(await Bun.file(join(root, "decks/ok/deck.json")).exists()).toBe(false);
});

test("deckList prefers the deck's own title", async () => {
  await Bun.write(join(root, "decks/talk/deck.json"), JSON.stringify({ ...deck("First slide"), title: "Named Deck" }));
  expect(await deckList(root)).toEqual([{ slug: "talk", title: "Named Deck" }]);
});

const post = (slug: string, body: string) => handler(root)(new Request("http://x/api/import/" + slug, { method: "POST", body }));
const MDX = (body: string) => `# Hello\nslug: hello\n\n${body}\n`;

test("POST /api/import creates a deck from markdown", async () => {
  const res = await post("fresh", MDX("Body text."));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ slug: "fresh", warnings: [] });
  const d = await Bun.file(join(root, "decks/fresh/deck.json")).json();
  expect(d.nodes.ROOT.children).toEqual(["hello"]);
  expect(d.source).toBeUndefined();
});

test("POST /api/import reports markdown errors with line numbers and writes nothing", async () => {
  const res = await post("broken", "# A\nslug: a\n\n[link:nope][X]\n");
  expect(res.status).toBe(400);
  expect((await res.json()).errors).toEqual([{ line: 4, msg: 'link target "nope" not found' }]);
  expect(await Bun.file(join(root, "decks/broken/deck.json")).exists()).toBe(false);
  expect((await post("Bad Slug", MDX("x"))).status).toBe(400);
});

test("POST /api/import re-import keeps layout edits and the recorded source", async () => {
  await post("talk", MDX("Old."));
  const p = join(root, "decks/talk/deck.json");
  const d = await Bun.file(p).json();
  d.nodes.hello.frames[0].layers[1].x = 42; d.source = "notes/talk.md";
  await Bun.write(p, JSON.stringify(d));
  await post("talk", MDX("New."));
  const d2 = await Bun.file(p).json();
  expect(d2.nodes.hello.frames[0].layers[1]).toMatchObject({ x: 42, text: "New." });
  expect(d2.source).toBe("notes/talk.md");
});

test("dev index offers markdown import; the published index does not", async () => {
  expect(await (await get("/")).text()).toContain('id="imp"');
  expect(indexHtml([], false)).not.toContain('id="imp"');
});
