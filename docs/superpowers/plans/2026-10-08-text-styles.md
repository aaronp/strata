# Text Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deck-wide named text styles. There are built-in H1/H2/H3/Body plus styles you add. A text layer uses a style plus overrides (or is Custom), with an "Edits apply to: This layer | <Style> style" switch and a Styles manager.

**Architecture:**
- Built-ins live in the app. `deck.styles` stores only the differences and the added styles.
- `resolveLayer()` merges a styled text layer over its style (host style first, then a linked deck's own style). The result is fed to every `Layers` render and to frame-change detection.
- Raw layers are still what editing reads and writes, so styles never get baked in by accident.
- The importer emits H1/Body styled layers.

**Tech Stack:** The Design Component app `design/strata.dc.html` (logic class driven headless by `app.test.ts`), plus `importer.ts`. Tests use Bun.

**Spec:** `docs/superpowers/specs/2026-10-08-text-styles-design.md`

## Global Constraints
- `STYLE_KEYS = ['font', 'size', 'weight', 'color', 'align', 'valign', 'lh', 'ls', 'bullets', 'gap', 'card', 'box']`.
- **Built-ins** (exact):
  - every built-in has `font: 'grot', color: null, ls: 0, align: 'left', bullets: 'none'`, and `gap: 0.15` except Body;
  - `h1`: H1, 64/800, valign bottom, lh 1.05;
  - `h2`: H2, 44/700, valign top, lh 1.1;
  - `h3`: H3, 32/600, valign top, lh 1.2;
  - `body`: Body, 32/400, valign top, lh 1.35, gap 0.35.
- **A layer's own `STYLE_KEYS` value wins only when it is not `undefined`.**
- **Resolved layers are for display and comparison only.** Never write a resolved layer back into `nodes`, except on purpose (choosing Custom, deleting a style).
- **Undo** covers `nodes` only, so style edits (`deck.styles`) aren't undoable. This is by design.
- **Tests:** run with `bun test`. The baseline is 160 passing.

## Review Focus
1. **Code paths that copy layers from `layersOf()`/`framesCur` back into nodes** (duplicate layer, duplicate frame, transition "copy into frame", apply layout, paste). Expected: a copy keeps `style` and only the real overrides; it must never bake resolved values into an override. Task 1 keeps `framesCur` raw and adds `framesShow`, and the copy-into-frame path stays raw.
2. **A layer whose `style` id no longer exists** (deleted, or missing in a linked deck). Expected: it renders as Custom from its own settings, and the Style dropdown shows Custom.
3. **Style mode with Container controls.** `upBox` writes `{card:'custom', box}` to the style. Expected: every layer using the style gets the box, and a layer with its own `card` keeps it.
4. **The text-editing overlay (`ed`) on a styled layer.** Expected: it uses resolved font, size, weight and colour, so typing doesn't jump to the defaults.
5. **Re-importing markdown into a deck whose `md-body` size was edited.** Expected: size stays as an override, and unedited keys are dropped so the layer follows Body.

---

### Task 1: Style model, resolution, rendering and change detection

**Files:**
- Modify `design/strata.dc.html`:
  - constants next to `DECK_FIELDS`, and `'styles'` added to `DECK_FIELDS` and the scratch snapshot;
  - new methods `styles()`, `resolveLayer()` and `shown()`;
  - `graft()` records the linked decks' styles;
  - in `renderVals`: tree thumbnails, `prevLayers`, the stage, ghost, frame strip and transition comparison, and the text-edit overlay.
- Test: `app.test.ts`

**Interfaces:**
- Produces:
  - `STYLE_KEYS`, `BUILTIN_STYLES`;
  - `styles(): Record<id, style>`, the effective styles;
  - `resolveLayer(layer, nodeId)`;
  - `shown(nodeId, layers)`;
  - `this._graftStyles: Record<deck, styles>`.

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`)

```ts
// ---- text styles ----
const TL = (id: string, extra: object = {}) => ({ id, type: "text", text: id, x: 5, y: 5, w: 50, h: 20, ...extra });
const styledDeck = async (extra: object = {}, layers = [TL("a", { style: "h1" }), TL("b", { style: "h1", size: 50 }), TL("c", { size: 20 })]) => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s"]), s: slideNode("s", "S", [], { frames: [{ id: "f0", layers }] }) }, extra);
  return (await mount("?deck=talk")).c;
};

test("styles resolve in order: renderer default < style < layer override; deck.styles edits built-ins; unknown style = Custom", async () => {
  const c = await styledDeck({ styles: { h1: { size: 70 }, callout: { name: "Callout", size: 28, card: "custom", box: { bg: "#ff0000" } } } });
  const S = c.styles();
  expect(Object.keys(S)).toEqual(["h1", "h2", "h3", "body", "callout"]);
  expect(S.h1).toMatchObject({ name: "H1", size: 70, weight: 800, valign: "bottom", lh: 1.05 });
  const [a, b, cc] = c.layersOf("s").map((l: any) => c.resolveLayer(l, "s"));
  expect(a).toMatchObject({ style: "h1", size: 70, weight: 800 });
  expect(b).toMatchObject({ size: 50, weight: 800 });                          // override wins
  expect(cc.size).toBe(20); expect(cc.weight).toBeUndefined();                 // Custom: untouched
  expect(c.resolveLayer(TL("z", { style: "callout" }), "s")).toMatchObject({ size: 28, card: "custom", box: { bg: "#ff0000" } });
  expect(c.resolveLayer(TL("z", { style: "gone", size: 9 }), "s")).toMatchObject({ size: 9 });
  expect(c.resolveLayer({ id: "i", type: "image", style: "h1" }, "s").size).toBeUndefined();
  expect(c.renderVals().treeNodes.find((n: any) => n.full === "S").layers[0].size).toBe(70);   // thumbnails are resolved
  expect(c.layersOf("s")[0].size).toBeUndefined();                                             // stored layers aren't
});

test("styles save only what differs from the built-ins, and round-trip", async () => {
  const c = await styledDeck();
  await c.save(); expect((await onDisk()).styles).toBeUndefined();
  c.setState({ styles: { h2: { size: 48 } } }); await c.save();
  expect((await onDisk()).styles).toEqual({ h2: { size: 48 } });
});

test("a size change that comes from different styles in two frames is detected and tweened", async () => {
  const c = await styledDeck({}, []);
  c.setNode("s", { frames: [{ id: "f0", layers: [TL("a", { style: "h1" })] }, { id: "f1", layers: [TL("a", { style: "body" })] }] });
  c.setState({ transSel: 0, stab: "frames" });
  expect(JSON.stringify(c.renderVals().transRows)).toContain("size");
});

test("a linked-in layer uses the host's style of its id, falling back to its own deck's style", async () => {
  await writeDeck("b", { ROOT: slideNode("ROOT", "", ["x"]), x: slideNode("x", "Bx", [], { frames: [{ id: "f", layers: [TL("p", { style: "h1" }), TL("q", { style: "callout" })] }] }) },
    { styles: { h1: { size: 10 }, callout: { name: "Callout", size: 33 } } });
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t"]), t: slideNode("t", "T", [], { include: "b" }) }, { styles: { h1: { size: 90 } } });
  const { c } = await mount("?deck=talk");
  const [p, q] = c.layersOf("t.x").map((l: any) => c.resolveLayer(l, "t.x"));
  expect(p.size).toBe(90); expect(q.size).toBe(33);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: the 4 new tests FAIL (`c.styles is not a function`).

- [ ] **Step 3: Implement** (in `design/strata.dc.html`)

After the `DECK_FIELDS` line, add:
```js
// Named text styles: built-ins live here; deck.styles holds only their differences and added styles. A styled layer's own STYLE_KEYS are overrides.
const STYLE_KEYS = ['font', 'size', 'weight', 'color', 'align', 'valign', 'lh', 'ls', 'bullets', 'gap', 'card', 'box'];
const STYLE_BASE = { font: 'grot', color: null, ls: 0, align: 'left', bullets: 'none', gap: 0.15 };
const BUILTIN_STYLES = {
  h1: { name: 'H1', ...STYLE_BASE, size: 64, weight: 800, valign: 'bottom', lh: 1.05 },
  h2: { name: 'H2', ...STYLE_BASE, size: 44, weight: 700, valign: 'top', lh: 1.1 },
  h3: { name: 'H3', ...STYLE_BASE, size: 32, weight: 600, valign: 'top', lh: 1.2 },
  body: { name: 'Body', ...STYLE_BASE, size: 32, weight: 400, valign: 'top', lh: 1.35, gap: 0.35 },
};
const mergeStyles = own => { const out = {}; for (const k in BUILTIN_STYLES) out[k] = { ...BUILTIN_STYLES[k], ...((own || {})[k] || {}) }; for (const k in own || {}) if (!out[k]) out[k] = own[k]; return out; };
```
Then:
- add `'styles'` to `DECK_FIELDS`, after `'rowGap'`;
- add `styles: S.styles,` to the scratch snapshot `JSON.stringify({ nodes: stripGrafts(S.nodes), … })`, after `rowGap: S.rowGap,`.

Methods, right before `layout(D) {`:
```js
  // Effective styles (built-ins + deck.styles), memoised on the state object.
  styles() { if (this._stylesOf !== this.state.styles) { this._stylesOf = this.state.styles; this._styles = mergeStyles(this.state.styles); } return this._styles; }
  // A styled text layer over its style: the host's style of that id, else (for a linked-in slide) its own deck's. Display and comparison only.
  resolveLayer(l, nodeId) {
    if (!l || l.type !== 'text' || !l.style) return l;
    const n = this.state.nodes[nodeId], st = this.styles()[l.style] || (n && n._from && ((this._graftStyles || {})[n._from] || {})[l.style]);
    if (!st) return l;
    const r = { ...l }; for (const k of STYLE_KEYS) if (r[k] === undefined && st[k] !== undefined) r[k] = st[k];
    return r;
  }
  shown(nodeId, ls) { return (ls || []).map(l => this.resolveLayer(l, nodeId)); }
```

In `graft(nodes)`:
- after `const out = stripGrafts(nodes), images = {};`, add `const gs = {};`;
- inside the `try`, after `const d = await this.fetchDeck(B);`, add `gs[B] = mergeStyles(d.styles);`;
- before `return { nodes: out, images };`, add `this._graftStyles = gs;`.

`renderVals` rendering:
- tree nodes: `layers: this.layersOf(id)` → `layers: this.shown(id, this.layersOf(id))`.
- `prevLayers: active ? this.layersOf(S.prev, S.prevFi || 0) : []` → `prevLayers: active ? this.shown(S.prev, this.layersOf(S.prev, S.prevFi || 0)) : []`.
- After the line that defines `framesCur` (`const framesCur = this.framesOf(cur); …`), add:
  ```js
  const framesShow = framesCur.map(f => ({ ...f, layers: this.shown(cur, f.layers) }));   // resolved, for display and change detection; framesCur stays raw for edits
  ```
  Then, everywhere else in `renderVals`, replace `framesCur[` / `framesCur.forEach` / `framesCur.map` with the same expressions on `framesShow`, **except** inside `copyInto` (`const src = framesCur[from].layers.find(…)`), which must stay raw. `framesCur.length` can stay as is.
- Text-edit overlay: in `const ed = edL ? { … } : {};`, use a resolved layer. Insert before it `const edR = edL && this.resolveLayer(edL, cur);`, and in the `ed` object replace every `edL.` with `edR.`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Text styles: built-ins, deck.styles, resolution for display and change detection"
```

---

### Task 2: Editing a styled layer: Style dropdown, This layer | Style switch, overrides

**Files:**
- Modify `design/strata.dc.html`:
  - new methods `setStyle`, `clearKeys`, `chooseStyle`;
  - `upL` and the text, colour and container values in `renderVals`;
  - the text-settings template;
  - `addLayer` defaults.
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `styles()`, `resolveLayer()`, `STYLE_KEYS` (Task 1)
- Produces:
  - `setStyle(id, patch)`, `clearKeys(nodeId, lid, keys)`, `chooseStyle(nodeId, lid, styleId | '')`;
  - render values `styleOpts`, `lyStyle`, `onLyStyle`, `lyStyled`, `styleTargetBtns`, `lyHasOverrides`, `onClearOverrides`, `colorLabel`, `colorOver`, `onColorReset`, `boxOver`, `onBoxReset`;
  - the fields `tf.over` and `tf.onReset` on each text field.

- [ ] **Step 1: Write the failing tests**

```ts
test("choosing a style clears overrides; Custom writes the resolved values back; each is one undo step", async () => {
  const c = await styledDeck(); await Bun.sleep(150);
  c.chooseStyle("s", "b", "h2"); c.componentDidUpdate();
  expect(c.layersOf("s")[1]).toMatchObject({ style: "h2" }); expect(c.layersOf("s")[1].size).toBeUndefined();
  c.undo(); c.componentDidUpdate(); expect(c.layersOf("s")[1]).toMatchObject({ style: "h1", size: 50 });
  c.chooseStyle("s", "a", ""); c.componentDidUpdate();
  const a = c.layersOf("s")[0]; expect(a.style).toBeUndefined(); expect(a).toMatchObject({ size: 64, weight: 800, valign: "bottom" });
});

test("This layer mode writes an override (marked, ↺ resets); Style mode edits the style for every layer using it", async () => {
  const c = await styledDeck();
  c.setState({ layerSel: "a" }); let v = c.renderVals();
  expect(v.lyStyle).toBe("h1"); expect(v.lyStyled).toBe(true); expect(v.styleOpts.map((o: any) => o.l)).toEqual(["Custom", "H1", "H2", "H3", "Body"]);
  const size = () => c.renderVals().textFields.find((f: any) => f.label.startsWith("Size"));   // an overridden label reads "Size •"
  size().onChange({ target: { value: "72" } });
  expect(c.layersOf("s")[0].size).toBe(72); expect(size().over).toBe(true); expect(c.renderVals().lyHasOverrides).toBe(true);
  size().onReset(); expect(c.layersOf("s")[0].size).toBeUndefined(); expect(size().over).toBe(false);
  c.renderVals().styleTargetBtns[1].onClick(); expect(c.state.styleTarget).toBe("style");
  size().onChange({ target: { value: "80" } });
  expect(c.state.styles).toEqual({ h1: { size: 80 } }); expect(c.layersOf("s")[0].size).toBeUndefined();
  expect(c.resolveLayer(c.layersOf("s")[0], "s").size).toBe(80);
  expect(c.resolveLayer(c.layersOf("s")[1], "s").size).toBe(50);              // b overrides size, so it keeps its own
  c.renderVals().textFields.find((f: any) => f.label.startsWith("Weight")).onChange({ target: { value: "600" } });
  expect(c.resolveLayer(c.layersOf("s")[1], "s").weight).toBe(600);           // b follows the style for weight
  c.setState({ styleTarget: "layer", layerSel: "b" }); c.renderVals().onClearOverrides();
  expect(c.layersOf("s")[1].size).toBeUndefined();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ styleOpts }}", "{{ styleTargetBtns }}", "{{ tf.onReset }}", "{{ onClearOverrides }}"]) expect(html).toContain(h);
});

test("+ Text creates a Body layer", async () => {
  const c = await styledDeck(); c.setState({ cur: "s" });
  c.addLayer("text"); const l = c.layersOf("s").at(-1);
  expect(l.style).toBe("body"); expect(l.size).toBeUndefined(); expect(c.resolveLayer(l, "s").size).toBe(32);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: FAIL (`c.chooseStyle is not a function`, `v.lyStyle` is undefined).

- [ ] **Step 3: Implement**

Methods, after `updLayer(…)`:
```js
  setStyle(id, patch) { this.setState(s => ({ styles: { ...(s.styles || {}), [id]: { ...((s.styles || {})[id] || {}), ...patch } } })); }
  clearKeys(id, lid, keys) { this.setLayers(id, ls => ls.map(l => { if (l.id !== lid) return l; const o = { ...l }; keys.forEach(k => delete o[k]); return o; })); }
  // '' = Custom: keep the look by writing the resolved values onto the layer. Otherwise adopt the style fully.
  chooseStyle(id, lid, sid) {
    this.setLayers(id, ls => ls.map(l => { if (l.id !== lid) return l;
      if (!sid) { const o = { ...this.resolveLayer(l, id) }; delete o.style; return o; }
      const o = { ...l, style: sid }; STYLE_KEYS.forEach(k => delete o[k]); return o; }));
  }
```
`addLayer`: in `D0.text`, replace everything after the geometry with `text: 'New text', style: 'body'`. The result is `text: { x: 20, y: 40, w: 60, h: 14, text: 'New text', style: 'body' }`.

`renderVals`. Replace the line `const upL = patch => ly && this.updLayer(cur, ly.id, patch);` with:
```js
    const styled = !!(ly && ly.type === 'text' && ly.style && this.styles()[ly.style]), toStyle = styled && S.styleTarget === 'style';
    const lyR = ly ? this.resolveLayer(ly, cur) : null;
    const lv = toStyle ? { ...lyR, ...this.styles()[ly.style] } : lyR;              // what the controls show: the style's values in Style mode
    const over = k => styled && ly[k] !== undefined;
    // Style mode sends style settings to the style; everything else (text, geometry, link…) always goes to the layer.
    const upL = patch => { if (!ly) return; if (!toStyle) { this.updLayer(cur, ly.id, patch); return; }
      const sp = {}, lp = {}; for (const k in patch) (STYLE_KEYS.includes(k) ? sp : lp)[k] = patch[k];
      if (Object.keys(sp).length) this.setStyle(ly.style, sp); if (Object.keys(lp).length) this.updLayer(cur, ly.id, lp); };
```
Move this block below the line that defines `ly`, if it isn't already, so that it comes after `ly` is defined.

Then show the resolved values (`lv`) in the controls:
- in `field(...)`:
  - `value: String(ly ? (ly[key] ?? fallback) : fallback)` → `value: String(lv ? (lv[key] ?? fallback) : fallback)`;
  - add `over: over(key), onReset: () => this.clearKeys(cur, ly.id, [key]),`.
- in `textFields`: the `withCur([...], ly.size || 40)`, `ly.lh || 1.2` and `ly.gap ?? 0.15` arguments read `lv.` instead of `ly.`.
- `bx`: `...(ly.box || {})` → `...(lv.box || {})`.
- `boxModes` / `boxModeLabel`: `ly.card` → `lv.card`. `setBoxMode`: `!ly.box` → `!lv.box`.
- `boxModeLabel` gets `+ (over('card') || over('box') ? ' •' : '')`.
- `curColor = ly ? ly[colorKey] : null` → `curColor = lv ? lv[colorKey] : null`.

Add to the returned object:
```js
      styleOpts: [{ v: '', l: 'Custom' }].concat(Object.entries(this.styles()).map(([id, st]) => ({ v: id, l: st.name || id }))),
      lyStyle: styled ? ly.style : '', onLyStyle: e => ly && this.chooseStyle(cur, ly.id, e.target.value), lyStyled: styled,
      styleTargetBtns: styled ? [['layer', 'This layer'], ['style', (this.styles()[ly.style].name || ly.style) + ' style']].map(([v, label]) => ({ label, ...tab((S.styleTarget === 'style' ? 'style' : 'layer') === v), onClick: () => this.setState({ styleTarget: v }) })) : [],
      lyHasOverrides: styled && STYLE_KEYS.some(over), onClearOverrides: () => ly && this.clearKeys(cur, ly.id, STYLE_KEYS),
      colorLabel: 'Colour' + (over('color') ? ' •' : ''), colorOver: over('color'), onColorReset: () => ly && this.clearKeys(cur, ly.id, ['color']),
      boxOver: over('card') || over('box'), onBoxReset: () => ly && this.clearKeys(cur, ly.id, ['card', 'box']),
```
In `textFields`' `field(...)` labels, append `' •'` when overridden: wrap each label as `label + (over(key) ? ' •' : '')`. Do this inside `field`: `label: label + (over(key) ? ' •' : '')`.

Template (text settings). Right after the `<textarea value="{{ ly.text }}" …>` line, insert:
```html
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="width:44px;font-size:12px;color:#6b6458">Style</span>
                    <select value="{{ lyStyle }}" onChange="{{ onLyStyle }}" style="flex:1;min-width:0;height:28px;padding:0 4px;border:1px solid #e0d9cb;border-radius:6px;background:#fff">
                      <sc-for list="{{ styleOpts }}" as="o" hint-placeholder-count="5"><option value="{{ o.v }}">{{ o.l }}</option></sc-for>
                    </select>
                  </div>
                  <sc-if value="{{ lyStyled }}">
                    <div style="display:flex;align-items:center;gap:6px">
                      <span style="font-size:12px;color:#6b6458;flex:none">Edits apply to</span>
                      <div style="flex:1;display:flex;gap:2px;padding:3px;border-radius:9px;background:#ece6d9">
                        <sc-for list="{{ styleTargetBtns }}" as="sb" hint-placeholder-count="2">
                          <button onClick="{{ sb.onClick }}" style="flex:1;padding:4px 6px;border:0;border-radius:7px;cursor:pointer;background:{{ sb.bg }};color:{{ sb.color }};box-shadow:{{ sb.shadow }};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ sb.label }}</button>
                        </sc-for>
                      </div>
                    </div>
                    <sc-if value="{{ lyHasOverrides }}"><button onClick="{{ onClearOverrides }}" title="Remove this layer's own settings so it follows the style" style="align-self:flex-start;padding:3px 8px;border:1px solid #e0d9cb;border-radius:6px;background:#fff;cursor:pointer;font-size:11.5px">Clear overrides</button></sc-if>
                  </sc-if>
```
In the `textFields` `<label>`:
- change its grid to `grid-template-columns:44px minmax(0,1fr) auto`;
- after `</select>`, add `<sc-if value="{{ tf.over }}"><button onClick="{{ tf.onReset }}" title="Remove this layer's override (use the style)" style="padding:0 4px;border:0;background:none;cursor:pointer;color:#6b6458">↺</button></sc-if>`.

In the Container header, after `<span …>{{ boxModeLabel }}</span>`, add:
```html
<sc-if value="{{ boxOver }}"><button onClick="{{ onBoxReset }}" title="Remove this layer's container override" style="padding:0 4px;border:0;background:none;cursor:pointer;color:#6b6458">↺</button></sc-if>
```
Replace `<span style="font-size:12px;color:#6b6458">Colour</span>` with:
```html
<span style="font-size:12px;color:#6b6458">{{ colorLabel }} <sc-if value="{{ colorOver }}"><button onClick="{{ onColorReset }}" title="Remove this layer's colour override" style="padding:0 4px;border:0;background:none;cursor:pointer;color:#6b6458">↺</button></sc-if></span>
```
This `onClick` sits in a container whose own `onClick` handles selection (`sec.box.toggle`). For `onBoxReset`, call `e.stopPropagation()`: make it `onBoxReset: e => { e && e.stopPropagation && e.stopPropagation(); ly && this.clearKeys(cur, ly.id, ['card', 'box']); }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. If an existing test asserted `+ Text` defaults (`size: 56`, `weight: 600`), update it to the Body style and ledger a `Ruling:`.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Text styles: Style dropdown, This layer | Style switch, overrides with reset; + Text is Body"
```

---

### Task 3: Styles section on the Canvas tab

**Files:**
- Modify `design/strata.dc.html`: new methods `newStyleFrom`, `deleteStyle`; `renderVals` values; the Canvas tab template.
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `styles()`, `setStyle`, `chooseStyle`, `resolveLayer` (Tasks 1–2)
- Produces:
  - `newStyleFrom(nodeId, lid): string`, the new id;
  - `deleteStyle(id)`;
  - render values `styleRows` (each `{ id, name, count, canDelete, onName, onDelete }`), `newStyleOff`, `onNewStyle`.

- [ ] **Step 1: Write the failing test**

```ts
test("Styles section: counts, rename keeps the id, new style from a layer, delete keeps the look and goes Custom", async () => {
  const c = await styledDeck();
  let v = c.renderVals();
  expect(v.styleRows.map((r: any) => [r.id, r.name, r.count, r.canDelete])).toEqual([["h1", "H1", "2 layers", false], ["h2", "H2", "0 layers", false], ["h3", "H3", "0 layers", false], ["body", "Body", "0 layers", false]]);
  v.styleRows[0].onName({ target: { value: "Heading" } }); expect(c.styles().h1.name).toBe("Heading");
  expect(c.renderVals().newStyleOff).toBe(true);
  c.setState({ layerSel: "c" }); v = c.renderVals(); expect(v.newStyleOff).toBe(false);
  v.onNewStyle();
  expect(c.styles()["style-1"]).toMatchObject({ name: "Style 1", size: 20 });
  expect(c.layersOf("s")[2]).toMatchObject({ style: "style-1" }); expect(c.layersOf("s")[2].size).toBeUndefined();
  v = c.renderVals(); const row = v.styleRows.find((r: any) => r.id === "style-1");
  expect(row.canDelete).toBe(true); row.onDelete();
  expect(c.styles()["style-1"]).toBeUndefined(); expect(c.state.styles["style-1"]).toBeUndefined();
  expect(c.layersOf("s")[2].style).toBeUndefined(); expect(c.layersOf("s")[2].size).toBe(20);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ styleRows }}", "{{ onNewStyle }}"]) expect(html).toContain(h);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test app.test.ts`
Expected: FAIL (`v.styleRows` is undefined).

- [ ] **Step 3: Implement**

Methods, after `chooseStyle`:
```js
  // A new named style from a layer's current look; the layer then uses it with no overrides.
  newStyleFrom(id, lid) {
    const l = this.layersOf(id).find(x => x.id === lid); if (!l || l.type !== 'text') return null;
    const all = this.styles(), names = Object.values(all).map(s => s.name); let n = 1; while (names.includes('Style ' + n)) n++;
    const name = 'Style ' + n, base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'style';
    let sid = base, i = 2; while (all[sid]) sid = base + '-' + i++;
    const r = this.resolveLayer(l, id), st = { name }; STYLE_KEYS.forEach(k => { if (r[k] !== undefined) st[k] = r[k]; });
    this.setState(s => ({ styles: { ...(s.styles || {}), [sid]: st } }));
    this.chooseStyle(id, lid, sid);
    return sid;
  }
  // Layers using the style keep its look (written onto them) and become Custom; linked-in slides are left alone.
  deleteStyle(sid) {
    if (BUILTIN_STYLES[sid]) return; const st = this.styles()[sid]; if (!st) return;
    this.setState(s => { const nodes = {};
      for (const k in s.nodes) { const n = s.nodes[k];
        nodes[k] = n._from || !n.frames ? n : { ...n, frames: n.frames.map(f => ({ ...f, layers: f.layers.map(l => { if (l.style !== sid) return l;
          const o = { ...l }; delete o.style; STYLE_KEYS.forEach(q => { if (o[q] === undefined && st[q] !== undefined) o[q] = st[q]; }); return o; }) })) }; }
      const { [sid]: _gone, ...styles } = s.styles || {}; return { nodes, styles }; });
  }
```
In `renderVals`, before `return {`:
```js
    const styleCount = {}; for (const k in N) { if (N[k]._from) continue; this.framesOf(k).forEach(f => f.layers.forEach(l => { if (l.style) styleCount[l.style] = (styleCount[l.style] || 0) + 1; })); }
```
Add to the returned object:
```js
      styleRows: Object.entries(this.styles()).map(([id, st]) => ({ id, name: st.name || id, count: (styleCount[id] || 0) + ' layer' + (styleCount[id] === 1 ? '' : 's'), canDelete: !BUILTIN_STYLES[id],
        onName: e => this.setStyle(id, { name: e.target.value }), onDelete: () => this.deleteStyle(id) })),
      newStyleOff: !(ly && ly.type === 'text'), onNewStyle: () => ly && this.newStyleFrom(cur, ly.id),
```
`framesOf(k)` is a frame count per node per render. That's fine for deck sizes here (ponytail: per-render scan; memoise on `nodes` if it ever shows up in a profile).

Template: in the Canvas tab, right after the Title page checkbox `</label>`, insert:
```html
            <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#6b6458">Text styles</span>
            <div style="display:flex;flex-direction:column;gap:4px">
              <sc-for list="{{ styleRows }}" as="sr" hint-placeholder-count="4">
                <div style="display:flex;align-items:center;gap:6px">
                  <input value="{{ sr.name }}" onChange="{{ sr.onName }}" title="Style name (its id stays {{ sr.id }})" style="flex:1;min-width:0;height:28px;padding:0 8px;border:1px solid #e0d9cb;border-radius:6px;background:#fff;font-size:12.5px">
                  <span style="flex:none;font-size:11.5px;color:#6b6458;width:64px;text-align:right">{{ sr.count }}</span>
                  <sc-if value="{{ sr.canDelete }}"><button onClick="{{ sr.onDelete }}" title="Delete: layers using it keep their look and become Custom" style="flex:none;width:22px;height:22px;padding:0;border:0;background:none;cursor:pointer;color:#a8301d">✕</button></sc-if>
                </div>
              </sc-for>
              <button onClick="{{ onNewStyle }}" disabled="{{ newStyleOff }}" title="Make a style from the selected text layer's look" style="align-self:flex-start;padding:5px 10px;border:1px solid #e0d9cb;border-radius:7px;background:#fff;cursor:pointer;font-size:12.5px">+ New style from selected layer</button>
            </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Text styles: Styles section (rename, counts, new from layer, delete keeps the look)"
```

---

### Task 4: Markdown import uses H1 and Body

**Files:**
- Modify: `importer.ts` (`layersFor`, `mergeLayers`)
- Test: `importer.test.ts`

**Interfaces:** none shared. It produces layers with `style: 'h1' | 'body'`.

- [ ] **Step 1: Write the failing tests** (append to `importer.test.ts`)

```ts
test("fresh import: md-title is an H1 layer and md-body a Body layer, keeping only content-driven overrides", () => {
  const d = imp(null, "# Hello\nslug: hello\n\n- one\n- two\n");
  const L = d.nodes.hello.frames[0].layers, t = L.find((l: any) => l.id === "md-title"), b = L.find((l: any) => l.id === "md-body");
  expect(t.style).toBe("h1"); for (const k of ["font", "size", "weight", "valign", "lh", "align", "color"]) expect(t[k]).toBeUndefined();
  expect(b.style).toBe("body"); expect(b.bullets).toBe("disc"); expect(typeof b.size).toBe("number"); expect(b.weight).toBeUndefined(); expect(b.lh).toBeUndefined();
});

test("re-import adopts H1/Body on older unstyled md layers, dropping unedited settings and keeping edited ones", () => {
  const old = { nodes: { ROOT: { id: "ROOT", children: ["a"] }, a: { id: "a", title: "A", body: "", children: [], frames: [{ id: "f1", layers: [
    { id: "md-title", type: "text", text: "A", font: "grot", size: 72, weight: 800, color: null, align: "left", valign: "bottom", lh: 1.05, bullets: "none", gap: 0.15, x: 6, y: 6, w: 88, h: 14 },
    { id: "md-body", type: "text", text: "Old.", font: "grot", size: 40, weight: 400, color: null, align: "left", valign: "top", lh: 1.35, bullets: "none", gap: 0.35, x: 6, y: 24, w: 88, h: 60 },
  ] }] } } };
  const d = imp(old, "# A\nslug: a\n\nNew body.\n");
  const L = d.nodes.a.frames[0].layers, t = L.find((l: any) => l.id === "md-title"), b = L.find((l: any) => l.id === "md-body");
  expect(t).toMatchObject({ style: "h1", size: 72 }); expect(t.weight).toBeUndefined(); expect(t.lh).toBeUndefined();   // 72 was edited, so it stays
  expect(b).toMatchObject({ style: "body", text: "New body.", size: 40 }); expect(b.weight).toBeUndefined();
  const again = imp({ nodes: d.nodes }, "# A\nslug: a\n\nNew body.\n");
  expect(again.nodes.a.frames[0].layers.find((l: any) => l.id === "md-title")).toMatchObject({ style: "h1", size: 72 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test importer.test.ts`
Expected: FAIL (`t.style` is undefined).

- [ ] **Step 3: Implement** (in `importer.ts`)

In `layersFor`, replace the `md-title` and `md-body` construction:
```ts
  const L: any[] = [{ id: "md-title", type: "text", style: "h1", text: s.title, x: 6, y: 6, w: 88, h: 14, rot: 0, opacity: 1 }];
  if (s.text) L.push({ id: "md-body", type: "text", style: "body", text: s.text, x: 6, y: 24, w: s.links.length ? 56 : 88, h: 60, rot: 0, opacity: 1,
    size: bodySize(s.text), bullets: s.bulletsOnly ? "disc" : "none" });
```
Leave the `md-link-*` and `md-src-*` layers as they are; they use `text(...)` and stay Custom.

Above `mergeLayers`, add:
```ts
// What the importer generated before styles: an older unstyled md layer still holding these values never had them edited, so they're dropped in favour of the style.
const OLD_GEN: Record<string, Record<string, unknown>> = {
  "md-title": { font: "grot", size: 64, weight: 800, color: null, align: "left", valign: "bottom", lh: 1.05, bullets: "none", gap: 0.15 },
  "md-body": { font: "grot", weight: 400, color: null, align: "left", valign: "top", lh: 1.35, gap: 0.35 },
};
```
In `mergeLayers`, change the `kept` mapping's first line from `const g = byId.get(l.id); if (!g) return l;` to:
```ts
    const g = byId.get(l.id); if (!g) return l;
    if (g.style && !l.style) { l = { ...l, style: g.style }; for (const [k, v] of Object.entries(OLD_GEN[l.id] ?? {})) if (l[k] === v) delete l[k]; }
```
`l` must be reassignable, so change the arrow parameter from `l =>` to `(l: any) =>` if it is typed `const`-like. Keep the rest (`const u = { ...g, ...l }; …CONTENT…`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. Some existing importer and app tests may assert the old explicit `md-title`/`md-body` style values (e.g. `weight: 800`, `size: 64`). Update each to assert the style, or the resolved value via the app, and ledger one `Ruling:` listing them. The re-import test "keeps builder layout…" (`md-body` size 99) must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add importer.ts importer.test.ts
git commit -m "Text styles: markdown import makes H1 titles and Body text; re-import adopts styles on older decks"
```

---

### Task 5: Check it in the real app

**Files:** none, unless a fix is needed. A fix gets a failing test first.

The sandbox blocks local port binding, so these steps are for the user:
- [ ] In `make dev`, select a slide title on an imported deck. Expected: Style is H1. Switch to **H1 style**, change Size, and every slide's title changes. Switch to **This layer**, change Size, and you see a dot and ↺ on that layer only.
- [ ] Canvas tab → Text styles: rename H1, then make "+ New style from selected layer" on a body text and delete it. Expected: the text keeps its look and becomes Custom.
- [ ] Two frames where a layer goes H1 → Body. Expected: Preview animates the size change.
- [ ] Re-import a markdown deck with `make import DECK=<slug>`. Expected: titles and bodies become H1/Body without changing their look.
