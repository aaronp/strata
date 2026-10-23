# Handoff: Strata — tree-structured, layered slide presentations

## Usage

Requires [bun](https://bun.sh).

| Command | What it does |
|---|---|
| `make dev` | Local editor at http://127.0.0.1:3067/ (pick or create a deck, ⌘S saves to `decks/<slug>/`) |
| `bun install` | Once, to fetch the test dependency (happy-dom) |
| `make test` | Run the tests |
| `make build [DECK=slug]` | Present-only static site in `dist/` with every deck (with `DECK`: the site root opens that deck; a missing deck fails the build) |
| `make preview` | Build, then serve `dist/` locally |

Publish a deck: set `DECK:` in `.github/workflows/pages.yml`, commit the deck (`decks/` is git-ignored, so `git add -f decks/<slug>`), and push to `master`. In the repo's **Settings → Pages**, set **Source: GitHub Actions** once. Or skip publishing: any hosted Strata presents a markdown file straight from a URL with `?src=` (below).

### Decks are markdown
A deck is `<name>.md` plus an optional `<name>-layout.json`. The markdown is the content and the only place text is edited; the layout file holds everything else (layouts, per-slide overrides, styles, frames, extras, images, canvas settings). The deck is rebuilt from the two on every load and edit. Locally they live in `decks/<slug>/<slug>.md` and `decks/<slug>/<slug>-layout.json`; opening the app without `?deck=` or `?src=` keeps both in browser storage (scratch mode). See `examples/current-situation.md`.

- **Headings are slides** (`#` top level, `##` below it, …, relative to the shallowest heading), styled H1, H2, …. Put `slug: <id>` on the line after a heading to fix its id (otherwise it comes from the heading text, and renaming the heading loses that slide's layout).
- **Blocks:** each paragraph is a `body` block, each `- `/`* ` list a `list`, each `![alt](url)` an `image` (relative to the markdown file); `[link:<slug>][Label]` lines make one `links` block of chips that jump to that slide; lines of only `[text](url)` links make one `sources` block. Wrap several paragraphs/lists in `<!-- block -->` … `<!-- /block -->` to make them one `body` block. A slide's **shape** is its block count per key (e.g. `title + body ×2`), and layouts match by shape.
- **Children by link:** an HTML comment under a heading (after `slug:`) lists other markdown files as that slide's children:
  ```
  <!--
  children:
    https://raw.githubusercontent.com/org/repo/main/team-a.md
    ./costs.md
  -->
  ```
  They're fetched only when you go into that slide (or a link/search targets them), shown as "▸ more" until then. Their ids are namespaced by the linking slide (`team-a.costs`), they're read-only here (the Slide tab links to them with `?src=`), and a failed fetch or loop shows one `Can't link <url>` slide. Their own `-layout.json` is used for slide layouts this deck doesn't set.
- Other HTML comments are ignored; raw HTML shows as text. Only `http(s):` links are clickable.

**`?src=<url>`** (e.g. `design/strata.dc.html?src=https://raw.githubusercontent.com/…/talk.md`) loads a markdown file and its sibling `<name>-layout.json`, if there is one. The URL must be `https:` or same-origin. There's no saving: in build mode your edits are kept in the browser as a draft for that URL until you download them. Present mode always shows the remote file; opening build mode with a draft that differs asks **You have local changes to this deck: Use my draft / Discard**.

**Editing:** the **Markdown** pane sits beside the slide (toggle and resize it); typing updates the slides live and it scrolls to the current slide. Layout edits (boxes, styles, frames, extras) go to the layout file. In the Slide tab, **This slide / Layout** chooses where they go: a per-slide override, or the shared layout for every slide of that shape without one. Content no layout region claims still shows, with a ⚠️ badge; click it to add a region for it (following the same choice). **Copy** copies the markdown; **Download** saves `<name>.md` and `<name>-layout.json`.


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
  bg: 'balloons' | 'london' | 'sea' | 'space' | 'forest' | 'sky' | 'ocean' | 'none' | 'custom';   // default 'balloons' customBg?: string /*dataURL*/; customAspect: number;
  opacity: number;        // background opacity 0–1
  base: string;           // colour behind the background
  offset: number;         // horizontal background offset (background loops infinitely)
  rowGap?: number;        // row step − 1: top edge to top edge is h·(1+rowGap); 0 = rows abut, < 0 overlaps (parallax)
  gap: number;            // column step − 1: left edge to left edge is w·(1+gap); 0 = slides abut (background moves in sync), < 0 overlaps (parallax)
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
- Canvas height = 100 units. `L` = number of levels (max depth + 1). With row step `r = 1 + rowGap` and padding `p = max(0, rowGap)`: slide height `h = 100 / (2p + (L−1)·r + 1)`, width `w = h·16/9`, and level `d`'s row starts at `p·h + d·r·h`.
- Horizontal placement (Layout → Spacing): **Even steps** (default) puts each slide at its parent's x + index × step, so every move between neighbours shifts the camera one step and every level move one row, whatever the tree's shape (branches may overlap on the canvas). **Fit subtrees** packs instead: a slide's children start at its x and run right, each leaf takes one step, and a parent spans at least its children's width.
- The camera centres on the current slide's rectangle. The background is drawn at canvas height, looped horizontally, and shifted by `offset`.
- Transitions between slides are swipes (fade for jumps from search or breadcrumbs); the background pans with the camera.

### Present view
- The header hides itself while presenting; move the mouse to the top edge to show it. **Jump to** (**/**) lives in the header.
- **View ▾** in the header:
  - **Slides · Tree · Radial** (or **T** to cycle). Tree draws the deck like the navigation tree, with parents centred over their children. Radial puts the title page (when on) at the centre and each level on a ring. In both, the current slide is outlined in red and its path in amber. Click a slide to jump there; Esc returns to Slides. **− / Fit / +** zooms, and the view scrolls when zoomed in.
  - **Breadcrumbs:** Off · 1s–5s · On for the top-left breadcrumbs. A time shows them on each transition, then fades them out after that many seconds. **B** toggles them off and on.
  - **Max size** (or **F**) makes the slide fill the whole area; crumbs and arrows float over it.
  - Breadcrumbs and Max size are remembered in the browser.

### Breadcrumbs (present view, top-left)
- A wizard-style row for the current level: earlier siblings shown as completed, the current one highlighted, later ones at reduced opacity.
- A ↓ marker under the current crumb when it has children.
- After going down, the child row shows beneath with a connector from the parent crumb. At most **two** rows are visible; deeper navigation slides the rows up.
- Clicking any crumb jumps there. `/` focuses search, and search results show their path and jump on click.

### Build mode
- **Left panel (resizable):** the deck as a read-only tree of thumbnails; click to go to a slide. Structure is edited in the markdown.
- **Centre:** the slide editor. Select / drag / resize (8 handles) / rotate layers, double-click to edit text, drop images, and Ctrl/⌘+V to paste an image (replaces the selected image layer, or adds a new one). There is also a wireframe view showing every slide rectangle over the background.
- **Right panel (resizable), tabs: Slide / Canvas** (Canvas holds the title page, Spacing — row/column step, Even steps vs Fit subtrees, transition time — text styles, background and readability).
  - **Layout section (collapsible):** preset layouts (Title, Title + list, Side by side, …) that rebuild the frame's layers from the slide's content.
  - **Frames section (collapsible):** a left-to-right strip of frame thumbnails with a → between each pair.
    - Buttons: ▶ Preview / ■ Stop (steps through the frames with → / Space; Esc stops), ⧉ Duplicate, Delete. Header checkbox: Progress.
    - If you duplicate frame A while an A→B transition has settings, a warning appears and those settings are dropped.
    - **Add as sequence** (shown when two or more layers are selected): choose Fade in, Slide up, Slide from left or Cascade. The current frame becomes the start, with the selected layers hidden. A new frame then reveals each layer in turn, top to bottom, with an ease-out. Cascade starts each layer at the previous one's position. Frames that were already after it are kept. It's one undo step.
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
- `design/backdrops/`: `countryside-balloons.png` (the default, aspect 1.5 w/h), `london.png` (1), `under-the-sea.png`, `space.png` and `forest.png` (tall, 0.4), plus the tall `sky.svg` and `ocean.svg` templates (≈ 0.4). Users can also upload their own (SVG preferred).

## Files
- `design/strata.dc.html`: the full app (template + logic). This is the source of truth.
- `design/Layers.dc.html`: renders a layer list onto a 16:9 slide (used by the stage, thumbnails and frame strip).
- `design/backdrops/*`: template backgrounds.

## Suggested build order
1. Data model, store and undo/redo, plus localStorage persistence and JSON import/export.
2. Tree panel (CRUD, reorder, keyboard).
3. Layout and parallax maths, and the present-mode camera with arrow navigation.
4. Breadcrumbs and search.
5. Layer editor (select, drag, resize, rotate, text editing, images, paste).
6. Frames, the transition view, per-action timing, bezier paths and defaults.
7. Links, layout presets, wireframe view, frame preview and progress dots.

### Text styles
Text layers can use deck-wide named styles: built-in **H1, H2, H3, Body, Bullets**, plus your own (Canvas tab → Text styles: rename, see how many layers use each, **+ New style from selected layer**, delete). A style covers font, size, weight, colour, alignment, line height, letter spacing, bullets, paragraph gap and the **Container** (On/Off plus its box: background, border, opacity, blur, corners, padding). The Container header says where it comes from (*From H1*, or *This layer •* when overridden). For a card behind all text, turn the container on in the styles you use; Canvas → Readability now only offers None or a Whole-slide backdrop. On a text layer, pick its **Style** (or Custom), then **Edits apply to: This layer | <Style> style**: *This layer* makes an override (marked •, ↺ to reset, **Clear overrides** for all); *<Style> style* edits the style for every layer using it. Saved in the layout file (only what differs from the built-ins); headings use H1, H2, … by depth and paragraphs Body. Style edits aren't on undo (like other Canvas settings). Linked-in slides use this deck's style of the same name, else their own.

### Layouts
A slide's **shape** is its markdown blocks counted by key (e.g. `title ×1 · body ×2`); extras added in Strata don't count. **Layouts** arrange that content: each matches one shape and places each block in a named region (rename regions in the list; matching stays by shape). Slide tab → **Layout** shows the slide's shape and status, the layouts for that shape (★ = the deck default, with "N slides" lists you can click to jump to), **Apply**, **Apply to all** (makes it the default and updates every slide of the shape without an override), **↺ Reset to default**, **Save as layout** and **Update “…” from this slide**. With **This slide**, moving or resizing an element makes a per-slide override; with **Layout**, it updates the shared layout instead. Multi-frame slides are always overrides. Built-in layouts can be renamed and updated; your own can be deleted. Saved in the layout file.

### Inline formatting
Inside a text layer, `**bold**`, `*italic*` and `[words]{style=h2 size=72 color=#d9432b font=serif weight=600}` format part of the text (escape with `\*`, `\[`, `\{`; anything malformed shows as typed). While editing a text layer, a formatting bar (**B**, *I*, Style, Size, Colour, Clear; ⌘B/⌘I) wraps the selection for you. Links work the same way: `[the costs]{link=costs}` links words to a slide (linked-in slides too, e.g. `link=team-a.costs`) and `[the report]{href=https://…}` to a web page (only `http(s):` targets); the bar's **Link ▾** sets them. Linked words are underlined and clickable in present mode; a link to a missing slide shows a dashed underline. In the markdown, a `[link:slug][label]` chip or `[text](url)` in the middle of a sentence becomes an inline link (a slide's chip lines, `- [link:slug][Label]` or `- [Label]{link=slug}`, become one bulleted link list in a card, using the built-in **Bullets** style; lines of only web links become source links).

### Components
**+ Component** (Layers) adds a live, sandboxed HTML/CSS/JS snippet you place and animate like any layer. Paste code into its editor and **Apply**. It talks to the slide through a `strata` helper: it hears `enter` and `frame` (with the frame number and its own tween `duration`), can claim the presenter's → / ← (`strata.ready({ steps: true })`, then `next` / `prev`, handing back with `strata.done()` / `strata.back()`), and can `strata.jumpTo('slide')` or `strata.nav('right')`. **Copy AI guide** copies a brief for an AI to write one; **Interact** lets you click into it while editing. A second → overrides a component that stops responding.
