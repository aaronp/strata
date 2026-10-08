# Inline Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Format part of a text layer with inline markup: `**bold**`, `*italic*`, and `[words]{style=h2 size=72 color=#d9432b font=serif weight=600}`.
- Markup is edited in the existing on-stage textarea, through a formatting bar.
- It renders as styled runs.
- It survives markdown import and export.

**Architecture:**
- **Pure functions** `parseRich`, `plainText` and `applyFormat` live at module level in `design/strata.dc.html`. They're exposed for tests as `Component.rich`.
- **`resolveLayer()`** adds display-only `_lines` (runs per line) to every text layer.
- **`Layers.dc.html`** renders runs as spans.
- **The editor** gains a formatting bar (`formatSel`), ⌘B / ⌘I, and a blur that keeps editing when focus moves into the bar.
- **`markdown.ts`** stops stripping `**`. The importer's node titles become plain text.

**Tech Stack:** Design Component app plus `Layers.dc.html`, `markdown.ts` and `importer.ts`. Tests use Bun (`app.test.ts`, `layers.test.ts`, `markdown.test.ts`, `importer.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-08-inline-formatting-design.md`

## Global Constraints
- **Grammar:**
  - `**`, `*` and `***`;
  - `[…]{k=v …}` with keys `style`, `size`, `color`, `font`, `weight`;
  - escapes `\* \[ \] \{ \} \\`.
- **Spans never cross lines.**
- **Malformed markup renders literally.** Nothing is dropped.
- **`style=` in a span brings `font, size, weight, color, ls` only.** Explicit attributes in the same span override it.
- **`_lines` is display-only and must never be written into `nodes`.** `chooseStyle('')` uses `resolveLayer`, so it must strip `_lines`.
- **Tests:** run with `bun test`. The baseline is 175 passing.

## Review Focus
1. **Whitespace between run spans.** Expected: no stray spaces appear between runs in rendered text. The template must keep the run `<sc-for>` and its spans on one line, with no whitespace between tags.
2. **Formatting with the bar's dropdowns and colour input.** Expected: the editor stays open, the remembered selection is used, and focus returns to the textarea afterwards.
3. **Typing `*` or `[` in normal prose** (e.g. "5 * 3", "[draft]"). Expected: shown literally, unchanged.
4. **Layers rendered from raw data without `_lines`** (any path that bypasses `resolveLayer`). Expected: identical to today's plain rendering.
5. **Imported markdown that already used `**bold**` in bodies.** Expected: it now renders bold, where before it was stripped. That's intended, but check the example decks look right.

---

### Task 1: Pure markup functions: `parseRich`, `plainText`, `applyFormat`

**Files:**
- Modify: `design/strata.dc.html` (module-level functions next to `STYLE_KEYS`, plus `static rich` on `Component`)
- Test: `app.test.ts`

**Interfaces:**
- Produces:
  - `parseRich(line, lookupStyle?) → Run[]`, where `Run = { text, b?, i?, size?, color?, font?, weight?, ls? }`;
  - `plainText(text) → string`;
  - `applyFormat(text, start, end, op) → { text, start, end }`, where `op` is `{bold:true} | {italic:true} | {attrs:{k: v|null}} | {clear:true}`;
  - `Component.rich = { parseRich, plainText, applyFormat }`.

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`)

```ts
// ---- inline formatting ----
const rich = async () => (await mount("")).c.constructor.rich;

test("parseRich: bold, italic, spans with attributes and styles, nesting, escapes, literal on malformed, merged runs", async () => {
  const { parseRich } = await rich();
  const st = (id: string) => (id === "h2" ? { size: 44, weight: 700, color: "#111111", font: "grot", ls: 0, align: "center", lh: 2 } : null);
  expect(parseRich("plain")).toEqual([{ text: "plain" }]);
  expect(parseRich("a **b** *c* ***d***")).toEqual([{ text: "a " }, { text: "b", b: true }, { text: " " }, { text: "c", i: true }, { text: " " }, { text: "d", b: true, i: true }]);
  expect(parseRich("[x]{size=72 color=#d9432b font=serif weight=600}")).toEqual([{ text: "x", size: 72, color: "#d9432b", font: "serif", weight: 600 }]);
  expect(parseRich("[x]{style=h2 size=50}", st)).toEqual([{ text: "x", size: 50, weight: 700, color: "#111111", font: "grot", ls: 0 }]);   // character settings only; explicit wins
  expect(parseRich("[a [b]{size=9} c]{size=20}")).toEqual([{ text: "a ", size: 20 }, { text: "b", size: 9 }, { text: " c", size: 20 }]);
  expect(parseRich("**[x]{color=red}**")).toEqual([{ text: "x", b: true, color: "red" }]);
  expect(parseRich("[x]{bogus=1 size=abc weight=950 style=nope}", st)).toEqual([{ text: "x" }]);
  for (const lit of ["5 * 3", "**open", "[draft]", "[x](http://a.b)", "[x]{size=3", "a * b * c"]) expect(parseRich(lit).map((r: any) => r.text).join("")).toBe(lit);
  expect(parseRich("\\*not\\* \\[x\\]")).toEqual([{ text: "*not* [x]" }]);
  expect(parseRich("")).toEqual([{ text: " " }]);
});

test("plainText strips markup line by line", async () => {
  const { plainText } = await rich();
  expect(plainText("a **b** [c]{size=9}\n\n*d* \\*e")).toBe("a b c\n\nd *e");
});

test("applyFormat: toggles bold, wraps lines, updates or unwraps spans, clears, and keeps the selection on the same words", async () => {
  const { applyFormat } = await rich();
  let r = applyFormat("say hello now", 4, 9, { bold: true });
  expect(r).toEqual({ text: "say **hello** now", start: 6, end: 11 });
  expect(applyFormat(r.text, r.start, r.end, { bold: true })).toEqual({ text: "say hello now", start: 4, end: 9 });
  expect(applyFormat("ab\n\ncd", 0, 6, { italic: true }).text).toBe("*ab*\n\n*cd*");
  r = applyFormat("big word", 0, 3, { attrs: { size: 72 } });
  expect(r).toEqual({ text: "[big]{size=72} word", start: 1, end: 4 });
  r = applyFormat(r.text, r.start, r.end, { attrs: { color: "#ff0000" } });
  expect(r.text).toBe("[big]{size=72 color=#ff0000} word");
  r = applyFormat(r.text, r.start, r.end, { attrs: { size: null, color: null } });
  expect(r).toEqual({ text: "big word", start: 0, end: 3 });
  expect(applyFormat("a **b** [c]{size=9}", 0, 0, { clear: true }).text).toBe("a b c");
  expect(applyFormat("a **b** c", 2, 7, { clear: true })).toEqual({ text: "a b c", start: 2, end: 3 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: the 3 new tests FAIL (`rich` is undefined, so destructuring fails).

- [ ] **Step 3: Implement** (module level, right after the `mergeStyles` line)

```js
// ---- Inline markup: **bold**, *italic*, [words]{style=h2 size=72 color=#hex font=serif weight=600}, \ escapes. Per line; malformed markup is literal.
const ESC = '*[]{}\\';
const runKeys = ['b', 'i', 'size', 'color', 'font', 'weight', 'ls'];
const unesc = (s, j) => (s[j] === '\\' && j + 1 < s.length && ESC.includes(s[j + 1]));
const matchBracket = (s, j) => { let d = 0; for (let k = j; k < s.length; k++) { if (unesc(s, k)) { k++; continue; } if (s[k] === '[') d++; else if (s[k] === ']' && --d === 0) return k; } return -1; };
const closeBrace = (s, j) => { for (let k = j; k < s.length; k++) { if (unesc(s, k)) { k++; continue; } if (s[k] === '}') return k; } return -1; };
const spanEnd = (s, j) => { const rb = matchBracket(s, j); if (rb < 0 || s[rb + 1] !== '{') return -1; const cb = closeBrace(s, rb + 2); return cb < 0 ? -1 : cb + 1; };
// Next closing run of exactly n stars at or after j (skipping escapes, whole spans, and longer star runs).
const findStars = (s, j, n) => { for (let k = j; k < s.length; k++) { if (unesc(s, k)) { k++; continue; } if (s[k] === '[') { const e = spanEnd(s, k); if (e > 0) { k = e - 1; continue; } }
  if (s[k] === '*') { let m = 0; while (s[k + m] === '*') m++; if (m === n && !/\s/.test(s[k - 1])) return k; k += m - 1; } } return -1; };   // a closer can't follow whitespace
const attrsOf = str => { const a = {}; String(str).trim().split(/\s+/).forEach(p => { const m = /^(\w+)=(\S+)$/.exec(p); if (m) a[m[1]] = m[2]; }); return a; };
const spanFmt = (fmt, a, lookupStyle) => {
  const f = { ...fmt }, st = a.style && lookupStyle ? lookupStyle(a.style) : null;
  if (st) ['font', 'size', 'weight', 'color', 'ls'].forEach(k => { if (st[k] !== undefined && st[k] !== null) f[k] = st[k]; });
  if (+a.size > 0) f.size = +a.size;
  if (/^[1-9]00$/.test(a.weight || '')) f.weight = +a.weight;
  if (/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(a.color || '')) f.color = a.color;
  if (a.font && FONT_CSS[a.font]) f.font = a.font;
  return f;
};
function parseRich(line, lookupStyle) {
  const out = [];
  const push = (text, fmt) => { if (!text) return; const last = out[out.length - 1];
    if (last && runKeys.every(k => last[k] === fmt[k])) last.text += text; else { const r = { text }; runKeys.forEach(k => { if (fmt[k] !== undefined) r[k] = fmt[k]; }); out.push(r); } };
  const walk = (s, fmt) => {
    let i = 0, buf = ''; const flush = () => { push(buf, fmt); buf = ''; };
    while (i < s.length) {
      if (unesc(s, i)) { buf += s[i + 1]; i += 2; continue; }
      if (s[i] === '*') { let n = 0; while (s[i + n] === '*') n++; n = Math.min(n, 3);
        const c = findStars(s, i + n, n);
        if (c > i + n && !/\s/.test(s[i + n])) { flush();   // an opener can't precede whitespace, so "5 * 3" stays literal
          walk(s.slice(i + n, c), { ...fmt, ...(n !== 1 ? { b: true } : {}), ...(n !== 2 ? { i: true } : {}) }); i = c + n; continue; }
        buf += s.slice(i, i + n); i += n; continue; }
      if (s[i] === '[') { const rb = matchBracket(s, i), e = spanEnd(s, i);
        if (e > 0) { flush(); walk(s.slice(i + 1, rb), spanFmt(fmt, attrsOf(s.slice(rb + 2, e - 1)), lookupStyle)); i = e; continue; } }
      buf += s[i]; i++;
    }
    flush();
  };
  walk(String(line), {});
  return out.length ? out : [{ text: ' ' }];
}
const plainText = text => String(text ?? '').split('\n').map(l => l === '' ? '' : parseRich(l).map(r => r.text).join('')).join('\n');
// Format the [start,end) selection; returns the new text and a selection on the same words (inside any markers).
function applyFormat(text, start, end, op) {
  text = String(text ?? '');
  if (op.clear) { if (start === end) { const t = plainText(text); return { text: t, start: 0, end: t.length }; }
    const p = plainText(text.slice(start, end)); return { text: text.slice(0, start) + p + text.slice(end), start, end: start + p.length }; }
  const wrapLines = (open, close) => { const pieces = text.slice(start, end).split('\n'); const w = pieces.map(p => p ? open + p + close : p).join('\n');
    const first = pieces[0] ? open.length : 0, last = pieces[pieces.length - 1] ? close.length : 0;
    return { text: text.slice(0, start) + w + text.slice(end), start: start + first, end: start + w.length - last }; };
  if (op.bold || op.italic) { const d = op.bold ? '**' : '*';
    if (text.slice(start - d.length, start) === d && text.slice(end, end + d.length) === d && text[start - d.length - 1] !== '*' && text[end + d.length] !== '*')
      return { text: text.slice(0, start - d.length) + text.slice(start, end) + text.slice(end + d.length), start: start - d.length, end: end - d.length };
    return wrapLines(d, d); }
  if (op.attrs) {
    const fmtA = a => Object.entries(a).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => k + '=' + v).join(' ');
    if (text[start - 1] === '[' && text.slice(end, end + 2) === ']{') { const cb = closeBrace(text, end + 2);
      if (cb > 0) { const a = { ...attrsOf(text.slice(end + 2, cb)), ...op.attrs }; const s2 = fmtA(a), inner = text.slice(start, end);
        if (!s2) return { text: text.slice(0, start - 1) + inner + text.slice(cb + 1), start: start - 1, end: end - 1 };
        return { text: text.slice(0, start - 1) + '[' + inner + ']{' + s2 + '}' + text.slice(cb + 1), start, end }; } }
    const s2 = fmtA(op.attrs); if (!s2) return { text, start, end };
    return wrapLines('[', ']{' + s2 + '}'); }
  return { text, start, end };
}
```
In `class Component extends DCLogic {`, add as the first line of the body:
```js
  static rich = { parseRich, plainText, applyFormat };
```
`FONT_CSS` must be defined before `spanFmt` is called. It is, because `FONT_CSS` is module-level and used at call time.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. If a `parseRich` expectation differs only in run-merging order, fix the code, not the test. These tests encode the spec.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Inline formatting: parseRich, plainText, applyFormat"
```

---

### Task 2: Runs on display: `resolveLayer` adds `_lines`; `Layers.dc.html` renders runs; plain names

**Files:**
- Modify:
  - `design/strata.dc.html`: `resolveLayer`, `chooseStyle`, `lname`, `lname2`;
  - `design/Layers.dc.html`: the line template and the `lines` mapping.
- Test: `app.test.ts`, `layers.test.ts`

**Interfaces:**
- Consumes: `parseRich`, `plainText` (Task 1)
- Produces:
  - `resolveLayer(l).\_lines` for every text layer;
  - in `Layers`, `items[].lines[].runs[]`, each `{ text, fw, fst, fsz, col, fam, lsp }`.

- [ ] **Step 1: Write the failing tests**

Append to `app.test.ts`:
```ts
test("resolveLayer gives every text layer display runs, with style spans looked up like layer styles; names are plain", async () => {
  const c = await styledDeck({ styles: { h2: { size: 41 } } }, [TL("a", { text: "x [y]{style=h2} **z**" }), TL("b", { style: "h1", text: "plain" })]);
  const [a, b] = c.layersOf("s").map((l: any) => c.resolveLayer(l, "s"));
  expect(a._lines).toEqual([[{ text: "x " }, { text: "y", size: 41, weight: 700, font: "grot", ls: 0 }, { text: " " }, { text: "z", b: true }]]);   // H2's colour is null, so it's not taken
  expect(b._lines).toEqual([[{ text: "plain" }]]);
  expect(c.layersOf("s")[0]._lines).toBeUndefined();                         // never stored
  c.chooseStyle("s", "a", ""); expect(c.layersOf("s")[0]._lines).toBeUndefined();
  c.setState({ layerSel: "a" }); expect(c.renderVals().layerRows.find((r: any) => r.name.startsWith("x")).name).toBe("x y z");
});
```

Append to `layers.test.ts`:
```ts
test("text runs render as spans with their own weight, style, size, colour and font; plain text renders as one run", () => {
  const v = render({ layers: [txt({ text: "a b", _lines: [[{ text: "a " }, { text: "b", b: true, i: true, size: 32, color: "#ff0000", font: "serif" }]] })] });
  expect(v.items[0].lines[0].runs).toEqual([
    { text: "a ", fw: "", fst: "", fsz: "", col: "", fam: "", lsp: "" },
    { text: "b", fw: "bolder", fst: "italic", fsz: "2cqw", col: "#ff0000", fam: "'DM Serif Display',serif", lsp: "" }]);
  expect(render({ layers: [txt()] }).items[0].lines[0].runs).toEqual([{ text: "Hi", fw: "", fst: "", fsz: "", col: "", fam: "", lsp: "" }]);
  const w = render({ layers: [txt({ text: "x", _lines: [[{ text: "x", b: true, weight: 300 }]] })] });
  expect(w.items[0].lines[0].runs[0].fw).toBe(300);                           // an explicit weight wins over bold
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts layers.test.ts`
Expected: FAIL (`_lines` is undefined; `runs` is undefined).

- [ ] **Step 3: Implement**

`design/strata.dc.html`, `resolveLayer`. Replace the method body with:
```js
  resolveLayer(l, nodeId) {
    if (!l || l.type !== 'text') return l;
    const n = this.state.nodes[nodeId], look = sid => this.styles()[sid] || (n && n._from && ((this._graftStyles || {})[n._from] || {})[sid]) || null;
    const st = l.style ? look(l.style) : null, r = { ...l };
    if (st) for (const k of STYLE_KEYS) if (r[k] === undefined && st[k] !== undefined) r[k] = st[k];
    r._lines = String(r.text ?? '').split('\n').map(line => parseRich(line, look));   // display-only runs; never saved
    return r;
  }
```
`chooseStyle`: change `if (!sid) return { ...this.resolveLayer(l, id), style: '' };` to:
```js
if (!sid) { const { _lines, ...o } = this.resolveLayer(l, id); return { ...o, style: '' }; }
```
`lname` and `lname2`: replace `String(l.text || '').split('\n')[0]` with `plainText(l.text).split('\n')[0]` in both.

`design/Layers.dc.html`. In the `lines` mapping inside the `l.type === 'text'` branch, replace the `const lines = raw.map(...)` line with:
```js
        const run = r => ({ text: r.text, fw: r.weight || (r.b ? 'bolder' : ''), fst: r.i ? 'italic' : '', fsz: r.size ? r.size / 16 + 'cqw' : '', col: r.color || '', fam: r.font ? (FONTS[r.font] || '') : '', lsp: r.ls ? r.ls + 'em' : '' });
        const lines = raw.map((t, i) => ({ text: t === '' ? ' ' : t, runs: ((l._lines && l._lines[i]) || [{ text: t === '' ? ' ' : t }]).map(run),
          hasMark: b !== 'none' && t !== '', mark: b === 'number' ? (raw.slice(0, i + 1).filter(x => x !== '').length) + '.' : MARKS[b] || '' }));
```
`lsp` uses `em`, the unit the layer's own `letter-spacing:{{ e.ls }}` uses. Check that the template appends `em` to `e.ls`; if it uses another unit, match it.

In the template, replace:
```html
              <span style="white-space:pre-wrap;text-wrap:pretty;min-width:0">{{ ln.text }}</span>
```
with this single line. The run spans must not have whitespace between them:
```html
              <span style="white-space:pre-wrap;text-wrap:pretty;min-width:0"><sc-for list="{{ ln.runs }}" as="r" hint-placeholder-count="1"><span style="font-weight:{{ r.fw }};font-style:{{ r.fst }};font-size:{{ r.fsz }};color:{{ r.col }};font-family:{{ r.fam }};letter-spacing:{{ r.lsp }}">{{ r.text }}</span></sc-for></span>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. Existing `layers.test.ts` tests that read `lines[i].text` still pass, because `text` is kept.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html design/Layers.dc.html app.test.ts layers.test.ts
git commit -m "Inline formatting: runs on display (resolveLayer _lines, Layers spans); plain layer names"
```

---

### Task 3: Formatting bar, ⌘B / ⌘I, and a blur that keeps editing

**Files:**
- Modify `design/strata.dc.html`:
  - new methods `formatSel`, `focusInBar`;
  - `stopEditing`;
  - `onKey`'s typing branch;
  - `renderVals` values;
  - the editor textarea and bar template.
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `applyFormat` (Task 1)
- Produces:
  - `formatSel(op)` and `focusInBar(): boolean`;
  - render values `fmtShow`, `fmtPos`, `fmtStyleOpts`, `fmtSizeOpts`, `onFmtBold`, `onFmtItalic`, `onFmtStyle`, `onFmtSize`, `onFmtColor`, `onFmtClear`, `fmtDown`, `onEditSel`.

- [ ] **Step 1: Write the failing test**

```ts
test("formatting bar: shown only while editing; formats the remembered selection; ⌘B works in the editor; blur into the bar keeps editing", async () => {
  const c = await styledDeck({}, [TL("a", { text: "say hello now" })]);
  expect(c.renderVals().fmtShow).toBe(false);
  c.setState({ editing: "a", layerSel: "a" }); let v = c.renderVals();
  expect(v.fmtShow).toBe(true); expect(v.fmtStyleOpts.map((o: any) => o.l)).toEqual(["Plain", "H1", "H2", "H3", "Body"]);
  v.onEditSel({ target: { selectionStart: 4, selectionEnd: 9 } });
  v.onFmtBold();
  expect(c.layersOf("s")[0].text).toBe("say **hello** now");
  c.renderVals().onFmtSize({ target: { value: "72" } });
  expect(c.layersOf("s")[0].text).toBe("say **[hello]{size=72}** now");
  const ta = { tagName: "TEXTAREA", focus() {}, setSelectionRange() {} }; c.editRef.current = ta;
  c._sel = { start: 0, end: 3 };
  c.onKey({ key: "i", metaKey: true, shiftKey: false, target: ta, preventDefault() {} });
  expect(c.layersOf("s")[0].text).toBe("*say* **[hello]{size=72}** now");
  c.focusInBar = () => true; c.renderVals().stopEditing(); await Bun.sleep(5); expect(c.state.editing).toBe("a");
  c.focusInBar = () => false; c.renderVals().stopEditing(); await Bun.sleep(5); expect(c.state.editing).toBeNull();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ['data-role="fmtbar"', "{{ onFmtBold }}", "{{ onEditSel }}"]) expect(html).toContain(h);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test app.test.ts`
Expected: FAIL (`fmtShow` is undefined).

- [ ] **Step 3: Implement**

Methods, after `chooseStyle`:
```js
  // Format the editor's selection (live if the textarea has focus, else the last remembered one), then put focus and selection back.
  formatSel(op) {
    const id = this.curId(), l = this.layersOf(id).find(x => x.id === this.state.editing); if (!l) return;
    const t = this.editRef.current, live = t && typeof document !== 'undefined' && document.activeElement === t;
    const sel = live ? { start: t.selectionStart, end: t.selectionEnd } : (this._sel || { start: 0, end: 0 });
    const r = applyFormat(l.text, sel.start, sel.end, op);
    this.updLayer(id, l.id, { text: r.text }); this._sel = { start: r.start, end: r.end };
    setTimeout(() => { const t2 = this.editRef.current; if (t2 && t2.focus) { t2.focus(); t2.setSelectionRange && t2.setSelectionRange(r.start, r.end); } }, 0);
  }
  focusInBar() { const a = typeof document !== 'undefined' && document.activeElement; return !!(a && a.closest && a.closest('[data-role="fmtbar"]')); }
```
`renderVals`: replace `stopEditing: () => this.setState({ editing: null }),` with:
```js
      stopEditing: () => setTimeout(() => { if (!this.focusInBar()) this.setState({ editing: null }); }, 0),   // a click into the formatting bar keeps editing
      onEditSel: e => { this._sel = { start: e.target.selectionStart, end: e.target.selectionEnd }; },
```
Add to the returned object:
```js
      fmtShow: !!edL && editable, fmtPos: edL ? (edL.y < 12 ? `left:${edL.x}%;top:calc(${edL.y + Math.max(edL.h, mh[edL.id] || 0)}% + 6px)` : `left:${edL.x}%;top:calc(${edL.y}% - 40px)`) : '',
      fmtStyleOpts: [{ v: '', l: 'Plain' }].concat(Object.entries(this.styles()).filter(([, st]) => !st.deleted).map(([id, st]) => ({ v: id, l: st.name || id }))),
      fmtSizeOpts: [{ v: '', l: 'Size' }].concat([12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 96, 128].map(v => ({ v: String(v), l: v + ' px' }))),
      fmtDown: e => e.preventDefault(), onFmtBold: () => this.formatSel({ bold: true }), onFmtItalic: () => this.formatSel({ italic: true }),
      onFmtStyle: e => this.formatSel({ attrs: { style: e.target.value || null } }), onFmtSize: e => this.formatSel({ attrs: { size: e.target.value || null } }),
      onFmtColor: e => this.formatSel({ attrs: { color: e.target.value } }), onFmtClear: () => this.formatSel({ clear: true }),
```
(`edL` and `mh` already exist in `renderVals`. `edL` is the layer being edited.)

`onKey`. In the `if (typing) {` branch, add as its first line:
```js
      if (t === this.editRef.current && (e.metaKey || e.ctrlKey) && /^[bi]$/i.test(k)) { e.preventDefault(); this.formatSel(k.toLowerCase() === 'b' ? { bold: true } : { italic: true }); return; }
```

Template:
- On the editor `<textarea ref="{{ editRef }}" …>`, add `onSelect="{{ onEditSel }}" onKeyUp="{{ onEditSel }}" onPointerUp="{{ onEditSel }}"`.
- Directly after that `<textarea …>` element, still inside its `<sc-if value="{{ isEditingText }}">`, add:
```html
                    <sc-if value="{{ fmtShow }}">
                      <div data-role="fmtbar" onPointerDown="{{ stopProp }}" style="position:absolute;{{ fmtPos }};z-index:30;display:flex;align-items:center;gap:4px;padding:4px;border-radius:9px;background:#fbf9f4;box-shadow:0 4px 14px rgba(0,0,0,.25)">
                        <button onPointerDown="{{ fmtDown }}" onClick="{{ onFmtBold }}" title="Bold (⌘B)" style="width:26px;height:26px;padding:0;border:1px solid #e0d9cb;border-radius:6px;background:#fff;cursor:pointer;font-weight:800">B</button>
                        <button onPointerDown="{{ fmtDown }}" onClick="{{ onFmtItalic }}" title="Italic (⌘I)" style="width:26px;height:26px;padding:0;border:1px solid #e0d9cb;border-radius:6px;background:#fff;cursor:pointer;font-style:italic;font-family:serif">I</button>
                        <select value="" onChange="{{ onFmtStyle }}" title="Style for the selection" style="height:26px;border:1px solid #e0d9cb;border-radius:6px;background:#fff;font-size:12px"><sc-for list="{{ fmtStyleOpts }}" as="o" hint-placeholder-count="5"><option value="{{ o.v }}">{{ o.l }}</option></sc-for></select>
                        <select value="" onChange="{{ onFmtSize }}" title="Size for the selection" style="height:26px;border:1px solid #e0d9cb;border-radius:6px;background:#fff;font-size:12px"><sc-for list="{{ fmtSizeOpts }}" as="o" hint-placeholder-count="5"><option value="{{ o.v }}">{{ o.l }}</option></sc-for></select>
                        <input type="color" onChange="{{ onFmtColor }}" title="Colour for the selection" style="width:28px;height:26px;padding:0;border:1px solid #e0d9cb;border-radius:6px;background:#fff">
                        <button onPointerDown="{{ fmtDown }}" onClick="{{ onFmtClear }}" title="Clear formatting (the selection, or all if nothing is selected)" style="height:26px;padding:0 7px;border:1px solid #e0d9cb;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">⌫ Clear</button>
                      </div>
                    </sc-if>
```
The bar is positioned in the same coordinate space as the textarea. Check that the textarea's container is the stage box, so `%` values match `ed.l`/`ed.t`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass, including "every {{ name }} the app template uses is provided by renderVals".

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Inline formatting: formatting bar, ⌘B/⌘I, blur into the bar keeps editing"
```

---

### Task 4: Markdown keeps markup; node titles are plain

**Files:**
- Modify: `markdown.ts` (`parseBody`, the heading parse, slugify, exported `plainText`), `importer.ts` (node `title`)
- Test: `markdown.test.ts`, `importer.test.ts`

**Interfaces:**
- Produces: `plainText(text)` exported from `markdown.ts`

- [ ] **Step 1: Write the failing tests**

Append to `markdown.test.ts` (add `plainText` to the `./markdown` import):
```ts
test("markup survives parsing: bold, italic and spans in bodies and headings; slugs come from the plain title", () => {
  const r = parseMarkdown("# The **big** [idea]{size=80}\n\nSay **this** and *that* [loud]{color=#d9432b}.\n");
  expect(r.sections[0].title).toBe("The **big** [idea]{size=80}");
  expect(r.sections[0].slug).toBe("the-big-idea");
  expect(r.sections[0].text).toBe("Say **this** and *that* [loud]{color=#d9432b}.");
});

test("plainText (markdown.ts) matches the app's cases", () => {
  expect(plainText("a **b** [c]{size=9}\n\n*d* \\*e")).toBe("a b c\n\nd *e");
  expect(plainText("[a [b]{size=9} c]{size=20}")).toBe("a b c");
  expect(plainText("5 * 3 and [draft]")).toBe("5 * 3 and [draft]");
});

test("export keeps body markup, so it re-imports formatted", () => {
  const nodes: any = { ROOT: node("ROOT", "", ["s"], null), s: node("s", "S", [], [T("b", "Say **this** [now]{size=72}", 30)]) };
  const md = toMarkdown(nodes, "s", { deck: "d", date: "x" });
  expect(md).toContain("Say **this** [now]{size=72}");
  expect(parseMarkdown(md).sections[0].text).toBe("Say **this** [now]{size=72}");
});
```
Append to `importer.test.ts`:
```ts
test("import: md-title keeps the heading's markup, the node title is plain", () => {
  const d = imp(null, "# The **big** idea\nslug: big\n");
  expect(d.nodes.big.title).toBe("The big idea");
  expect(d.nodes.big.frames[0].layers.find((l: any) => l.id === "md-title").text).toBe("The **big** idea");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test markdown.test.ts importer.test.ts`
Expected: FAIL (`**` is stripped; `plainText` isn't exported).

- [ ] **Step 3: Implement**

`markdown.ts`:
- in `parseBody`'s `entry`, delete the `.replace(/\*\*/g, "")` call. The chain ends after the `EXT` replace.
- in the heading parse, change `title: h[2].replace(/\*\*/g, "")` to `title: h[2]`.
- change `r.slug = slugify(r.title) || …` to `r.slug = slugify(plainText(r.title)) || …`.
- add, near `slugify`:
```ts
// Inline markup → plain text (a regex mirror of the app's parser for titles and slugs): spans keep their words, ** and * markers go, escapes become literal.
export function plainText(t: string): string {
  let s = String(t ?? ""), prev;
  do { prev = s; s = s.replace(/\[([^\[\]]*)\]\{[^}]*\}/g, "$1"); } while (s !== prev);   // innermost spans first
  return s.replace(/\*\*\*(?=\S)(.+?)\*\*\*/g, "$1").replace(/\*\*(?=\S)(.+?)\*\*/g, "$1").replace(/(^|[^*])\*(?=\S)([^*]+?)\*/g, "$1$2").replace(/\\([*[\]{}\\])/g, "$1");
}
```
Check: `"5 * 3"` stays literal, because `* 3` has whitespace after the `*`.

`importer.ts`: change the node's `title: s.title` to `title: plainText(s.title)`, importing `plainText` from `./markdown`. `layersFor` keeps `text: s.title` (with markup) for `md-title`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. An existing `markdown.test.ts` test asserting that `**bold**` is stripped from body text (e.g. "Intro **bold** text." → "Intro bold text.") now fails by design. Update it to expect the markup kept, and ledger a `Ruling:`.

- [ ] **Step 5: Commit**

```bash
git add markdown.ts importer.ts markdown.test.ts importer.test.ts
git commit -m "Inline formatting: markdown keeps bold/italic/spans; node titles are plain"
```

---

### Task 5: Check it in the real app

The sandbox blocks local port binding, so these steps are for the user:
- [ ] Run `make dev`. Double-click a text layer, select a word, and press **B**, then Size 72. Expected: the editor shows `**[word]{size=72}**`; click away and the slide shows that word bold and big.
- [ ] Choose a colour, and a Style from the bar's dropdown. Expected: the editor doesn't close.
- [ ] Type "5 * 3" and "[draft]". Expected: they show literally.
- [ ] Re-import a markdown deck with `**bold**`. Expected: it now renders bold.
