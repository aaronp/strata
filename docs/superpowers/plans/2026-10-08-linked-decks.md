# Linked Decks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **linked node** (`include: <deck>`) shows another deck's slides as its children, live and read-only. They are namespaced `<linked node id>.<slide id>`, laid out on the host's canvas, chainable, and supported by markdown import/export and single-deck publishing.

**Architecture:**
- **Graft at load.** The app's `graft()` fetches linked decks recursively and adds prefixed nodes (marked `_from`) to the in-memory tree. `stripGrafts()` removes them on save.
- **Read-only.** Explicit refusals in tree operations, plus a catch-all `guardGrafts()` in `componentDidUpdate`, keep grafted slides read-only.
- **Markdown.** The parser learns `include:` lines and dotted links into a graft. The importer checks those links against the linked deck as warnings.
- **Publishing.** `build()` publishes the linked chain.

**Tech Stack:** Bun + TypeScript (`markdown.ts`, `importer.ts`, `build.ts`, `server.ts`), and the Design Component app `design/strata.dc.html` (logic class driven headless by `app.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-08-linked-decks-design.md`

## Global Constraints
- **Ids:** grafted id = `<linked node full id>.<B's node id>`. Ids are flat within B, so `y` under `x` is `t.y`, not `t.x.y`. Chained grafts get `t.fut.z`. The error slide is `<L>.!error`.
- **Grafted nodes** carry `_from: '<deck slug>'`. Linked nodes carry `include: '<deck slug>'`, and their saved `children` are always `[]`.
- **Images:** graft image keys contain `.`; own keys (`'im' + uid()`) never do. Save drops `.` keys.
- **Linked-node slugs** match `/^[a-z0-9-]+$/` and are unique. They can't be renamed.
- **Messages (exact strings, tests match them):**
  - `Slides from "B" can't be changed here: open B, or move/delete "<linked node title>"`
  - `Its slides come from "B": open B to change them`
  - `Removed link to "B"`
- **Tests:** run with `bun test`. The baseline is 137 passing.
- **Style:** match the surrounding style: dense one-liners in the app, `S`/`N`/`D` naming, no new dependencies.

## Deviations from the spec (decided here)
- The spec has the Export button on grafted slides read "Open B to export these slides". Instead, the whole Slide tab body (Export included) is hidden on grafted slides, and the read-only banner says "Open it → to edit or export". It's the same outcome with one less special case.

## Review Focus
1. **Scratch mode (no `?deck=`) with linked nodes.** Expected: they graft on load and the localStorage snapshot is stripped. No test covers it (the harness can't pre-seed localStorage), so check it by reading the code.
2. **Single-layer edit paths on a grafted slide** (paste image, apply layout, duplicate frame, component code edit). Expected: reverted by the guard with the message. The guard test covers the generic `setNode` path only.
3. **Deleting a linked node while the current slide is inside its graft.** Expected: land on a surviving slide, never a blank stage.
4. **A linked deck whose slide links point at its own `ROOT`.** Expected: shows as a missing-slide link, not a crash.
5. **Regrafting after create/copy builds new objects for every grafted node.** Expected: `_graftEdit` stops the guard from reverting that update. Pinned by the create-link test.

---

### Task 1: Markdown: `include:` lines, dotted links into grafts, export

**Files:**
- Modify: `markdown.ts` (`Chip`, `Section`, the heading loop in `parseMarkdown`, `resolve`/`check`, `toMarkdown`)
- Test: `markdown.test.ts`, `server.test.ts`

**Interfaces:**
- Produces:
  - `Section.include?: string`
  - `Chip.into?: string`, `Chip.path?: string[]`, `Chip.via?: string`: set when a dotted link enters a linked section. `target` is then `<via>.<path joined by .>`.
  - `toMarkdown` writes `include:` and throws for `_from` nodes.

- [ ] **Step 1: Write the failing tests** (append to `markdown.test.ts`; `node`, `T` and `toMarkdown` are already defined/imported there)

```ts
test("include: makes a linked section; dotted links into it are left for the importer", () => {
  const r = parseMarkdown("# Top\nslug: top\n\n[link:top.wallets.costs][Costs]\n\n## Wallets\nslug: wallets\ninclude: digital-wallets\n\nWhy wallets.\n");
  expect(r.errors).toEqual([]);
  expect(r.sections[0].children[0]).toMatchObject({ slug: "wallets", include: "digital-wallets", body: "Why wallets.", children: [] });
  expect(r.sections[0].links[0]).toMatchObject({ target: "wallets.costs", into: "digital-wallets", path: ["costs"], via: "wallets" });
  expect(parseMarkdown("# A\nslug: a\n\n[link:costs][C]\n").errors).toEqual([{ line: 4, msg: 'link target "costs" not found' }]);   // bare refs never look inside
});

test("include: errors: no slug line, bad deck slug, child headings under a linked slide", () => {
  expect(parseMarkdown("# A\ninclude: b\n").errors).toEqual([{ line: 2, msg: "a linked slide needs a slug line" }]);
  expect(parseMarkdown("# A\nslug: a\ninclude: Bad Deck\n").errors).toEqual([{ line: 3, msg: 'invalid deck slug "Bad Deck"' }]);
  expect(parseMarkdown("# A\nslug: a\ninclude: b\n\n## C\nslug: c\n").errors).toEqual([{ line: 5, msg: "a linked slide's slides come from b; it can't have its own" }]);
});

test("export writes a linked node's include line and stops there; chips into its graft stay chips", () => {
  const nodes: any = {
    ROOT: node("ROOT", "", ["top"], null),
    top: node("top", "Top", ["wallets"], [T("c", "Costs →", 50, { link: { type: "slide", id: "wallets.costs" } })]),
    wallets: { ...node("wallets", "Wallets", ["wallets.costs"], null, "Why wallets."), include: "digital-wallets" },
    "wallets.costs": { ...node("wallets.costs", "Costs", [], null), _from: "digital-wallets" },
  };
  const md = toMarkdown(nodes, "top", { deck: "d", date: "x" });
  expect(md).toBe(
`<!-- Exported from deck "d", slide "Top" (top), x -->

# Top
slug: top

- [link:wallets.costs][Costs]

## Wallets
slug: wallets
include: digital-wallets

Why wallets.
`);
  expect(parseMarkdown(md).errors).toEqual([]);
  expect(() => toMarkdown(nodes, "wallets.costs", { deck: "d", date: "x" })).toThrow('belongs to deck "digital-wallets"');
});
```
Exported chips use graft ids like `[link:wallets.costs]`, where `wallets` needn't be top-level. So a dotted ref's **first** segment is now looked up anywhere by slug (like a bare ref), and the rest is walked from there. Existing `top.child` paths keep working. `resolve` below implements this.

Append to `server.test.ts`:
```ts
test("POST /api/export refuses a grafted slide: it belongs to its own deck", async () => {
  const nodes = { ROOT: { id: "ROOT", title: "", body: "", children: ["w"] }, w: { id: "w", title: "W", body: "", children: ["w.x"], include: "b" },
    "w.x": { id: "w.x", title: "X", body: "", children: [], _from: "b" } };
  const res = await handler(root)(new Request("http://x/api/export", { method: "POST", body: JSON.stringify({ nodes, id: "w.x", deck: "t" }) }));
  expect(res.status).toBe(400);
  expect(await res.text()).toContain('belongs to deck "b"');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test markdown.test.ts server.test.ts`
Expected: the 4 new tests FAIL (`include` is undefined, errors are not reported, and the export emits the graft / doesn't throw).

- [ ] **Step 3: Implement in `markdown.ts`**

Types:
```ts
export type Chip = { label: string; ref: string; line: number; target?: string; into?: string; path?: string[]; via?: string };
```
and `Section` gains `include?: string;`.

Next to `SLUG_LINE`:
```ts
const INC_LINE = /^include:\s*(.*?)\s*$/;
```

In `parseMarkdown`, `Raw` gains `include?: string`. In the heading branch, after the existing slug/no-slug `if/else`, add:
```ts
      const inc = INC_LINE.exec(lines[i + 1] ?? "");
      if (inc) {
        i++; r.include = inc[1];
        if (!s) errors.push({ line: i + 1, msg: "a linked slide needs a slug line" });
        else if (!SLUG_RE.test(inc[1])) errors.push({ line: i + 1, msg: `invalid deck slug "${inc[1]}"` });
      }
```
In the section-building loop, replace:
```ts
    const sec: Section = { slug: r.slug, title: r.title, line: r.line, depth, ...parseBody(r.body), children: [] };
    stack.length = Math.min(stack.length, depth - 1);
```
with:
```ts
    const sec: Section = { slug: r.slug, title: r.title, line: r.line, depth, ...parseBody(r.body), children: [], ...(r.include ? { include: r.include } : {}) };
    stack.length = Math.min(stack.length, depth - 1);
    const parent = stack[stack.length - 1];
    if (parent?.include) errors.push({ line: r.line, msg: `a linked slide's slides come from ${parent.include}; it can't have its own` });
```
Replace `resolve` and the link line in `check`:
```ts
  // Dotted refs: the first segment is found anywhere (like a bare ref), the rest walks children; entering a linked section hands the rest to the importer.
  const resolve = (ref: string): Partial<Chip> | undefined => {
    const parts = ref.split(".");
    let hit = bySlug.get(parts[0]);
    for (let n = 1; hit && n < parts.length; n++) {
      if (hit.include) return { target: [hit.slug, ...parts.slice(n)].join("."), into: hit.include, path: parts.slice(n), via: hit.slug };
      const next: Section | undefined = hit.children.find(s => s.slug === parts[n]); hit = next;
    }
    return hit && { target: hit.slug };
  };
  const check = (ss: Section[]) => ss.forEach(s => {
    s.links.forEach(l => { const r = resolve(l.ref); if (r) Object.assign(l, r); else errors.push({ line: l.line, msg: `link target "${l.ref}" not found` }); });
    check(s.children);
  });
```
(The `top` list stays in use for building sections.) Then run `bun test markdown.test.ts` and confirm the existing dotted-path test (`[link:top.child]`) still passes.

In `toMarkdown`:
- At the top, after `walk(id);`:
  ```ts
  if (nodes[id]._from) throw new Error(`"${nodes[id].title}" belongs to deck "${nodes[id]._from}": open that deck to export it`);
  ```
- In `emit`, replace the `out.push(…)` and `n.children.forEach(…)` lines with:
  ```ts
      out.push(`${"#".repeat(depth)} ${one(n.title) || "Untitled"}\nslug: ${k}` + (n.include ? `\ninclude: ${n.include}` : ""), ...body(n));
      if (!n.include) n.children.forEach((c: string) => emit(c, depth + 1));   // a linked node's children are its deck's
  ```
- The depth check must not count grafts:
  ```ts
  const height = (k: string): number => 1 + (nodes[k].include ? 0 : Math.max(0, ...nodes[k].children.map(height)));
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add markdown.ts markdown.test.ts server.test.ts
git commit -m "Linked decks: include: lines and dotted links into grafts in markdown"
```

---

### Task 2: Importer: write `include`, warn on links into linked decks

**Files:**
- Modify: `importer.ts` (`importInto`, `importMarkdown`, plus a new `linkProblem`)
- Test: `importer.test.ts`

**Interfaces:**
- Consumes: `Section.include` and `Chip.into/path/via/target` (Task 1)
- Produces: nodes with `include`; `importMarkdown(...).warnings` gains link-into-deck warnings

- [ ] **Step 1: Write the failing tests** (append to `importer.test.ts`; add `importMarkdown` to its import from `./importer`)

```ts
const deckFile = (root: string, slug: string, nodes: object) => Bun.write(join(root, `decks/${slug}/deck.json`), JSON.stringify({ nodes }));

test("import writes include onto the linked node, and drops it when the line goes", () => {
  const d = imp(null, "# W\nslug: w\ninclude: dw\n\nWhy.\n");
  expect(d.nodes.w).toMatchObject({ include: "dw", children: [] });
  expect(imp(d, "# W\nslug: w\n\nWhy.\n").nodes.w.include).toBeUndefined();
});

test("links into a linked deck are checked on import: warnings, never errors; chains are followed", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-inc-"));
  await deckFile(root, "dw", { ROOT: { id: "ROOT", children: ["costs", "fut"] }, costs: { id: "costs", title: "Costs", children: [] }, fut: { id: "fut", title: "F", include: "df", children: [] } });
  await deckFile(root, "df", { ROOT: { id: "ROOT", children: ["y"] }, y: { id: "y", title: "Y", children: [] } });
  const md = (ref: string, deck = "dw") => `# Top\nslug: top\n\n[link:${ref}][Go]\n\n## W\nslug: w\ninclude: ${deck}\n`;
  for (const ok of ["w.costs", "w.fut.y"]) { const r = await importMarkdown(root, "t", md(ok)); expect(r.errors).toEqual([]); expect(r.warnings).toEqual([]); }
  expect((await importMarkdown(root, "t", md("w.nope"))).warnings).toEqual([{ line: 4, msg: 'link target "w.nope" not found in deck dw' }]);
  const gone = await importMarkdown(root, "t2", md("w.costs", "missing"));
  expect(gone.deck).toBeTruthy();
  expect(gone.warnings).toEqual([{ line: 4, msg: 'deck "missing" not found (linked from "w")' }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test importer.test.ts`
Expected: FAIL. `include` is undefined on the node, and the warnings arrays are empty.

- [ ] **Step 3: Implement in `importer.ts`**

In `importInto`'s `add`, replace:
```ts
    const { layers: _legacy, ...rest } = prev ?? {};
    nodes[s.slug] = { ...rest, id: s.slug, title: s.title, body: s.body, children: s.children.map(c => c.slug),
```
with:
```ts
    const { layers: _legacy, include: _inc, ...rest } = prev ?? {};
    nodes[s.slug] = { ...rest, id: s.slug, title: s.title, body: s.body, children: s.children.map(c => c.slug), ...(s.include ? { include: s.include } : {}),
```
Above `importMarkdown`, add:
```ts
// Where a link into a linked deck fails: null = found, "missing" = no such slide, else the problem (a missing deck). Follows chained links.
async function linkProblem(root: string, deck: string, path: string[], seen: string[] = []): Promise<string | null> {
  const f = Bun.file(join(root, "decks", deck, "deck.json"));
  if (!(await f.exists())) return `deck "${deck}" not found`;
  const N = (await f.json()).nodes; let list: string[] = N.ROOT.children;
  for (let n = 0; n < path.length; n++) {
    const node = list.includes(path[n]) ? N[path[n]] : null;
    if (!node) return "missing";
    if (node.include && n < path.length - 1) return seen.includes(node.include) ? "missing" : linkProblem(root, node.include, path.slice(n + 1), [...seen, deck]);
    list = node.children ?? [];
  }
  return null;
}
```
In `importMarkdown`, right after the `if (parsed.errors.length) return …` line:
```ts
  const checkInto = async (ss: Section[]): Promise<void> => { for (const s of ss) {
    for (const l of s.links) if (l.into) { const p = await linkProblem(root, l.into, l.path!);
      if (p) parsed.warnings.push({ line: l.line, msg: p === "missing" ? `link target "${l.ref}" not found in deck ${l.into}` : `${p} (linked from "${l.via}")` }); }
    await checkInto(s.children); } };
  await checkInto(parsed.sections);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add importer.ts importer.test.ts
git commit -m "Linked decks: importer writes include and warns on links into linked decks"
```

---

### Task 3: Build publishes the linked chain

**Files:**
- Modify: `build.ts`
- Test: `build.test.ts`

**Interfaces:** none shared.

- [ ] **Step 1: Write the failing test** (append to `build.test.ts`)

```ts
test("publishing a deck also publishes the decks it links to, through chains and loops; a missing link fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "strata-b-"));
  await Bun.write(join(root, "design/strata.dc.html"), '<head>\n<script src="./support.js"></script>\n</head>');
  const deck = (s: string, inc?: string) => Bun.write(join(root, `decks/${s}/deck.json`),
    JSON.stringify({ title: s, nodes: { ROOT: { children: inc ? ["l"] : [] }, ...(inc ? { l: { id: "l", title: "L", include: inc, children: [] } } : {}) } }));
  await deck("talk", "dw"); await deck("dw", "df"); await deck("df", "dw"); await deck("other");
  const out = join(root, "dist");
  await build(root, out, "talk");
  expect((await Bun.file(join(out, "decks/index.json")).json()).map((d: any) => d.slug).sort()).toEqual(["df", "dw", "talk"]);
  expect(await Bun.file(join(out, "decks/other/deck.json")).exists()).toBe(false);
  await deck("broken", "nope");
  await expect(build(root, out, "broken")).rejects.toThrow(`deck "broken" links to "nope", which isn't in decks/`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test build.test.ts`
Expected: FAIL. Only `talk` is published.

- [ ] **Step 3: Implement in `build.ts`**

Replace:
```ts
  if (deck && !existsSync(join(root, "decks", deck, "deck.json"))) throw new Error(`build: no deck "${deck}" in decks/`);
```
with:
```ts
  const publish = new Set<string>();   // the deck plus every deck it links to (include fields), transitively
  const visit = async (s: string, from?: string): Promise<void> => {
    if (publish.has(s)) return;
    const f = join(root, "decks", s, "deck.json");
    if (!existsSync(f)) throw new Error(from ? `build: deck "${from}" links to "${s}", which isn't in decks/` : `build: no deck "${s}" in decks/`);
    publish.add(s);
    for (const n of Object.values<any>((await Bun.file(f).json()).nodes)) if (n.include) await visit(n.include, s);
  };
  if (deck) await visit(deck);
```
And replace:
```ts
  if (deck) await cp(join(root, "decks", deck), join(out, "decks", deck), { recursive: true });
```
with:
```ts
  if (deck) for (const s of publish) await cp(join(root, "decks", s), join(out, "decks", s), { recursive: true });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass, including the existing "publishes only that deck" test.

- [ ] **Step 5: Commit**

```bash
git add build.ts build.test.ts
git commit -m "Linked decks: publishing a deck also publishes its linked decks"
```

---

### Task 4: App: graft on load, strip on save, copy keeps links

**Files:**
- Modify: `design/strata.dc.html`:
  - module consts (after `const mapImgs`)
  - new `graft()` method
  - `loadDeck()`, `save()`, scratch load in `componentDidMount()` and the scratch snapshot in `componentDidUpdate()`
  - `copyDeck()`, `copyDeckHere()`
- Test: `app.test.ts`

**Interfaces:**
- Produces:
  - `graft(nodes): Promise<{ nodes, images }>`
  - module helpers `stripGrafts(N)`, `ownImages(im)`, `graftImages(im)`
  - `this._graftEdit` (set true right before any `setState` that installs a fresh graft; consumed by Task 6's guard)
  - `freeId(base): string`

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`)

```ts
// ---- linked decks ----
const linkTalk = async () => {
  await deckBWithImage();
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t", "w2"]), t: slideNode("t", "Intro", [], { include: "b" }), w2: slideNode("w2", "Again", [], { include: "b" }) });
  return (await mount("?deck=talk")).c;
};

test("a linked node's deck is grafted under it: namespaced ids, prefixed links and images, same deck twice", async () => {
  const c = await linkTalk(); const N = c.state.nodes;
  expect(N.t.children).toEqual(["t.x"]);
  expect(N["t.x"]).toMatchObject({ _from: "b", children: ["t.y"] });
  expect(N["t.y"]._from).toBe("b");
  const ls = N["t.x"].frames[0].layers;
  expect(ls[0].link).toEqual({ type: "slide", id: "t.y" }); expect(ls[1].imgKey).toBe("t.im1");
  expect(c.state.images["t.im1"]).toBe("../decks/b/img/a.png");
  expect(N.w2.children).toEqual(["w2.x"]);                                       // same deck again, its own namespace
  c.nav("t.y", "jump"); expect(c.state.cur).toBe("t.y");                         // a host link to a grafted id just navigates
  expect(c.isDirty()).toBe(false); await Bun.sleep(150); c.componentDidUpdate(); expect(c._past.length).toBe(0);
});

test("chains graft through, and a missing deck or a loop becomes one error slide", async () => {
  await writeDeck("c3", { ROOT: slideNode("ROOT", "", ["z"]), z: slideNode("z", "Z") });
  await writeDeck("b", { ROOT: slideNode("ROOT", "", ["x", "fut", "lp"]), x: slideNode("x", "Bx"), fut: slideNode("fut", "Fut", [], { include: "c3" }), lp: slideNode("lp", "Loop", [], { include: "talk" }) });
  await writeDeck("talk", { ROOT: slideNode("ROOT", "", ["t", "m"]), t: slideNode("t", "Intro", [], { include: "b" }), m: slideNode("m", "Missing", [], { include: "nope" }) });
  const { c } = await mount("?deck=talk"); const N = c.state.nodes;
  expect(N["t.fut"].children).toEqual(["t.fut.z"]); expect(N["t.fut.z"].title).toBe("Z");
  expect(N["t.lp"].children).toEqual(["t.lp.!error"]); expect(N["t.lp.!error"].body).toContain("loop");
  expect(N.m.children).toEqual(["m.!error"]); expect(N["m.!error"].title).toBe("Can't link nope");
  expect(N.ROOT.children).toEqual(["t", "m"]);
});

test("saving writes only the link: no grafted slides, linked node children empty, no grafted images", async () => {
  const c = await linkTalk();
  c.setNode("t", { title: "Intro 2" }); await c.save();
  const d = await onDisk();
  expect(Object.keys(d.nodes).sort()).toEqual(["ROOT", "t", "w2"]);
  expect(d.nodes.t).toMatchObject({ include: "b", children: [], title: "Intro 2" });
  expect(Object.keys(d.images || {})).toEqual([]);
  expect(c.state.nodes["t.x"]).toBeTruthy(); expect(c.state.images["t.im1"]).toBeTruthy();   // still grafted in the editor
});

test("copying a deck keeps its linked nodes live, with their slug (or -2 if taken)", async () => {
  await deckBWithImage();
  await writeDeck("lib", { ROOT: slideNode("ROOT", "", ["t", "s"]), t: slideNode("t", "Lib link", [], { include: "b" }), s: slideNode("s", "S") });
  await deckTalk();
  const { c } = await mount("?deck=talk");
  await c.copyDeckHere("t", "lib");
  const [lk, s] = c.state.nodes.t.children;
  expect(lk).toBe("t-2"); expect(c.state.nodes[lk]).toMatchObject({ include: "b", children: ["t-2.x"] });
  expect(s).not.toBe("s");                                                        // ordinary slides still get fresh ids
});
```
Replace the existing test `"old live includes are converted to real copies when a deck is opened, then saved"` with:
```ts
test("a saved include opens as a live link (no longer converted to copies)", async () => {
  await deckBWithImage(); await deckTalk({ include: "b" });
  const { c } = await mount("?deck=talk");
  expect(c.state.nodes.t.include).toBe("b"); expect(c.state.nodes.t.children).toEqual(["t.x"]); expect(c.isDirty()).toBe(false);
});
```
In the test `"Slide tab offers 'Copy deck here' and no longer has include/read-only UI"`:
- rename it to `"Slide tab offers 'Copy deck here'; the old include dropdown is gone"`;
- change its list to `["incFrom", "incShow"]`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: the 5 new or changed linked-deck tests FAIL. For example, `t.children` is `["t.x-copy-id"]` (old migration), or the expectation is undefined.

- [ ] **Step 3: Implement** (in `design/strata.dc.html`)

Module consts, after the `const mapImgs = …` line:
```js
// Linked decks: a node with include: B gets B's slides grafted under it in memory, ids "<linked node id>.<B's id>", marked _from: B; saves strip them.
const prefixLayer = (l, p) => ({ ...l, ...(l.link && l.link.type === 'slide' ? { link: { ...l.link, id: p + l.link.id } } : {}), ...(l.imgKey ? { imgKey: p + l.imgKey } : {}) });
const prefixNode = (n, k, p, from) => ({ ...n, id: p + k, _from: from, children: (n.children || []).map(c => p + c),
  ...(n.frames ? { frames: n.frames.map(f => ({ ...f, layers: f.layers.map(l => prefixLayer(l, p)) })) } : {}),
  ...(n.layers ? { layers: n.layers.map(l => prefixLayer(l, p)) } : {}) });
const stripGrafts = N => { const o = {}; for (const k in N) { const v = N[k]; if (v._from) continue; o[k] = v.include ? { ...v, children: [] } : v; } return o; };
const ownImages = im => Object.fromEntries(Object.entries(im || {}).filter(([k]) => !k.includes('.')));
const graftImages = im => Object.fromEntries(Object.entries(im || {}).filter(([k]) => k.includes('.')));
```
New methods, before `async copyDeck(`:
```js
  // Rebuild every graft from the decks' saved files. Loops (the chain includes B) and missing decks become one error slide.
  async graft(nodes) {
    const out = stripGrafts(nodes), images = {};
    const walk = async (id, chain) => {
      const n = out[id];
      if (n.include) {
        const B = n.include, p = id + '.';
        try {
          if (chain.includes(B)) throw new Error('link loop ' + chain.concat(B).join(' → '));
          const d = await this.fetchDeck(B);
          for (const k in d.nodes) if (k !== 'ROOT') out[p + k] = prefixNode(d.nodes[k], k, p, B);
          for (const k in d.images || {}) images[p + k] = deckUrl(B, d.images[k]);
          out[id] = { ...n, children: d.nodes.ROOT.children.map(c => p + c) };
          for (const k of out[id].children) await walk(k, chain.concat(B));
        } catch (e) { out[p + '!error'] = { id: p + '!error', title: "Can't link " + B, body: e.message, children: [], _from: B }; out[id] = { ...n, children: [p + '!error'] }; }
        return;
      }
      for (const c of n.children) await walk(c, chain);
    };
    await walk('ROOT', DECK ? [DECK] : []);
    return { nodes: out, images };
  }
  freeId(base, taken = []) { const N = this.state.nodes; let s = base, i = 2; while (N[s] || taken.includes(s)) s = base + '-' + i++; return s; }
```
`copyDeck(slug, chain)`. Keep the `chain.includes(slug)` loop check, but:
- replace `for (const k in d.nodes) if (k !== 'ROOT') map[k] = 's' + uid();` with:
  ```js
  for (const k in d.nodes) if (k !== 'ROOT') map[k] = d.nodes[k].include ? this.freeId(k, Object.values(map)) : 's' + uid();   // linked nodes keep their readable slug
  ```
- delete the whole `for (const k of Object.keys(nodes)) if (nodes[k].include) { … }` block that recursively copied includes, and update the comment above `copyDeck` to: `// Copy another deck's slides as ordinary slides: fresh ids, slide links remapped, images inlined. Linked nodes stay live links.`

`copyDeckHere(tid, slug, mode)`. After the `if (tid === 'ROOT') mode = 'child';` line add:
```js
    if (this.state.nodes[tid]._from || this.state.nodes[tid].include) { this.flash(this.graftMsg(tid)); return; }
```
Then replace the two `this.setState(…)` branches with:
```js
      const S = this.state; let nodes, extra;
      if (mode === 'replace') {
        const pid = this.derive().parent[tid];
        nodes = { ...S.nodes, ...c.nodes }; const kill = x => { nodes[x].children.forEach(kill); delete nodes[x]; }; kill(tid);
        const ks = S.nodes[pid].children, i = ks.indexOf(tid);
        nodes[pid] = { ...S.nodes[pid], children: [...ks.slice(0, i), ...c.tops, ...ks.slice(i + 1)] };
        extra = { cur: c.tops[0], prev: null, phase: 'idle', fi: 0, layerSel: null, transSel: null };
      } else {
        nodes = { ...S.nodes, ...c.nodes, [tid]: { ...S.nodes[tid], children: [...S.nodes[tid].children, ...c.tops] } };
        extra = { collapsed: { ...(S.collapsed || {}), [tid]: false } };
      }
      const g = await this.graft(nodes); this._graftEdit = true;
      this.setState(s => ({ nodes: g.nodes, images: { ...ownImages(s.images), ...c.images, ...g.images }, ...extra }));
```
(`graftMsg` arrives in Task 6. Until then, add this temporary stub after `freeId`; Task 6 replaces it:
`graftMsg(id) { return 'read-only'; }`.)

`loadDeck()`. Replace everything from `let nodes = d.nodes, images = mapImgs(d.images, absUrl), migrated = false;` through the closing `});` of the `this.setState({ ...pick, nodes, images, …` call with:
```js
      const g = await this.graft(d.nodes);
      this._lastNodes = g.nodes;                               // don't record the load (or its grafts) as an undo step
      this.setState({ ...pick, nodes: g.nodes, images: { ...mapImgs(d.images, absUrl), ...g.images }, customBg: d.customBg ? absUrl(d.customBg) : null,
        cur: d.titlePage ? 'ROOT' : d.nodes.ROOT.children[0], prev: null, phase: 'idle' }, () => { this._loaded = true; this.markSaved(); });
```
Before editing, read the current block. Keep any field in that `setState` that the replacement omits.

`save()`. After `body.images = mapImgs(S.images, relUrl); body.customBg = …;` change it to:
```js
    body.nodes = stripGrafts(S.nodes); body.images = mapImgs(ownImages(S.images), relUrl); body.customBg = S.customBg ? relUrl(S.customBg) : null;
```
and in the success branch replace `images: mapImgs(d.images, absUrl)` with `images: { ...graftImages(S.images), ...mapImgs(d.images, absUrl) }`.

Scratch mode, in `componentDidMount`:
- after the line `if (s && s.nodes && s.nodes.ROOT) this.setState({ ...s, … });` add:
  ```js
      if (s && s.nodes && s.nodes.ROOT) this.graft(s.nodes).then(g => { this._lastNodes = g.nodes; this._graftEdit = true; this.setState(st => ({ nodes: g.nodes, images: { ...ownImages(st.images), ...g.images } })); });
  ```
- in `componentDidUpdate`'s scratch snapshot, change `nodes: S.nodes,` to `nodes: stripGrafts(S.nodes),`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass. That includes the existing copy-deck tests: "copying the same deck twice", "can't be copied into itself", and "Replace this slide … one undo step".

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Linked decks: graft linked decks on load, strip on save; copies keep links live"
```

---

### Task 5: App: create a link; linked-node move/delete/refusals

**Files:**
- Modify: `design/strata.dc.html`:
  - new `createLink()`
  - `insert()`, `remove()`
  - `renderVals` insert-deck values
  - the Insert deck template
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `graft`, `freeId`, `_graftEdit`, `ownImages`, and the `graftMsg` stub (Task 4)
- Produces: `createLink(tid, B, slug): Promise<boolean>`; render values `isLinkMode`, `linkSlug`, `onLinkSlug`, `linkLabel`, `linkOff`, `onLink`, `insertHint`

- [ ] **Step 1: Write the failing tests**

```ts
test("Link (live) adds a linked node under the current slide: deduped slug, grafted at once, one undo step", async () => {
  await deckBWithImage(); await deckTalk();
  const { c } = await mount("?deck=talk"); await Bun.sleep(150);
  c.setState({ copyMode: "link" }); let v = c.renderVals();
  expect(v.isLinkMode).toBe(true);
  v.onCopyDeck({ target: { value: "b" } }); expect(c.state.linkDeck).toBe("b"); expect(c.state.linkSlug).toBe("b");
  expect(c.freeId("t")).toBe("t-2");
  expect(await c.createLink("t", "b", "Bad Slug")).toBe(false); expect(c.state.note).toMatch(/not valid/);
  expect(await c.createLink("t", "b", "b")).toBe(true); c.componentDidUpdate();
  expect(c.state.nodes.t.children).toEqual(["b"]);
  expect(c.state.nodes.b).toMatchObject({ include: "b", title: "Bx", children: ["b.x"] });
  expect(c.state.nodes["b.x"]).toBeTruthy(); expect(c.state.cur).toBe("b");
  c.undo(); c.componentDidUpdate();
  expect(c.state.nodes.b).toBeUndefined(); expect(c.state.nodes["b.x"]).toBeUndefined();
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  expect(html).toContain('onClick="{{ onLink }}"');
});

test("a linked node moves with its graft, deletes at once (undo restores), and can't take children of its own", async () => {
  const c = await linkTalk(); await Bun.sleep(150);
  c.moveNode("w2", "t", "before"); c.componentDidUpdate();
  expect(kids(c, "ROOT")).toEqual(["w2", "t"]); expect(kids(c, "w2")).toEqual(["w2.x"]);
  c.remove("t"); c.componentDidUpdate();
  expect(c.state.confirmDel).toBeFalsy(); expect(c.state.nodes.t).toBeUndefined(); expect(c.state.nodes["t.x"]).toBeUndefined();
  expect(c.state.note).toBe('Removed link to "b"');
  c.undo(); c.componentDidUpdate(); expect(kids(c, "t")).toEqual(["t.x"]);
  const before = c.state.nodes;
  c.addChild("t"); expect(c.state.nodes).toBe(before);
  c.moveNode("w2", "t", "child"); expect(c.state.nodes).toBe(before);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test app.test.ts`
Expected: FAIL. `isLinkMode` is undefined, `c.createLink is not a function`, and `remove("t")` opens the confirm dialog.

- [ ] **Step 3: Implement**

New method after `freeId`:
```js
  // Live link: a new linked node (readable slug id) as the last child of tid, with deck B grafted under it. One undo step.
  async createLink(tid, B, slug) {
    const N = this.state.nodes;
    if (!B) return false;
    if (!/^[a-z0-9-]+$/.test(slug || '') || N[slug]) { this.flash('Slug "' + (slug || '') + '" is ' + (N[slug] ? 'taken' : 'not valid (use a-z, 0-9 and -)')); return false; }
    if (N[tid]._from || N[tid].include) { this.flash(this.graftMsg(tid)); return false; }
    let d; try { d = await this.fetchDeck(B); } catch (e) { this.flash('Couldn\'t link "' + B + '": ' + e.message); return false; }
    const first = d.nodes[d.nodes.ROOT.children[0]];
    const own = { ...N, [slug]: { id: slug, title: d.title || (first && first.title) || B, body: '', children: [], include: B }, [tid]: { ...N[tid], children: [...N[tid].children, slug] } };
    const g = await this.graft(own); this._graftEdit = true;
    this.setState(s => ({ nodes: g.nodes, images: { ...ownImages(s.images), ...g.images }, cur: slug, prev: null, phase: 'idle', fi: 0, linkDeck: null, layerSel: null }));
    return true;
  }
```
`insert(pid, index)`, at the start of the body:
```js
    if (this.state.nodes[pid]._from || this.state.nodes[pid].include) { this.flash(this.graftMsg(pid)); return; }
```
`moveNode(id, tid, where)`, after the existing invalid-move `return` line:
```js
    if (where === 'child' && T.include) { this.flash(this.graftMsg(tid)); return; }
```
`remove(id)`, after the `if (!N[id] || id === 'ROOT') return;` line:
```js
    if (N[id].include) { this.removeNode(id, false); this.flash('Removed link to "' + N[id].include + '"'); return; }   // its children are the graft, not yours
```
`treeDropAt`: change `return { id, where };` to `return where === 'child' && this.state.nodes[id].include ? null : { id, where };`.

`renderVals`:
- `copyModes`: add `['link', 'Link (live)']` as the third entry.
- `onCopyDeck`:
  ```js
  onCopyDeck: e => { const v = e.target.value; if (!v) return; if ((S.copyMode || 'child') === 'link') this.setState({ linkDeck: v, linkSlug: this.freeId(v) }); else this.copyDeckHere(this.curId(), v, S.copyMode || 'child'); },
  ```
- add:
  ```js
      isLinkMode: (S.copyMode || 'child') === 'link', linkSlug: S.linkSlug || '', onLinkSlug: e => this.setState({ linkSlug: e.target.value }),
      linkLabel: S.linkDeck ? 'Link ' + S.linkDeck : 'Choose a deck above', linkOff: !S.linkDeck, onLink: () => this.createLink(this.curId(), S.linkDeck, S.linkSlug),
      insertHint: (S.copyMode || 'child') === 'link' ? 'Shows another deck\'s slides under a new linked slide here, live and read-only: edits to that deck show when this one is reopened.' : 'Copies another deck\'s slides into this one as ordinary, editable slides.',
  ```

Template (Insert deck section):
- replace the fixed hint text `Copies another deck's slides into this one as ordinary, editable slides.` with `{{ insertHint }}`;
- after the `</select>` of `onCopyDeck`, add:
```html
                    <sc-if value="{{ isLinkMode }}">
                      <div style="display:flex;gap:6px;align-items:center">
                        <input value="{{ linkSlug }}" onChange="{{ onLinkSlug }}" placeholder="slug" title="The linked slide's slug: its slides become slug.slide" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e0d9cb;border-radius:7px;background:#fff;outline:none;font-family:'JetBrains Mono',monospace;font-size:12px">
                        <button onClick="{{ onLink }}" disabled="{{ linkOff }}" style="flex:none;padding:6px 12px;border:0;border-radius:7px;background:#1d1b17;color:#fbf9f4;cursor:pointer;font-size:12.5px;white-space:nowrap">{{ linkLabel }}</button>
                      </div>
                    </sc-if>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Linked decks: Link (live) in Insert deck; linked nodes move and delete freely"
```

---

### Task 6: App: grafted slides are read-only (refusals, guard, stage, tree, Slide tab)

**Files:**
- Modify: `design/strata.dc.html`:
  - `graftMsg()` (replaces the stub), new `guardGrafts()`, `componentDidUpdate()`
  - `insert()`/`remove()`/`outdent()`/`moveNode()`/`treeDropAt()`/`startTreeDrag()`
  - `renderVals` (`editable`, tree nodes, Slide tab values)
  - the tree node and Slide tab templates
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `_graftEdit`, `_from`/`include` fields (Tasks 4–5)
- Produces: render values `fromDeck`, `fromHref`, `ownSlide`, `linkedDeck`, `linkedHref`; tree-node fields `ring`, `canAdd`

- [ ] **Step 1: Write the failing test**

```ts
test("grafted slides are read-only: tree edits refused with a message, the guard reverts anything else, the stage isn't editable", async () => {
  const c = await linkTalk(); await Bun.sleep(150); const before = c.state.nodes;
  c.addPeer("t.x"); c.addChild("t.x"); c.remove("t.x"); c.outdent("t.y"); c.moveNode("t.x", "w2", "after"); c.moveNode("w2", "t.x", "after");
  expect(c.state.nodes).toBe(before);
  expect(c.state.note).toBe('Slides from "b" can\'t be changed here: open b, or move/delete "Intro"');
  c.setNode("t.x", { title: "hacked" }); c.componentDidUpdate();                    // a path with no explicit block
  expect(c.state.nodes["t.x"].title).toBe("Bx");
  c.setState({ cur: "t.x", prev: null, phase: "idle" }); let v = c.renderVals();
  expect(v.editable).toBe(false); expect(v.ownSlide).toBe(false);
  expect(v.fromDeck).toBe("b"); expect(v.fromHref).toBe("?deck=b");
  const tn = v.treeNodes.find((n: any) => n.full === "Bx");
  expect(tn.canPeer).toBe(false); expect(tn.canAdd).toBe(false); expect(tn.ring).toContain("#9db8d3");
  expect(v.treeNodes.find((n: any) => n.full === "Intro").title).toBe("⛓ Intro");
  c._tpos = { "t.x": { x: 0, y: 0 } }; expect(c.treeDropAt(40, 10, "w2")).toBeNull();
  c.setState({ cur: "t" }); v = c.renderVals();
  expect(v.ownSlide).toBe(true); expect(v.linkedDeck).toBe("b"); expect(v.treeNodes.find((n: any) => n.full === "Intro").canAdd).toBe(false);
  const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
  for (const h of ["{{ fromDeck }}", "{{ ownSlide }}", "{{ linkedDeck }}", "{{ n.ring }}", "{{ n.canAdd }}"]) expect(html).toContain(h);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test app.test.ts`
Expected: FAIL. `nodes` changed (`addPeer` inserted a slide), or the note is `"read-only"`.

- [ ] **Step 3: Implement**

Replace the `graftMsg` stub with:
```js
  // The read-only message, naming the linked node that holds a grafted slide (that's what you can move or delete).
  graftMsg(id) {
    const N = this.state.nodes, D = this.derive(), n = N[id] || {};
    if (!n._from) return 'Its slides come from "' + n.include + '": open ' + n.include + ' to change them';
    let h = id; while (h && N[h] && N[h]._from) h = D.parent[h];
    return 'Slides from "' + n._from + '" can\'t be changed here: open ' + n._from + ', or move/delete "' + ((N[h] && N[h].title) || h) + '"';
  }
  // Grafted slides are read-only: revert any nodes change that alters one, or a linked node's children. A fresh graft sets _graftEdit.
  guardGrafts() {
    const S = this.state, prev = this._lastNodes;
    if (this._graftEdit) { this._graftEdit = false; return false; }
    if (!prev || S.nodes === prev || this._restoring) return false;
    for (const k in prev) {
      const v = prev[k], cur = S.nodes[k]; if (!cur) continue;   // deleted along with its linked node
      if ((v._from && cur !== v) || (v.include && String(cur.children) !== String(v.children))) {
        this.setState(s => ({ nodes: prev, layerSel: null, editing: null, cur: prev[s.cur] ? s.cur : prev.ROOT.children[0] }));
        this.flash(this.graftMsg(k)); return true;
      }
    }
    return false;
  }
```
`componentDidUpdate()`: make its first line `if (this.guardGrafts()) return;`, before `this.histTrack();`.

Explicit refusals. In each, the read-only flash comes first:
- `addPeer(id)`: after the `ROOT` return, add `if (this.state.nodes[id]._from) { this.flash(this.graftMsg(id)); return; }`.
- `insert(pid, …)`: already refuses `_from`/`include` parents (Task 5).
- `remove(id)`: before the `include` line, add `if (N[id]._from) { this.flash(this.graftMsg(id)); return; }`.
- `outdent(id)`: after the `ROOT` return, add `if (this.state.nodes[id]._from) { this.flash(this.graftMsg(id)); return; }`.
- `moveNode(id, tid, where)`: before the Task 5 `include` line, add `if (N[id]._from || T._from) { this.flash(this.graftMsg(N[id]._from ? id : tid)); return; }`.
- `treeDropAt`: inside the loop, after `if (id === dragId || this.isUnder(id, dragId)) return null;`, add `if (this.state.nodes[id]._from) return null;`.
- `startTreeDrag(ev, id)`: in `move`, right after `dragging = true;` (the threshold has passed), add:
  ```js
  if (this.state.nodes[id]._from) { up(); this.flash(this.graftMsg(id), 6000); return; }
  ```

`renderVals`:
- `const editable = !isPresent && !isWire && !active;` → `const editable = !isPresent && !isWire && !active && !curN._from;`
- In `treeNodes`' object:
  - `title: name(id)` → `title: (N[id].include ? '⛓ ' : '') + name(id)`;
  - `canPeer: id !== 'ROOT'` → `canPeer: id !== 'ROOT' && !N[id]._from`;
  - add `canAdd: id === 'ROOT' || (!N[id]._from && !N[id].include), ring: N[id]._from ? '0 0 0 2px #9db8d3' : '0 1px 3px rgba(0,0,0,.18)',`;
  - add `from: N[id]._from ? 'From ' + N[id]._from : name(id),` for the hover title (`full` stays as is).
- Add to the returned object:
  ```js
      fromDeck: curN._from || '', fromHref: '?deck=' + (curN._from || ''), ownSlide: !curN._from, linkedDeck: curN.include || '', linkedHref: '?deck=' + (curN.include || ''),
  ```

Template:
- Tree node thumbnail: in the `<div onPointerDown="{{ n.onDragStart }}" …>` element:
  - replace `title="{{ n.full }}"` with `title="{{ n.from }}"`;
  - replace `box-shadow:0 1px 3px rgba(0,0,0,.18)` with `box-shadow:{{ n.ring }}`.
- Wrap the `onChild` ("+ below") button in `<sc-if value="{{ n.canAdd }}">…</sc-if>`, as `canPeer` wraps the others.
- Slide tab: right after `<sc-if value="{{ tabSlide }}">`, insert:
```html
            <sc-if value="{{ fromDeck }}">
              <div style="padding:8px 10px;border:1px solid #d6e2ef;border-radius:8px;background:#eef3f9;font-size:12.5px;line-height:1.45;color:#1f4f80">From <b>{{ fromDeck }}</b>: read-only here. <a href="{{ fromHref }}">Open it →</a> to edit or export.</div>
            </sc-if>
            <sc-if value="{{ linkedDeck }}">
              <div style="padding:8px 10px;border:1px solid #d6e2ef;border-radius:8px;background:#eef3f9;font-size:12.5px;line-height:1.45;color:#1f4f80">Linked deck: <b>{{ linkedDeck }}</b> · <code>{{ cur.id }}</code> · <a href="{{ linkedHref }}">Open it →</a></div>
            </sc-if>
            <sc-if value="{{ ownSlide }}">
```
and close that `<sc-if value="{{ ownSlide }}">` with a `</sc-if>` immediately before the `</sc-if>` that closes `tabSlide`. That closing `</sc-if>` is the one just before `<sc-if value="{{ tabLayout }}">`. Read the lines first to place it exactly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass, including "every {{ name }} the app template uses is provided by renderVals".

- [ ] **Step 5: Commit**

```bash
git add design/strata.dc.html app.test.ts
git commit -m "Linked decks: grafted slides are read-only (refusals, guard, stage, tree, Slide tab)"
```

---

### Task 7: Check it in the real app

**Files:** none, unless a fix is needed. A fix gets a failing test first.

The sandbox blocks local port binding, so this is for the user. Hand them these steps:
- [ ] In `make dev`, open a scratch copy of a deck, choose Insert deck → **Link (live)**, pick another deck, keep the slug, and press **Link**. Expected: a ⛓ node with the linked deck's slides under it, tinted blue.
- [ ] Select a grafted slide. Expected: the read-only banner, no layer handles, and a message when you try Enter, ⌫ or a drag.
- [ ] Drag the ⛓ node elsewhere, then delete it and undo. Then reload. Expected: the graft returns and the deck isn't marked unsaved.
- [ ] In Present mode, step through the grafted slides with arrows and Space, and use breadcrumbs and search.
- [ ] Run `make build DECK=<host>`, then `make preview`. Expected: the linked deck's slides render on the static site.
