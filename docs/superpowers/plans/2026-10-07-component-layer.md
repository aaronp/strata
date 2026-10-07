# Component Layers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `component` layer type: a pasted HTML/CSS/JS snippet running in a sandboxed iframe on a slide, told about navigation and able to drive it (`done`, `back`, `jumpTo`, `nav`), with presenter key-claiming and a builder code editor.

**Architecture:** `design/Layers.dc.html` renders component layers as `<iframe sandbox="allow-scripts" src="data:text/html,…">` (helper script + snippet) only when its new `live` prop (the current slide id) is set — the main stage; elsewhere a placeholder card. `design/strata.dc.html` listens for `message` events, identifies the sender among the main stage's iframes, answers `hello` with `enter`, posts `frame` on frame changes, routes Present-mode →/←/Space to a claiming component, and handles `done/back/jumpTo/nav/error`. The builder adds `+ Component` and a component settings panel.

**Tech Stack:** the existing DC prototype app, bun test.

**Spec:** `docs/superpowers/specs/2026-10-07-component-layer-design.md`

## Global Constraints

- Sandbox is exactly `allow-scripts` (no `allow-same-origin`). Host → component posts use target origin `'*'` (opaque origin); host accepts a message only when `event.source` is the `contentWindow` of an `iframe[data-lid]` inside `[data-stage="main"]`.
- Every message is an object with `strata: 1` and `type`.
- The iframe source is `src = 'data:text/html;charset=utf-8,' + encodeURIComponent(doc)` (not `srcdoc`: the runtime doesn't map the attribute's casing). `doc` contains `<!-- strata <slideId> -->` so a different slide always reloads the component.
- Frame numbers in messages are 0-based `frame` plus `frames` (count).
- Keys are only routed in Present mode (`S.mode === 'present'`).

## Review Focus

1. **A component that never calls `done`** must not trap the presenter — pinned by the override test (Task 2).
2. **Messages from anything other than a main-stage component iframe** (another window, a thumbnail, the transition ghost) are ignored — tested in Task 2.
3. **Frame changes on the same slide must not reload the iframe** (the src string must stay identical across frames) — tested in Task 1 (same src for the same layer across two renders with different geometry).
4. **A snippet that throws** surfaces its error in the settings instead of failing silently — tested in Tasks 1 (helper forwards errors) and 3 (error shown).
5. **Pasting an AI-written full HTML document** (`<!doctype html><html>…`) into the code area still works — the helper is in the wrapper's head and a nested document's tags are tolerated by the HTML parser; tested in Task 1 (doc built from a full-document snippet keeps the helper first).

---

### Task 1: Render component layers (`design/Layers.dc.html`)

**Files:** Modify `design/Layers.dc.html`; Modify `layers.test.ts`

**Interfaces:**
- Produces: Layers prop `live` (string slide id | absent). Render item for `type: 'component'`: `{ isComponent: true, live: boolean, placeholder: boolean, src: string, name: string, lid }`. Script constant `HELPER` (string) and `componentDoc(code, key) → string`.

- [ ] **Step 1: Failing tests** (append to `layers.test.ts`; also add next to `Component`: `const HELPER = new Function("DCLogic", js + "\nreturn HELPER;")(class {});`):

```ts
const comp = (o = {}) => ({ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, name: "Demo", code: "<b>hi</b><script>strata.ready({steps:true})</script>", ...o });
const doc = (src: string) => decodeURIComponent(src.replace("data:text/html;charset=utf-8,", ""));

test("a live component renders a sandboxed iframe running the helper, then the snippet", () => {
  const it = render({ layers: [comp()], live: "s1" }).items[0];
  expect(it).toMatchObject({ isComponent: true, live: true, placeholder: false, name: "Demo", lid: "c1" });
  expect(it.src.startsWith("data:text/html;charset=utf-8,")).toBe(true);
  const d = doc(it.src);
  expect(d.indexOf("window.strata=")).toBeLessThan(d.indexOf("<b>hi</b>"));
  expect(d).toContain("<!-- strata s1 -->");
  expect(html).toContain('sandbox="allow-scripts"');
  expect(html).not.toContain("allow-same-origin");
});

test("the same component keeps an identical src across frames (no reload), but not across slides", () => {
  const a = render({ layers: [comp({ x: 0 })], live: "s1" }).items[0].src;
  expect(render({ layers: [comp({ x: 40, w: 20, opacity: 0.5 })], live: "s1" }).items[0].src).toBe(a);
  expect(render({ layers: [comp()], live: "s2" }).items[0].src).not.toBe(a);
});

test("not live (thumbnails, previews): a placeholder card with the name, no iframe", () => {
  expect(render({ layers: [comp()] }).items[0]).toMatchObject({ isComponent: true, live: false, placeholder: true, name: "Demo", src: "" });
});

test("a pasted full HTML document keeps the helper first", () => {
  const d = doc(render({ layers: [comp({ code: "<!doctype html><html><head><title>x</title></head><body><p>y</p></body></html>" })], live: "s1" }).items[0].src);
  expect(d.indexOf("window.strata=")).toBeLessThan(d.indexOf("<title>x</title>"));
});

test("the helper: forwards messages to handlers, acks next/prev, reports errors, says hello on load", () => {
  const posted: any[] = [], L: Record<string, Function> = {}, parent = { postMessage: (m: any) => posted.push(m) }, win: any = {};
  new Function("parent", "addEventListener", "window", HELPER)(parent, (t: string, f: Function) => (L[t] = f), win);
  const got: any[] = [];
  win.strata.on("next", (m: any) => got.push(m.type));
  L.message({ source: parent, data: { strata: 1, type: "next" } });
  L.message({ source: {}, data: { strata: 1, type: "next" } });          // not from the slide: ignored
  expect(got).toEqual(["next"]);
  expect(posted).toEqual([{ strata: 1, type: "ack" }]);
  win.strata.ready({ steps: true }); win.strata.done(); win.strata.jumpTo("intro"); win.strata.nav("up");
  L.error({ message: "boom", lineno: 3 }); L.load();
  expect(posted.slice(1)).toEqual([{ strata: 1, type: "ready", steps: true }, { strata: 1, type: "done" }, { strata: 1, type: "jumpTo", slug: "intro" },
    { strata: 1, type: "nav", dir: "up" }, { strata: 1, type: "error", message: "boom", line: 3 }, { strata: 1, type: "hello" }]);
});
```

- [ ] **Step 2: Run** — `bun test layers.test.ts` → the 5 new tests FAIL.

- [ ] **Step 3: Implement.** In the Layers script, after `const rgba = …`:

```js
// Component layers: a snippet runs in a sandboxed iframe; this helper (injected first) is its only link to the slide.
const HELPER = "(function(){var h={};function emit(t,d){parent.postMessage(Object.assign({strata:1,type:t},d||{}),'*');}" +
  "addEventListener('message',function(e){var m=e.data;if(e.source!==parent||!m||m.strata!==1)return;(h[m.type]||[]).forEach(function(f){f(m);});if(m.type==='next'||m.type==='prev')emit('ack');});" +
  "addEventListener('error',function(e){emit('error',{message:String(e.message),line:e.lineno});});" +
  "addEventListener('unhandledrejection',function(e){var r=e.reason;emit('error',{message:String(r&&r.message||r)});});" +
  "addEventListener('load',function(){emit('hello');});" +
  "window.strata={on:function(t,f){(h[t]=h[t]||[]).push(f);},emit:emit,ready:function(o){emit('ready',o||{});},done:function(){emit('done');},back:function(){emit('back');}," +
  "jumpTo:function(s){emit('jumpTo',{slug:s});},nav:function(d){emit('nav',{dir:d});}};})();";
const componentDoc = (code, key) => '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}</style><script>' +
  HELPER + '</script><!-- strata ' + key + ' --></head><body>' + (code || '') + '</body></html>';
```

In `renderVals`, before the image branch:
```js
      if (l.type === 'component') {
        const live = !!p.live;
        return { ...base, isComponent: true, live, placeholder: !live, name: l.name || 'Component',
          src: live ? 'data:text/html;charset=utf-8,' + encodeURIComponent(componentDoc(l.code, p.live)) : '' };
      }
```
and add `isComponent: false` to `base` (so other items have the flag), and `"live":{"editor":null,"tsType":"string"}` to the `data-props` JSON (HTML-escaped like the others).

Template, inside the item wrapper next to the other `sc-if`s:
```html
      <sc-if value="{{ e.isComponent }}">
        <sc-if value="{{ e.live }}">
          <iframe data-lid="{{ e.lid }}" sandbox="allow-scripts" src="{{ e.src }}" title="{{ e.name }}" style="display:block;width:100%;height:100%;border:0;background:transparent;pointer-events:auto"></iframe>
        </sc-if>
        <sc-if value="{{ e.placeholder }}">
          <div style="width:100%;height:100%;display:grid;place-items:center;border-radius:1cqw;background:rgba(29,27,23,.78);color:#fbf9f4;font-family:'JetBrains Mono',monospace;font-size:1.4cqw;letter-spacing:.06em;overflow:hidden;white-space:nowrap">⧉ {{ e.name }}</div>
        </sc-if>
      </sc-if>
```

- [ ] **Step 4: Run** — `bun test layers.test.ts` → all pass.

- [ ] **Step 5: Commit** — `git add design/Layers.dc.html layers.test.ts && git commit -m "Render component layers: sandboxed iframe with helper, placeholder when not live"`

---

### Task 2: Protocol and key routing (`design/strata.dc.html`)

**Files:** Modify `design/strata.dc.html`; Modify `app.test.ts`

**Interfaces:**
- Consumes: Task 1's `live` prop and `iframe[data-lid]` elements.
- Produces (app): `compFrames() → [{ lid, win }]`, `postComp(win, msg)`, `onCompMessage(e)`, `routeToComponent(act) → boolean` (`act`: `'right' | 'left' | 'step+' | 'step-'`), `deckMove(act)`, `claimer() → lid | null`, state `compErr: { [lid]: string }`. Instance fields `_claims`, `_fwd`.

- [ ] **Step 1: Failing tests** (append to `app.test.ts`):

```ts
// ---- component layers: protocol ----
async function compDeck() {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["a", "b"]),
    a: slideNode("a", "Alpha", [], { frames: [{ id: "f1", layers: [{ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, code: "" }] }, { id: "f2", layers: [{ id: "c1", type: "component", x: 0, y: 0, w: 50, h: 50, code: "" }] }] }),
    b: slideNode("b", "Beta") });
  const { c, listeners } = await mount("?deck=talk");
  const win: any = { posted: [] as any[], postMessage(m: any) { this.posted.push(m); } };
  c.stageRef.current = { clientHeight: 0, querySelectorAll: (q: string) => q === '[data-stage="main"] iframe[data-lid]' ? [{ dataset: { lid: "c1" }, contentWindow: win }] : [] };
  const send = (data: object, source: any = win) => listeners.message({ source, data: { strata: 1, ...data } });
  return { c, win, send };
}

test("hello is answered with enter (frame, frames, mode, slide); frame changes are posted", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "hello" });
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "enter", frame: 0, frames: 2, mode: "build", slide: { id: "a", title: "Alpha" } });
  c.setState({ nodes: { ...c.state.nodes, a: { ...c.state.nodes.a, ftrans: { f1: { c1: { move: { dur: 900, delay: 100 }, fade: { dur: 300 } } } } } } });
  c.setState({ fi: 1 }); c.componentDidUpdate();
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "frame", frame: 1, frames: 2, from: 0, duration: 1000 });
});

test("messages from anything but a main-stage component iframe are ignored", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "hello" }, { postMessage() {} });
  send({ type: "nav", dir: "right" }, {});
  listeners_safe: { }
  expect(win.posted).toEqual([]);
  expect(c.state.cur).toBe("a");
});

test("Present: a claiming component gets → as next; done advances, ack doesn't; an unacknowledged press is bypassed", async () => {
  const { c, win, send } = await compDeck();
  c.setState({ mode: "present" });
  send({ type: "ready", steps: true });
  key(c, "ArrowRight");
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "next" });
  expect(c.fiFor("a")).toBe(0);
  send({ type: "ack" });
  key(c, "ArrowRight");                                   // acknowledged → forwarded again
  expect(win.posted.filter((m: any) => m.type === "next").length).toBe(2);
  send({ type: "done" });                                 // component finished → deck moves (next frame)
  expect(c.fiFor("a")).toBe(1);
  key(c, "ArrowRight");                                   // forwarded, never acknowledged…
  key(c, "ArrowRight");                                   // …so this one bypasses the component
  expect(c.state.cur).toBe("b");
});

test("Present: ← and Shift+Space go to the component as prev; back moves the deck back", async () => {
  const { c, win, send } = await compDeck();
  c.setState({ mode: "present", fi: 1 });
  send({ type: "ready", steps: true });
  key(c, " ", { shiftKey: true });
  expect(win.posted.at(-1)).toEqual({ strata: 1, type: "prev" });
  send({ type: "back" });
  expect(c.fiFor("a")).toBe(0);
});

test("keys are never routed in build mode, and claims end when the slide changes", async () => {
  const { c, win, send } = await compDeck();
  send({ type: "ready", steps: true });
  key(c, "ArrowRight");
  expect(win.posted.filter((m: any) => m.type === "next")).toEqual([]);
  c.setState({ mode: "present", cur: "b" }); c.componentDidUpdate();
  expect(c.claimer()).toBeNull();
});

test("component-initiated navigation: done without a pending key, jumpTo by id or title, nav, unknown slug", async () => {
  const { c, send } = await compDeck();
  send({ type: "jumpTo", slug: "beta" });
  expect(c.state.cur).toBe("b");
  c.setState({ cur: "a" });
  send({ type: "jumpTo", slug: "b" });
  expect(c.state.cur).toBe("b");
  c.setState({ cur: "a", fi: 0 });
  send({ type: "done" });
  expect(c.fiFor("a")).toBe(1);
  send({ type: "nav", dir: "right" });
  expect(c.state.cur).toBe("b");
  send({ type: "jumpTo", slug: "nowhere" });
  expect(c.state.note).toContain('"nowhere"');
});

test("component errors are kept per layer", async () => {
  const { c, send } = await compDeck();
  send({ type: "error", message: "x is not defined", line: 4 });
  expect(c.state.compErr).toEqual({ c1: "x is not defined (line 4)" });
});
```
(Remove the stray `listeners_safe: { }` line when writing the file — it is a typo in this plan.)

- [ ] **Step 2: Run** — `bun test app.test.ts` → the 7 new tests FAIL.

- [ ] **Step 3: Implement** (methods next to `measureStage`):

```js
  // ---- component layers: messaging (see the helper in Layers.dc.html) ----
  compFrames() {
    const st = this.stageRef.current; if (!st || !st.querySelectorAll) return [];
    return [...st.querySelectorAll('[data-stage="main"] iframe[data-lid]')].map(el => ({ lid: el.dataset.lid, win: el.contentWindow }));
  }
  postComp(win, msg) { try { win && win.postMessage(Object.assign({ strata: 1 }, msg), '*'); } catch (e) {} }
  compInfo() { const id = this.curId(); return { frame: this.fiFor(id), frames: this.framesOf(id).length }; }
  claimer() { const c = this._claims || {}; return this.layersOf(this.curId()).map(l => l.id).filter(id => c[id]).pop() || null; }
  deckMove(act) { if (act === 'right' || act === 'left') this.go(act); else this.step(act === 'step+' ? 1 : -1); }
  // Present-mode →/←/Space: a claiming component gets next/prev; an unacknowledged forward is bypassed on the next press.
  routeToComponent(act) {
    const fwd = act === 'right' || act === 'step+', lid = this.claimer(); if (!lid) return false;
    const p = this._fwd; if (p && !p.acked && p.fwd === fwd) { this._fwd = null; return false; }
    const f = this.compFrames().find(x => x.lid === lid); if (!f) return false;
    this._fwd = { lid, act, fwd, acked: false }; this.postComp(f.win, { type: fwd ? 'next' : 'prev' }); return true;
  }
  onCompMessage(e) {
    const m = e && e.data; if (!m || m.strata !== 1) return;
    const f = this.compFrames().find(x => x.win === e.source); if (!f) return;
    const lid = f.lid, N = this.state.nodes, id = this.curId();
    if (m.type === 'hello') { this._claims = { ...(this._claims || {}), [lid]: false }; this.postComp(f.win, { type: 'enter', ...this.compInfo(), mode: this.state.mode, slide: { id, title: N[id].title } }); }
    else if (m.type === 'ready') this._claims = { ...(this._claims || {}), [lid]: !!m.steps };
    else if (m.type === 'ack') { if (this._fwd && this._fwd.lid === lid) this._fwd.acked = true; }
    else if (m.type === 'done' || m.type === 'back') { const p = this._fwd; this._fwd = null; if (p && p.lid === lid) this.deckMove(p.act); else this.step(m.type === 'done' ? 1 : -1); }
    else if (m.type === 'jumpTo') {
      const s = String(m.slug || ''), t = N[s] && s !== 'ROOT' ? s : Object.keys(N).find(k => k !== 'ROOT' && (N[k].title || '').toLowerCase() === s.toLowerCase());
      if (t) this.nav(t, 'jump'); else this.flash('Component asked for unknown slide "' + s + '"');
    }
    else if (m.type === 'nav') { const d = m.dir; if (['left', 'right', 'up', 'down'].includes(d)) this.go(d); else if (d === 'next' || d === 'prev') this.step(d === 'next' ? 1 : -1); }
    else if (m.type === 'error') this.setState(s => ({ compErr: { ...(s.compErr || {}), [lid]: String(m.message || 'error') + (m.line ? ' (line ' + m.line + ')' : '') } }));
  }
```
In `componentDidMount`: `this.onMsg = e => this.onCompMessage(e); window.addEventListener('message', this.onMsg);` and in `componentWillUnmount` remove it.

In `componentDidUpdate` (after `measureStage`):
```js
    const ck = this.curId(), cf = this.fiFor(ck);
    if (ck !== this._compCur) { this._compCur = ck; this._compFi = cf; this._claims = {}; this._fwd = null; }
    else if (cf !== this._compFi) {   // per component: its own transition time for this step (0 for a multi-frame jump)
      const from = this._compFi; this._compFi = cf; const info = this.compInfo(), a = Math.min(from, cf), adj = Math.abs(cf - from) === 1;
      this.compFrames().forEach(f => { const t = this.transFor(ck, a, f.lid);
        const duration = adj ? Math.max(...DEF_ACTS.map(act => { const s = this.actT(t, act); return s.dur + s.delay; })) : 0;
        this.postComp(f.win, { type: 'frame', ...info, from, duration }); });
    }
```

In `onKey`, immediately before the generic `if (k.startsWith('Arrow')) { e.preventDefault(); this.go(…`:
```js
    if (S.mode === 'present' && (k === 'ArrowRight' || k === 'ArrowLeft' || k === ' ')
      && this.routeToComponent(k === ' ' ? (e.shiftKey ? 'step-' : 'step+') : k === 'ArrowRight' ? 'right' : 'left')) { e.preventDefault(); return; }
```

Main stage Layers import: add `live="{{ cur }}"` to the `dc-import` that has `editing-id="{{ editingId }}"` (exactly one).

- [ ] **Step 4: Run** — `bun test` → all pass. If `go`/`step` in the harness don't move `cur`/`fi` synchronously, read their implementation and assert on the state they do set; record a Ruling.

- [ ] **Step 5: Commit** — `git add design/strata.dc.html app.test.ts && git commit -m "Component protocol: enter/frame, key claiming with override, done/back/jumpTo/nav/error"`

---

### Task 3: Builder UI for components

**Files:** Modify `design/strata.dc.html`; Modify `app.test.ts`

**Interfaces:**
- Consumes: Task 2's `compErr`.
- Produces: `addLayer('component')` default; render values `lyIsComponent, compName, onCompName, compCode, onCompCode, compDirty, onCompApply, onCompRevert, compErrText, compInteract, onCompInteract, onCopyCompGuide`; overlay field `pe`; state `compDraft: { [lid]: string }`, `interact: lid | null`.

- [ ] **Step 1: Failing tests** (append):

```ts
test("+ Component adds a working default; Apply writes the draft, Revert discards it; errors show; Interact frees the overlay", async () => {
  const { c, send } = await compDeck();
  c.addLayer("component");
  const l = () => c.layersOf("a").find((x: any) => x.id === c.state.layerSel);
  expect(l()).toMatchObject({ type: "component", name: "Component" });
  expect(l().code).toContain("strata.ready({ steps: true })");
  let v = c.renderVals();
  expect(v.lyIsComponent).toBe(true);
  v.onCompCode({ target: { value: "<p>new</p>" } }); v = c.renderVals();
  expect(v.compDirty).toBe(true);
  expect(l().code).not.toBe("<p>new</p>");
  v.onCompRevert(); v = c.renderVals();
  expect(v.compCode).toBe(l().code);
  v.onCompCode({ target: { value: "<p>new</p>" } }); c.renderVals().onCompApply();
  expect(l().code).toBe("<p>new</p>");
  c.setState({ compErr: { [c.state.layerSel]: "boom (line 1)" } });
  expect(c.renderVals().compErrText).toBe("boom (line 1)");
  c.renderVals().onCompInteract();
  expect(c.renderVals().overlays.find((o: any) => o.selected).pe).toBe("none");
});

test("the layers list and template know about components", async () => {
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const s of ['onClick="{{ addComponent }}"', '<sc-if value="{{ lyIsComponent }}">', 'onClick="{{ onCompApply }}"', 'onClick="{{ onCopyCompGuide }}"', 'pointer-events:{{ o.pe }}', 'live="{{ cur }}"'])
    expect(html).toContain(s);
});
```

- [ ] **Step 2: Run** → the 2 new tests FAIL.

- [ ] **Step 3: Implement.**
- Module constants (near `SLIDE_LAYOUTS`):
```js
const COMPONENT_DEFAULT = `<div id="out" style="height:100%;display:grid;place-items:center;font:600 7vw system-ui;color:#fbf9f4;background:rgba(31,111,184,.35);border-radius:12px"></div>
<script>
  // Talks to the slide via the injected \`strata\` helper.
  let frame = 0, step = 0;
  const show = () => out.textContent = 'frame ' + (frame + 1) + ' · step ' + step;
  strata.on('enter', m => { frame = m.frame; show(); });
  strata.on('frame', m => { frame = m.frame; show(); });
  strata.on('next', () => { if (step < 3) { step++; show(); } else strata.done(); });
  strata.on('prev', () => { if (step > 0) { step--; show(); } else strata.back(); });
  strata.ready({ steps: true });   // claim →/← in Present
</script>`;
const COMPONENT_GUIDE = `Write a Strata slide component: one HTML snippet (markup + <style> + <script>) that runs in a sandboxed iframe filling a box on a slide.
Rules: no access to the parent page, cookies or storage; you may load libraries from CDNs and fetch public URLs. Use a transparent background unless asked; size everything to the iframe (100% width/height, vw/vh units).
A global \`strata\` object connects it to the slide:
  strata.on('enter', m => …)   // arrived on the slide: m.frame (0-based), m.frames, m.mode ('build'|'present'), m.slide {id,title}
  strata.on('frame', m => …)   // the slide's frame changed: m.frame, m.frames, m.from, m.duration (ms this layer's own tween takes; 0 for a jump)
  strata.ready({ steps: true }) // claim the presenter's → / ← keys in Present mode
  strata.on('next', () => …)   // → pressed (only after claiming); call strata.done() when there's nothing left to show
  strata.on('prev', () => …)   // ← pressed; call strata.back() when already at the start
  strata.done() / strata.back() // hand control back to the deck (also auto-advance, e.g. when a video ends)
  strata.jumpTo('slide-id-or-title'), strata.nav('left'|'right'|'up'|'down'|'next'|'prev')
Reply with the complete snippet in one \`\`\`html block.`;
```
- `addLayer` defaults (the per-type defaults object): `component: { x: 20, y: 15, w: 60, h: 70, name: 'Component', code: COMPONENT_DEFAULT }`.
- `lname`: `l.type === 'component' ? '⧉ ' + (l.name || 'Component')`; layer-row glyph map: add `component: '⧉'`.
- Overlays: add `pe: S.interact === l.id ? 'none' : 'auto'`; overlay div style gets `pointer-events:{{ o.pe }};`.
- Render values:
```js
      addComponent: () => this.addLayer('component'),
      lyIsComponent: !!(ly && ly.type === 'component'), compName: ly && ly.name || '', onCompName: e => upL({ name: e.target.value }),
      compCode: ly && ly.type === 'component' ? ((S.compDraft || {})[ly.id] ?? ly.code ?? '') : '',
      onCompCode: e => { const v = e.target.value; this.setState(s => ({ compDraft: { ...(s.compDraft || {}), [ly.id]: v } })); },
      compDirty: !!(ly && (S.compDraft || {})[ly.id] != null && S.compDraft[ly.id] !== ly.code),
      onCompApply: () => { const d = (S.compDraft || {})[ly.id]; if (d != null) upL({ code: d }); this.setState(s => { const cd = { ...(s.compDraft || {}) }, ce = { ...(s.compErr || {}) }; delete cd[ly.id]; delete ce[ly.id]; return { compDraft: cd, compErr: ce }; }); },
      onCompRevert: () => this.setState(s => { const cd = { ...(s.compDraft || {}) }; delete cd[ly.id]; return { compDraft: cd }; }),
      compErrText: ly && (S.compErr || {})[ly.id] || '', hasCompErr: !!(ly && (S.compErr || {})[ly.id]),
      compInteract: !!(ly && S.interact === ly.id), onCompInteract: () => this.setState(s => ({ interact: s.interact === ly.id ? null : ly.id })),
      interactLabel: ly && S.interact === ly.id ? '✓ Interacting' : 'Interact',
      onCopyCompGuide: () => navigator.clipboard.writeText(COMPONENT_GUIDE).then(() => this.flash('Component guide copied: paste it into your AI'), e => this.flash('Clipboard blocked: ' + e.message)),
```
- Template: a `+ Component` button next to `+ Icon` (`onClick="{{ addComponent }}"`, same style). In the layer settings, a `<sc-if value="{{ lyIsComponent }}">` block in the same place as the text/image blocks with: Name input; a monospace `<textarea value="{{ compCode }}" onChange="{{ onCompCode }}" rows="14" spellcheck="false">`; buttons **Apply** (`onCompApply`), **Revert** (`onCompRevert`), **{{ interactLabel }}** (`onCompInteract`), **Copy AI guide** (`onCopyCompGuide`); `<sc-if value="{{ hasCompErr }}">` red mono line `{{ compErrText }}`; a short static help line: "Paste a snippet (HTML/CSS/JS), then Apply. It talks to the slide through `strata` — Copy AI guide has the details."

- [ ] **Step 4: Run** — `bun test` → all pass (the template-names test checks every new value).

- [ ] **Step 5: Commit** — `git add design/strata.dc.html app.test.ts && git commit -m "Builder: + Component, code editor with Apply/Revert, errors, Interact, AI guide"`

---

### Task 4: README

- [ ] Append to the README Usage section:

```markdown
### Components
**+ Component** (Layers) adds a live, sandboxed HTML/CSS/JS snippet you place and animate like any layer. Paste code into its editor and **Apply**. It talks to the slide through a `strata` helper: it hears `enter` / `frame`, can claim the presenter's → / ← (`strata.ready({ steps: true })`, then `next` / `prev`, handing back with `strata.done()` / `strata.back()`), and can `strata.jumpTo('slide')` or `strata.nav('right')`. **Copy AI guide** copies a brief for an AI to write one. A second → overrides a component that stops responding.
```
- [ ] `bun test` → all pass. Commit `git commit -am "Document component layers"`.
