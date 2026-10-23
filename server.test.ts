import { test, expect, beforeEach } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler, deckList, indexHtml } from "./server";

let root: string;
const layout = (deck: any = {}) => ({ version: 1, deck: { images: {}, customBg: null, ...deck }, slides: {} });
const MD = "# My *Talk*\n\nHello  \r\n\n## Two\n";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "strata-"));
  await mkdir(join(root, "design"));
  await Bun.write(join(root, "design/strata.dc.html"), "<x-dc>app</x-dc>");
  await Bun.write(join(root, "server.ts"), "secret");
  await Bun.write(join(root, "markdown.ts"), Bun.file("markdown.ts"));
  await Bun.write(join(root, "decks/talk/talk.md"), "# My Talk\n");
});

const get = (p: string) => handler(root)(new Request("http://x" + p));

test("serves design and deck files", async () => {
  expect(await (await get("/design/strata.dc.html")).text()).toContain("app");
  expect((await get("/decks/talk/talk.md")).status).toBe(200);
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

test("deckList ignores folders without <slug>.md or with bad names", async () => {
  await mkdir(join(root, "decks/empty"), { recursive: true });
  await Bun.write(join(root, "decks/Bad Name/Bad Name.md"), "# x");
  expect(await deckList(root)).toEqual([{ slug: "talk", title: "My Talk" }]);
});

test("GET /api/decks returns the list", async () => {
  expect(await (await get("/api/decks")).json()).toEqual([{ slug: "talk", title: "My Talk" }]);
});

const put = (slug: string, body: string) => handler(root)(new Request("http://x/api/decks/" + slug, { method: "PUT", body }));
const PNG = "data:image/png;base64," + Buffer.from("fakepng").toString("base64");
const SVG = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'/>");

test("PUT writes md and layout", async () => {
  const res = await put("new-deck", JSON.stringify({ md: MD, layout: layout() }));
  expect(res.status).toBe(200);
  expect(await Bun.file(join(root, "decks/new-deck/new-deck.md")).text()).toBe(MD);
  const raw = await Bun.file(join(root, "decks/new-deck/new-deck-layout.json")).text();
  expect(raw.endsWith("\n")).toBe(true);
  expect(JSON.parse(raw)).toEqual((await res.json()).layout);
});

test("images extracted from layout", async () => {
  const out = (await (await put("new-deck", JSON.stringify({ md: MD, layout: layout({ images: { im1: PNG, im2: PNG }, customBg: SVG }) }))).json()).layout.deck;
  expect(out.images.im1).toMatch(/^img\/[0-9a-f]{12}\.png$/);
  expect(out.images.im2).toBe(out.images.im1);
  expect(out.customBg).toMatch(/^img\/[0-9a-f]{12}\.svg$/);
  expect(await Bun.file(join(root, "decks/new-deck", out.images.im1)).text()).toBe("fakepng");
  expect(await Bun.file(join(root, "decks/new-deck", out.customBg)).text()).toContain("<svg");
});

test("PUT passes already-relative paths through unchanged", async () => {
  const first = (await (await put("talk", JSON.stringify({ md: MD, layout: layout({ images: { im1: PNG } }) }))).json()).layout;
  const second = (await (await put("talk", JSON.stringify({ md: MD, layout: first }))).json()).layout;
  expect(second.deck.images.im1).toBe(first.deck.images.im1);
});

test("PUT rejects missing md, bad slugs and bad bodies without writing", async () => {
  expect((await put("ok", JSON.stringify({ layout: layout() }))).status).toBe(400);
  expect((await put("Bad", JSON.stringify({ md: MD, layout: layout() }))).status).toBe(400);
  expect((await put("..%2Fescape", JSON.stringify({ md: MD, layout: layout() }))).status).toBe(400);
  expect((await put("ok", "not json")).status).toBe(400);
  expect(await Bun.file(join(root, "decks/ok/ok.md")).exists()).toBe(false);
});

test("deckList titles from markdown", async () => {
  await Bun.write(join(root, "decks/talk/talk.md"), MD);
  await Bun.write(join(root, "decks/plain/plain.md"), "no heading\n");
  expect(await deckList(root)).toEqual([{ slug: "plain", title: "plain" }, { slug: "talk", title: "My Talk" }]);
});

test("writes from another origin (e.g. a sandboxed component, Origin: null) are refused", async () => {
  const req = (method: string, path: string, origin: string, body = "x") => handler(root)(new Request("http://x" + path, { method, body, headers: { origin } }));
  expect((await req("PUT", "/api/decks/talk", "null", JSON.stringify({ md: MD, layout: layout() }))).status).toBe(403);
  expect((await req("PUT", "/api/decks/talk", "http://elsewhere.example", JSON.stringify({ md: MD, layout: layout() }))).status).toBe(403);
  expect((await req("PUT", "/api/decks/talk", "http://x", JSON.stringify({ md: MD, layout: layout() }))).status).toBe(200);
});

test("md.js is served and defines StrataMd", async () => {
  const r = await get("/design/md.js");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("javascript");
  const w: any = {};
  new Function("window", await r.text())(w);
  expect(typeof w.StrataMd.parseMarkdown).toBe("function");
});

test("index: open-from-url form and tour link in both variants; the ?src= redirect only static; New deck only dev", () => {
  const tour = 'href="design/strata.dc.html?src=' + encodeURIComponent("https://github.com/aaronp/strata/blob/master/examples/strata-tour/strata-tour.md") + '"';
  for (const dev of [true, false]) {
    const html = indexHtml([], dev);
    expect(html).toContain('placeholder="https://github.com/you/repo/blob/main/talk.md"'); expect(html).toContain(">Open</button>");
    expect(html).toContain(tour); expect(html).toContain("Strata tour");
    expect(html.includes("location.replace('design/strata.dc.html' + location.search)")).toBe(!dev);
    expect(html.includes("New deck")).toBe(dev);
  }
});

test("serves examples/ like decks/", async () => {
  await Bun.write(join(root, "examples/t/t.md"), "# T\n");
  const r = await get("/examples/t/t.md");
  expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store");
  expect((await get("/examples/%2e%2e/server.ts")).status).toBe(404);
});
