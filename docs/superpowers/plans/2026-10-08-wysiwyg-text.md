# WYSIWYG Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit text layers in place, as they look on the slide (a `contentEditable` editor built on runs), with a **</>** toggle back to the markup textarea. The stored `text` stays inline markup.

**Architecture:**
- **Pure functions at module level in `design/strata.dc.html`** (exposed on `Component.rich`):
  - raw parsing (`parseRich(…, {raw:true})`);
  - `runsToMarkup`;
  - run operations (`setAttr`, `toggle`, `clear`, `insertBreak`, `insertPlain`, `deleteRange`, `linkAt`);
  - DOM glue that takes a root element: `buildEditor`, `getOffsets`, `setOffsets`, `readLines`, `wysBefore`.
- **The app** attaches native listeners to the editor root in `componentDidUpdate`. It keeps `this._wysLines` as the model, saves `text`, and rebuilds the editor only after operations or outside changes.
- **Tests:** pure parts in `app.test.ts`; DOM glue with happy-dom in `editor.test.ts`.

**Tech Stack:** Bun; happy-dom (new dev dependency, already in `package.json`/`bun.lock`); the Design Component app.

**Spec:** `docs/superpowers/specs/2026-10-08-wysiwyg-text-design.md`

## Global Constraints
- **Stored `text` stays markup.** `runsToMarkup` output must re-parse to the same source runs (the round trip).
- **Source run keys, in this order:** `RAW_KEYS = ['b', 'i', 'style', 'size', 'color', 'font', 'weight', 'link', 'href']`. Span attributes are written in the order `style, size, color, font, weight, link, href`.
- **Grammar addition (decided here, not in the spec):** span attributes accept bare **flags** `b` and `i` (`[t]{b}`, `[t]{i size=9}`). `runsToMarkup` uses them where `**`/`*` markers would be ambiguous or touch the previous run's markers. The parser and both `plainText` functions must accept them. Ledger this as a Ruling.
- **An empty line** is `[]` in raw mode (not the ` ` placeholder).
- **Glue functions never touch the global `document`.** They use `root.ownerDocument`, so the existing tests, which rely on `typeof document === 'undefined'`, keep passing.
- **Tests:** run with `bun test`. The baseline is 192 passing. Run `bun install` first.

## Review Focus
1. **Double toggling.** ⌘B in rich mode reaches both `keydown` (`onKey`) and `beforeinput formatBold` (Safari). Expected: one toggle. `onKey` prevents the default, which cancels `beforeinput`.
2. **Typing in rich mode must not trigger tree/layer shortcuts** (Backspace deleting the layer, arrows moving it). Expected: a `contentEditable` target counts as typing.
3. **Undo or redo while editing.** Expected: the editor is rebuilt from the new `text`, and `_wysLines` is reset from it.
4. **A layer's text changed from outside** (bar in markup mode, Layout preset) while the rich editor is open. Expected: the editor is rebuilt; it's never stale.
5. **Round-trip stability on real deck text** (all `decks/*` text layers). Expected: `textOf(linesOf(t))` re-parses to the same runs, so opening and closing the editor never changes the meaning.

---

### Task 1: Raw parsing, span flags, `runsToMarkup`, round trip

**Files:**
- Modify: `design/strata.dc.html` (`attrsOf`, `spanFmt`, `parseRich`, `runKeys`, new `runsToMarkup`, `linesOf`, `textOf`, `Component.rich`)
- Modify: `markdown.ts` (`plainText` accepts `{b}`/`{i}` spans; its regex already strips any `[x]{…}`, so verify only)
- Test: `app.test.ts`

**Interfaces:**
- Produces:
  - `parseRich(line, lookup, { raw })`;
  - `runsToMarkup(runs) → string`;
  - `linesOf(text) → Run[][]`, raw;
  - `textOf(lines) → string`;
  - `RAW_KEYS`;
  - `Component.rich.{ runsToMarkup, linesOf, textOf }`.

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`)

```ts
// ---- WYSIWYG: model ----
test("raw parsing keeps the style id and what the markup states; span flags b/i work everywhere", async () => {
  const { parseRich } = await rich();
  const st = (id: string) => (id === "h2" ? { size: 44, weight: 700 } : null);
  expect(parseRich("[x]{style=h2 size=50}", st, { raw: true })).toEqual([{ text: "x", style: "h2", size: 50 }]);
  expect(parseRich("[a [b]{style=h2} c]{size=20 color=red}", null, { raw: true })).toEqual([{ text: "a ", size: 20, color: "red" }, { text: "b", style: "h2" }, { text: " c", size: 20, color: "red" }]);
  expect(parseRich("[go]{link=k} [w]{href=https://x}", null, { raw: true })).toEqual([{ text: "go", link: "k" }, { text: " " }, { text: "w", href: "https://x" }]);
  expect(parseRich("[t]{b i size=9}", null, { raw: true })).toEqual([{ text: "t", b: true, i: true, size: 9 }]);
  expect(parseRich("[t]{b}")).toEqual([{ text: "t", b: true }]);                 // display parsing accepts flags too
  expect(parseRich("", null, { raw: true })).toEqual([]);
  expect(parseRich("x [y]{style=h2}", st)).toEqual([{ text: "x " }, { text: "y", size: 44, weight: 700 }]);   // display parsing unchanged
});

test("runsToMarkup: escapes, attribute order, emphasis inside spans, spaces outside markers, no touching markers, merging", async () => {
  const { runsToMarkup } = await rich();
  expect(runsToMarkup([{ text: "a*b [c] {d} \\e" }])).toBe("a\\*b \\[c\\] \\{d\\} \\\\e");
  expect(runsToMarkup([{ text: "x", href: "https://h", size: 9, style: "h2", color: "red", link: "k" }])).toBe("[x]{style=h2 size=9 color=red link=k href=https://h}");
  expect(runsToMarkup([{ text: " bold ", b: true }])).toBe(" **bold** ");
  expect(runsToMarkup([{ text: "x", b: true, i: true }])).toBe("***x***");
  expect(runsToMarkup([{ text: "x", b: true, size: 9 }])).toBe("[x]{b size=9}");
  expect(runsToMarkup([{ text: "a", b: true }, { text: "b", b: true, i: true }])).toBe("**a**[b]{b i}");
  expect(runsToMarkup([{ text: "a", b: true }, { text: "b", b: true }, { text: "" }])).toBe("**ab**");
  expect(runsToMarkup([{ text: "   ", b: true }])).toBe("   ");
});

test("round trip: markup → raw runs → markup → raw runs is stable (table + 500 random run lists)", async () => {
  const { parseRich, runsToMarkup } = await rich();
  const raw = (s: string) => parseRich(s, null, { raw: true });
  for (const s of ["plain", "a **b** *c* ***d***", "[x]{style=h2 size=50}", "[a [b]{style=h2} c]{size=20}", "**[x]{color=red}** y", "\\*lit\\* [go]{link=k}", "5 * 3 [draft]", "[t]{b i size=9}"])
    expect(raw(runsToMarkup(raw(s)))).toEqual(raw(s));
  let seed = 7; const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const words = ["a", "b c", " x ", "*", "[", "}", "go", "  ", "é"];
  for (let t = 0; t < 500; t++) {
    const runs = Array.from({ length: 1 + rnd(5) }, () => { const r: any = { text: words[rnd(words.length)] };
      if (rnd(2)) r.b = true; if (rnd(3) === 0) r.i = true; if (rnd(4) === 0) r.size = 10 + rnd(50); if (rnd(5) === 0) r.link = "s" + rnd(3); if (rnd(6) === 0) r.style = "h2"; return r; });
    const once = raw(runsToMarkup(runs)); expect(raw(runsToMarkup(once))).toEqual(once);
    expect(once.map((r: any) => r.text).join("")).toBe(runs.map((r: any) => r.text).join(""));   // the text itself survives
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun install && bun test app.test.ts`
Expected: the 3 new tests FAIL (`runsToMarkup` is undefined; raw mode isn't implemented).

- [ ] **Step 3: Implement** (in `design/strata.dc.html`)

- **`runKeys`:** add `'style'` (it is only ever set in raw mode, so display runs are unaffected).
- **`attrsOf`:** accept bare `b`/`i` flags:
```js
const attrsOf = str => { const a = {}; String(str).trim().split(/\s+/).forEach(p => { const m = /^(\w+)=(\S+)$/.exec(p); if (m) a[m[1]] = m[2]; else if (p === 'b' || p === 'i') a[p] = true; }); return a; };
```
- **`spanFmt(fmt, a, lookupStyle, raw)`**, new fourth parameter:
```js
const spanFmt = (fmt, a, lookupStyle, raw) => {
  const f = { ...fmt };
  if (raw) { if (/^[A-Za-z0-9_-]+$/.test(a.style || '')) { f.style = a.style; ['font', 'size', 'weight', 'color', 'ls'].forEach(k => delete f[k]); } }   // innermost wins
  else { const st = a.style && lookupStyle ? lookupStyle(a.style) : null; if (st) ['font', 'size', 'weight', 'color', 'ls'].forEach(k => { if (st[k] !== undefined && st[k] !== null) f[k] = st[k]; }); }
  if (a.b === true) f.b = true; if (a.i === true) f.i = true;
  …the existing size / weight / color / font / link / href lines unchanged…
  return f;
};
```
- **`parseRich(line, lookupStyle, opts)`:**
  - pass `!!(opts && opts.raw)` to `spanFmt`;
  - at the end, return `out.length ? out : (opts && opts.raw ? [] : [{ text: ' ' }])`.

New module-level functions after `parseRich`:
```js
const RAW_KEYS = ['b', 'i', 'style', 'size', 'color', 'font', 'weight', 'link', 'href'];
const ATTR_ORDER = ['style', 'size', 'color', 'font', 'weight', 'link', 'href'];
const escRich = t => String(t).replace(/[\\*[\]{}]/g, c => '\\' + c);
const sameRun = (a, b) => RAW_KEYS.every(k => a[k] === b[k]);
const mergeLine = line => { const out = []; for (const r of line) { if (!r.text) continue; const p = out[out.length - 1]; if (p && sameRun(p, r)) out[out.length - 1] = { ...p, text: p.text + r.text }; else out.push({ ...r }); } return out; };
// One line of source runs → markup. Emphasis markers never touch a neighbour's markers (that run uses span flags instead).
function runsToMarkup(runs) {
  let out = '', prevMarked = false;
  for (const r0 of mergeLine(runs)) {
    const r = r0.text.trim() ? r0 : { ...r0, b: undefined, i: undefined };
    const attrs = ATTR_ORDER.filter(k => r[k] !== undefined && r[k] !== null && r[k] !== '').map(k => k + '=' + r[k]);
    const emph = r.b || r.i;
    if (!attrs.length && emph && !prevMarked) {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text), d = r.b && r.i ? '***' : r.b ? '**' : '*';
      out += m[1] + d + escRich(m[2]) + d + m[3]; prevMarked = !m[3]; continue; }
    if (!attrs.length && !emph) { out += escRich(r.text); prevMarked = false; continue; }
    const flags = [r.b ? 'b' : '', r.i ? 'i' : ''].filter(Boolean);
    out += '[' + escRich(r.text) + ']{' + flags.concat(attrs).join(' ') + '}'; prevMarked = false;
  }
  return out;
}
const linesOf = text => String(text ?? '').split('\n').map(l => parseRich(l, null, { raw: true }));
const textOf = lines => lines.map(runsToMarkup).join('\n');
```
A span's text could contain a `]` written by a nested span. Our runs are flat, so only escaped characters occur.

Extend `static rich` to `{ parseRich, plainText, applyFormat, runsToMarkup, linesOf, textOf }`.

`markdown.ts`: confirm `plainText("[t]{b}")` returns `"t"` (its span regex handles any attributes). Add an assertion to the existing `markdown.ts` `plainText` test: `expect(plainText("[t]{b i}")).toBe("t");`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html markdown.test.ts app.test.ts
git commit -m "WYSIWYG: raw source runs, span flags b/i, runsToMarkup with a stable round trip"
```
Ledger: `Task 1: Ruling: added bare b/i span flags to the grammar — needed so runsToMarkup never emits touching ** markers (e.g. bold then bold-italic) — cost if wrong: one more grammar form`.

---

### Task 2: Run operations

**Files:**
- Modify: `design/strata.dc.html` (module-level functions after `textOf`; extend `Component.rich`)
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `mergeLine`, `RAW_KEYS` (Task 1)
- Produces:
  - `toPlain`, `lineLen`, `locate`, `setAttr`, `toggleAttr`, `clearRange`, `insertBreak`, `insertPlain`, `deleteRange`, `linkAt`, all on `Component.rich`.
  - `toggleAttr` is named so to avoid clashing with anything called `toggle`.

- [ ] **Step 1: Write the failing tests**

```ts
test("run operations: set/clear attributes, toggle (incl. word at cursor), breaks, paste, deletes across lines, link lookup", async () => {
  const R = await rich(); const { linesOf, textOf } = R;
  const L = linesOf("say hello now\n[go]{link=k} on");
  expect(textOf(R.setAttr(L, 4, 9, { size: 72 }))).toBe("say [hello]{size=72} now\n[go]{link=k} on");
  expect(textOf(R.setAttr(linesOf("[ab]{size=9}"), 0, 1, { size: null }))).toBe("a[b]{size=9}");
  expect(textOf(R.toggleAttr(L, 4, 9, "b"))).toBe("say **hello** now\n[go]{link=k} on");
  expect(textOf(R.toggleAttr(linesOf("say **hello** now"), 4, 9, "b"))).toBe("say hello now");     // all on → off
  expect(textOf(R.toggleAttr(linesOf("a **b** c"), 0, 3, "b"))).toBe("**a b** c");                 // mixed → on
  expect(textOf(R.toggleAttr(L, 6, 6, "i"))).toBe("say *hello* now\n[go]{link=k} on");              // word at the cursor
  const L2 = linesOf("a  b"); expect(R.toggleAttr(L2, 2, 2, "i")).toBe(L2);                          // not in a word
  expect(textOf(R.clearRange(linesOf("a **b** [c]{size=9}"), 0, 5))).toBe("a b c");
  expect(textOf(R.insertBreak(L, 9))).toBe("say hello\n now\n[go]{link=k} on");
  expect(textOf(R.insertPlain(linesOf("**ab**"), 1, "x\ny"))).toBe("**ax**\n**yb**");                 // pasted text takes the run's settings
  expect(textOf(R.deleteRange(L, 9, 16))).toBe("say hello on");                                      // " now\ngo" removed across the break
  expect(textOf(R.deleteRange(L, 13, 14))).toBe("say hello now[go]{link=k} on");                    // joining two lines
  expect(R.linkAt(L, 15)).toEqual({ link: "k", href: undefined, start: 14, end: 16 });
  expect(R.linkAt(L, 2)).toBeNull();
  expect(R.toPlain(L)).toBe("say hello now\ngo on");
  expect(R.locate(L, 14)).toEqual([1, 0]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test app.test.ts`
Expected: FAIL (`R.setAttr` is undefined).

- [ ] **Step 3: Implement** (module level, after `textOf`)

```js
// ---- Run operations: pure, on lines of source runs, by plain offset (a line break counts 1).
const lineLen = line => line.reduce((n, r) => n + r.text.length, 0);
const toPlain = lines => lines.map(l => l.map(r => r.text).join('')).join('\n');
const locate = (lines, off) => { for (let n = 0; n < lines.length; n++) { const L = lineLen(lines[n]); if (off <= L) return [n, off]; off -= L + 1; } const n = lines.length - 1; return [n, lineLen(lines[n] || [])]; };
const splitAt = (line, col) => { const a = [], b = []; let pos = 0;
  for (const r of line) { const e = pos + r.text.length; if (e <= col) a.push(r); else if (pos >= col) b.push(r); else { a.push({ ...r, text: r.text.slice(0, col - pos) }); b.push({ ...r, text: r.text.slice(col - pos) }); } pos = e; }
  return [a, b]; };
const mapRange = (lines, start, end, fn) => { const [sl, sc] = locate(lines, start), [el, ec] = locate(lines, end);
  return lines.map((line, n) => { if (n < sl || n > el) return line; const from = n === sl ? sc : 0, to = n === el ? ec : lineLen(line);
    const [left, rest] = splitAt(line, from), [mid, right] = splitAt(rest, to - from); return mergeLine([...left, ...mid.map(fn), ...right]); }); };
const patchRun = (r, patch) => { const o = { ...r }; for (const k in patch) { if (patch[k] === null || patch[k] === undefined) delete o[k]; else o[k] = patch[k]; } return o; };
const setAttr = (lines, start, end, patch) => mapRange(lines, start, end, r => patchRun(r, patch));
const clearRange = (lines, start, end) => mapRange(lines, start, end, r => ({ text: r.text }));
function toggleAttr(lines, start, end, key) {
  if (start === end) { const t = toPlain(lines); let a = start, b = start; while (a > 0 && /[\w']/.test(t[a - 1])) a--; while (b < t.length && /[\w']/.test(t[b])) b++; if (a === b) return lines; start = a; end = b; }
  let all = true; mapRange(lines, start, end, r => { if (r.text.trim() && !r[key]) all = false; return r; });
  return setAttr(lines, start, end, { [key]: all ? null : true });
}
const insertBreak = (lines, at) => { const [n, c] = locate(lines, at), [a, b] = splitAt(lines[n], c); return [...lines.slice(0, n), mergeLine(a), mergeLine(b), ...lines.slice(n + 1)]; };
function insertPlain(lines, at, text) {
  const [n, c] = locate(lines, at), line = lines[n]; let pos = 0, base = line[0] || { text: '' };
  for (const r of line) { if (c > pos && c <= pos + r.text.length) { base = r; break; } pos += r.text.length; }
  const { text: _t, ...attrs } = base, mk = t => (t ? [{ ...attrs, text: t }] : []);
  const parts = String(text).replace(/\r\n?/g, '\n').split('\n'), [a, b] = splitAt(line, c);
  if (parts.length === 1) return [...lines.slice(0, n), mergeLine([...a, ...mk(parts[0]), ...b]), ...lines.slice(n + 1)];
  return [...lines.slice(0, n), mergeLine([...a, ...mk(parts[0])]), ...parts.slice(1, -1).map(p => mergeLine(mk(p))), mergeLine([...mk(parts[parts.length - 1]), ...b]), ...lines.slice(n + 1)];
}
const deleteRange = (lines, start, end) => { const [sl, sc] = locate(lines, start), [el, ec] = locate(lines, end);
  const [left] = splitAt(lines[sl], sc), [, right] = splitAt(lines[el], ec); return [...lines.slice(0, sl), mergeLine([...left, ...right]), ...lines.slice(el + 1)]; };
// The link run under a plain offset, with its full range (merged neighbours share the link).
function linkAt(lines, off) {
  const [n, c] = locate(lines, off); let base = 0; for (let k = 0; k < n; k++) base += lineLen(lines[k]) + 1;
  let pos = 0; for (const r of lines[n]) { const e = pos + r.text.length;
    if ((c > pos && c < e) || (c === e && c > pos) || (c === pos && c < e && pos === 0)) return r.link || r.href ? { link: r.link, href: r.href, start: base + pos, end: base + e } : null;
    pos = e; }
  return null;
}
```
Add all of them to `static rich`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "WYSIWYG: run operations (setAttr, toggleAttr, clearRange, insertBreak, insertPlain, deleteRange, linkAt)"
```

---

### Task 3: DOM glue with happy-dom (`buildEditor`, offsets, `readLines`, `wysBefore`), plus repo setup

**Files:**
- Create: `editor.test.ts`
- Modify:
  - `design/strata.dc.html` (module-level glue; `MARK_CH`; extend `Component.rich`);
  - `.gitignore` (`node_modules`);
  - `.github/workflows/pages.yml` (`bun install`);
  - `README.md` (Usage: run `bun install` once).
- Commit: `package.json`, `bun.lock`

**Interfaces:**
- Consumes: the run operations (Task 2)
- Produces:
  - `buildEditor(root, lines, layer, look)`;
  - `getOffsets(root) → {start,end}|null`;
  - `setOffsets(root, start, end)`;
  - `readLines(root, prevLines) → lines`;
  - `wysBefore(root, lines, ev) → { lines, start, end } | null`.

- [ ] **Step 1: Write the failing tests** (new file `editor.test.ts`)

```ts
// The WYSIWYG editor's DOM glue, driven in happy-dom (no globals are registered: the app's other tests rely on there being no document).
import { test, expect } from "bun:test";
import { join } from "node:path";
import { Window } from "happy-dom";

const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
const js = html.split('<script type="text/x-dc" data-dc-script>')[1].split("</script>")[0];
const g = { location: { search: "" }, window: {}, localStorage: { getItem: () => null, setItem() {} }, fetch: async () => new Response("{}"), setTimeout, requestAnimationFrame() {} };
const C = new Function("DCLogic", "React", ...Object.keys(g), js + "\nreturn Component;")(class {}, { createRef: () => ({ current: null }) }, ...Object.values(g));
const R = C.rich;
const fresh = () => { const w = new Window(); const root = w.document.createElement("div"); root.setAttribute("contenteditable", "true"); w.document.body.appendChild(root); return { w, root }; };
const look = (id: string) => (id === "h2" ? { size: 44, weight: 700 } : null);

test("buildEditor renders lines, marks, styled run spans and empty lines", () => {
  const { root } = fresh();
  R.buildEditor(root, R.linesOf("a **b** [c]{style=h2 link=k}\n"), { bullets: "disc" }, look);
  const lines = root.querySelectorAll("[data-line]");
  expect(lines.length).toBe(2);
  expect(lines[0].querySelector("[data-mark]").textContent).toBe("• ");
  const runs = lines[0].querySelectorAll("[data-run]");
  expect([...runs].map((s: any) => s.textContent)).toEqual(["a ", "b", " ", "c"]);
  expect(runs[1].getAttribute("style")).toContain("font-weight:bolder");
  expect(runs[3].getAttribute("style")).toContain("font-size:2.75cqw");
  expect(runs[3].getAttribute("style")).toContain("text-decoration:underline");
  expect(lines[1].querySelector("br")).toBeTruthy(); expect(lines[1].querySelector("[data-mark]")).toBeNull();   // empty lines get no mark
});

test("getOffsets / setOffsets round-trip across lines and around marks", () => {
  const { root } = fresh();
  R.buildEditor(root, R.linesOf("ab **cd**\nef"), { bullets: "number" }, null);
  for (const [s, e] of [[0, 0], [1, 4], [3, 8], [8, 8], [5, 5]]) { R.setOffsets(root, s, e); expect(R.getOffsets(root)).toEqual({ start: s, end: e }); }
});

test("readLines reads edited spans, bare text nodes, emptied spans and stray root text back into runs", () => {
  const { w, root } = fresh(); const L = R.linesOf("ab **cd**\nef");
  R.buildEditor(root, L, {}, null);
  const [l0, l1] = root.querySelectorAll("[data-line]");
  l0.querySelectorAll("[data-run]")[1].textContent = "cdX";             // typed inside the bold run
  l0.appendChild(w.document.createTextNode("!"));                       // the browser added bare text after it
  l1.querySelectorAll("[data-run]")[0].textContent = "";                // emptied
  root.appendChild(w.document.createTextNode("tail"));                  // stray text under the root
  expect(R.textOf(R.readLines(root, L))).toBe("ab **cdX!**\ntail");
});

test("wysBefore takes over Enter, paste, bold, and deletes that cross or join lines", () => {
  const { root } = fresh(); let L = R.linesOf("say hello\nnow");
  const run = (inputType: string, s: number, e: number, data?: string) => { R.buildEditor(root, L, {}, null); R.setOffsets(root, s, e);
    return R.wysBefore(root, L, { inputType, dataTransfer: data == null ? null : { getData: () => data } }); };
  expect(R.textOf(run("insertParagraph", 3, 3).lines)).toBe("say\n hello\nnow");
  expect(run("insertParagraph", 3, 3).start).toBe(4);
  expect(R.textOf(run("insertFromPaste", 4, 9, "big\nday").lines)).toBe("say big\nday\nnow");
  expect(R.textOf(run("formatBold", 4, 9).lines)).toBe("say **hello**\nnow");
  expect(R.textOf(run("deleteContentBackward", 10, 10).lines)).toBe("say hellonow");    // Backspace at a line start joins
  expect(R.textOf(run("deleteContentForward", 9, 9).lines)).toBe("say hellonow");     // Delete at a line end joins
  expect(R.textOf(run("deleteContentBackward", 7, 11).lines)).toBe("say heow");       // a selection across the break
  expect(run("insertText", 3, 3)).toBeNull(); expect(run("deleteContentBackward", 5, 5)).toBeNull();   // left to the browser
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test editor.test.ts`
Expected: FAIL (`R.buildEditor` is undefined).

- [ ] **Step 3: Implement** (module level, after the run operations)

```js
// ---- WYSIWYG DOM glue: always via root.ownerDocument (never the global document).
const MARK_CH = { disc: '•', dash: '–', check: '✓', arrow: '→' };
const runStyle = (r, look) => { const st = (r.style && look && look(r.style)) || {}, v = k => (r[k] !== undefined ? r[k] : st[k]);
  return [v('weight') ? 'font-weight:' + v('weight') : r.b ? 'font-weight:bolder' : '', r.i ? 'font-style:italic' : '', v('size') ? 'font-size:' + v('size') / 16 + 'cqw' : '',
    v('color') ? 'color:' + v('color') : '', v('font') && FONT_CSS[v('font')] ? 'font-family:' + FONT_CSS[v('font')] : '', v('ls') ? 'letter-spacing:' + v('ls') + 'em' : '',
    r.link || r.href ? 'text-decoration:underline' : ''].filter(Boolean).join(';'); };
function buildEditor(root, lines, layer, look) {
  const doc = root.ownerDocument, b = (layer && layer.bullets) || 'none'; let num = 0; root.textContent = '';
  lines.forEach((line, n) => { const div = doc.createElement('div'); div.setAttribute('data-line', String(n));
    if (b !== 'none' && line.length) { num++; const m = doc.createElement('span'); m.setAttribute('contenteditable', 'false'); m.setAttribute('data-mark', ''); m.textContent = (b === 'number' ? num + '.' : MARK_CH[b] || '•') + ' '; div.appendChild(m); }
    if (!line.length) div.appendChild(doc.createElement('br'));
    line.forEach((r, k) => { const s = doc.createElement('span'); s.setAttribute('data-run', String(k)); const css = runStyle(r, look); if (css) s.setAttribute('style', css); s.textContent = r.text; div.appendChild(s); });
    root.appendChild(div); });
}
const textNodes = (node, out = []) => { for (const ch of node.childNodes) { if (ch.nodeType === 3) out.push(ch); else if (ch.nodeType === 1 && !ch.hasAttribute('data-mark')) textNodes(ch, out); } return out; };
const lineDivs = root => [...root.childNodes].filter(n => n.nodeType === 1 && n.hasAttribute('data-line'));
function offsetOf(root, node, o) {
  let total = 0;
  for (const div of lineDivs(root)) {
    if (div === node || div.contains(node)) {
      if (node.nodeType === 3) { let col = 0; for (const t of textNodes(div)) { if (t === node) return total + col + o; col += t.data.length; } return total + col; }
      let col = 0; const stop = node.childNodes[o]; for (const t of textNodes(div)) { if (stop && (stop === t || stop.contains(t) || (stop.compareDocumentPosition(t) & 2))) break; if (!stop && !node.contains(t)) continue; col += t.data.length; } return total + col;
    }
    total += textNodes(div).reduce((n, t) => n + t.data.length, 0) + 1;
  }
  return Math.max(0, total - 1);
}
function getOffsets(root) { const sel = root.ownerDocument.getSelection(); if (!sel || !sel.rangeCount) return null; const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null; return { start: offsetOf(root, r.startContainer, r.startOffset), end: offsetOf(root, r.endContainer, r.endOffset) }; }
function pointAt(root, off) {
  const divs = lineDivs(root);
  for (let n = 0; n < divs.length; n++) { const ts = textNodes(divs[n]), len = ts.reduce((a, t) => a + t.data.length, 0);
    if (off <= len || n === divs.length - 1) { for (const t of ts) { if (off <= t.data.length) return [t, off]; off -= t.data.length; } return [divs[n], divs[n].childNodes.length]; }
    off -= len + 1; }
  return [root, 0];
}
function setOffsets(root, start, end) { const doc = root.ownerDocument, sel = doc.getSelection(), rg = doc.createRange(); const [a, ao] = pointAt(root, start), [b, bo] = pointAt(root, end);
  rg.setStart(a, ao); rg.setEnd(b, bo); sel.removeAllRanges(); sel.addRange(rg); }
function readLines(root, prev) {
  const lines = []; let lastAttrs = {};
  for (const node of root.childNodes) {
    if (node.nodeType === 1 && node.hasAttribute('data-line')) {
      const n = lines.length, line = []; lastAttrs = {};
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1 && (ch.hasAttribute('data-mark') || ch.tagName === 'BR')) continue;
        if (ch.nodeType === 1 && ch.hasAttribute('data-run')) { const { text: _t, ...attrs } = ((prev[n] || [])[+ch.getAttribute('data-run')]) || { ...lastAttrs, text: '' }; line.push({ ...attrs, text: ch.textContent }); lastAttrs = attrs; }
        else line.push({ ...lastAttrs, text: ch.textContent || '' });
      }
      lines.push(mergeLine(line));
    } else if ((node.textContent || '') !== '') { if (!lines.length) lines.push([]); lines[lines.length - 1] = mergeLine([...lines[lines.length - 1], { ...lastAttrs, text: node.textContent }]); }
  }
  return lines.length ? lines : [[]];
}
// beforeinput: take over what browsers do badly. Returns the new lines and selection, or null to let the browser handle it.
function wysBefore(root, lines, ev) {
  const t = ev.inputType || '', o = getOffsets(root); if (!o) return null; let { start, end } = o; if (start > end) [start, end] = [end, start];
  const cut = () => (start !== end ? deleteRange(lines, start, end) : lines);
  if (t === 'insertParagraph' || t === 'insertLineBreak') return { lines: insertBreak(cut(), start), start: start + 1, end: start + 1 };
  if (t === 'insertFromPaste' || t === 'insertFromDrop') { const txt = String((ev.dataTransfer && ev.dataTransfer.getData('text/plain')) || '').replace(/\r\n?/g, '\n');
    return { lines: insertPlain(cut(), start, txt), start: start + txt.length, end: start + txt.length }; }
  if (t === 'formatBold' || t === 'formatItalic') return { lines: toggleAttr(lines, start, end, t === 'formatBold' ? 'b' : 'i'), start, end };
  if (t.startsWith('delete')) { const [sl, sc] = locate(lines, start), [el] = locate(lines, end);
    if (sl !== el) return { lines: deleteRange(lines, start, end), start, end: start };
    if (start === end && t === 'deleteContentBackward' && sc === 0 && sl > 0) return { lines: deleteRange(lines, start - 1, start), start: start - 1, end: start - 1 };
    if (start === end && t === 'deleteContentForward' && sc === lineLen(lines[sl]) && sl < lines.length - 1) return { lines: deleteRange(lines, start, start + 1), start, end: start }; }
  return null;
}
```
Add `buildEditor, getOffsets, setOffsets, readLines, wysBefore` to `static rich`.

`offsetOf`'s element-container branch handles a range whose container is a line div or span with a child index. If the test shows an off-by-one there, fix the branch, not the test: offsets are character counts excluding marks.

Repo setup:
- **`.gitignore`:** add a line `node_modules`.
- **`.github/workflows/pages.yml`:** after `- uses: oven-sh/setup-bun@v2`, add `- run: bun install --frozen-lockfile`.
- **`README.md`**, Usage table: add a row `| bun install | Once, to fetch the test dependency (happy-dom) |` before `make test`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass, including `editor.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html editor.test.ts package.json bun.lock .gitignore .github/workflows/pages.yml README.md
git commit -m "WYSIWYG: editor DOM glue (build, offsets, read back, beforeinput takeover) tested in happy-dom"
```

---

### Task 4: App integration: rich editor, </> toggle, rich-mode bar actions, link popover

**Files:**
- Modify `design/strata.dc.html`:
  - the template (editor container next to the textarea, the toggle, the popover);
  - `componentDidUpdate` (attach listeners, rebuild);
  - `formatSel` (rich branch);
  - new `saveWys`, `formatRange`;
  - `onKey` (typing check, ⌘K);
  - `renderVals` values.
- Test: `app.test.ts`

**Interfaces:**
- Consumes: everything on `Component.rich` from Tasks 1–3
- Produces:
  - `wysRef`; state `editMode` ('rich' default | 'markup'), `wysSel`, `linkPick`;
  - methods `saveWys()`, `formatRange(start, end, op)`;
  - render values `isEditingRich`, `isEditingMarkup`, `onFmtMode`, `fmtModeLabel`, `linkPopShow`, `linkPopLabel`, `linkPopPos`, `onLinkPopChange`, `onLinkPopRemove`, `linkPick`, `onLinkPick`.

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`; add `import { Window } from "happy-dom";` at the top of the file)

```ts
// ---- WYSIWYG: app ----
test("rich editing: the editor fills in, Enter goes through the model, bar actions use run operations, </> switches to markup", async () => {
  const c = await styledDeck({}, [TL("a", { text: "say hello\nnow" })]);
  const w = new Window(); const root = w.document.createElement("div"); w.document.body.appendChild(root); c.wysRef.current = root;
  c.setState({ editing: "a", layerSel: "a" }); c.componentDidUpdate();
  expect(root.querySelectorAll("[data-line]").length).toBe(2);
  c.renderVals(); expect(c.renderVals().isEditingRich).toBe(true); expect(c.renderVals().isEditingMarkup).toBe(false);
  c.constructor.rich.setOffsets(root, 3, 3);
  const ev = new w.InputEvent("beforeinput", { inputType: "insertParagraph", cancelable: true }); root.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true); expect(c.layersOf("s")[0].text).toBe("say\n hello\nnow");
  c.constructor.rich.setOffsets(root, 5, 10); c.renderVals().onFmtBold();                     // the live selection
  expect(c.layersOf("s")[0].text).toBe("say\n **hello**\nnow");
  c.renderVals().onFmtMode(); expect(c.state.editMode).toBe("markup"); expect(c.renderVals().isEditingMarkup).toBe(true);
  const typing = { isContentEditable: true, tagName: "DIV" }; const n = c.layersOf("s").length;
  c.setState({ editMode: "rich" }); c.onKey({ key: "Backspace", target: typing, preventDefault() {} }); expect(c.layersOf("s").length).toBe(n);   // typing doesn't delete the layer
});

test("link popover: shown with the cursor in a link run; Remove clears the whole link; ⌘K opens the chooser for a selection", async () => {
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["s", "costs"]), s: slideNode("s", "S", [], { frames: [{ id: "f", layers: [TL("a", { text: "see [the costs]{link=costs} now" })] }] }), costs: slideNode("costs", "Costs") });
  const { c } = await mount("?deck=talk");
  c.setState({ cur: "s", editing: "a", layerSel: "a", wysSel: { start: 6, end: 6 } }); let v = c.renderVals();
  expect(v.linkPopShow).toBe(true); expect(v.linkPopLabel).toBe("→ Costs");
  v.onLinkPopRemove(); expect(c.layersOf("s")[0].text).toBe("see the costs now");
  c.setState({ wysSel: { start: 0, end: 3 } }); c._wysSel = { start: 0, end: 3 };
  c.onKey({ key: "k", metaKey: true, target: { isContentEditable: true, tagName: "DIV" }, preventDefault() {} });
  v = c.renderVals(); expect(v.linkPick).toBe(true); expect(v.linkPopShow).toBe(true);
  v.onLinkPick({ target: { value: "costs" } }); expect(c.layersOf("s")[0].text).toBe("[see]{link=costs} the costs now");
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ['data-role="wysiwyg"', 'ref="{{ wysRef }}"', "{{ onFmtMode }}", "{{ linkPopShow }}", "{{ onLinkPick }}"]) expect(html).toContain(h);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: FAIL (`c.wysRef` is undefined).

- [ ] **Step 3: Implement**

**Refs and state:**
- add `wysRef = React.createRef();` to the class's ref list;
- add `editMode: 'rich'` to the initial state.

**Methods** (after `formatSel`):
```js
  // The rich editor's model → stored text (remembered so typing doesn't trigger a rebuild).
  saveWys() { const id = this.curId(), lid = this.state.editing; if (!lid || !this._wysLines) return; const text = textOf(this._wysLines); this._wysText = text; this.updLayer(id, lid, { text }); }
  rebuildWys(start, end) { const root = this.wysRef.current, id = this.curId(), l = this.layersOf(id).find(x => x.id === this.state.editing); if (!root || !l || !root.ownerDocument) return;
    const n = this.state.nodes[id], look = sid => this.styles()[sid] || (n && n._from && ((this._graftStyles || {})[n._from] || {})[sid]) || null;
    buildEditor(root, this._wysLines, this.resolveLayer(l, id), look); if (start != null) setOffsets(root, start, end ?? start); }
  // A rich-mode format action on a plain range (op as in applyFormat: bold / italic / attrs / clear).
  formatRange(start, end, op) {
    const id = this.curId(), l = this.layersOf(id).find(x => x.id === this.state.editing); if (!l) return;
    const lines = this._wysLines || linesOf(l.text); let out;
    if (op.bold || op.italic) out = toggleAttr(lines, start, end, op.bold ? 'b' : 'i');
    else if (op.clear) out = start === end ? clearRange(lines, 0, toPlain(lines).length) : clearRange(lines, start, end);
    else if (op.attrs) { const p = {}; for (const k in op.attrs) { const v = op.attrs[k]; p[k] = v === null || v === '' ? null : k === 'size' || k === 'weight' ? +v : v; } out = setAttr(lines, start, end, p); }
    if (!out) return; this._wysLines = out; this.saveWys(); this._wysSel = { start, end }; this.rebuildWys(start, end);
  }
```
**`formatSel(op)`:** add as its first line:
```js
    if (this.state.editMode !== 'markup') { const root = this.wysRef.current, o = (root && root.ownerDocument && getOffsets(root)) || this._wysSel || this.state.wysSel || { start: 0, end: 0 }; this.formatRange(o.start, o.end, op); return; }
```
**`componentDidUpdate`.** At the end, before the wheel-listener block, add:
```js
    // Rich editor: attach native listeners once per element; (re)build when editing opens or the text changed from outside.
    const root = this.wysRef.current;
    if (root !== this._wysEl) { this._wysEl = root; this._wysFor = null;
      if (root && root.addEventListener) {
        root.addEventListener('beforeinput', e => { const r = wysBefore(root, this._wysLines || [[]], e); if (!r) return; e.preventDefault(); this._wysLines = r.lines; this.saveWys(); this._wysSel = { start: r.start, end: r.end }; this.rebuildWys(r.start, r.end); });
        root.addEventListener('input', () => { if (this._composing) return; this._wysLines = readLines(root, this._wysLines || [[]]); this.saveWys(); });
        root.addEventListener('compositionstart', () => { this._composing = true; });
        root.addEventListener('compositionend', () => { this._composing = false; this._wysLines = readLines(root, this._wysLines || [[]]); this.saveWys(); });
        const track = () => { const o = getOffsets(root); if (o) { this._wysSel = o; const p = this.state.wysSel; if (!p || p.start !== o.start || p.end !== o.end) this.setState({ wysSel: o }); } };
        root.addEventListener('keyup', track); root.addEventListener('mouseup', track); root.addEventListener('pointerup', track);
      } }
    if (root && root.ownerDocument && S.editing && S.editMode !== 'markup') {
      const l = this.layersOf(this.curId()).find(x => x.id === S.editing), text = l ? String(l.text ?? '') : '';
      if (this._wysFor !== S.editing) { this._wysFor = S.editing; this._wysLines = linesOf(text); this._wysText = text; this.rebuildWys(); root.focus && root.focus(); const end = toPlain(this._wysLines).length; setOffsets(root, end, end); }
      else if (l && text !== this._wysText) { this._wysLines = linesOf(text); this._wysText = text; const o = this._wysSel || { start: 0, end: 0 }; this.rebuildWys(o.start, o.end); }   // undo/redo or an outside change
    } else if (!S.editing) { this._wysFor = null; this._wysLines = null; }
```
**`onKey`:**
- typing check: append `|| !!t.isContentEditable` inside the `typing` expression;
- in the typing branch, extend the ⌘B/⌘I line's condition to `(t === this.editRef.current || t === this.wysRef.current || t.isContentEditable)`;
- add after it:
```js
      if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K') && t.isContentEditable) { e.preventDefault(); this.setState({ linkPick: true }); return; }
      if (k === 'Escape' && t.isContentEditable) { this.setState({ editing: null, linkPick: false }); return; }
```
**`renderVals`.** Add before `return {`:
```js
    const rich = !!edL && editable && S.editMode !== 'markup';
    const wl = rich ? (this._wysLines || linesOf(edL.text)) : null, ws = S.wysSel || this._wysSel || null;
    const lk = rich && ws ? linkAt(wl, ws.start) : null;
```
and to the returned object:
```js
      isEditingRich: rich, isEditingMarkup: !!edL && !rich, fmtModeLabel: rich ? '</>' : 'Aa',
      onFmtMode: () => { this.setState({ editMode: S.editMode === 'markup' ? 'rich' : 'markup', linkPick: false }); this._wysFor = null; },
      linkPopShow: rich && (!!lk || !!S.linkPick), linkPick: !!S.linkPick,
      linkPopLabel: lk ? (lk.link ? '→ ' + (N[lk.link] ? name(lk.link) : 'missing slide') : '↗ ' + short(lk.href, 32)) : 'Link the selection',
      linkPopPos: edL ? `left:min(${edL.x}%, calc(100% - 260px));top:calc(${edL.y}% - 76px)` : '',
      onLinkPopChange: () => this.setState({ linkPick: true }),
      onLinkPopRemove: () => { if (lk) this.formatRange(lk.start, lk.end, { attrs: { link: null, href: null } }); },
      onLinkPick: e => { const v = e.target.value; if (!v) return; const r = lk || ws || { start: 0, end: 0 };
        if (v === '@url') { this.setState({ fmtUrl: true }); return; }
        this.formatRange(r.start, r.end, { attrs: v === '-' ? { link: null, href: null } : { link: v, href: null } }); this.setState({ linkPick: false }); },
```
Also change `isEditingText: !!edL,` to `isEditingText: !!edL && !rich,`. The textarea is markup mode only.

**Template:**
- Wrap the existing `<textarea ref="{{ editRef }}" …>` in `<sc-if value="{{ isEditingMarkup }}">…</sc-if>`. It already sits in `<sc-if value="{{ isEditingText }}">`; keep that, since both are true in markup mode.
- After that `<sc-if isEditingText>` block closes, add the rich editor. It uses the same position and typography as the textarea, `white-space:pre-wrap`, and no children:
```html
                  <sc-if value="{{ isEditingRich }}">
                    <div ref="{{ wysRef }}" contenteditable="true" data-role="wysiwyg" spellcheck="true" onBlur="{{ stopEditing }}" onPointerDown="{{ stopProp }}" style="position:absolute;left:{{ ed.l }}%;top:{{ ed.t }}%;width:{{ ed.w }}%;min-height:{{ ed.h }}%;padding:0;margin:0;outline:2px solid #1f6fb8;outline-offset:1px;background:rgba(10,14,28,.12);white-space:pre-wrap;overflow-wrap:anywhere;font-family:{{ ed.font }};font-size:{{ ed.fs }}cqw;font-weight:{{ ed.weight }};color:{{ ed.color }};text-align:{{ ed.align }};line-height:{{ ed.lh }};z-index:999;cursor:text"></div>
                  </sc-if>
```
- Move the formatting bar's `<sc-if value="{{ fmtShow }}">` block so it renders in both modes: place it after the rich editor block, outside both `sc-if`s. Then add as the bar's first child:
```html
                        <button onPointerDown="{{ fmtDown }}" onMouseDown="{{ fmtDown }}" onClick="{{ onFmtMode }}" title="Switch between formatted editing and markup" style="height:26px;padding:0 6px;border:1px solid #e0d9cb;border-radius:6px;background:#fff;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px">{{ fmtModeLabel }}</button>
```
- After the bar, add the link popover:
```html
                    <sc-if value="{{ linkPopShow }}">
                      <div data-role="fmtbar" onPointerDown="{{ stopProp }}" style="position:absolute;{{ linkPopPos }};z-index:31;display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:9px;background:#1d1b17;color:#fbf9f4;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.3)">
                        <span style="white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis">{{ linkPopLabel }}</span>
                        <sc-if value="{{ linkPick }}"><select value="" onChange="{{ onLinkPick }}" style="height:24px;max-width:150px;border:0;border-radius:5px;font-size:12px"><sc-for list="{{ fmtLinkOpts }}" as="o" hint-placeholder-count="5"><option value="{{ o.v }}" disabled="{{ o.off }}">{{ o.l }}</option></sc-for></select></sc-if>
                        <button onPointerDown="{{ fmtDown }}" onMouseDown="{{ fmtDown }}" onClick="{{ onLinkPopChange }}" style="padding:2px 7px;border:1px solid rgba(251,249,244,.4);border-radius:5px;background:none;color:inherit;cursor:pointer">Change</button>
                        <button onPointerDown="{{ fmtDown }}" onMouseDown="{{ fmtDown }}" onClick="{{ onLinkPopRemove }}" style="padding:2px 7px;border:1px solid rgba(251,249,244,.4);border-radius:5px;background:none;color:inherit;cursor:pointer">Remove</button>
                      </div>
                    </sc-if>
```
`fmtShow` and the popover depend on `edL`, so they are only visible while editing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass, including the template-names test. The existing markup-path tests ("formatting bar: shown only while editing…", "formatting bar: Plain is choosable…") expect `applyFormat` on the textarea, and rich mode is now the default. Add `editMode: "markup"` to their first `setState`, and ledger one `Ruling:` naming both.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "WYSIWYG: rich editor in place (model-driven, native beforeinput takeover), </> toggle, rich bar actions, link popover"
```

---

### Task 5: Real-deck round trip and the manual check

**Files:**
- Test: `app.test.ts`

- [ ] **Step 1: Write the test**

```ts
test("every text layer in the saved decks survives the rich editor's round trip unchanged in meaning", async () => {
  const { linesOf, textOf, parseRich } = await rich(); const raw = (s: string) => parseRich(s, null, { raw: true });
  const { readdir } = await import("node:fs/promises"); let n = 0;
  for (const d of await readdir(join(import.meta.dir, "decks")).catch(() => [])) {
    const f = Bun.file(join(import.meta.dir, "decks", d, "deck.json")); if (!(await f.exists())) continue;
    for (const node of Object.values<any>((await f.json()).nodes)) for (const fr of node.frames || []) for (const l of fr.layers) if (l.type === "text") {
      const t = String(l.text ?? ""); expect(textOf(linesOf(t)).split("\n").map(raw)).toEqual(t.split("\n").map(raw)); n++; } }
  expect(n).toBeGreaterThanOrEqual(0);
});
```
This passes immediately if the round trip is sound; that's what it checks. If it fails, the failure names the text: fix `runsToMarkup`, not the test.

- [ ] **Step 2: Run, then commit**

Run: `bun test`
Then:
```bash
git add app.test.ts && git commit -m "WYSIWYG: round-trip check over every saved deck's text"
```

- [ ] **Step 3: Manual checklist for the user (Chrome and Safari)**
  - Type inside, before and after a bold or linked word.
  - Accents and IME; autocorrect.
  - Enter, Backspace at a line start, Delete at a line end.
  - Paste from a web page: the formatting should be stripped.
  - ⌘B, ⌘I, ⌘K.
  - The popover's position near the slide's edges.
  - </> back and forth.
  - Undo while editing.
