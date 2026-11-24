# Slide studio refresh: Theme · Slides · Builds

## Intent
Strata's editor has grown too complicated: frames, per-layer tweens (move/scale/rotate/colour/size/fade), bezier paths, transition defaults, "Add as sequence", text styles with containers, and a Layout section all compete in the right panel. The user prototyped a cleaner model in `design/slides/`:

1. **Theme** (`design/slides/theme/Main.dc.html`): the whole deck's look (background, colour scheme, palette, fonts, surface).
2. **Slides** (`design/slides/slides/Templates.dc.html`): a template per slide, plus text and shape editing.
3. **Builds** (`design/slides/build/Builds.dc.html`): number the elements by step (1, 2, 3…) and pick one transition per step.

Replace the right panel and the frame/tween machinery with that model. Keep everything else that makes Strata Strata.

## Goals
- The right panel's tabs become **Theme / Slides / Builds**, closely following the three prototypes (their markup and inline styles are the visual spec, and their logic classes are the behaviour spec).
- A slide has **one set of layers**. Each layer has a **step** (0 = always visible). In present mode, → / Space reveals the next step before moving to the next slide. ← hides the last step, and landing on a previous slide shows all of its steps. ↑ / ↓ land on step 0.
- Elements only **appear**. There is no movement or morphing between steps.
- The whole editor is re-skinned to the prototypes' dark chrome.

## Non-goals
- Backwards compatibility. Old layout files, frames, `ftrans`, `tdef` and old saved UI state can be dropped. Existing example layout files are rewritten or reset.
- A React/TS rewrite.
- Elements that move or change between steps.

## Anti-goals (failure even if it "works")
- Losing what works today: markdown as the only place text is edited, the `-layout.json` sidecar, the tree, parallax and spacing, present mode (views, breadcrumbs, search, Max size), `?src=`, drafts, File menu, open file, linked child decks, inline formatting and links, components, images and paste, undo/redo, and `make build`.
- Keeping two systems side by side ("frames under the hood"). Delete the old one.

## Constraints
- Stays in `design/strata.dc.html` (Design Component: template plus `class Component` logic) and its tests (`app.test.ts`, `layers.test.ts`, `editor.test.ts`, …, run with `make test`/bun + happy-dom).
- `design/Layers.dc.html` renders layers for stage, thumbnails and present. It stays, minus frame/tween concerns.
- Theme colours and fonts must reach the slides through **tokens** (`primary`, `secondary`, `tertiary`, `impact`, `text`, `muted`, `onPrimary`; fonts `head` / `body` / `mono`), so switching theme restyles every slide, as the Templates prototype says.

## Approaches considered
- **A. Gut and re-panel `strata.dc.html` in place** (chosen). Delete frames, tweens, bezier paths, transition defaults, sequence and the old Layout/Frames/Layers sections. Port the three prototype panels in. Keep the rest. It reuses the working core and its tests. The cost is surgery in a ~2,900-line file.
- **B. Start from the prototypes and port Strata's core into them.** It would be the most faithful look, but means re-wiring linked decks, `?src=`, drafts, components and inline links, which is where regressions hide. Rejected.
- **C. React + TS + Vite rewrite** (the README's suggestion). Far bigger than a UI refresh. Rejected.

## Design

### Data (layout file, `version: 2`; v1 files are ignored and fall back to defaults)
```ts
deck: {
  // kept: offset, gap, rowGap, spacing, speed, titlePage, images, customBg, customAspect, opacity
  theme: {
    background: string;        // id from the Theme prototype's BACKGROUNDS, or 'image:<balloons|london|sea|space|forest|sky|ocean|custom>'
    scheme: 'original' | string | { deep, mid, accent };  // SCHEMES id, or custom colours
    palette: string;           // PALETTES id
    fonts: string;             // FONTS id
    surface: 'clear' | 'frosted' | 'card';
    motion?: { speed, count?, opacity?, size?, sun? };   // per the prototype's MOTION controls
  };
  templates?: Record<string, Template>;   // user-saved templates (built-ins live in code)
}
slides: { [id]: {
  template?: string;                       // absent = auto (first built-in whose content shape matches)
  barStyle?: 'band' | 'rule' | 'none'; side?: 'left' | 'right';   // template options
  layers: Layer[];                         // replaces frames[]; md-* layers keep content-from-markdown merging
  steps?: Record<LayerId, number>;         // absent/0 = always visible
  trans?: Record<number, TransitionId>;    // 'fade'|'rise'|'slide'|'scale'|'wipe'|'wave'|'pop'|'none'
  build?: { dur: 250|500|900; ease: string; earlier: 'keep'|'dim'; replace: boolean };
}}
```
`Layer` keeps its current fields minus anything frame- or tween-related. Colour fields may hold a theme token (`'primary'`) or a literal hex. Shapes gain `token`, `opacity`, `border: { width, style }` and `blend` per the Templates prototype.

### Theme tab
- Port `Main.dc.html`'s right-hand panel: Background (All/Solid/Gradient/Moving/Pattern **+ Image**, the existing backdrops), Colours (Original + schemes + Custom, "reset every background"), Theme (palettes) and Typography (font sets), plus Surface (Clear/Frosted/Card, replacing Readability).
- The deck's Spacing settings (row/column step, Even steps / Fit subtrees, slide transition speed) and Title page move into a collapsible **Canvas** section at the bottom of this tab.
- A CSS background is drawn at canvas size behind the whole deck, so parallax still applies. Moving backgrounds animate per the prototype.

### Slides tab
- Port `Templates.dc.html`: a template grid (Title, Title bar + content, List + detail, Two columns, Three cards, Section break, Statement, Shapes), per-template options (title bar style, list side) and a placeholder list.
- **Markdown → regions (agreed with the user):** each bullet becomes its own layer (`md-list-<n>-<i>`), so it can have its own step. Paragraphs pair by order:
  - **List + detail:** a heading, a list of N items, then N paragraphs. Paragraph *k* is bullet *k*'s detail panel (kind `detail`, for Builds' "replace previous").
  - **Title:** the heading, then an optional paragraph as the subtitle. No kicker.
  - **Section break:** the big number is worked out from the slide's position among its siblings.
  - **Statement:** two paragraphs. The second uses the `impact` token.
  - **Two columns / Three cards:** two or three paragraphs.

  No new markdown grammar.
- **Templates are the new layouts.** All 17 current `BUILTIN_LAYOUTS` stay as templates alongside the prototype's 8. The grid lists the templates that fit the slide's content shape first, then the rest (picking one that doesn't fit leaves ⚠️ blocks, as today). *(Claude's call.)*
- **Placeholders:** markdown stays the only place text is edited. Clicking a markdown-owned placeholder opens the Content tab scrolled to the slide, as today. *(Claude's call.)* A template is a set of named regions keyed by block (`title`, `body`, `list`, `image`, `links`, …). The slide's markdown blocks fill regions by key in reading order, as `fillSlots` does today. Unfilled regions show an empty placeholder in build mode only. Blocks no region claims show with the existing ⚠️ badge. Auto-pick by content shape stays as the default. Built-in `BUILTIN_LAYOUTS` are folded into this list.
- The shape toolbar (Select, Text, Rectangle, Rounded, Ellipse, Line, Arrow) sits above the stage. Selecting a layer shows its properties in this tab: for shapes, the prototype's Shape / Fill token / Opacity / Border / Blend; for text, image, icon and components, a trimmed version of today's settings (geometry, opacity, link, type-specific), coloured by tokens.
- Text styles shrink to sizes and weights per role (H1, H2, H3, Body, Bullets). Font and colour come from the theme. Containers go (Surface covers them).
- This slide / Layout ("apply to") stays: moving a region edits this slide, or with Layout, the template for every slide using it. Save as template / Update template stay.

### Builds tab
- Port `Builds.dc.html`: the Elements list with step badges, **Set order by clicking** (ordering mode: click elements on the stage or list to join step N; Next step; Done; Clear), a Step N members list, the Transition grid for the selected step, whole-slide Timing (duration, easing), and List behaviour (earlier items Keep/Dim; detail panels Replace previous / Build up).
- A frame strip under the stage (◀ ▶ Play, Frame 1…N with each one's transition) previews the build in the editor.
- Present mode plays steps with CSS transitions (opacity/transform/clip-path, `dur`, `ease`, stagger for Wave), as in the prototype's `elementView`.
- Step progress dots (today's Progress option) stay as a per-slide toggle.
- **Components:** the helper's `frame` event becomes `step` `{ n, duration }`, with no alias. Claiming → / ← (`ready({steps:true})`, `next`/`prev`, `done`/`back`) is unchanged. Update "Copy AI guide" to match. *(Claude's call.)*

### Linked child decks
They use the **root deck's theme** (one background behind the whole tree), and their own `theme` is ignored. Their own templates and per-slide settings still apply as layouts do today. *(Claude's call.)*

### Deleted
Frames, frame strip/duplicate/delete, `ftrans`, per-action timing, `tdef` and transition defaults, bezier paths and the curved-move animator, Add as sequence, the transition view, the old Layout section, text-style containers, Readability, and the Fun/Basic theme buttons. Plus their tests.

### Kept unchanged
Header and present chrome (re-skinned), left tree, wireframe view, Content (markdown) editing. **Content moves to a fourth position**, as a button/tab next to Theme/Slides/Builds, so the markdown stays one click away.

## Left to the builder
- How to restructure tests: delete frame/tween tests and add tests for step visibility, step navigation in present mode, template filling, theme token resolution and v1→defaults.
- The exact dark-chrome colour values for parts the prototypes don't show (the tree panel, menus, dialogs): extend the prototypes' palette (`#16181D`, `#1B1E24`, `#23262E`, `#2C3039`, `#343944`, accent `#7AA2FF`).
- Updating the README and the example decks' layout files.
