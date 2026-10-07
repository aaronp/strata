# Title Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in title page: the hidden `ROOT` node becomes a navigable slide above the top row, whose background is the whole canvas scaled into the slide (zoom/pan adjustable), with a camera-zoom transition to and from the top row.

**Architecture:**
- Everything lives in the app's logic class and template in `design/strata.dc.html`.
- A deck flag `titlePage` makes `ROOT` a valid `cur`. `neighbour`/`step`/`nav` learn about it.
- A new `titleCam()` method computes ROOT's camera transform, and `camOf` emits `translate(…) scale(…)` for every slide so CSS can interpolate the zoom.
- `derive()`/`layout()` are untouched.

**Tech Stack:** Plain JS inside a Design Component (`<script data-dc-script>` class `Component`), with bun tests (`app.test.ts` drives the logic class headless; `importer.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-07-title-page-design.md`

## Global Constraints
- Decks without `titlePage` behave exactly as before: no new slide, `neighbour('<top>', 'up')` is `null`, `camOf` for normal slides keeps the same translate.
- `derive()` and `layout()` are unchanged. ROOT never enters `D.order` and never gets a `L.rect`.
- New deck fields: `titlePage?: boolean` and `titleView?: { zoom, x, y }` (default `{ zoom: 1, x: 0.5, y: 0.5 }`). Both go in `DECK_FIELDS`.
- `titleView` is not on undo, the same as every other Canvas setting.
- Match the file's style: dense one-line methods, `this.state` as `S`, `N` for nodes, `f3()` for formatted numbers.
- Run tests with `bun test` (or `make test`). The baseline is 116 passing.

## Review Focus
1. **The flag is turned off while on ROOT, or a deck saved `cur` as ROOT then lost the flag.** Expected: land on the first top-level slide, never a blank or crashed stage. Pinned in Task 1 (`setTitlePage(false)` and `curId()` with the flag off).
2. **Tree keyboard and buttons on ROOT** (Enter, Tab, Shift+Tab, ⌫, drag-drop onto ROOT, Copy deck "Replace this slide"). Expected: nothing happens, except Tab/"+ below", which adds a top-level slide. No crash from `D.parent.ROOT` being `undefined`. Pinned in Task 1.
3. **A canvas narrower than 16:9** (e.g. a one-level deck with two slides). Expected: Cover is ≥ 1, there's no letterbox gap at Fit, and pan clamps. Pinned in Task 2 (`titleCover` floor).
4. **Rendering while on ROOT:** breadcrumbs, the ←/→ pills, `label()` and the slide-link dropdown all read `D.parent[cur]`. Expected: no exception from `renderVals()` on ROOT. Pinned in Task 3 (`renderVals()` on ROOT).
5. **Re-importing the markdown of a deck with a title page.** Expected: ROOT's title, frames and the deck flags survive. Pinned in Task 1 (`importer.test.ts`).

---

### Task 1: Data and navigation

**Files:**
- Modify: `design/strata.dc.html`. Code locations are given by snippet; line numbers are approximate.
- Test: `app.test.ts`, `importer.test.ts`

**Interfaces:**
- Produces:
  - `setTitlePage(on: boolean): void`
  - `curId()`: returns `'ROOT'` when the flag is on and `cur === 'ROOT'`
  - `neighbour('ROOT', dir, D)`
  - `nav()` sets `state.type = 'zoom'` for any move to or from ROOT
  - state fields `titlePage`, `titleView`, and `lastChild.ROOT`

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`)

```ts
async function titleDeck(fields: object = { titlePage: true }) {
  await writeDeck("talk", {
    ROOT: slideNode("ROOT", "Big picture", ["a", "b"]),
    a: slideNode("a", "A", ["a1", "a2"]), a1: slideNode("a1", "A1"), a2: slideNode("a2", "A2"), b: slideNode("b", "B"),
  }, fields);
  return (await mount("?deck=talk")).c;
}

test("title page off: ROOT is unreachable and up from the top row goes nowhere", async () => {
  const c = await titleDeck({});
  expect(c.state.cur).toBe("a");
  expect(c.neighbour("a", "up", c.derive())).toBeNull();
  c.nav("ROOT", "jump"); expect(c.state.cur).toBe("a");
  c.setState({ cur: "ROOT" }); expect(c.curId()).toBe("a");
});

test("title page on: the deck opens on ROOT; up/down link it to the top row with a zoom transition", async () => {
  const c = await titleDeck();
  expect(c.state.cur).toBe("ROOT"); expect(c.curId()).toBe("ROOT");
  const D = c.derive();
  for (const d of ["left", "right", "up"]) expect(c.neighbour("ROOT", d, D)).toBeNull();
  expect(c.neighbour("ROOT", "down", D)).toBe("a");
  c.go("down"); expect(c.state.cur).toBe("a"); expect(c.state.type).toBe("zoom");
  c.go("right"); expect(c.state.cur).toBe("b"); expect(c.state.type).toBe("swipe");
  c.go("up"); expect(c.state.cur).toBe("ROOT"); expect(c.state.type).toBe("zoom");
  c.go("down"); expect(c.state.cur).toBe("b");                 // back to the last-visited top-level slide
  expect(c.derive().order).not.toContain("ROOT");              // layout untouched
});

test("Space walks from ROOT into the deck; Shift+Space walks back and stops at ROOT", async () => {
  const c = await titleDeck();
  c.step(1); expect(c.state.cur).toBe("a");
  c.step(1); expect(c.state.cur).toBe("a1");
  c.step(-1); c.step(-1); expect(c.state.cur).toBe("ROOT");
  c.step(-1); expect(c.state.cur).toBe("ROOT");
});

test("turning the title page on seeds its title once and goes there; off keeps it and leaves ROOT", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a"]), a: slideNode("a", "A") }, { title: "My talk" });
  const { c } = await mount("?deck=talk");
  c.setTitlePage(true);
  expect(c.state.titlePage).toBe(true); expect(c.state.cur).toBe("ROOT"); expect(c.state.nodes.ROOT.title).toBe("My talk");
  c.setNode("ROOT", { title: "Renamed" });
  c.setTitlePage(false);
  expect(c.state.cur).toBe("a"); expect(c.state.nodes.ROOT.title).toBe("Renamed");
  c.setTitlePage(true); expect(c.state.nodes.ROOT.title).toBe("Renamed");
});

test("ROOT can't be deleted, given a sibling, outdented, dropped beside, or replaced by a copied deck", async () => {
  const c = await titleDeck(); const before = c.state.nodes;
  c.addPeer("ROOT"); c.remove("ROOT"); c.outdent("ROOT");
  expect(c.state.nodes).toBe(before);
  c._tpos = { ROOT: { x: 0, y: 0 } }; expect(c.treeDropAt(10, 10, "a")).toBeNull();
  await deckBWithImage(); await c.copyDeckHere("ROOT", "b", "replace");
  expect(c.state.nodes.ROOT.children.slice(0, 2)).toEqual(["a", "b"]);   // copied as children, ROOT kept
  c.addChild("ROOT"); expect(c.state.nodes.ROOT.children.length).toBe(4); // "+ below" adds a top-level slide
});

test("titlePage and titleView are saved and reloaded", async () => {
  const c = await titleDeck();
  c.setState({ titleView: { zoom: 2, x: 0.3, y: 0.6 } }); await c.save();
  const d = await Bun.file(join(root, "decks/talk/deck.json")).json();
  expect(d.titlePage).toBe(true); expect(d.titleView).toEqual({ zoom: 2, x: 0.3, y: 0.6 });
});
```

`deckBWithImage()` (already in `app.test.ts`, used by the copy-deck tests) writes deck `b` with one top-level slide `x` and its image file. After the copy, ROOT has `["a", "b", <copied x>]`, and `addChild` makes it 4.

Append to `importer.test.ts`:

```ts
test("re-import keeps the title page: ROOT's title and frames, and the deck flags", () => {
  const deck = { titlePage: true, titleView: { zoom: 2, x: 0.5, y: 0.5 },
    nodes: { ROOT: { id: "ROOT", title: "Big", body: "", children: ["a"], frames: [{ id: "fr", layers: [{ id: "t", type: "text" }] }] }, a: { id: "a", title: "A", body: "", children: [] } } };
  const d = imp(deck, "# A\nslug: a\n");
  expect(d.titlePage).toBe(true); expect(d.titleView.zoom).toBe(2);
  expect(d.nodes.ROOT.title).toBe("Big"); expect(d.nodes.ROOT.frames[0].id).toBe("fr");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts importer.test.ts`
Expected:
- the new `app.test.ts` tests FAIL (e.g. `c.setTitlePage is not a function`, or `cur` is `"a"` instead of `"ROOT"`);
- the importer test PASSES already. It pins existing behaviour, which is fine.

- [ ] **Step 3: Implement** (all in `design/strata.dc.html`)

Deck fields (`const DECK_FIELDS`, ~line 815): add `'titlePage', 'titleView'` after `'tdef'`:
```js
const DECK_FIELDS = ['title', 'source', 'card', 'nodes', 'bg', 'customBg', 'customAspect', 'bgScale', 'bgRepeat', 'bgY', 'opacity', 'base', 'offset', 'margin', 'gap', 'tone', 'speed', 'tdef', 'titlePage', 'titleView', 'images'];
```
Scratch-mode persistence (`componentDidUpdate`, the `JSON.stringify({ nodes: S.nodes, cur: S.cur, …` line): add `titlePage: S.titlePage, titleView: S.titleView,` after `tdef: S.tdef,`.

`loadDeck()`: in the final `setState`, replace `cur: d.nodes.ROOT.children[0],` with:
```js
cur: d.titlePage ? 'ROOT' : d.nodes.ROOT.children[0],
```

`curId()`: replace with:
```js
curId() { const N = this.state.nodes, c = this.state.cur; return N[c] && (c !== 'ROOT' || this.state.titlePage) ? c : N.ROOT.children[0]; }
```

`neighbour()`: replace the whole method with:
```js
  neighbour(id, dir, D) {
    const N = this.state.nodes;
    if (dir === 'down') { const lc = this.state.lastChild[id]; return N[id].children.includes(lc) ? lc : N[id].children[0]; }
    if (id === 'ROOT') return null;
    const pid = D.parent[id];
    if (dir === 'up') return pid !== 'ROOT' ? pid : this.state.titlePage ? 'ROOT' : null;
    const sibs = N[pid].children, i = sibs.indexOf(id);
    return dir === 'left' ? sibs[i - 1] : dir === 'right' ? sibs[i + 1] : undefined;
  }
```

`nav()`, with three edits:
- the first line's guard gets `|| (id === 'ROOT' && !S.titlePage)`:
  ```js
  const S = this.state; if (!id || id === S.cur || !S.nodes[id] || (id === 'ROOT' && !S.titlePage)) return;
  ```
- the `lastChild` loop records ROOT too: `while (D.parent[x] && D.parent[x] !== 'ROOT')` → `while (D.parent[x])`;
- the transition type:
  ```js
  this.setState({ cur: id, prev: S.cur, dx, dy, type: id === 'ROOT' || S.cur === 'ROOT' ? 'zoom' : dir === 'jump' ? 'fade' : 'swipe', phase: 'start', lastChild, ...fx });
  ```

`step()`: replace with:
```js
  step(delta) {
    if (this.stepFrame(delta)) return; const D = this.derive(), cur = this.curId();
    const order = this.state.titlePage ? ['ROOT', ...D.order] : D.order, dep = x => x === 'ROOT' ? -1 : D.depth[x];
    const id = order[order.indexOf(cur) + delta]; if (!id) return; const dd = dep(id) - dep(cur);
    this.nav(id, dd > 0 ? 'down' : dd < 0 ? 'up' : (delta > 0 ? 'right' : 'left'));
  }
```

New method, next to `setNode`:
```js
  // Title page on/off. First enable names ROOT after the deck (defaultLayers renders it); off keeps ROOT's slide for next time.
  setTitlePage(on) {
    const S = this.state, N = S.nodes, R = N.ROOT, first = R.children[0];
    const seed = on && !R.title && !R.frames ? { nodes: { ...N, ROOT: { ...R, title: S.title || (N[first] && N[first].title) || 'Title' } } } : {};
    const go = on ? { cur: 'ROOT' } : S.cur === 'ROOT' ? { cur: first } : null;
    this.setState({ titlePage: on, ...seed, ...(go ? { ...go, prev: null, phase: 'idle', fi: 0, layerSel: null } : {}) });
  }
```

Guards. ROOT has no parent, so each of these must return early:
- `addPeer(id)`: start with `if (id === 'ROOT') return;`
- `remove(id)`: `const N = this.state.nodes; if (!N[id] || id === 'ROOT') return;`
- `outdent(id)`: start with `if (id === 'ROOT') return;`
- `treeDropAt`: inside the `for (const id in tp)` loop, add first `if (id === 'ROOT') continue;`
- `copyDeckHere(tid, slug, mode)`: first line in the body: `if (tid === 'ROOT') mode = 'child';`

`onCompMessage` `jumpTo`: change `N[s] && s !== 'ROOT'` to `N[s] && (s !== 'ROOT' || this.state.titlePage)`.

`renderVals()` (~line 1588): replace `const cur = N[S.cur] ? S.cur : N.ROOT.children[0];` with `const cur = this.curId();`.

Also in `renderVals()` (~line 1594), so render doesn't crash on ROOT before Task 3 completes it:
```js
const sibs = cur === 'ROOT' ? ['ROOT'] : N[D.parent[cur]].children; const ci = sibs.indexOf(cur);
```
and `label`:
```js
const label = id => { if (id === 'ROOT') return 'Title page'; const s = N[D.parent[id]].children; return `Level ${D.depth[id] + 1} · ${s.indexOf(id) + 1} / ${s.length}`; };
```
and the breadcrumb `path0` (see Task 3 for the full crumb work). For now:
```js
const path0 = cur === 'ROOT' ? [null] : pathOf(cur); let indent = 0;
```
with, inside `crumbRows`' map:
```js
const rowSibs = pid ? N[D.parent[pid]].children : N.ROOT.children;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass (116 + 7).

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts importer.test.ts
git commit -m "Title page: ROOT as an opt-in slide; navigation, toggle, guards"
```

---

### Task 2: Camera framing, zoom transition, wireframe rect

**Files:**
- Modify: `design/strata.dc.html`: the logic class (new `titleCam`/`titleCover`, `camOf` in `renderVals`, `fade`) and the template (two camera divs, the wireframe box)
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `state.titlePage`, `state.titleView`, and `state.type === 'zoom'` (Task 1)
- Produces:
  - `titleCover(L): number`
  - `titleCam(L, CW): { s, tx, ty, Wc, Hc, view: { l, t, w, h } }`. `tx`/`ty` are percentages of the camera plane, and `view` is in % of the wireframe canvas (CW × H).
  - render value `titleFrame: { show, l, t, w, h }`

- [ ] **Step 1: Write the failing tests**

```ts
test("title camera: Fit shows the whole content width letterboxed; Cover fills the height; pan clamps to the content", async () => {
  const c = await titleDeck();
  const L = c.layout(c.derive()), CW = L.CW + L.w;
  let t = c.titleCam(L, CW);
  expect(t.s).toBeCloseTo(L.w / L.CW); expect(t.tx).toBeCloseTo(0);
  expect(t.Hc).toBeLessThan(1);                                         // this deck is wider than 16:9
  expect(t.ty).toBeCloseTo((1 - t.Hc) / 2 / (100 / L.h) * 100);        // centred vertically
  expect(t.view.l).toBeCloseTo(0); expect(t.view.w).toBeCloseTo(L.CW / CW * 100);
  c.setState({ titleView: { zoom: c.titleCover(L), x: 1, y: 0.5 } }); t = c.titleCam(L, CW);
  expect(t.Hc).toBeCloseTo(1); expect(t.ty).toBeCloseTo(0);
  expect(t.view.l + t.view.w).toBeCloseTo(L.CW / CW * 100);             // panned fully right = the content's right edge
});

test("Cover never drops below Fit, even on a canvas narrower than 16:9", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "T", ["a"]), a: slideNode("a", "A") }, { titlePage: true });
  const { c } = await mount("?deck=talk");
  expect(c.titleCover(c.layout(c.derive()))).toBeGreaterThanOrEqual(1);
});

test("the stage camera frames the title page, and a zoom transition crossfades the layers", async () => {
  const c = await titleDeck();
  let v = c.renderVals();
  expect(v.curCam).toMatch(/^translate\([-\d.]+%, [-\d.]+%\) scale\(0\.\d+\)$/);
  expect(v.titleFrame.show).toBe(true);
  c.go("down"); v = c.renderVals();
  expect(v.curCam).toMatch(/ scale\(1\)$/);
  expect(v.planeB).toEqual({ t: "none", o: 0 });                        // zoom start: incoming layers transparent, not swiped
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain("transform:{{ curCam }};transform-origin:0 0");
  expect(html).toContain("transform:{{ n.cam }};transform-origin:0 0");
  expect(html).toContain("{{ titleFrame.show }}");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: FAIL. `c.titleCam is not a function`.

- [ ] **Step 3: Implement**

New methods, right after `layout(D)`:
```js
  // Title page framing. Zoom 1 fits the content width (L.CW, not the slack-padded CW) to the slide; x/y is the focus point (0–1).
  // Camera plane = CW/L.w stage-widths × H/L.h stage-heights; per axis: smaller than the stage → centred, else focus centred and clamped.
  // view: the visible region in % of the canvas (CW × H), for the wireframe.
  titleCover(L) { return Math.max(1, L.CW * L.h / (H * L.w)); }
  titleCam(L, CW) {
    const tv = { zoom: 1, x: 0.5, y: 0.5, ...this.state.titleView }, Pw = CW / L.w, Ph = H / L.h, s = tv.zoom * L.w / L.CW;
    const Wc = tv.zoom, Hc = s * Ph, off = (size, f) => size <= 1 ? (1 - size) / 2 : Math.min(0, Math.max(1 - size, 0.5 - f * size));
    const ox = off(Wc, tv.x), oy = off(Hc, tv.y);
    return { s, tx: ox / Pw * 100, ty: oy / Ph * 100, Wc, Hc, view: { l: -ox / Wc * L.CW / CW * 100, t: -oy / Hc * 100, w: L.CW / CW / Wc * 100, h: 100 / Hc } };
  }
```

In `renderVals()`, replace the `camOf` line (~1600) with:
```js
    const TC = this.titleCam(L, CW);
    const camOf = id => { if (id === 'ROOT') return `translate(${f3(TC.tx)}%, ${f3(TC.ty)}%) scale(${+TC.s.toFixed(5)})`;
      const r = L.rect[id]; return `translate(${f3(-r.x / CW * 100)}%, ${f3(-r.y / H * 100)}%) scale(1)`; };
```
In the stage section, change `const fade = S.type === 'fade';` to:
```js
const fade = S.type === 'fade' || S.type === 'zoom';
```
In the wireframe section, after `wireLinesSafe` is built:
```js
    const titleFrame = S.titlePage ? { show: true, l: f3(TC.view.l), t: f3(TC.view.t), w: f3(TC.view.w), h: f3(TC.view.h) } : { show: false };
```
and add `titleFrame,` to the returned object, next to `wireRects`.

Template changes:
- In the stage camera div (~line 142), insert `transform-origin:0 0;` right after `transform:{{ curCam }};`.
- In the tree thumbnail camera div (~line 93), insert `transform-origin:0 0;` right after `transform:{{ n.cam }};`.
- In the wireframe box, after the closing `</sc-for>` of `wireRects`:
```html
              <sc-if value="{{ titleFrame.show }}">
                <div title="Title page view" style="position:absolute;left:{{ titleFrame.l }}%;top:{{ titleFrame.t }}%;width:{{ titleFrame.w }}%;height:{{ titleFrame.h }}%;border:2px dashed #fbf9f4;border-radius:3px;box-sizing:border-box;pointer-events:none"></div>
              </sc-if>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. That includes "every {{ name }} the app template uses is provided by renderVals".

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Title page: whole-canvas camera framing, zoom transition, wireframe view rect"
```

---

### Task 3: Tree node, breadcrumbs, link targets

**Files:**
- Modify: `design/strata.dc.html`: the tree layout and `treeNodes`/`treeEdges` in `renderVals`, the crumb rows, `name`, `deckTitle`, `slideOptions`, and the tree node template
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `camOf('ROOT')` (Task 2), `curId()`/`neighbour` (Task 1), and Task 1's `path0`/`rowSibs` edits
- Produces: the tree node field `canPeer: boolean`; render values `crumbRows[0].steps[0]` (⌂ when off ROOT) and `slideOptions[0].id === 'ROOT'`

- [ ] **Step 1: Write the failing tests**

```ts
test("on the title page the crumbs show the top row with nothing current; elsewhere a ⌂ crumb leads home", async () => {
  const c = await titleDeck();
  let v = c.renderVals();
  expect(v.crumbRows.length).toBe(1);
  expect(v.crumbRows[0].steps.map((s: any) => s.full)).toEqual(["A", "B"]);
  expect(v.crumbRows[0].steps.every((s: any) => s.title === "")).toBe(true);   // nothing highlighted
  expect(v.hasDownHint).toBe(true); expect(v.curLabel).toBe("Title page");
  expect(v.hasLeft || v.hasRight).toBe(false);
  c.go("down"); v = c.renderVals();
  expect(v.crumbRows[0].steps[0].mark).toBe("⌂");
  expect(v.upTitle).toBe("Big picture");
  v.crumbRows[0].steps[0].onClick(); expect(c.state.cur).toBe("ROOT");
  const off = await titleDeck({});
  expect(off.renderVals().crumbRows[0].steps[0].mark).not.toBe("⌂");
});

test("tree: the title page sits centred above the top row, joined to it, with no sibling/delete/collapse", async () => {
  const c = await titleDeck();
  const v = c.renderVals(), at = (t: string) => v.treeNodes.find((n: any) => n.full === t);
  const r = at("Big picture"), a = at("A"), b = at("B");
  expect(r.canPeer).toBe(false); expect(r.hasKids).toBe(false); expect(a.canPeer).toBe(true);
  expect(a.y).toBeGreaterThan(r.y); expect(r.x).toBeCloseTo((a.x + b.x) / 2);
  expect(v.treeEdges.length).toBe(4);                              // ROOT→a, ROOT→b, a→a1, a→a2
  expect(v.slideOptions[0].id).toBe("ROOT");
  expect(v.treeH).toBeGreaterThan((await titleDeck({})).renderVals().treeH);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain("{{ n.canPeer }}");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: FAIL. `r` is undefined (there's no ROOT tree node yet), or `mark` is `"1"`.

- [ ] **Step 3: Implement** (in `renderVals()`)

`name`, at the top of `renderVals`:
```js
const name = id => N[id].title || (id === 'ROOT' ? 'Title page' : 'Untitled');
```

Tree layout. Replace the `TV.kids('ROOT').forEach(k => lay(k, 0));` statement with:
```js
    const r0 = S.titlePage ? 1 : 0; TV.kids('ROOT').forEach(k => lay(k, r0));
    if (r0) { const tk = TV.kids('ROOT'); tp.ROOT = { x: tk.length ? (tp[tk[0]].x + tp[tk[tk.length - 1]].x) / 2 : TPX, y: TPY }; }
```
(Keep `this._tpos = tp; this._treeW = …` after it.)

`treeNodes`: change `TV.vis.map(id => ({` to `(r0 ? ['ROOT'] : []).concat(TV.vis).map(id => ({`, and inside the object:
- `hasKids: id !== 'ROOT' && N[id].children.length > 0,`
- `onDragStart: ev => { if (id !== 'ROOT') this.startTreeDrag(ev, id); },`
- add `canPeer: id !== 'ROOT',`

`treeEdges` and `topEdge`:
```js
    const treeEdges = TV.vis.filter(id => tp[D.parent[id]]).map(id => { …unchanged… });
    const tops = N.ROOT.children; const topEdge = !r0 && tops.length > 1 ? […unchanged…] : [];
```
(With the flag on, `tp.ROOT` exists, so the top-level slides get ordinary parent edges. With it off, `tp.ROOT` is absent and the old top bar is drawn.)

Tree height. In the two places that compute it (`treeHz:` and `treeH:` in the returned object), replace `D.levels * ROWH` with `(D.levels + r0) * ROWH`.

Breadcrumbs. Replace the block from `const path0 = …` through `const downHint = …` with:
```js
    const home = S.titlePage && cur !== 'ROOT' ? 1 : 0;
    const homeStep = { title: '', pad: '4px', full: name('ROOT'), mark: '⌂', opacity: 1, lineDisplay: 'none', lineColor: '#d9432b', bg: 'rgba(251,249,244,.92)', color: '#1d1b17',
      dotBg: 'transparent', dotColor: '#1d1b17', dotBorder: '1.5px solid #1d1b17', onClick: () => this.nav('ROOT', 'up') };
    const path0 = cur === 'ROOT' ? [null] : pathOf(cur); let indent = 0;
    const crumbRows = path0.map((pid, k) => {
      const rowSibs = pid ? N[D.parent[pid]].children : N.ROOT.children; const ix = rowSibs.indexOf(pid); const isCur = k === path0.length - 1; const off = k === 0 ? home : 0;
      const row = { indent, top: k * CP, opacity: isCur ? 1 : 0.92, hasLink: k > 0, linkX: indent + CD - 1, linkTop: k * CP - (CP - CRH),
        steps: (off ? [homeStep] : []).concat(rowSibs.map((sid, j) => { …the existing step object, unchanged except: lineDisplay: j === 0 && !off ? 'none' : 'block', … })) };
      indent += CS * (ix + off); return row;
    });
```
Keep `firstVis`, `crumbTx`/`crumbTy` and `curRow` unchanged. Then:
```js
    const downHint = this.neighbour(cur, 'down', D) ? { x: curRow.indent + CD - 1 + CS * (ci + (path0.length === 1 ? home : 0)) - 9, y: curRow.top + CRH, title: 'Below: ' + name(this.neighbour(cur, 'down', D)) } : null;
```

Link targets (`slideOptions`):
```js
slideOptions: (S.titlePage ? ['ROOT'] : []).concat(D.order).map(id => ({ id, label: ' '.repeat(id === 'ROOT' ? 0 : D.depth[id] * 3) + name(id) + (id === cur ? '  (this slide)' : '') })),
```

Deck title fallback: `deckTitle: S.title || (S.titlePage && N.ROOT.title) || name(N.ROOT.children[0]),`

Template. In the tree node (~lines 104-108), wrap the `onPeer` (+ sibling) button and the `onDelete` (✕) button each in `<sc-if value="{{ n.canPeer }}">…</sc-if>`. Leave the `onChild` button as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Title page: tree node above the top row, ⌂ crumb, link target"
```

---

### Task 4: Title view controls and the Canvas toggle

**Files:**
- Modify: `design/strata.dc.html`: Slide tab template (after the slide-name `<label>`, ~line 316), Canvas tab template (top of `<sc-if value="{{ tabCanvas }}">`, ~line 724), and `renderVals` return values
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `titleCam`, `titleCover` (Task 2), `setTitlePage` (Task 1)
- Produces: render values `isTitlePage`, `tvZoom`, `tvZoomMax`, `tvZoomLabel`, `onTvZoom`, `tvFit`, `tvCover`, `tvX`, `tvXLabel`, `onTvX`, `tvY`, `tvYLabel`, `onTvY`, `tvHint`, `titlePage`, `onTitlePage`

- [ ] **Step 1: Write the failing test**

```ts
test("Title view controls set zoom/Fit/Cover/pan; the Canvas tab toggles the title page", async () => {
  const c = await titleDeck();
  let v = c.renderVals();
  expect(v.isTitlePage).toBe(true); expect(v.titlePage).toBe(true);
  expect(v.tvHint).toMatch(/Pan Y/);                                   // Fit on a wide deck: letterboxed vertically
  v.onTvZoom({ target: { value: "3" } }); expect(c.state.titleView.zoom).toBe(3);
  v = c.renderVals(); v.onTvX({ target: { value: "0.2" } }); expect(c.state.titleView).toEqual({ zoom: 3, x: 0.2, y: 0.5 });
  v = c.renderVals(); v.onTvY({ target: { value: "0.7" } }); expect(c.state.titleView.y).toBe(0.7);
  v = c.renderVals(); v.tvFit(); expect(c.state.titleView.zoom).toBe(1);
  v = c.renderVals(); v.tvCover(); expect(c.state.titleView.zoom).toBeCloseTo(c.titleCover(c.layout(c.derive())));
  v = c.renderVals(); v.onTitlePage({ target: { checked: false } });
  expect(c.state.titlePage).toBe(false); expect(c.renderVals().isTitlePage).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test app.test.ts`
Expected: FAIL. `v.onTvZoom is not a function`, and the `isTitlePage` expectation fails.

- [ ] **Step 3: Implement**

In `renderVals()`, before `return {`:
```js
    const tv = { zoom: 1, x: 0.5, y: 0.5, ...S.titleView }, setTv = p => this.setState(s => ({ titleView: { zoom: 1, x: 0.5, y: 0.5, ...s.titleView, ...p } }));
    const tvFree = [TC.Wc <= 1.001 && 'Pan X', TC.Hc <= 1.001 && 'Pan Y'].filter(Boolean);
```
Add to the returned object:
```js
      isTitlePage: cur === 'ROOT', titlePage: !!S.titlePage, onTitlePage: e => this.setTitlePage(!!e.target.checked),
      tvZoom: tv.zoom, tvZoomMax: Math.max(8, Math.ceil(this.titleCover(L))), tvZoomLabel: tv.zoom.toFixed(2) + '×', onTvZoom: e => setTv({ zoom: +e.target.value }),
      tvFit: () => setTv({ zoom: 1 }), tvCover: () => setTv({ zoom: this.titleCover(L) }),
      tvX: tv.x, tvXLabel: Math.round(tv.x * 100) + '%', onTvX: e => setTv({ x: +e.target.value }),
      tvY: tv.y, tvYLabel: Math.round(tv.y * 100) + '%', onTvY: e => setTv({ y: +e.target.value }),
      tvHint: tvFree.length ? 'The whole canvas fits this way, so ' + tvFree.join(' and ') + ' has no effect.' : '',
```

Slide tab template, right after the slide-name `</label>`:
```html
            <sc-if value="{{ isTitlePage }}">
              <div style="display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #e0d9cb;border-radius:10px;background:#fff">
                <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#1d1b17">Title view · whole canvas</span>
                <label style="display:flex;flex-direction:column;gap:4px;min-width:0">
                  <span style="display:flex;justify-content:space-between;font-size:12px;color:#6b6458"><span>Zoom</span><span style="font-family:'JetBrains Mono',monospace">{{ tvZoomLabel }}</span></span>
                  <input type="range" min="1" max="{{ tvZoomMax }}" step="0.05" value="{{ tvZoom }}" onChange="{{ onTvZoom }}" style="accent-color:#1d1b17;width:100%;min-width:0">
                </label>
                <div style="display:flex;gap:6px">
                  <button onClick="{{ tvFit }}" style="flex:1;padding:5px 0;border:1px solid #e0d9cb;border-radius:7px;background:#fff;cursor:pointer;font-size:12.5px">Fit</button>
                  <button onClick="{{ tvCover }}" style="flex:1;padding:5px 0;border:1px solid #e0d9cb;border-radius:7px;background:#fff;cursor:pointer;font-size:12.5px">Cover</button>
                </div>
                <label style="display:flex;flex-direction:column;gap:4px;min-width:0">
                  <span style="display:flex;justify-content:space-between;font-size:12px;color:#6b6458"><span>Pan X</span><span style="font-family:'JetBrains Mono',monospace">{{ tvXLabel }}</span></span>
                  <input type="range" min="0" max="1" step="0.01" value="{{ tvX }}" onChange="{{ onTvX }}" style="accent-color:#1d1b17;width:100%;min-width:0">
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;min-width:0">
                  <span style="display:flex;justify-content:space-between;font-size:12px;color:#6b6458"><span>Pan Y</span><span style="font-family:'JetBrains Mono',monospace">{{ tvYLabel }}</span></span>
                  <input type="range" min="0" max="1" step="0.01" value="{{ tvY }}" onChange="{{ onTvY }}" style="accent-color:#1d1b17;width:100%;min-width:0">
                </label>
                <span style="font-size:12px;line-height:1.45;color:#6b6458">{{ tvHint }}</span>
              </div>
            </sc-if>
```

Canvas tab template, as the first child inside `<sc-if value="{{ tabCanvas }}">`:
```html
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" checked="{{ titlePage }}" onChange="{{ onTitlePage }}" style="accent-color:#1d1b17">Title page · the whole canvas as a first slide
            </label>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Title page: Title view zoom/pan controls and Canvas tab toggle"
```

---

### Task 5: Check it in the real app

**Files:** none, unless a fix is needed. A fix gets its own failing test first, in the owning area of `app.test.ts`.

- [ ] **Step 1:** Run `make dev` (in the background) and open `http://127.0.0.1:3067/design/strata.dc.html?deck=digital-wallets`. The canvas there is 20.5:1. Use the `run` skill or claude-in-chrome to drive it.
- [ ] **Step 2:** On the Canvas tab, tick **Title page**. Expected: you land on ROOT, the stage shows the whole canvas as a band across the middle with the deck title over it, and the tree shows the node above the top row.
- [ ] **Step 3:** Zoom slider, Cover, then Pan X/Y. Expected:
  - the stage and the ROOT tree thumbnail reframe;
  - Cover fills the height with no band;
  - in the Wireframe view, the dashed rect matches.
- [ ] **Step 4:** Present mode. Expected:
  - ↓ zooms into the top-level slide and the layers crossfade;
  - ↑ from a top-level slide zooms back out;
  - Space/Shift+Space pass through ROOT;
  - the ⌂ crumb works.

  If the zoom path visibly drifts in a way that looks wrong, report it rather than fixing it. The spec's ponytail note covers the upgrade.
- [ ] **Step 5:** Untick **Title page** and confirm the deck behaves as before. Then tick it again to leave the deck as you found it plus the feature, or revert the deck file with `git checkout decks/digital-wallets`.
- [ ] **Step 6:** Commit any fixes with their tests. Do not commit `decks/` changes made during the check.
