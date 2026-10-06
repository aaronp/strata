# Save-and-Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone → `make dev` → author a deck → save it into `decks/<slug>/` → `make build` → GitHub Pages serves it present-only.

**Architecture:** A dependency-free bun server (`server.ts`) serves `design/` and `decks/` statically and exposes a `PUT /api/decks/:slug` endpoint that writes `deck.json` and extracts `data:` images to files. The existing prototype app gains `?deck=<slug>` loading, a Save button / ⌘S, and a `window.STRATA_STATIC` present-only switch. `build.ts` copies everything to `dist/`, writes an index page, and injects the static flag. A GH Actions workflow deploys `dist/`.

**Tech Stack:** bun (runtime, test runner, `Bun.serve`, `Bun.file`/`Bun.write`), node:fs/promises, the existing DC prototype runtime (`design/support.js`, React 18 from unpkg), GNU/BSD make, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-save-and-publish-design.md`

## Global Constraints

- No npm dependencies. No `package.json`. bun built-ins and `node:` modules only.
- Slugs must match `^[a-z0-9-]+$` everywhere (server and client).
- Dev server binds to `127.0.0.1` only. Port from `PORT`, default `3000`.
- `deck.json` fields (exactly): `nodes, bg, customBg, customAspect, opacity, base, offset, margin, gap, tone, speed, tdef, images`. No UI state.
- Images in `deck.json` are paths relative to the deck folder: `img/<sha1-first-12-hex>.<ext>`.
- `deck.json` is pretty-printed (`JSON.stringify(x, null, 2)` + trailing newline).
- All URLs in the built site are relative (no leading `/`), so it works under `https://<user>.github.io/<repo>/`.
- App file is `design/strata.dc.html` (renamed from `design/Strata v7.dc.html`). The DC runtime only requires the `.dc.html` suffix.
- Do not edit `design/support.js` (generated runtime).

## Review Focus

1. **Re-saving an already-saved deck**: images that are already `img/x.png` must pass through unchanged, and saving the same data URL twice yields one file. Test in Task 2.
2. **Path traversal**: `PUT /api/decks/..%2Fx` and `GET /decks/%2e%2e/server.ts` must not touch files outside `design/` or `decks/`. Test in Tasks 1 and 2.
3. **Garbage request body** (non-JSON, or JSON without `nodes.ROOT`): 400, and nothing is written. Test in Task 2.
4. **Non-base64 SVG data URLs** (`data:image/svg+xml,%3Csvg…`), which is how an SVG custom background often arrives: decoded to a real `.svg` file. Test in Task 2.
5. **Site served from a subpath**: the built `index.html` contains no root-absolute `href="/…"`. Test in Task 4.

---

### Task 1: Rename app, static dev server, Makefile

**Files:**
- Rename: `design/Strata v7.dc.html` → `design/strata.dc.html`
- Create: `server.ts`
- Create: `server.test.ts`
- Create: `Makefile`
- Create: `.gitignore`

**Interfaces:**
- Produces (from `server.ts`):
  - `export const SLUG: RegExp` → `/^[a-z0-9-]+$/`
  - `export type DeckInfo = { slug: string; title: string }`
  - `export async function deckList(root: string): Promise<DeckInfo[]>`: sorted by slug; only dirs matching SLUG that contain `deck.json`; title = title of the first top-level node, falling back to slug.
  - `export function indexHtml(decks: DeckInfo[], dev: boolean): string`
  - `export function handler(root: string): (req: Request) => Promise<Response>`

- [ ] **Step 1: Rename the app file**

```bash
git mv "design/Strata v7.dc.html" design/strata.dc.html
```

- [ ] **Step 2: Write the failing tests**

`server.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test`
Expected: FAIL, "Cannot find module './server'"

- [ ] **Step 4: Implement `server.ts`**

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const SLUG = /^[a-z0-9-]+$/;
export type DeckInfo = { slug: string; title: string };

export async function deckList(root: string): Promise<DeckInfo[]> {
  const dir = join(root, "decks");
  const ents = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: DeckInfo[] = [];
  for (const e of ents) {
    if (!e.isDirectory() || !SLUG.test(e.name)) continue;
    const f = Bun.file(join(dir, e.name, "deck.json"));
    if (!(await f.exists())) continue;
    const d = await f.json().catch(() => null);
    const first = d?.nodes?.[d?.nodes?.ROOT?.children?.[0]];
    out.push({ slug: e.name, title: first?.title || e.name });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function indexHtml(decks: DeckInfo[], dev: boolean): string {
  const items = decks.map(d => `<li><a href="design/strata.dc.html?deck=${d.slug}">${esc(d.title)}</a> <code>${d.slug}</code></li>`).join("\n");
  const form = dev ? `<form action="design/strata.dc.html"><input name="deck" required pattern="[a-z0-9-]+" placeholder="new-deck-slug"> <button>New deck</button></form>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strata decks</title>
<style>body{font:16px system-ui,sans-serif;background:#f2eee5;color:#1d1b17;max-width:640px;margin:48px auto;padding:0 16px}a{color:#d9432b}code{color:#6b6458;font-size:12px}li{margin:8px 0}</style></head>
<body><h1>Strata</h1><ul>${items || "<li>No decks yet.</li>"}</ul>${form}</body></html>`;
}

export function handler(root: string) {
  return async (req: Request): Promise<Response> => {
    let p: string;
    try { p = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response("bad path", { status: 400 }); }
    if (p === "/api/decks" && req.method === "GET") return Response.json(await deckList(root));
    if (p === "/" || p === "/index.html") return new Response(indexHtml(await deckList(root), true), { headers: { "content-type": "text/html; charset=utf-8" } });
    if ((p.startsWith("/design/") || p.startsWith("/decks/")) && !p.includes("..")) {
      const f = Bun.file(join(root, p));
      if (await f.exists()) return new Response(f, { headers: { "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ hostname: "127.0.0.1", port, fetch: handler(process.cwd()) });
  console.log(`Strata dev server: http://127.0.0.1:${port}/`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test`
Expected: 5 pass, 0 fail

- [ ] **Step 6: Add `Makefile` and `.gitignore`**

`Makefile` (recipe lines are TABs):
```make
PORT ?= 3000
.PHONY: dev build preview test clean

dev:
	PORT=$(PORT) bun server.ts

test:
	bun test

clean:
	rm -rf dist
```

`.gitignore`:
```
dist/
```

- [ ] **Step 7: Smoke test the dev server**

Run: `make dev` (background), then `curl -s localhost:3000/ | head -3` and `curl -sI "localhost:3000/design/strata.dc.html" | head -1`
Expected: HTML containing `<h1>Strata</h1>` and `HTTP/1.1 200 OK`. Open `http://127.0.0.1:3000/design/strata.dc.html` in a browser; the app renders as before. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A design server.ts server.test.ts Makefile .gitignore
git commit -m "Add bun dev server and Makefile; rename app to strata.dc.html"
```

---

### Task 2: Save endpoint with image extraction

**Files:**
- Modify: `server.ts` (add `saveDeck`, PUT route)
- Modify: `server.test.ts` (append tests)

**Interfaces:**
- Consumes: `SLUG`, `handler(root)` from Task 1.
- Produces:
  - `export async function saveDeck(root: string, slug: string, deck: any): Promise<any>`: writes `decks/<slug>/deck.json` and returns the rewritten deck (data URLs replaced by `img/<hash>.<ext>`).
  - HTTP: `PUT /api/decks/:slug`, body = deck JSON → 200 + rewritten deck JSON; 400 on bad slug or body.

- [ ] **Step 1: Write the failing tests** (append to `server.test.ts`)

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test`
Expected: the 3 new tests FAIL (PUT returns 404)

- [ ] **Step 3: Implement** (add to `server.ts`; add `import { createHash } from "node:crypto";` at top)

```ts
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" };

async function extract(url: unknown, imgDir: string): Promise<unknown> {
  if (typeof url !== "string") return url;
  const m = /^data:([^;,]+)((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(url);
  if (!m) return url;
  const bytes = m[3] ? Buffer.from(m[4], "base64") : Buffer.from(decodeURIComponent(m[4]));
  const name = createHash("sha1").update(bytes).digest("hex").slice(0, 12) + "." + (EXT[m[1]] ?? "bin");
  await Bun.write(join(imgDir, name), bytes);
  return "img/" + name;
}

export async function saveDeck(root: string, slug: string, deck: any) {
  const dir = join(root, "decks", slug), imgDir = join(dir, "img");
  const images: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(deck.images ?? {})) images[k] = await extract(v, imgDir);
  const out = { ...deck, images, customBg: deck.customBg ? await extract(deck.customBg, imgDir) : null };
  await Bun.write(join(dir, "deck.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}
```

In `handler`, before the `/` route:
```ts
    const m = /^\/api\/decks\/(.+)$/.exec(p);
    if (m && req.method === "PUT") {
      if (!SLUG.test(m[1])) return new Response("bad slug", { status: 400 });
      const deck = await req.json().catch(() => null);
      if (!deck?.nodes?.ROOT) return new Response("bad deck: expected { nodes: { ROOT } }", { status: 400 });
      return Response.json(await saveDeck(root, m[1], deck));
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: 8 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add server.ts server.test.ts
git commit -m "Add PUT /api/decks/:slug with data-URL image extraction"
```

---

### Task 3: App loads `?deck=`, saves with ⌘S, honours STRATA_STATIC

**Files:**
- Modify: `design/strata.dc.html`
  - Script constants block (after the `const KEY = …` line, ~line 644)
  - `state` initializer (~line 696, `mode: 'build'`)
  - `componentDidMount` (~lines 702–713)
  - `componentDidUpdate` (~lines 736–744)
  - `onKey` (~line 1003; and the Escape-to-build line ~1035)
  - render values (~lines 1311–1314: `deckTitle`, `keyHint`, `modeTabs`)
  - header template (~lines 31–36, the undo/redo `sc-if`)

**Interfaces:**
- Consumes: `GET ../decks/<slug>/deck.json` (static file), `PUT /api/decks/<slug>` from Task 2 (returns rewritten deck with `img/…` paths).
- Produces: `window.STRATA_STATIC` (set by Task 4's build) is read here; the app URL contract is `design/strata.dc.html?deck=<slug>`.

No automated test harness exists for the DC app; verification is a manual browser check (Step 7).

- [ ] **Step 1: Add constants and helpers** after the `const KEY = 'strata-v7', …` line:

```js
const DECK = (s => s && /^[a-z0-9-]+$/.test(s) ? s : null)(new URLSearchParams(location.search).get('deck'));
const DECK_BASE = DECK ? '../decks/' + DECK + '/' : '';
const STATIC = !!window.STRATA_STATIC;
const UIKEY = 'strata-ui';
const DECK_FIELDS = ['nodes', 'bg', 'customBg', 'customAspect', 'opacity', 'base', 'offset', 'margin', 'gap', 'tone', 'speed', 'tdef', 'images'];
const absUrl = v => typeof v === 'string' && v && !/^(data:|blob:|https?:|\/)/.test(v) ? DECK_BASE + v : v;
const relUrl = v => typeof v === 'string' && DECK_BASE && v.startsWith(DECK_BASE) ? v.slice(DECK_BASE.length) : v;
const mapImgs = (im, f) => Object.fromEntries(Object.entries(im || {}).map(([k, v]) => [k, f(v)]));
```

- [ ] **Step 2: Force present mode when static.** In the `state = { … }` initializer change `mode: 'build'` to `mode: STATIC ? 'present' : 'build'`.

- [ ] **Step 3: Load from deck file.** Replace the first `try { … } catch (e) {}` block in `componentDidMount` (the one reading `localStorage.getItem(KEY)`) with:

```js
    if (DECK) {
      try { const ui = JSON.parse(localStorage.getItem(UIKEY) || 'null'); if (ui) this.setState(ui); } catch (e) {}
      this.loadDeck();
    } else try {
      const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('strata-v6') || 'null');
      try { const im = JSON.parse(localStorage.getItem(IKEY) || 'null'); if (im) this.setState({ images: im }); } catch (e) {}
      if (s && s.nodes && s.nodes.ROOT) this.setState({ ...s, cur: s.nodes[s.cur] ? s.cur : s.nodes.ROOT.children[0], prev: null, phase: 'idle', customBg: localStorage.getItem(BGKEY) || null });
    } catch (e) {}
    if (STATIC) this.setState({ mode: 'present' });
```

Add these methods right after `componentDidMount`:

```js
  markSaved() { this._savedRefs = DECK_FIELDS.map(k => this.state[k]); this.forceUpdate(); }
  isDirty() { const S = this.state; return !this._savedRefs || DECK_FIELDS.some((k, i) => S[k] !== this._savedRefs[i]); }
  async loadDeck() {
    try {
      const r = await fetch(DECK_BASE + 'deck.json', { cache: 'no-store' });
      if (r.status === 404 && !STATIC) return;                 // new deck: keep seed(), stays dirty until first save
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(); if (!d.nodes || !d.nodes.ROOT) throw new Error('not a deck');
      const pick = Object.fromEntries(DECK_FIELDS.filter(k => k in d).map(k => [k, d[k]]));
      this._lastNodes = d.nodes;                               // don't record the load as an undo step
      this.setState({ ...pick, images: mapImgs(d.images, absUrl), customBg: d.customBg ? absUrl(d.customBg) : null,
        cur: d.nodes.ROOT.children[0], prev: null, phase: 'idle' }, () => this.markSaved());
    } catch (e) { this.setState({ saveMsg: 'Could not load deck "' + DECK + '": ' + e.message }); }
  }
  async save() {
    if (!DECK || STATIC || this.state.saving) return;
    const S = this.state; const body = Object.fromEntries(DECK_FIELDS.map(k => [k, S[k]]));
    body.images = mapImgs(S.images, relUrl); body.customBg = S.customBg ? relUrl(S.customBg) : null;
    this.setState({ saving: true, saveMsg: null });
    try {
      const r = await fetch('/api/decks/' + DECK, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
      const d = await r.json();
      // Only adopt the server's image paths if nothing changed while saving; otherwise stay dirty and let the next save catch up.
      if (DECK_FIELDS.every(k => this.state[k] === S[k])) this.setState({ saving: false, images: mapImgs(d.images, absUrl), customBg: d.customBg ? absUrl(d.customBg) : null }, () => this.markSaved());
      else this.setState({ saving: false });
    } catch (e) { this.setState({ saving: false, saveMsg: 'Save failed: ' + e.message }); }
  }
```

- [ ] **Step 4: Stop writing deck data to localStorage in deck mode.** In `componentDidUpdate`, wrap the three `localStorage.setItem` lines (KEY, IKEY, BGKEY) so they run only when `!DECK`, and add a UI-prefs write for deck mode:

```js
    if (!DECK) {
      const d = JSON.stringify({ nodes: S.nodes, cur: S.cur, mode: S.mode, view: S.view, rtab: S.rtab, bg: S.bg, customAspect: S.customAspect, opacity: S.opacity, base: S.base, offset: S.offset, margin: S.margin, gap: S.gap, tone: S.tone, speed: S.speed, navW: S.navW, rightW: S.rightW, tdef: S.tdef, secOpen: S.secOpen });
      if (d !== this._d) { this._d = d; try { localStorage.setItem(KEY, d); } catch (e) {} }
      if (S.images !== this._im) { this._im = S.images; try { localStorage.setItem(IKEY, JSON.stringify(S.images)); } catch (e) {} }
      if (S.customBg !== this._bg) { this._bg = S.customBg; try { if (S.customBg) localStorage.setItem(BGKEY, S.customBg); } catch (e) {} }
    } else if (!STATIC) {
      const u = JSON.stringify({ navW: S.navW, rightW: S.rightW, secOpen: S.secOpen, view: S.view, rtab: S.rtab });
      if (u !== this._u) { this._u = u; try { localStorage.setItem(UIKEY, u); } catch (e) {} }
    }
```

- [ ] **Step 5: Keys.** At the very top of `onKey`, after the `const t = e.target; …` line, insert:

```js
    if ((e.metaKey || e.ctrlKey) && (k === 's' || k === 'S')) { e.preventDefault(); this.save(); return; }
```

Change the present-mode Escape line from `else if (k === 'Escape') this.setState({ mode: 'build' });` to:

```js
      else if (k === 'Escape' && !STATIC) this.setState({ mode: 'build' });
```

- [ ] **Step 6: Render values and header.** In the render-values object, replace the `keyHint` and `modeTabs` entries and add `hasDeck`, `save`, `saveLabel`:

```js
      deckTitle: name(N.ROOT.children[0]), keyHint: S.saveMsg || (isPresent ? '← → ↑ ↓  ·  Space next  ·  / search' + (STATIC ? '' : '  ·  Esc') : ''),
      modeTabs: STATIC ? [] : [{ label: 'Build', ...tab(!isPresent), onClick: () => this.setState({ mode: 'build' }) }, { label: 'Present', ...tab(isPresent), onClick: () => this.setState({ mode: 'present', query: '' }) }],
      hasDeck: !!DECK && !STATIC, save: () => this.save(), saveLabel: S.saving ? 'Saving…' : this.isDirty() ? '● Save' : '✓ Saved',
```

In the header template, inside the `<sc-if value="{{ isBuild }}">` that holds Undo/Redo, after the Redo `<button>` and before its closing `</div>`, add:

```html
        <sc-if value="{{ hasDeck }}">
          <button onClick="{{ save }}" title="Save to decks/ (⌘S)" style="height:30px;padding:0 12px;border:1px solid #1d1b17;border-radius:8px;background:#1d1b17;color:#fbf9f4;cursor:pointer;font-size:13px;white-space:nowrap" style-hover="background:#3a362f">{{ saveLabel }}</button>
        </sc-if>
```

- [ ] **Step 7: Manual verification** (`make dev`, browser at `http://127.0.0.1:3000/`)
  1. Type `example` in the New deck box and submit. The app opens with the seed deck and the button reads `● Save` (a new deck is unsaved). No console errors.
  2. Rename a slide, then press ⌘S. The button shows `✓ Saved`, and `decks/example/deck.json` exists and is pretty-printed.
  3. Paste or drop an image into a slide and save. `decks/example/img/<hash>.png` exists, and `deck.json` has `"images": { "im…": "img/<hash>.png" }`.
  4. Reload the page. The deck, image and title persist, and Undo is greyed out (the load is not an undo step).
  5. Open `http://127.0.0.1:3000/design/strata.dc.html` with no `?deck`. It still uses localStorage as before.
  6. Stop the server and press ⌘S. The header shows `Save failed: …` and the button stays `● Save`.

- [ ] **Step 8: Commit** (including `decks/example`, which ships as the repo's sample deck)

```bash
git add design/strata.dc.html decks/example
git commit -m "App: load and save decks from decks/<slug>, static present-only flag"
```

---

### Task 4: Static build

**Files:**
- Create: `build.ts`
- Create: `build.test.ts`
- Modify: `Makefile` (add `build`, `preview`)

**Interfaces:**
- Consumes: `deckList(root)`, `indexHtml(decks, dev)` from `server.ts`.
- Produces: `export async function build(root: string, out: string): Promise<void>`; `make build` → `dist/`.

- [ ] **Step 1: Write the failing test**

`build.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test build.test.ts`
Expected: FAIL, "Cannot find module './build'"

- [ ] **Step 3: Implement `build.ts`**

```ts
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { deckList, indexHtml } from "./server";

const HOOK = '<script src="./support.js">';

export async function build(root: string, out: string) {
  await rm(out, { recursive: true, force: true });
  await cp(join(root, "design"), join(out, "design"), { recursive: true });
  if (existsSync(join(root, "decks"))) await cp(join(root, "decks"), join(out, "decks"), { recursive: true });
  const app = join(out, "design/strata.dc.html");
  const html = await Bun.file(app).text();
  if (!html.includes(HOOK)) throw new Error(`build: ${HOOK} not found in strata.dc.html; cannot inject STRATA_STATIC`);
  await Bun.write(app, html.replace(HOOK, "<script>window.STRATA_STATIC=true</script>\n" + HOOK));
  const decks = await deckList(root);
  await Bun.write(join(out, "decks/index.json"), JSON.stringify(decks, null, 2) + "\n");
  await Bun.write(join(out, "index.html"), indexHtml(decks, false));
}

if (import.meta.main) {
  await build(process.cwd(), join(process.cwd(), "dist"));
  console.log("Built dist/");
}
```

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: 10 pass, 0 fail

- [ ] **Step 5: Makefile targets.** Add to `Makefile` (TAB-indented recipes) and extend `.PHONY` (already lists `build preview`):

```make
build:
	bun build.ts

preview: build
	bunx serve dist -l $(PORT)
```

- [ ] **Step 6: Manual verification**

Run: `make preview`, then open the printed URL.
Expected: the index lists "example". Clicking it opens the deck in Present mode, with no Build/Present tabs, no Save/Undo, and Esc doesn't switch to build. The image from Task 3 renders and arrow keys navigate.

- [ ] **Step 7: Commit**

```bash
git add build.ts build.test.ts Makefile
git commit -m "Add static build to dist/ with present-only flag"
```

---

### Task 5: GitHub Pages workflow and README

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md` (prepend a Usage section; replace `Strata v7.dc.html` references with `strata.dc.html`)

**Interfaces:**
- Consumes: `make build` → `dist/` (Task 4).

- [ ] **Step 1: Workflow** `.github/workflows/pages.yml`:

```yaml
name: pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun test
      - run: make build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README.** Insert directly under the `# Handoff: Strata …` title:

```markdown
## Usage

Requires [bun](https://bun.sh).

| Command | What it does |
|---|---|
| `make dev` | Local editor at http://127.0.0.1:3000/ (pick or create a deck, ⌘S saves to `decks/<slug>/`) |
| `make test` | Run server/build tests |
| `make build` | Present-only static site in `dist/` |
| `make preview` | Build, then serve `dist/` locally |

Publish: commit `decks/`, push to `main`. In the repo's **Settings → Pages**, set **Source: GitHub Actions** once; `.github/workflows/pages.yml` deploys `dist/` on every push.

Decks live in `decks/<slug>/deck.json`, with images extracted to `decks/<slug>/img/`. Opening the app without `?deck=` uses browser storage only (scratch mode).
```

Then: `sed -i '' 's/Strata v7\.dc\.html/strata.dc.html/g' README.md`

- [ ] **Step 3: Verify**

Run: `bun test && make build && ls dist && grep -c "strata.dc.html" README.md`
Expected: tests pass; `dist` contains `design decks index.html`; the grep count is ≥ 1 and `grep "Strata v7" README.md` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml README.md
git commit -m "Add GitHub Pages workflow and usage docs"
```
