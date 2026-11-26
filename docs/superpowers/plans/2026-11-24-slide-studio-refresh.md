# Slide Studio Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Strata's frames/tween editor with the prototype's Theme / Slides / Builds model (step-numbered reveals, template layouts, token-based deck theme), re-skinned dark, keeping the markdown, tree, parallax and present core.

**Architecture:** New pure logic goes in two TypeScript modules: `theme.ts` (theme data and token resolution) and `builds.ts` (step visibility and transition styles). They're bundled into the browser beside `markdown.ts` as `window.StrataTheme` / `window.StrataBuilds` and unit-tested with bun. `design/strata.dc.html` loses frames, `ftrans`, `tdef`, bezier paths and sequences: a slide becomes `layers + steps + trans + build`. Its right panel becomes Content / Theme / Slides / Builds, ported from the prototypes. `design/Layers.dc.html` renders per-layer build styles and theme tokens.

**Tech Stack:** Design Component HTML (template + `class Component`), bun test + happy-dom, Bun.build iife bundle.

**Spec:** `docs/superpowers/specs/2026-11-24-slide-studio-refresh-design.md`. Prototypes (visual + behaviour spec): `design/slides/theme/Main.dc.html`, `design/slides/slides/Templates.dc.html`, `design/slides/build/Builds.dc.html`.

## Global Constraints
- No backwards compatibility: the layout file is `version: 2`. A v1 file (or any other version) is ignored and the deck uses defaults, with a note "Old layout file ignored". Old saved UI keys (`stab`, `transSel`, …) are dropped.
- Markdown stays the only place text is edited. md-* layers are never text-editable on the stage.
- Elements only appear. Nothing moves or morphs between steps.
- Theme colours reach slides as tokens: `primary`, `secondary`, `tertiary`, `impact`, `text`, `muted`, `onPrimary`; fonts as `head` / `body` / `mono`. Changing the theme restyles every slide.
- Transitions, exactly as in Builds.dc.html: `fade`, `rise` (`translateY(3cqw)`), `slide` (`translateX(-5cqw)`), `scale` (`scale(0.6)`), `wipe` (clip `inset(0 100% 0 0)`), `wave` (rise + 120 ms stagger), `pop` (`scale(0.3)`), `none` (Cut).
- Durations: Quick 250 / Normal 500 / Slow 900 ms. Easings: Ease out `cubic-bezier(0.2, 0.7, 0.2, 1)`, Springy `cubic-bezier(0.34, 1.56, 0.64, 1)`, Linear `linear`. Defaults: 500, Ease out, earlier `dim` (opacity 0.45), replace `true`. The default transition for a new step is `fade`.
- Editor chrome palette: page `#16181D`, panel `#1B1E24`, control `#23262E`, line `#2C3039`, active `#343944`, text `#E8EAEE`, secondary text `#C3C8D2`, muted `#9AA1AD`, accent `#7AA2FF`, accent text on accent `#0B1020`, selected-card bg `#2A3A5C`, current-step amber `#FBBF24`.
- Components: the `frame` message becomes `step` `{ n, steps, duration }` and `enter` carries `step`/`steps`. There is no `frame` alias. "Copy AI guide" text is updated to match.
- Linked child decks render with the root deck's theme.
- `make test` stays green after every task.

## Review Focus
1. **Gaps in step numbers** (steps 1, 3, 7 with nothing at 2): → walks only the steps in use (1 → 3 → 7), and the frame strip shows three frames. Test in Task 2 (`stepList`) and Task 4 (present navigation).
2. **A markdown edit removes a layer that had a step, or a step's last member:** stale `steps` entries are dropped on enrich, the current step is clamped, and nothing throws. Test in Task 4.
3. **List + detail with mismatched counts** (3 bullets, 4 paragraphs): the template doesn't fit, auto-pick falls through, and the blocks show ⚠️. No crash. Test in Task 3.
4. **← into the previous slide shows all its steps. Search, breadcrumbs, ↑/↓ and links land on step 0.** Test in Task 4.
5. **Linked (read-only) slides in Builds:** ordering mode and transition picks are refused with the existing read-only note, while playback still works. Test in Task 8.

---

### Task 1: `theme.ts` — theme data and resolution

**Files:**
- Create: `theme.ts`, `theme.test.ts`
- Modify: `server.ts:50-58` (bundle entry also sets `window.StrataTheme` and `window.StrataBuilds`; Task 2 adds the module), `app.test.ts:27` (mount's `window` also gets `StrataTheme: await import("./theme")`, `StrataBuilds: await import("./builds")`)

**Interfaces:**
- Produces:
  - `type Theme = { background: string; scheme: string | { deep: string; mid: string; accent: string }; palette: string; fonts: string; surface: 'clear'|'frosted'|'card'; motion?: Record<string, number> }`
  - `DEFAULT_THEME: Theme` = `{ background: 'dusk', scheme: 'original', palette: 'midnight', fonts: 'technical', surface: 'clear' }`
  - `BACKGROUNDS`, `SCHEMES`, `PALETTES`, `FONTS`, `STYLES`, `MOTION`, `SPEEDS`, `KINDS`, `SURFACES`, copied verbatim from `design/slides/theme/Main.dc.html`. Add an `image` kind: `IMAGE_BACKGROUNDS = ['balloons','london','sea','space','forest','sky','ocean','custom']`, used as `background: 'image:<id>'`.
  - `resolveTheme(t: Partial<Theme>): { palette: Palette; fonts: FontSet; bg: { css: string; size: string; image?: string; motion?: string }; surface: string; tone: 'light'|'dark' }`. Missing or unknown ids fall back to `DEFAULT_THEME`'s and never throw (this is a trust boundary: layout files come from URLs).
  - `tokenColor(v: string | null | undefined, p: Palette): string | null`. A token name gives the palette hex. A `#hex` or any other CSS colour passes through. Null gives null.
  - `fontFor(role: 'head'|'body'|'mono', f: FontSet): string` (CSS family) and `fontsHref(f: FontSet): string` (a Google Fonts URL for that set).

- [ ] **Step 1: Write failing tests** in `theme.test.ts`:
  - `resolveTheme({})` → `palette.id === 'midnight'`, `fonts.id === 'technical'`, and `bg.css` contains `#1E1B4B` (Dusk original).
  - `resolveTheme({ background: 'dusk', scheme: 'plum' }).bg.css` contains `#1A0B2E`.
  - `resolveTheme({ background: 'nope', palette: 'nope' })` equals `resolveTheme({})`.
  - `resolveTheme({ background: 'image:london' }).bg.image === 'london'`.
  - `tokenColor('impact', PALETTES[0]) === '#FBBF24'`, `tokenColor('#123456', …) === '#123456'`, `tokenColor(null, …) === null`.
  - `fontFor('head', FONTS[0]) === "'Space Grotesk', sans-serif"`.
- [ ] **Step 2:** Run `bun test theme.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `theme.ts`. Wire the bundle in `server.ts`: `import * as StrataTheme from "./theme"; import * as StrataBuilds from "./builds"; window.StrataTheme = StrataTheme; window.StrataBuilds = StrataBuilds;`. Until Task 2 lands, create an empty `builds.ts` (`export {}`) so the bundle builds.
- [ ] **Step 4:** Run `bun test`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: theme module (backgrounds, schemes, palettes, fonts, tokens)`.

### Task 2: `builds.ts` — steps and transition styles

**Files:**
- Create/replace: `builds.ts`, `builds.test.ts`

**Interfaces:**
- Produces:
  - `TRANSITIONS` (the eight in Global Constraints: `{ id, label, hint, hidden, clip, stagger }`, as in Builds.dc.html), `DURATIONS`, `EASINGS`, `DEFAULT_BUILD = { dur: 500, ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)', earlier: 'dim', replace: true }`.
  - `type BuildLayer = { id: string; kind?: 'item'|'detail'|string }`
  - `stepList(steps: Record<string, number>, ids: string[]): number[]`: sorted distinct steps > 0, counting only ids still present.
  - `isVisible(l: BuildLayer, at: number, steps, layers: BuildLayer[], replace: boolean): boolean`. Step 0 or none is always visible. A layer is visible when its step ≤ at. A `detail` is hidden once a later detail with step ≤ at exists and `replace` is on.
  - `buildStyle(l, at, steps, layers, trans: Record<number,string>, b = DEFAULT_BUILD): { opacity: number; transform: string; clip: string; transition: string }`. Same maths as `elementView` in Builds.dc.html: earlier `item`s are dimmed to 0.45 when `b.earlier === 'dim'`. The transition string is `opacity, transform, clip-path` with `dur`, `ease` and stagger delay, or `'none'` for Cut.
  - `pruneSteps(steps, ids: string[]): Record<string, number>`: drops ids no longer present.
- [ ] **Step 1: Write failing tests:**
  - `stepList({a:1,b:3,c:7,d:0}, ['a','b','c','d'])` → `[1,3,7]`, and with `'c'` missing → `[1,3]`.
  - `isVisible({id:'b'}, 2, {b:3}, …)` → false. With `at` 3 → true.
  - The replace case: d1@1, d2@2 at 2 → d1 hidden; with `replace=false` → visible.
  - The dim case: item@1 at 2 → opacity 0.45; with `earlier: 'keep'` → 1.
  - Hidden with `rise` → transform `translateY(3cqw)`. Hidden with `wipe` → clip `inset(0 100% 0 0)`. `none` → transition `'none'`.
  - `wave`: the second member of a step has delay `120ms` in its transition.
  - `pruneSteps({a:1,x:2}, ['a'])` → `{a:1}`.
- [ ] **Step 2:** `bun test builds.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun test` → PASS.
- [ ] **Step 5:** Commit: `feat: builds module (step visibility and transition styles)`.

### Task 3: Markdown → layers: one layer per bullet, detail pairing, templates

**Files:**
- Modify: `design/strata.dc.html` (`BUILTIN_LAYOUTS` ~1043, `sigOf`/`groupsOf`/`fillSlots` ~1063-1070, `blockLayers` ~1107, `enrich` ~1130)
- Test: `app.test.ts` (rewrite the "shapes count blocks…", "layouts: stacked-2…" and "fillSlots…" tests)

**Interfaces:**
- Produces:
  - A list block becomes layers `md-list-<n>-<i>` with `block: 'list'`, `list: n`, `item: i`, `kind: 'item'`, one bullet's text each, and bullets on.
  - `sigOf` counts each list once (by `list`, not per item). `fillSlots` splits a list region evenly top-to-bottom among its items (2% gaps), so all 17 existing layouts still work.
  - `BUILTIN_LAYOUTS` (now "templates") gain the prototype's eight. Each has `name`, `match`, `slots`, an optional `icon` (thumbnail id: `title|bar|split|two|cards|section|statement|venn`) and optional `opts: ['bar'] | ['bar','side']`. Ids: `t-title`, `t-bar`, `t-split`, `t-two`, `t-cards`, `t-section`, `t-statement`, `t-shapes`. Convert the slide markup positions in Templates.dc.html into % boxes.
    - `match` may use `body: 'items'`, meaning "body count equals the list's item count". `t-split` = `{ title: 1, list: 1, body: 'items' }`. With it, body *k* gets `kind: 'detail'` and is placed in the single detail region (all details share one box).
    - `t-title` = `{ title: 1 }` or `{ title: 1, body: 1 }` (subtitle). Use two template ids if the matcher needs exact counts: `t-title` and `t-title-sub`.
    - `t-section` = `{ title: 1 }` and draws a big number: the slide's 1-based index among its siblings, zero-padded to two digits, coloured `impact`, as a generated non-md layer `gen-number`. It's not saved and doesn't count toward the shape.
    - `t-statement` = `{ body: 2 }`, with the second body's colour set to the `impact` token.
    - `t-cards` = `{ title: 1, body: 3 }`, `t-two` = `{ title: 1, body: 2 }`.
    - `t-shapes` = `{ title: 1 }`, title only (shapes are user extras).
  - `fitsTemplate(layers, tpl): boolean`, exported on `Component.lay` beside `sigOf` and `sigKey`.
  - Auto-pick order: the slide's own template if it still fits, then the deck default for the shape, then the first fitting built-in in the order of `BUILTIN_LAYOUTS`. Keep the current first-match winners: stacked-2 for `body:2`, and so on. The prototype templates go *after* the existing entries, except `t-split`, which is the only match for its shape.
- [ ] **Step 1: Write failing tests:**
  - `"# T\n- a\n- b\n- c\n"` gives layers `md-list-1-1..3` with texts `a`, `b`, `c`, the shape `list:1,title:1`, and layout `list`. The three items' boxes stack inside `B(6,24,88,66)`, don't overlap, and fill it with 2% gaps.
  - `"# T\n- a\n- b\nA.\n\nB.\n"` auto-picks `t-split`. `md-body-1` and `md-body-2` have `kind: 'detail'` and the same box.
  - The same with three bullets and two paragraphs: no template fits, and the non-title blocks are `_warn`.
  - A section slide that is the second of its siblings has a `gen-number` layer with text `02`.
- [ ] **Step 2:** `bun test app.test.ts -t "templates|shapes|fillSlots"` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun test` → PASS. Update the other existing tests that assumed one list layer. `md-list-1` becomes `md-list-1-1…`.
- [ ] **Step 5:** Commit: `feat: per-bullet layers, list+detail pairing, prototype templates`.

### Task 4: Gut frames — the one-layer-set data model and step navigation

**Files:**
- Modify: `design/strata.dc.html`: delete `dupFrame`, `addSequence`, `delFrame`, `transFor`, `setTrans`, `actT`, `resetTransKey`, `resetAllTrans`, `setTransAct`, `setPath`, `startPathDrag`, `goFrame`, `compFrames`, `updLayerAllFrames`, the `tween`/`praf`/`ptick`/`transSel`/`confirmDup`/`tdef` state and their template blocks (Frames section, transition view, transition defaults, Add as sequence). Replace `framesOfNode`/`framesOf`/`fiFor`/`layersOf`/`setLayers`/`setFrames`/`stepFrame` and adapt `nav`/`go`/`step`/`enrich`/`layoutOf`, the component messaging (~1501-1530, 1760-1765) and history.
- Modify: `design/Layers.dc.html`: drop tween props; each item may carry `build: { opacity, transform, clip, transition }`, applied on the layer's outer div.
- Test: `app.test.ts`, `layers.test.ts` (delete every frame/tween/sequence/transition-defaults test: "Slide tab: Layout / Frames / Layers…", "add as sequence…", "a size change … tweened", "toggling the title page mid frame-tween…", "Apply and Name write to every frame…"; adapt the component tests to `step`)

**Interfaces:**
- Consumes: `StrataBuilds.stepList`, `isVisible`, `buildStyle`, `pruneSteps`, `DEFAULT_BUILD` (Task 2).
- Produces:
  - Node: `{ layers: Layer[]; steps?: Record<string, number>; trans?: Record<number, string>; build?: Build; template?: string; barStyle?: 'band'|'rule'|'none'; side?: 'left'|'right'; custom?: true }`.
  - Layout file: `{ version: 2, deck: {…kept deck fields, theme, layouts, layoutDefaults, styles}, slides: { [id]: { layers (md content stripped, as today), steps, trans, build, template, barStyle, side } } }`. A non-2 version is ignored (defaults plus the note).
  - State `at` (the current step on the current slide; replaces `fi`). Methods:
    - `layersOf(id): Layer[]` (no frame argument)
    - `setLayers(id, fn)`
    - `stepsOf(id): number[]` (= `stepList`)
    - `stepBuild(delta): boolean`: moves `at` to the next or previous entry of `stepsOf` (0 counts as the start). Returns false at the ends.
    - `goStep(n)`
    - `buildOf(id): Build` (node.build merged over `DEFAULT_BUILD`)
  - `go('right')` / `step(1)` call `stepBuild(1)` first. `nav(id,'left')` lands on the last step. Every other `nav` lands on 0.
  - Build mode shows all steps (`at` ignored) unless a preview is playing (Task 8). Present renders `buildStyle` per layer.
  - Component messages: `enter` → `{ step: at, steps: stepsOf(id).length, … }`. On a step change → `{ type: 'step', n, steps, duration: build.dur }`.
- [ ] **Step 1: Write failing tests:**
  - A v2 layout with `slides.intro = { layers: [...], steps: { 'md-body-1': 1, x1: 3 }, trans: { 1: 'rise', 3: 'pop' } }` loads. In present mode, `→` sets `at` to 1, then to 3, then navigates to the next slide.
  - `←` from the next slide returns with `at === 3`. ↓/↑ and `nav(id,'jump')` land on `at === 0`.
  - A v1 layout file (with `frames`) is ignored: the layers are the defaults, and the note says "Old layout file ignored".
  - After saving, the layout file has `version: 2` and no `frames`, `ftrans` or `tdef` keys.
  - Removing a bullet from the markdown drops its `steps` entry. If the current step disappears, `at` clamps to the highest remaining step ≤ `at`.
  - Steps with a gap (1, 3, 7) walk 1 → 3 → 7.
  - A component gets `{type:'step', n:1, steps:2, duration:500}` on the first →.
  - Undo restores `steps` and `trans` edits.
  - `layers.test.ts`: an item with `build: {opacity:0, transform:'scale(0.6)', clip:'inset(0 0 0 0)', transition:'none'}` renders those values on the layer div.
- [ ] **Step 2:** `bun test` → the new tests FAIL.
- [ ] **Step 3:** Implement. Delete first, then rebuild. `grep -n "frames\|ftrans\|tween\|tdef\|fi\b"` on `strata.dc.html` must find nothing relevant afterwards.
- [ ] **Step 4:** `bun test` → PASS, including "every {{ name }} the app template uses is provided by renderVals".
- [ ] **Step 5:** Commit: `refactor!: replace frames and tweens with step-numbered builds`.

### Task 5: Panel shell, Content tab and dark re-skin

**Files:**
- Modify: `design/strata.dc.html` (header, left tree, right panel tabs `rTabs` ~2859, all chrome colours; `design/Layers.dc.html` component placeholder colours)
- Test: `app.test.ts` (rewrite "right panel: Content, Slide and Canvas tabs…")

**Interfaces:**
- Produces: `rtab ∈ 'content'|'theme'|'slides'|'builds'`, defaulting to `'content'`. Any other saved value opens `'content'`. Template flags are `tabContent`, `tabTheme`, `tabSlides`, `tabBuilds`. The tab bar uses the prototypes' segmented style (`#23262E` track, `#343944` active). Build/Present mode switching and the header keep their behaviour. The chrome uses the Global Constraints palette and the fonts Inter (UI), Space Grotesk (headings) and JetBrains Mono (labels).
- [ ] **Step 1: Write failing test:** `rTabs` labels are `['Content','Theme','Slides','Builds']`. Clicking each sets `rtab`. A saved `rtab: 'canvas'` opens Content.
- [ ] **Step 2:** `bun test -t "right panel"` → FAIL.
- [ ] **Step 3:** Implement. Theme/Slides/Builds start as empty sections, filled by Tasks 6–8. Swap the paper palette (`#f2eee5`, `#fbf9f4`, `#fff`, `#e0d9cb`, `#1d1b17`, `#6b6458`, `#1f6fb8`…) for the dark palette throughout. The Content textarea and issues are unchanged apart from colour.
- [ ] **Step 4:** `bun test` → PASS. Run `make dev`, open http://127.0.0.1:3067/, and check by eye that no paper-coloured panel is left.
- [ ] **Step 5:** Commit: `feat: Content/Theme/Slides/Builds panel and dark editor chrome`.

### Task 6: Theme tab and theme rendering

**Files:**
- Modify: `design/strata.dc.html` (deck state: replace `bg`/`base`/`tone`/`card`/Fun-Basic with `theme`; `bgInfo` ~1820; Canvas section; `resolveLayer` ~1839; `BUILTIN_STYLES` ~1030; `DECK_FIELDS`), `design/Layers.dc.html` (surface replaces card)
- Test: `app.test.ts` (delete the Readability, container and "Fun/Basic" tests; replace the backdrop tests)

**Interfaces:**
- Consumes: `StrataTheme.resolveTheme`, `tokenColor`, `fontFor`, `fontsHref`, `DEFAULT_THEME`, and the data lists (Task 1).
- Produces:
  - `state.theme: Theme`, saved in `deck.theme`. `setTheme(patch)` is not an undo step, like other canvas settings today.
  - The canvas background is `bg.css`/`bg.size`, drawn at canvas size behind the deck, so parallax and offset apply as today. `image:<id>` uses the existing backdrop path (`BGS`, custom upload, scale/repeat/position controls). Moving backgrounds animate `background-position` over `MOTION[id].base / SPEEDS[speed]` seconds, with the bubbles/gears/sunset overlays from Main.dc.html.
  - `BUILTIN_STYLES` keep only `size`, `weight`, `lh`, `ls`, `align`, `valign`, `bullets` and `gap`. Font is `head` for h1–h3 and `body` for body and bullets. Colour is `text` for headings and body, and `muted` for sources. Containers are removed.
  - `resolveLayer` resolves `font` and colour fields through `fontFor`/`tokenColor` with the root deck's theme. Linked slides use the root theme too.
  - Surface: `clear` adds nothing. `frosted` draws a whole-slide `rgba(…,0.35)` with blur 8px. `card` draws a solid card using palette tone: dark `#0F1220` at 0.85, light `#FFFFFF` at 0.9. These go through `Layers.dc.html`'s existing `slideCard` path.
  - The Theme tab template ports Main.dc.html's right panel: Background (kind filter All/Solid/Gradient/Moving/Pattern/Image, swatch grid), Colours (Original, schemes, Custom pickers for the background style's `slots`, and "Reset every background to its original colours"), Theme (palettes) and Typography (font sets), plus Surface. A collapsible **Canvas** section holds the existing Spacing controls, slide transition speed and the Title page toggle.
  - The `<head>` loads `fontsHref(currentFonts)`.
- [ ] **Step 1: Write failing tests:**
  - A new deck has `state.theme` equal to `DEFAULT_THEME`.
  - Picking palette `ember` changes a heading layer's resolved colour to `#FFF7ED`, with no layer edit.
  - `theme` round-trips through save and reload.
  - `background: 'image:london'` makes `bgInfo()` use the London backdrop.
  - A shape with `fill: 'impact'` resolves to the palette's impact colour.
  - A linked child's own `deck.theme` is ignored.
  - The Theme tab template contains the Canvas section with the spacing buttons.
- [ ] **Step 2:** `bun test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun test` → PASS. In `make dev`, switch between Dusk, Ink and Bubbles and check that the slides restyle.
- [ ] **Step 5:** Commit: `feat: Theme tab — backgrounds, colour schemes, palettes, fonts, surface`.

### Task 7: Slides tab — template grid, options and shape tool

**Files:**
- Modify: `design/strata.dc.html` (remove the old Layout section template and the Layers list section; add the Slides tab; the stage toolbar; `addLayer` ~2150; the draw-by-drag handler beside `startMarquee`), `design/Layers.dc.html` (shape `token`, `opacity`, `border`, `blend`, `kind: 'line'|'arrow'`)
- Test: `app.test.ts` (rewrite the "Layout panel…" and "layouts: multi-frame…" tests)

**Interfaces:**
- Consumes: the templates and `fitsTemplate` (Task 3), `tokenColor` (Task 1), `layersOf`/`setLayers` (Task 4).
- Produces:
  - The template grid lists fitting templates first ("Fits this slide"), then the rest. Thumbnails use the `icon` drawings from Templates.dc.html, and other templates draw from their slot boxes.
  - Clicking a template calls the existing `applyLayout(id, lid)`. Apply to all, Reset, Save as template, Update, rename and delete keep their behaviour and the This slide / Layout switch.
  - Template options are `barStyle` (Band / Underline / None) and `side` (List left / List right), stored on the node. A band draws as a generated `gen-bar` layer.
  - The placeholder list shows the template's regions. Clicking one (or a markdown-owned layer on the stage) sets `rtab: 'content'` and scrolls to the slide.
  - Stage toolbar: Select (V), Text (T), Rectangle (R), Rounded, Ellipse (O), Line (L), Arrow (A), with the prototype's hint text. Drawing tools draw by drag on the stage (Shift makes a circle or square) into a new extra layer, then switch back to Select. The keys apply only in build mode, outside text editing.
  - Shape properties: Shape (Ellipse / Rounded / Rectangle), Fill token (Primary, Secondary, Tertiary, Impact, Text, None), Fill opacity 0–100 step 5, Border width (None 0 / Thin 1 / Medium 2 / Thick 5, in tenths of cqw) and style (Solid / Dashed / Dotted), and "Where shapes overlap" (Stack = `normal`, Blend colours = `screen`). New shapes default to `{ kind: 'ellipse', token: 'primary', opacity: 35, border: { width: 2, style: 'solid' }, blend: 'screen' }`.
  - Other layer types keep a trimmed settings block: geometry, opacity, link, image fit/replace, icon, component editor, text style picker for extras, and colour as token or custom.
  - Layer order and visibility move to a compact list under the properties (z-order up/down, hide).
- [ ] **Step 1: Write failing tests:**
  - On a `title + list` slide, the first grid entries are templates that fit `{title:1,list:1}`.
  - Clicking `t-bar` sets `node.layout`. Setting `barStyle: 'none'` removes the `gen-bar` layer.
  - Drawing with Ellipse from (10,10) to (30,40) on the stage adds a shape layer with those % bounds and the default props, then the tool returns to `select`.
  - Choosing Fill `secondary` on it gives a resolved fill of the palette secondary plus alpha `59` (35%).
  - Clicking `md-title` on the stage opens `rtab: 'content'`.
  - Every template name used is provided by renderVals (the existing test).
- [ ] **Step 2:** `bun test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun test` → PASS. In `make dev`, rebuild the Venn from Templates.dc.html by hand.
- [ ] **Step 5:** Commit: `feat: Slides tab — templates, template options, shape tool`.

### Task 8: Builds tab — ordering, transitions, timing, preview

**Files:**
- Modify: `design/strata.dc.html` (Builds tab template and logic, the frame strip under the stage, the "Copy AI guide" text and the component helper's docs), `README.md` (replace the Frames, Transition and Add-as-sequence docs with Builds, and the Layout section with Templates; document the Theme tab and the step navigation keys)
- Test: `app.test.ts`

**Interfaces:**
- Consumes: `stepsOf`, `goStep`, `buildOf`, `stepBuild` (Task 4); `TRANSITIONS`, `DURATIONS`, `EASINGS` (Task 2).
- Produces:
  - State `ordering: boolean`, `orderStep: number` and `selStep: number`.
  - `startOrdering()` sets `ordering` and `orderStep: 1`, and stops play.
  - `assignStep(lid)` sets `steps[lid] = orderStep` and seeds `trans[orderStep] ||= 'fade'`. Title layers can't be assigned. It's one undo step.
  - `nextOrderStep()`, `finishOrdering()` (go to the last step) and `clearOrder()` (every step 0, `orderStep` 1).
  - In ordering mode, clicking an element on the stage or in the Elements list calls `assignStep`, and detail panels are reachable through the "Stacked here" chips.
  - Elements list rows show a badge (step number, `–` for 0, amber for the current `orderStep`) and a meta line ("Always visible" or "<Transition>" plus " · replaced by next" for details when replace is on).
  - Step N panel: a members list and the 2×4 transition grid. Picking one sets `trans[selStep]` and replays that step.
  - Timing (`dur`, `ease`) and List behaviour (Earlier: Keep/Dim; Detail panels: Replace previous/Build up) write `node.build`.
  - Frame strip: ◀ ▶ and Play/Pause, which steps every `dur + 1100` ms and stops at the end. Plus Frame chips (Frame n, transition label). While previewing, build mode renders `buildStyle` at `at`.
  - Linked slides refuse ordering mode and transition picks with `RO_MSG`, but preview works.
  - Step progress dots: a per-slide `showSteps` toggle in the Builds tab. Present draws dots for `stepsOf(id).length > 0`.
- [ ] **Step 1: Write failing tests:**
  - Starting ordering, `assignStep('md-list-1-1')`, `nextOrderStep()` and `assignStep('md-list-1-2')` give `steps` of `{…-1:1, …-2:2}` and `trans` of `{1:'fade',2:'fade'}`. One undo removes the last assignment.
  - Assigning `md-title` does nothing.
  - Picking `pop` for step 2 sets `trans[2] = 'pop'`.
  - Play advances `at` through `stepsOf` and stops at the end. Use fake timers or call the timer callback directly.
  - On a linked slide, `startOrdering()` flashes `RO_MSG` and leaves `ordering` false.
  - The AI guide text contains `step` and not `'frame'`.
- [ ] **Step 2:** `bun test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun test` → PASS. In `make dev`, build the "How the theme is built" list+detail example and present it.
- [ ] **Step 5:** Commit: `feat: Builds tab — click-to-order steps, per-step transitions, preview`.

### Task 9: Examples and final sweep

**Files:**
- Modify: `examples/strata-tour/strata-tour-layout.json`, `examples/my-deck/deck-layout.json` (rewrite as v2: `theme` plus any steps the tour needs), `examples/strata-tour/strata-tour.md` (slides that describe frames or tweens now describe Theme, Slides and Builds), and `README.md` (data model section: the `SlideNode`/`Frame`/`LayerTrans` types are replaced by the v2 shape; the Transition maths section is removed)
- Delete: `design/slides/*/slides-*.zip` (exports no longer needed; the prototypes stay as reference)

- [ ] **Step 1:** Run `grep -rn "frame\|tween\|ftrans\|tdef\|bezier" README.md examples design/strata.dc.html`. The only hits left should be unrelated words (e.g. iframe).
- [ ] **Step 2:** Run `make test && make build`. Expected: PASS and `Built dist/`.
- [ ] **Step 3:** Run `make dev` and open the tour (`/design/strata.dc.html?src=/examples/strata-tour/strata-tour.md`). Present it end to end: steps reveal, ← shows all steps, the theme applies to linked children.
- [ ] **Step 4:** Commit: `docs: v2 examples and README for Theme / Slides / Builds`.
