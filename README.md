# Handoff: Strata — tree-structured, layered slide presentations

## Usage

Requires [bun](https://bun.sh).

| Command | What it does |
|---|---|
| `make dev` | Local editor at http://127.0.0.1:3067/ (pick or create a deck, ⌘S saves to `decks/<slug>/`) |
| `make import MD=notes.md [SLUG=name]` | Build `decks/<slug>/` from a markdown outline; re-run (or `make import DECK=<slug>`) after editing the markdown |
| `make test` | Run server/build tests |
| `make build [DECK=slug]` | Present-only static site in `dist/` (with `DECK`: just that deck, opened from the site root) |
| `make preview` | Build, then serve `dist/` locally |

Publish one deck: set `DECK:` in `.github/workflows/pages.yml`, commit that deck (`decks/` is git-ignored, so `git add -f decks/<slug>`), and push to `master`. In the repo's **Settings → Pages**, set **Source: GitHub Actions** once. The workflow runs `make build DECK=<slug>`, which publishes only that deck and makes the site root open it; `make build` with no `DECK` publishes every deck behind a list page.

Decks live in `decks/<slug>/deck.json`, with images extracted to `decks/<slug>/img/`. Opening the app without `?deck=` uses browser storage only (scratch mode).

### Markdown decks
Headings become slides (`#` top level, `##` below it, …). Put `slug: <id>` on the line after each heading. `[link:<slug>][Label]` adds a clickable chip that jumps to that slide; dotted paths like `[link:top.child][…]` also work. Ordinary `[text](url)` links become source links. Re-importing rewrites text and links but keeps anything you moved, restyled, hid or added in the builder. See `examples/current-situation.md`.

**Export markdown** (Slide tab) does the reverse: it downloads the current slide and everything below it as markdown with `slug:` lines (on the title page: the whole deck), ready to edit and import as a new deck. Bodies come from each slide's text layers; links to slides outside the branch become plain text; images, shapes, styling and later frames don't travel.

### Composing decks
In the builder's Slide tab, **Copy deck here** copies another deck's slides (and images) under the current slide as ordinary, editable slides. Copies are independent: later changes to the source deck don't flow into them. Decks saved with the older live "Include deck" are converted to copies the first time they're opened.


## Overview
Strata is a presentation tool where slides form a **tree**, not a line. Viewers move ← → between siblings (children of the same parent) and ↑ ↓ between levels, so they can stay at the top level or dig into any topic. One large looping background image sits behind the whole deck and shifts with parallax as you navigate, giving a sense of depth (e.g. sky → ground → underground, or ocean surface → trench).

Each slide is built from positioned **layers** (text, image, shape, icon) across one or more **frames**; moving between frames tweens the layers (move / scale / rotate / colour / text size / fade), with per-change easing, timing and optional curved paths.

## About the design files
The files in `design/` are **design references built in HTML**: working prototypes that show the intended look and behaviour. They are not production code to copy. The task is to **rebuild this in a real app**. Recommended stack if starting fresh: **React + TypeScript + Vite**, a state store (Zustand or Redux Toolkit) with undo/redo built on immutable snapshots, and plain CSS transitions / Web Animations API for tweening. Persist to localStorage first, with a JSON export/import; a backend can come later.

`strata.dc.html` is the current version. It's a "Design Component": a template with `{{ }}` holes plus a `class Component` logic block inside a `<script data-dc-script>` tag. **Read the logic class: it is the spec for all behaviour.** `support.js` is the prototype's runtime only; don't port it. Older `Strata*.dc.html` versions are superseded and not included.

## Fidelity
**High-fidelity for behaviour and layout; mid-fidelity for visual polish.** Match the interaction model, data model, parallax maths and transition system exactly. Colours and type below are final for the editor chrome.

## Data model (as in the prototype)
```ts
type Deck = {
  nodes: Record<string, SlideNode>;   // 'ROOT' is a hidden root; its children are the top-level row
  bg: 'sky' | 'ocean' | 'none' | 'custom'; customBg?: string /*dataURL*/; customAspect: number;
  opacity: number;        // background opacity 0–1
  base: string;           // colour behind the background
  offset: number;         // horizontal background offset (background loops infinitely)
  margin: number;         // vertical margin between levels (% of canvas height)
  gap: number;            // horizontal gap between slides (fraction of slide width)
  tdef: Partial<Record<Action, Timing>>;   // deck-wide transition defaults
  images: Record<string, string>;          // imgKey -> dataURL (stored separately in the prototype)
};
type SlideNode = {
  id: string; title: string; body: string /*notes*/; children: string[];
  frames?: Frame[];                 // absent = one frame with default layers
  ftrans?: Record<FrameId, Record<LayerId, LayerTrans>>; // keyed by the FROM frame of each A→B pair
  showFrames?: boolean;             // show frame-progress dots on the slide
};
type Frame = { id: string; layers: Layer[] };    // array order = z-order (later = on top)
type Layer = {
  id: string; type: 'text' | 'image' | 'shape' | 'icon';
  x: number; y: number; w: number; h: number;   // % of the 16:9 slide
  rot?: number; opacity?: number; hidden?: boolean;
  link?: { kind: 'url'; url: string } | { kind: 'slide'; id: string };
  // text: text, font, size, weight, color, align, valign, lh, ls, bullets ('none'|'disc'|'num'|…), gap
  // image: imgKey, fit; shape: shape ('rect'|'ellipse'|…), fill, radius; icon: icon, color, sw
};
type Action = 'move' | 'scale' | 'rotate' | 'colour' | 'size' | 'fade';
type Timing = { ease: 'linear'|'in'|'out'|'both'|'spring'; dur: number /*ms*/; delay: number /*ms*/ };
type LayerTrans = Partial<Record<Action, Timing>> & { path?: { c1: Pt; c2: Pt } }; // bezier control points in slide %
```
A layer keeps the **same `id`** across frames; that's how it's matched for tweening. Duplicating a frame copies its layers with their ids.

## Core behaviour

### Tree navigation
- ← → move between siblings only. To reach a cousin you go ↑, across, ↓.
- ↓ goes to the first child (or the last-visited child); ↑ goes to the parent.
- Space / Shift+Space step through the tree in depth-first order.
- With frames: → / Space step to the next frame first and only change slide after the last frame. ← does the same in reverse and lands on the **last** frame of the previous slide. ↑ / ↓ always land on frame 1.

### Layout and parallax (`layout()` in the source)
- Canvas height = 100 units. `L` = number of levels (max depth + 1). Slide height `h = (100 − margin·(L+1)) / L`, width `w = h·16/9`. Each level's row starts `margin` below the row above it.
- Horizontal placement: a slide's children start at the **parent's x** and run right (never back to the left). Each leaf takes one slot `w·(1+gap)`, and a parent spans at least its children's width.
- The camera centres on the current slide's rectangle. The background is drawn at canvas height, looped horizontally, and shifted by `offset`.
- Transitions between slides are swipes (fade for jumps from search or breadcrumbs); the background pans with the camera.

### Breadcrumbs (present view, top-left)
- A wizard-style row for the current level: earlier siblings shown as completed, the current one highlighted, later ones at reduced opacity.
- A ↓ marker under the current crumb when it has children.
- After going down, the child row shows beneath with a connector from the parent crumb. At most **two** rows are visible; deeper navigation slides the rows up.
- Clicking any crumb jumps there. `/` focuses search, and search results show their path and jump on click.

### Build mode
- **Left panel (resizable):** vertical tree of thumbnail nodes with + sibling / + child / delete and drag to reorder. Keys: Enter adds a sibling, Tab adds a child, ⌫ deletes, double-click renames.
- **Centre:** the slide editor. Select / drag / resize (8 handles) / rotate layers, double-click to edit text, drop images, and Ctrl/⌘+V to paste an image (replaces the selected image layer, or adds a new one). There is also a wireframe view showing every slide rectangle over the background.
- **Right panel (resizable), tabs: Slide / Layout / Background.**
  - **Layout section (collapsible):** preset layouts (Title, Title + list, Side by side, …) that rebuild the frame's layers from the slide's content.
  - **Frames section (collapsible):** a left-to-right strip of frame thumbnails with a → between each pair.
    - Buttons: ▶ Preview / ■ Stop (steps through the frames with → / Space; Esc stops), ⧉ Duplicate, Delete. Header checkbox: Progress.
    - If you duplicate frame A while an A→B transition has settings, a warning appears and those settings are dropped.
  - **Transition view (opens from a →):**
    - Side-by-side lists of the layers in A and B, with an → between each pair; an empty cell means the layer appears or disappears, and clicking it copies the layer across.
    - Clicking a side selects that layer in that frame for editing. The other frame shows on the stage as a non-interactive 50%-opacity ghost.
    - Moved layers show a path from centre to centre. The selected layer's path has two draggable bezier handles, and its table shows "Path: Straight/Curved [Reset]".
    - Per-change table: one row per detected change (Move, Scale, Rotate, Colour, Text size, Fade), each with Easing · Duration · Delay. Each column has an **All** toggle that makes edits apply to every row.
  - **Transition defaults (collapsible):** the same table for deck-wide defaults, with **All** and **Apply** per column. Apply strips that one setting from every custom transition on every slide.
  - **Layers section (collapsible):** a z-ordered list with show/hide and reorder. Below it, settings for the selected layer: geometry, rotate, opacity, link (URL or slide), plus type-specific settings. Text settings use a `label : dropdown` two-column grid.
- **Undo / redo:** ⌘Z / ⇧⌘Z / ⌘Y covers node, layer, frame and transition edits.

### Transition maths
- Easing curves: linear `(0,0,1,1)`, in `(.55,0,1,.45)`, out `(0,.55,.45,1)`, both `(.65,0,.35,1)`, spring `(.34,1.56,.64,1)`.
- Timing fallback: per-layer action → legacy per-layer → deck default → `{ease:'both', dur:600, delay:0}`.
- Straight moves are CSS transitions on left/top/width/height. **Curved** moves are animated per frame: progress is eased, position comes from a cubic bezier between the two centres, and size is interpolated using the Scale timing. Going backwards plays the same curve reversed.
- Layers present in only one frame fade in or out where they sit.

## Design tokens (editor chrome)
- Paper `#f2eee5`, panel `#fbf9f4`, card `#fff`, line `#e0d9cb`, soft line `#f0ebe0`, tag background `#ece6d9`
- Ink `#1d1b17`, muted `#6b6458`, accent red `#d9432b` (current frame), destructive `#a8301d`
- Selection blue `#1f6fb8`, blue tints `#eef3f9` / `#d6e2ef` / `#9db8d3`, deep blue text `#1f4f80` / `#3d5a78`
- Slide base colour options start with `#0b1220`
- Type:
  - UI: **Bricolage Grotesque** 14px (headers 600–800)
  - Labels: **JetBrains Mono** 10–11px, uppercase, letter-spacing .14em
  - Slide fonts also include DM Serif Display and Newsreader (Google Fonts)
- Radii: 5–10px on controls, 999px on pills. Panel sections are bordered with a 10px radius.

## Assets
- `design/backdrops/sky.svg` and `design/backdrops/ocean.svg` are tall template backgrounds (aspect ≈ 0.4 w/h). Users can also upload their own (SVG preferred).

## Files
- `design/strata.dc.html`: the full app (template + logic). This is the source of truth.
- `design/Layers.dc.html`: renders a layer list onto a 16:9 slide (used by the stage, thumbnails and frame strip).
- `design/backdrops/*.svg`: template backgrounds.

## Suggested build order
1. Data model, store and undo/redo, plus localStorage persistence and JSON import/export.
2. Tree panel (CRUD, reorder, keyboard).
3. Layout and parallax maths, and the present-mode camera with arrow navigation.
4. Breadcrumbs and search.
5. Layer editor (select, drag, resize, rotate, text editing, images, paste).
6. Frames, the transition view, per-action timing, bezier paths and defaults.
7. Links, layout presets, wireframe view, frame preview and progress dots.

### Components
**+ Component** (Layers) adds a live, sandboxed HTML/CSS/JS snippet you place and animate like any layer. Paste code into its editor and **Apply**. It talks to the slide through a `strata` helper: it hears `enter` and `frame` (with the frame number and its own tween `duration`), can claim the presenter's → / ← (`strata.ready({ steps: true })`, then `next` / `prev`, handing back with `strata.done()` / `strata.back()`), and can `strata.jumpTo('slide')` or `strata.nav('right')`. **Copy AI guide** copies a brief for an AI to write one; **Interact** lets you click into it while editing. A second → overrides a component that stops responding.
