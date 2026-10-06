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
