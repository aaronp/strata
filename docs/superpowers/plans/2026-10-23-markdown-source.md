# Markdown as the Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deck is `<name>.md` + `<name>-layout.json`; the app rebuilds its in-memory `nodes` from them on every load and markdown edit, with live side-by-side editing, URL loading (`?src=`) and lazily-loaded linked children.

**Architecture:**
- `markdown.ts` stays the one pure parser. It is bundled to `design/md.js` (IIFE, global `StrataMd`) for the browser.
- A new pure **enrichment** step in `design/strata.dc.html`, `enrich(sections, layout, opts) → nodes`, turns parsed sections plus layout data into today's `nodes` (frames/layers). Its inverse, `layoutOf(state) → LayoutFile`, strips content back out. Everything downstream (stage, present, breadcrumbs, search, map views) is unchanged.
- Per-slide overrides **are** today's `custom` nodes, minus their content.

**Tech Stack:** Bun (server, tests, `Bun.build`), a single-file DC component (`design/strata.dc.html`), happy-dom in tests.

**Spec:** `docs/superpowers/specs/2026-10-23-markdown-source-design.md`

## Global Constraints
- All existing deck data may be deleted. There is no migration and no `deck.json` reader.
- Raw HTML in markdown is never rendered. HTML comments are metadata. Other HTML is literal text.
- `children:` URLs are absolute (`https:`) or relative to the file containing them. `?src=` must be `https:` or same-origin.
- The parent owns child order. There is no `right:` field.
- Ids of linked slides are `<linking slide full id>.<slug>`.
- Layout resolution, first match wins: host per-slide override → host layout matching the shape → linked doc's `-layout.json` (override, then layout) → built-in.
- Only the host's own layout file may contain `component` (iframe) layers. Drop them from linked layout files.
- Markdown re-enrichment is debounced **200 ms**.
- Removed:
  - `importer.ts`, `make import`, `/api/import`, `/api/export`, `toMarkdown`
  - `include`/grafting by deck, `createLink`, `copyDeck`/`copyDeckHere`
  - "Split lines into layers" (`splitLines`)
  - The tree's + / delete / drag / rename controls and their keys (Enter, ⇧Enter, Tab, ⌫)

## Review Focus
1. **A markdown file with no headings, or an empty one,** gives a deck with no slides. Build mode shows the markdown pane and an empty stage reading "Add a `#` heading to make a slide". Nothing throws. (Task 4 test `enrich: empty markdown`, Task 6 test `app: empty markdown`.)
2. **Duplicate slugs in one file:** the second becomes `<slug>-2`, with a warning, so layout keys stay unique. (Task 1 test `parse: duplicate slugs`.)
3. **`?src=` pointing at an HTML page** (e.g. a github.com blob URL, not raw): the stage shows `Can't load <url>: not a markdown file` instead of rendering the HTML as slides. (Task 6 test `app: src returns html`.)
4. **Deleting the heading of the slide being edited, or typing a bare `#`:** the current slide moves to its parent, or else the first slide. No crash, and no undo step. (Task 6 test `app: current slide removed by edit`.)
5. **A missing or invalid `-layout.json`:** the deck still loads with built-in layouts, and the header shows `Layout file ignored: <reason>` for invalid JSON. Nothing is shown for a 404. (Task 6 test `app: bad layout file`.)

---

### Task 1: Parser — blocks, comments, children links, images

**Files:**
- Modify: `markdown.ts` (parser; delete `toMarkdown`, the `include:` line, `INC_LINE`)
- Test: `markdown.test.ts` (delete tests for `toMarkdown`, `include:` and text joining; add the tests below)

**Interfaces:**
- Produces:
  ```ts
  export type BlockKey = "body" | "list" | "links" | "sources" | "image";
  export type Block = { key: BlockKey; text: string; line: number; url?: string; alt?: string };   // url/alt for image; text is inline markup (links rewritten as today)
  export type Section = { slug: string; title: string; line: number; depth: number; body: string;
    blocks: Block[]; links: Chip[]; sources: Source[]; inline: Chip[]; childSrc: string[]; children: Section[] };
  export function parseMarkdown(md: string): { sections: Section[]; errors: Issue[]; warnings: Issue[] };
  ```
  - `Chip.target` is the slug when the ref resolves in this file. Otherwise it is left `undefined`: no error, no warning, because enrichment decides.
  - `childSrc` holds the raw URLs, unresolved.
  - `text`, `bulletsOnly` and `include` are removed from `Section`.

- [ ] **Step 1: Write the failing tests** in `markdown.test.ts`:
  - `parse: each paragraph and each list is its own block`: `"# T\nslug: t\n\nA.\n\nB.\n\n- x\n- y\n\nC."` → `blocks.map(b => b.key)` equals `["body","body","list","body"]`. The list block's `text` is `"x\ny"`.
  - `parse: block comment groups`: `"# T\n\n<!-- block -->\nA.\n\nB.\n<!-- /block -->\n\nC."` → keys `["body","body"]`, and the first text is `"A.\n\nB."`.
  - `parse: links and sources are one block each`: two `- [link:t][Go]` items plus `[S1](https://a) · [S2](https://b)` → one `links` block and one `sources` block. `sources.length === 2`.
  - `parse: image block`: `![Cat](img/cat.png)` → `{ key: "image", url: "img/cat.png", alt: "Cat" }`. It is not a source.
  - `parse: children comment`: `"## A\nslug: a\n<!--\nchildren:\n  https://x/y.md\n  ./z.md\n-->\n\nBody."` → `childSrc` equals `["https://x/y.md","./z.md"]`, and `blocks` has one body `"Body."`.
  - `parse: other comments are dropped`: `<!-- note -->` mid-body produces no block and no text.
  - `parse: raw html is literal`: `<b>hi</b>` → body text `"<b>hi</b>"`.
  - `parse: unresolved link is not an error`: `[link:team-a.costs][X]` with no such slug → `errors` is `[]` and `links[0].target` is `undefined`.
  - `parse: duplicate slugs`: two `slug: a` → the second is `a-2`, and `warnings` contains `duplicate slug "a"; using "a-2"`.

- [ ] **Step 2: Run** `bun test markdown.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - Before the existing body logic, strip HTML comments while scanning, with these exceptions:
    - The first comment directly after a heading/slug line that contains `children:` → `childSrc`, one URL per non-empty line after `children:`.
    - `<!-- block -->` and `<!-- /block -->` → group markers.
  - Split blocks on blank lines, outside groups. A block whose lines are all list items → `list`.
  - Chip-only and source-only entries are collected into the single `links` and `sources` blocks, positioned at their first occurrence.
  - `![alt](url)` alone on a line → `image`. Match it before `EXT`.

- [ ] **Step 4: Run** `bun test markdown.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Parser: blocks, children comments, block groups, images"`

---

### Task 2: Ship the parser to the browser

**Files:**
- Modify: `server.ts` (route `GET /design/md.js`)
- Modify: `build.ts` (write `dist/design/md.js`)
- Modify: `design/strata.dc.html:6` (add `<script src="./md.js"></script>` before `support.js`)
- Modify: `app.test.ts` `mount()` (pass `window.StrataMd`)
- Test: `server.test.ts`, `build.test.ts`

**Interfaces:**
- Produces:
  - `export async function mdBundle(root: string): Promise<string>` in `server.ts`. It returns JS from `Bun.build({ entrypoints: [join(root, "markdown.ts")], format: "iife", ... })`, wrapped so that it sets `window.StrataMd = { parseMarkdown, plainText }`.
  - In the app: `const MD = window.StrataMd;`

- [ ] **Step 1: Write the failing tests.**
  - `server.test.ts` `md.js is served and defines StrataMd`: `GET /design/md.js` → 200, `content-type` contains `javascript`. Evaluate the body with `new Function("window", body)(w)`, then check `typeof w.StrataMd.parseMarkdown === "function"`.
  - `build.test.ts`: `dist/design/md.js` exists after `build()`.

- [ ] **Step 2: Run** `bun test server.test.ts build.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `mdBundle`**, the route, the build write, and the `<script>` tag. In `app.test.ts`, set `window: { StrataMd: await import("./markdown"), ... }`.

- [ ] **Step 4: Run** `bun test`. Expected: the new tests PASS. Other failures come from later tasks' removals and are allowed only in `app.test.ts`. Note them.

- [ ] **Step 5: Commit** `git commit -am "Serve and build the parser as design/md.js"`

---

### Task 3: Shapes and layouts by block key

**Files:**
- Modify: `design/strata.dc.html:1011-1037` (`BUILTIN_LAYOUTS`, `counted`, `keyOf`, `sigOf`, `groupsOf`, `fillSlots`, `slotsOf`)
- Test: `layers.test.ts` (uses `Component.lay`)

**Interfaces:**
- Produces:
  - A markdown layer carries `block: 'title'|'body'|'list'|'links'|'sources'|'image'`.
  - `counted = l => !l.hidden && !!l.block && l.block !== 'sources'`.
  - `keyOf = l => l.block`. `sigOf`, `groupsOf` and `fillSlots` keep their signatures, with the styles argument now ignored.
  - `SOURCES_BOX = B(6, 89, 88, 5)`: `fillSlots` places `sources` there unless the layout has a `sources` region.
  - `BUILTIN_LAYOUTS` are re-keyed (`h1`→`title`, `bullets`→`links`). New: `stacked-1`…`stacked-4`, named `Stacked`, `Stacked 2`…, with match `{ title: 1, body: n }` and bodies stacked in `y 24–90` with 2-unit gaps. They are declared **first**, so `body:2` defaults to `stacked-2`. Add `list` variants: `list` = `{ title: 1, list: 1 }` with list at `B(6, 24, 88, 66)`, and `text-list` = `{ title: 1, body: 1, list: 1 }` with body `B(6,24,42,66)` and list `B(52,24,42,66)`.
  - Slots are renamed **regions**. The stored shape is unchanged, `slots: { [key]: Box[] }`, plus an optional `names: { [key]: string[] }`. The layout panel shows `names[key][i] || key + '-' + (i+1)`, and the names are editable.

- [ ] **Step 1: Write the failing tests** in `layers.test.ts`:
  - `shape: sources don't count`: layers `[title, body, sources]` → `sigKey(sigOf(...)) === "body:1,title:1"`.
  - `shape: extras don't count`: a text layer without `block` is not counted.
  - `layouts: stacked-2 is first match for body:2`: `Object.values(BUILTIN_LAYOUTS).find(L => sigKey(L.match) === "body:2,title:1").name === "Stacked 2"`.
  - `fillSlots: sources default box`: a sources layer gets `{ x: 6, y: 89, w: 88, h: 5 }`.

- [ ] **Step 2: Run** `bun test layers.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** as in Interfaces. Add region renaming to the layout panel (`renameRegion(lid, key, i, name)`).

- [ ] **Step 4: Run** `bun test layers.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Layouts: shape by markdown block; stacked and list built-ins; named regions"`

---

### Task 4: Enrichment and its inverse

**Files:**
- Modify: `design/strata.dc.html` (new top-level pure functions next to the layout helpers; add `static md = { enrich, layoutOf, blockLayers }` to `Component`)
- Create: `enrich.test.ts` (loads the component the same way `app.test.ts` does, using only the statics)

**Interfaces:**
- Consumes:
  - Task 1's `Section`.
  - Task 3's helpers: `BUILTIN_LAYOUTS`, `sigOf`, `sigKey`, `fillSlots`.
- Produces:
  ```js
  // LayoutFile: { version: 1, deck: { ...DECK_FIELDS except 'nodes','title','source' }, slides: { [fullId]: SlideOverride } }
  // SlideOverride = the node minus id/title/body/children/childSrc/_from/_warn, with each md layer's text/link/bullets/src removed.
  // ROOT is stored whole (the title page is not from markdown).
  function blockLayers(sec, depth, prefix)        // → layers: md-title (style 'h'+min(depth,3), block 'title'),
                                                  //   md-body-<n>, md-list-<n>, md-links, md-sources, md-image-<n>; default geometry from importer.ts layersFor
  function enrich(sections, layouts, opts)        // layouts: LayoutFile[] in resolution order (host first, then linked doc's);
                                                  // opts: { prefix = '', depth0 = 1, from = null, root = ROOT node or null, src = null }
                                                  // → { nodes, images, warnings: [{ id, block }] }
  function layoutOf(nodes, deckFields)            // → LayoutFile: overrides for nodes with custom === true, never for _from nodes
  ```
  - For each section, the node is `{ id: prefix+slug, title: plainText(title), body, children, childSrc, frames, layout?, custom?, _from? }`.
  - **Override found** (first `layouts[i].slides[localOrFullId]`): merge content into its frames with importer's `mergeLayers` rule (content fields from generated layers; the stored layer keeps geometry and style). Generated layers missing from the stored frames are added with `_warn: true`. Stored `md-*` layers with no generated counterpart stay in the stored data, but are left out of the frames. `custom: true`.
  - **Otherwise** the first layout across `layouts` matching the shape is used: `deck.layoutDefaults[shape]`, then any layout with that match, then `BUILTIN_LAYOUTS` in declaration order. That gives one frame laid out by `fillSlots`, with `layout: id`.
  - **No match:** title at `HEAD[0]`, other blocks stacked full-width in `y 24–88`, each with `_warn: true`.
  - Slide links: `target ? prefix+target : ref`.
  - Layers of type `component` are dropped from any `layouts[i]` with `i > 0`.
  - Markdown image blocks become `type: 'image'` layers with `imgKey: 'md:' + resolved`, where `resolved = new URL(url, opts.src || location.href).href`, and `images['md:' + resolved] = resolved`. `layoutOf` never stores `md:` image keys.

- [ ] **Step 1: Write the failing tests** in `enrich.test.ts`:
  - `enrich: stacked by default`: `# T\n\nA.\n\nB.` → the node's frame has `md-body-1` and `md-body-2` at the `stacked-2` boxes. `layout === "stacked-2"`. No `_warn`.
  - `enrich: heading styles by depth`: `#`/`##`/`###`/`####` → `md-title.style` is `h1`, `h2`, `h3`, `h3`.
  - `enrich: override wins and new block warns`: an override with `md-body-1` at `x: 50`, plus markdown that now has two bodies → `md-body-1.x === 50`, and `md-body-2._warn === true`.
  - `enrich: removed block kept in override, absent from frames`: `layoutOf` after re-enriching still lists `md-body-2` in `slides[id].frames[0].layers`.
  - `enrich: no layout match warns`: a shape `{ title:1, image:2, list:2 }` → every non-title block has `_warn`.
  - `enrich: prefix and fallback chain`: `prefix: "a."`, layouts `[host, linked]`, where `linked.slides.x` overrides → node `a.x` uses the linked override. If `host.slides["a.x"]` exists, the host wins.
  - `enrich: linked component layers dropped`: a linked override containing `{ type: "component" }` → not in frames.
  - `layoutOf: strips content`: no `text`/`link`/`src` on `md-*` layers. Extras keep their `text`.
  - `enrich: markdown image resolves against src`: `![c](img/c.png)` with `src: "https://h/d/a.md"` → `images["md:https://h/d/img/c.png"]` is set.
  - `enrich: empty markdown`: `""` → `nodes.ROOT.children` is `[]`.

- [ ] **Step 2: Run** `bun test enrich.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the three functions. Move `mergeLayers`' rule from `importer.ts` into the HTML as `mergeContent(stored, gen)`.

- [ ] **Step 4: Run** `bun test enrich.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Enrichment: markdown + layout file -> nodes, and back"`

---

### Task 5: Server storage as `.md` + `-layout.json`

**Files:**
- Modify: `server.ts`
- Delete: `importer.ts`, `importer.test.ts`
- Modify: `Makefile` (remove `import`)
- Test: `server.test.ts` (rewrite deck save/list tests; delete import/export tests)

**Interfaces:**
- Produces:
  - `saveDeck(root, slug, { md: string, layout: LayoutFile })` writes `decks/<slug>/<slug>.md` and `decks/<slug>/<slug>-layout.json`. Data URLs in `layout.deck.images` and `layout.deck.customBg` are extracted to `img/` as today. It returns `{ layout }` with the rewritten paths.
  - `PUT /api/decks/<slug>` body `{ md, layout }`. 400 unless `typeof md === "string"`.
  - `deckList` reads `<slug>.md`. Title = the first heading's plain text, or the slug.
  - `/api/import` and `/api/export` are removed.

- [ ] **Step 1: Write the failing tests:**
  - `PUT writes md and layout`: both files exist, and the md content round-trips byte-for-byte.
  - `images extracted from layout`: a data URL becomes `img/<hash>.png`.
  - `deckList titles from markdown`.
  - `PUT rejects missing md` (400).

- [ ] **Step 2: Run** `bun test server.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Delete the importer files and the `import` target. In `indexHtml`, drop the import form. "New deck" stays.

- [ ] **Step 4: Run** `bun test server.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Server: decks are <slug>.md + <slug>-layout.json"`

---

### Task 6: App loads, edits and saves markdown

**Files:**
- Modify: `design/strata.dc.html`:
  - `componentDidMount`, `loadDeck`, `save`, `seed`, `DECK_FIELDS` use, `undo`/`redo`/`restore`, `markCustom`
  - Remove `graft`, `fetchDeck`, `createLink`, `copyDeck`, `copyDeckHere`, `guardGrafts`, `allowGraft`, `graftMsg` and their UI
- Test: `app.test.ts` (delete tests for removed features; add the tests below)

**Interfaces:**
- Consumes: `MD.parseMarkdown` (Task 2), `enrich`/`layoutOf` (Task 4), `PUT /api/decks` (Task 5).
- Produces:
  - **State:** `md: string` (the host markdown), `mdIssues: Issue[]`.
  - **`SRC`** (const): `?src=` if `https:` or same-origin, else `null`. With `DECK`, `SRC = '../decks/'+DECK+'/'+DECK+'.md'`.
  - **`layoutUrl(src) = src.replace(/\.md(\?.*)?$/i, '-layout.json$1')`**.
  - **`setMd(md)`**: sets `md` and schedules `reenrich()` after 200 ms.
  - **`reenrich(baseNodes = this.state.nodes)`**: parses `md`, then runs `enrich(sections, [layoutOf(baseNodes, deck fields)], { root: baseNodes.ROOT, src: SRC })` and merges the returned `images`. It commits with `this._lastNodes = nodes; this.allowLayout(nodes)`, so the commit is neither an undo step nor a hand edit. If `cur` is gone, it moves to the nearest existing ancestor id (by trimming dot/heading path), then `ROOT.children[0]`.
  - **`restore(nodes)`** (undo/redo) ends with `reenrich(nodes)`.
  - **`save()`** PUTs `{ md, layout: layoutOf(...) }`.
  - **Scratch** (no `DECK`/`SRC`): `localStorage[KEY] = JSON.stringify({ md, layout })`.
  - **`seed()`** returns a short markdown string: three headings, one with a `##` child.
  - **Present mode on static/`SRC`** always fetches remote.

- [ ] **Step 1: Write the failing tests** (`mount()` with `fetch` serving fixture files from the temp root):
  - `app: loads deck markdown and layout`.
  - `app: typing markdown updates slides after 200ms and is not an undo step`: `setMd`, wait 250 ms → the new heading's node exists, and `_past.length` is unchanged.
  - `app: layout edit then undo keeps current markdown`: move `md-body-1`, edit md text, undo → the box is back, and the text is the new text.
  - `app: save writes md and layout`.
  - `app: src loads https url` (stub `fetch` for `https://x/a.md` and `https://x/a-layout.json`).
  - `app: src returns html` → `saveMsg` is `Can't load https://x/a.md: not a markdown file`. Detect it by the response `content-type` including `text/html`, or the body starting with `<!doctype`/`<html` (case-insensitive).
  - `app: empty markdown` → the stage message `Add a # heading to make a slide`.
  - `app: current slide removed by edit`.
  - `app: bad layout file` → `note` is `Layout file ignored: <JSON error message>`. A 404 shows nothing.

- [ ] **Step 2: Run** `bun test app.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** In `markCustom`, every frames change to a non-`_from` slide that isn't a layout/enrich commit marks it `custom`, not just counted-box geometry. Adding or removing extras makes an override.

- [ ] **Step 4: Run** `bun test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "App: markdown + layout file are the deck"`

---

### Task 7: Markdown pane, read-only tree, copy and download

**Files:**
- Modify: `design/strata.dc.html` (template: pane between tree and stage; header buttons; remove tree controls; render values)
- Test: `app.test.ts`, `editor.test.ts` (drop on-slide text editing tests for md layers)

**Interfaces:**
- Produces:
  - **State:** `mdOpen` (default `true` in build mode), `mdW` (default 380, min 240, persisted in UI prefs like `navW`).
  - **Render values:**
    - `mdText`, `onMdInput` (→ `setMd`), `mdRef`.
    - `onMdResize`.
    - `onCopyMd` (`navigator.clipboard.writeText(md)`, then flash `Markdown copied`).
    - `onDownload`: two downloads, `<name>.md` and `<name>-layout.json`. `name` = `DECK` or the `SRC` basename or `deck`.
    - `mdIssuesText`: one line per issue, `line N: msg`.
  - **Changing slide** scrolls the textarea so the slide's heading line is at the top: `scrollTop = line × lineHeight`, using `node.line` kept from enrichment as `_line`.
  - **Removed:** tree `onBefore`/`onPeer`/`onChild`/`onDelete`/`onDragStart`/`onRename`, plus keys Enter/⇧Enter/Tab/⌫ in build mode. Double-click on an `md-*` layer selects it but doesn't open the text editor. Extras still edit.

- [ ] **Step 1: Write the failing tests:**
  - `pane: input updates md and re-enriches`.
  - `pane: copy` (stub `navigator.clipboard`).
  - `pane: download names`: capture created anchors' `download` attribute → `["talk.md","talk-layout.json"]` for `?deck=talk`.
  - `tree: no add/delete controls`: `treeNodes[0]` has no `onBefore`. Enter in build mode doesn't change `nodes`.
  - `md layer not editable on slide`: `startEdit` on `md-body-1` leaves `editing` null. An extra text layer still opens.

- [ ] **Step 2: Run** `bun test app.test.ts editor.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the template and logic. The textarea is plain, monospace, `spellcheck="false"`.

- [ ] **Step 4: Run** `bun test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Build mode: markdown pane, read-only tree, copy and download"`

---

### Task 8: Apply choice and ⚠️ badges

**Files:**
- Modify: `design/strata.dc.html` (layout section of the Slide tab; stage overlay; `markCustom`)
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `updateLayoutFrom`, `saveAsLayout`, `effectiveLayout` (existing). `_warn` from Task 4.
- Produces:
  - **State:** `applyTo: 'slide'|'layout'` (default `'slide'`, persisted in UI prefs).
  - **Render values:** `applyItems` (two segmented buttons, labels `This slide` / `Layout`) and `warnBadges: [{ x, y, onClick, title }]` for the current slide's `_warn` layers, in build mode only.
  - **`markCustom`**, when `applyTo === 'layout'` and the hit slide is single-frame with no extras: calls `updateLayoutFrom(id)` instead of setting `custom`.
  - **⚠️ click → `claimBlock(id, layerId)`:**
    - If the slide is `custom`: clear that layer's `_warn` by committing the node unchanged except `_warn` removed (the override now records it).
    - Else (no layout matched): `saveAsLayout(id)`, then re-enrich.
  - **Badge title:** `Not placed by this slide's layout — click to add a region for it`.

- [ ] **Step 1: Write the failing tests:**
  - `apply: layout mode updates shared layout`: two `body:2` slides; move a box on one with `applyTo: 'layout'` → the other follows. Neither is `custom`.
  - `apply: slide mode makes an override`.
  - `warn: badge shown and claim on custom slide clears it`.
  - `warn: claim on unmatched shape saves a layout and clears all same-shape warnings`.

- [ ] **Step 2: Run** `bun test app.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `Reset to default` only if it can't apply. Keep it: it clears the override.

- [ ] **Step 4: Run** `bun test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Layouts: This slide / Layout apply choice; warning badges for unplaced content"`

---

### Task 9: Lazy linked children

**Files:**
- Modify: `design/strata.dc.html` (`nav`, link following, tree/breadcrumb render values, Slide tab)
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `enrich` with `prefix`/`depth0`/`from` (Task 4), `layoutUrl` (Task 6).
- Produces:
  - **`this._linked: { [nodeId]: { status: 'loading'|'ok'|'error', md, layout, src } }`**: an in-memory cache keyed by the linking node's full id.
  - **`loadChildren(id): Promise<void>`:**
    - For each `childSrc` URL, resolved with `new URL(u, sourceOfNode(id))`: fetch the `.md` (plus `-layout.json`, where a 404 is fine).
    - Run `enrich(sections, [hostLayout, thatLayout], { prefix: id + '.', depth0: depth(id) + 1, from: url, src: url })`.
    - Append the tops to `id`'s children after its heading children, in list order.
    - Commits like `reenrich`.
    - **Loop:** the URL is already on the chain of `from` URLs above `id`. **Fetch error, non-markdown, loop:** one node `id + '.!error'`, titled `Can't link <url>`, body = reason, `_from: url`.
  - **`reenrich`** re-applies loaded linked results, so they survive markdown edits of the host.
  - **Navigation:**
    - `nav(child, 'down')` from a node with unloaded `childSrc`: set `loading: id`, `await loadChildren(id)`, then navigate.
    - Following a slide link to a missing id: find the longest existing prefix with unloaded `childSrc`, load it, retry once. If still missing, show today's missing-link behaviour.
  - **Render:**
    - Tree and breadcrumb nodes with unloaded `childSrc` show `▸ more`.
    - The stage shows `Loading…` while `loading === cur`'s parent.
    - Slide tab for `_from` nodes: `fromHref: '?src=' + encodeURIComponent(n._from)`, label `Open`.
  - **Read-only:** a `_from` node's frames can't be changed. Revert in `markCustom` with the flash `This slide comes from <url>: open it to edit`.

- [ ] **Step 1: Write the failing tests** (a stub `fetch` serving `https://h/host.md` with `<!-- children: ./team.md -->` under `## A`, and `https://h/team.md`):
  - `linked: not loaded until navigating down`: before, the fetch count for `team.md` is 0 and `a.<slug>` is absent. After `go('down')` from `a`, the nodes exist and `cur` is the first linked slide.
  - `linked: ids namespaced and _from set`.
  - `linked: host override beats linked layout file`.
  - `linked: loop shows error slide` (`team.md` links back to `host.md`).
  - `linked: 404 shows error slide titled "Can't link https://h/missing.md"`.
  - `linked: link into unloaded file loads it`.
  - `linked: survives host markdown edit`.
  - `linked: read-only`.

- [ ] **Step 2: Run** `bun test app.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `bun test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Linked children: lazy-load markdown URLs under a slide"`

---

### Task 10: Remote drafts, link safety, publishing, docs

**Files:**
- Modify: `design/strata.dc.html` (draft prompt; `href` safety)
- Modify: `build.ts` (copy all `decks/`; with a deck arg, `index.html` redirects to `design/strata.dc.html?deck=<slug>`; drop the transitive `include` visit; write `md.js`, done in Task 2)
- Modify: `README.md` (markdown format, `children:`, `?src=`, layout file, editing; remove import/include/copy sections)
- Replace: `decks/*` (delete existing; add `decks/current-situation/current-situation.md` from `examples/current-situation.md`, without `slug:` changes)
- Test: `app.test.ts`, `build.test.ts`

**Interfaces:**
- **`DRAFT_KEY(src) = 'strata-draft:' + src`.** On static/`SRC` (not `DECK`), edits in build mode autosave `{ md, layout }` there.
- **On load:**
  - In present mode, the remote file is always used.
  - In build mode with a draft that differs from remote, `draftPrompt: true` renders the bar `You have local changes to this deck` with buttons **Use my draft** / **Discard** (Discard removes the key).
- **Link safety:** an inline `href` or `link.type === 'url'` is opened only when `/^https?:/i` matches. Otherwise it renders as plain text.

- [ ] **Step 1: Write the failing tests:**
  - `draft: present ignores draft`.
  - `draft: build asks; use draft loads it; discard removes it`.
  - `links: javascript: href not clickable`.
  - `build: copies all decks and md.js; deck arg redirects`.

- [ ] **Step 2: Run** `bun test`. Expected: FAIL.

- [ ] **Step 3: Implement**, update the README and replace `decks/`.

- [ ] **Step 4: Run** `bun test`. Expected: all PASS. Run `make build` and confirm `dist/design/md.js` and `dist/decks/current-situation/current-situation.md` exist.

- [ ] **Step 5: Commit** `git commit -am "Remote drafts, safe links, publishing and docs for markdown decks"`
