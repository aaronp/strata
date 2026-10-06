import { test, expect, beforeEach } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler, deckList } from "./server";

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
