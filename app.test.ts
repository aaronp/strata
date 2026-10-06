// Drives the app's logic class (design/strata.dc.html) with React/DOM stubbed out and fetch wired to the real dev-server handler.
import { test, expect, beforeEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler } from "./server";

const js = (await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text()).split('<script type="text/x-dc" data-dc-script>')[1].split("</script>")[0];
class DCLogic { state: any; setState(u: any, cb?: () => void) { this.state = { ...this.state, ...(typeof u === "function" ? u(this.state) : u) }; cb?.(); } forceUpdate() {} }

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "strata-app-")); });

async function mount(search: string, opts: { isStatic?: boolean; settle?: boolean } = {}) {
  const store: Record<string, string> = {}, listeners: Record<string, Function> = {};
  const g = {
    location: { search }, window: { STRATA_STATIC: !!opts.isStatic, addEventListener: (t: string, f: Function) => (listeners[t] = f), removeEventListener() {} },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) },
    fetch: (u: string, o: RequestInit = {}) => handler(root)(new Request(new URL(u, "http://x/design/strata.dc.html"), o)),
    setTimeout, requestAnimationFrame: () => {},
  };
  const C = new Function("DCLogic", "React", ...Object.keys(g), js + "\nreturn Component;")(DCLogic, { createRef: () => ({ current: null }) }, ...Object.values(g));
  const c = new C(); c.componentDidMount();
  if (opts.settle !== false) await Bun.sleep(30);
  return { c, listeners };
}

test("new deck saves, reloads clean, keeps relative image paths", async () => {
  let { c } = await mount("?deck=talk");
  expect(c.isDirty()).toBe(true);
  c.setState({ images: { im1: "data:image/png;base64," + Buffer.from("png").toString("base64") } });
  await c.save();
  expect(c.isDirty()).toBe(false);
  ({ c } = await mount("?deck=talk"));
  expect(c.isDirty()).toBe(false);
  expect(c._past.length).toBe(0);
  expect(c.state.images.im1).toMatch(/^\.\.\/decks\/talk\/img\/[0-9a-f]{12}\.png$/);
});

test("save refuses to overwrite a deck that failed to load", async () => {
  await Bun.write(join(root, "decks/talk/deck.json"), "<<<<<<< HEAD\n{ broken");
  const { c } = await mount("?deck=talk");
  expect(c.state.saveMsg).toContain("Could not load");
  await c.save();
  expect(await Bun.file(join(root, "decks/talk/deck.json")).text()).toStartWith("<<<<<<< HEAD");
  expect(c.state.saveMsg).toContain("Could not load");
});

test("save before the load finishes is a no-op", async () => {
  await Bun.write(join(root, "decks/talk/deck.json"), JSON.stringify({ nodes: { ROOT: { id: "ROOT", children: ["x"] }, x: { id: "x", title: "Real", body: "", children: [] } } }));
  const { c } = await mount("?deck=talk", { settle: false });
  await c.save();
  await Bun.sleep(30);
  expect((await Bun.file(join(root, "decks/talk/deck.json")).json()).nodes.x.title).toBe("Real");
});

test("leaving the page with unsaved deck edits asks first", async () => {
  const { c, listeners } = await mount("?deck=talk");
  const ev = { prevented: false, preventDefault() { this.prevented = true; }, returnValue: undefined as any };
  listeners.beforeunload(ev);
  expect(ev.prevented).toBe(true);                     // new, unsaved deck
  await c.save();
  const ev2 = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners.beforeunload(ev2);
  expect(ev2.prevented).toBe(false);
});

test("static mode presents and never saves", async () => {
  await mount("?deck=talk");
  const { c } = await mount("?deck=talk", { isStatic: true });
  expect(c.state.mode).toBe("present");
  await c.save();
  expect(await Bun.file(join(root, "decks/talk/deck.json")).exists()).toBe(false);
});
