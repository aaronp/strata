# Handoff: Strata — tree-structured, layered slide presentations

## Usage

Requires [bun](https://bun.sh).

| Command | What it does |
|---|---|
| `make dev` | Local editor at http://127.0.0.1:3067/ (pick or create a deck, ⌘S saves to `decks/<slug>/`) |
| `bun install` | Once, to fetch the test dependency (happy-dom) |
| `make test` | Run the tests |
| `make build [DECK=slug]` | Present-only static site in `dist/`: the app (its File menu opens a URL or any published deck) and every local deck (with `DECK`: the site root opens that deck; a missing deck fails the build) |
| `make preview` | Build, then serve `dist/` locally |

Pushing to `master` publishes the app to GitHub Pages (`.github/workflows/pages.yml` runs the tests, then `make build`); in the repo's **Settings → Pages**, set **Source: GitHub Actions** once. Decks aren't published with it: share them by URL.

### Share a deck
Put the markdown (and its `-layout.json`) anywhere public, e.g. a GitHub repo, and share:

`https://aaronp.github.io/strata/?src=<markdown url>[&slide=<id>]`

- GitHub `blob` links work (`https://github.com/you/repo/blob/main/talk.md`): Strata fetches the raw file; `children:` links too.
- `&slide=<id>` opens on that slide; an id inside a linked file (`stitching.joining`) loads it on the way. An unknown id opens the first slide with a note.
- The published site is present-only. Its root opens the app; the **File** menu has **Open URL…**, the published decks and the [Strata tour](https://aaronp.github.io/strata/?src=https://github.com/aaronp/strata/blob/master/examples/strata-tour/strata-tour.md), a deck about Strata in `examples/strata-tour/`.
- **Open a file:** drop a `.md` (with its `-layout.json`) anywhere in the app, or use **File → Open file…**. It becomes the scratch deck, kept in this browser. A layout file on its own restyles the open deck. Relative images in a local `.md` don't load (there's no URL to resolve them against), so use absolute URLs or publish the deck.
- **Your own deck repo:** `examples/my-deck/` is a template repo (deck, layout, a redirecting `index.html` and a Pages workflow). From that folder, `make clone REPO=you/your-deck` (or `./clone.sh`, which prompts) copies it to `../your-deck` as a fresh repo, points its README at `https://you.github.io/your-deck/` and sets `origin`. Push it, then set **Settings → Pages → Source: GitHub Actions**: the site redirects to Strata with `?src=` pointing at your `deck.md`.
- Locally, `make dev` serves `examples/` too: http://127.0.0.1:3067/design/strata.dc.html?src=/examples/strata-tour/strata-tour.md (or use File → Open URL…).

### Decks are markdown
A deck is `<name>.md` plus an optional `<name>-layout.json`. The markdown is the content and the only place text is edited; the layout file holds everything else (theme, templates, per-slide overrides, styles, build steps, extras, images, canvas settings). The deck is rebuilt from the two on every load and edit. Locally they live in `decks/<slug>/<slug>.md` and `decks/<slug>/<slug>-layout.json`; opening the app without `?deck=` or `?src=` keeps both in browser storage (scratch mode). See `examples/strata-tour/` and `examples/current-situation.md`.

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
  They're fetched only when you go into that slide (or a link/search targets them), shown as "▸ more" until then. Their ids are namespaced by the linking slide (`team-a.costs`), they're read-only here (the Slides tab links to them with `?src=`; their steps can be previewed but not changed), and a failed fetch or loop shows one `Can't link <url>` slide. Their own `-layout.json` is used for slide layouts this deck doesn't set.
- Other HTML comments are ignored; raw HTML shows as text. Only `http(s):` links are clickable.

**`?src=<url>`** (e.g. `design/strata.dc.html?src=https://raw.githubusercontent.com/…/talk.md`) loads a markdown file and its sibling `<name>-layout.json`, if there is one. The URL must be `https:` or same-origin. There's no saving: in build mode your edits are kept in the browser as a draft for that URL until you download them. Present mode always shows the remote file; opening build mode with a draft that differs asks **You have local changes to this deck: Use my draft / Discard**.

**Adding slides:** in build mode, the **+** on the slide's right edge adds a slide after it (a sibling, after its children), the **+** on its bottom edge adds one below it (its last child). Each writes a `# New slide` heading with a `slug:` line into the markdown and goes to it.

**Editing:** the markdown is in the right panel's **Content** tab (with any parse issues below it); typing updates the slides live and it scrolls to the current slide. Layout edits (boxes, styles, build steps, extras) go to the layout file. In the Slides tab, **This slide / Layout** chooses where they go: a per-slide override, or the shared layout for every slide of that shape without one. Content no layout region claims still shows, with a ⚠️ badge; click it to add a region for it (following the same choice). **Copy** copies the markdown; **Download** saves `<name>.md` and `<name>-layout.json`.


## Overview
Strata is a presentation tool where slides form a **tree**, not a line. Viewers move ← → between siblings (children of the same parent) and ↑ ↓ between levels, so they can stay at the top level or dig into any topic. One large looping background image sits behind the whole deck and shifts with parallax as you navigate, giving a sense of depth (e.g. sky → ground → underground, or ocean surface → trench).

Each slide is built from positioned **layers** (text, image, shape, icon, component), laid out by a **template** and coloured by the deck's **theme**. A slide can reveal its layers in **build steps**: each layer has a step number (0 = always shown), each step has a transition (Fade, Rise, Slide in, Grow, Wipe, Wave, Pop or Cut), and the slide has one timing. Elements only appear; nothing moves or morphs between steps.

## About the design files
The files in `design/` are **design references built in HTML**: working prototypes that show the intended look and behaviour. They are not production code to copy. The task is to **rebuild this in a real app**. Recommended stack if starting fresh: **React + TypeScript + Vite**, a state store (Zustand or Redux Toolkit) with undo/redo built on immutable snapshots, and plain CSS transitions for the build reveals. Persist to localStorage first, with a JSON export/import; a backend can come later.

`strata.dc.html` is the current version. It's a "Design Component": a template with `{{ }}` holes plus a `class Component` logic block inside a `<script data-dc-script>` tag. **Read the logic class: it is the spec for all behaviour.** `support.js` is the prototype's runtime only; don't port it. Older `Strata*.dc.html` versions are superseded and not included.

## Fidelity
**High-fidelity for behaviour and layout; mid-fidelity for visual polish.** Match the interaction model, data model, parallax maths and transition system exactly. Colours and type below are final for the editor chrome.

## Data model
The layout file (`<name>-layout.json`) is `version: 2`; any other version is ignored ("Old layout file ignored") and the deck uses defaults.
```ts
type LayoutFile = {
  version: 2;
  deck: {
    theme: Theme;
    layouts?: Record<string, Template>; layoutDefaults?: Record<string, string>;   // templates by id; default template per slide shape
    styles?: Record<string, TextStyle>;   // only what differs from the built-ins
    customBg?: string /*dataURL*/; customAspect: number; opacity: number; offset: number;
    gap: number; rowGap?: number;         // column / row step − 1 (0 = slides abut, < 0 overlaps)
    speed: number; titlePage: boolean;
    images: Record<string, string>;       // imgKey -> dataURL
  };
  slides: Record<string, SlideOverride>;  // by slide id; absent = defaults
};
type Theme = {
  background: string;                     // e.g. 'image:sky'
  scheme: string;                         // 'original', a preset or 'custom'
  palette: string;                        // sets primary, secondary, tertiary, impact, text, muted, onPrimary
  fonts: string;                          // a heading / body / mono set
  surface: 'clear' | 'frosted' | 'card';
};
type SlideOverride = {
  layers?: Layer[];                       // array order = z-order (later = on top); md-* layers are filled from the markdown
  template?: string; layout?: string; barStyle?: 'band' | 'underline' | 'none'; side?: 'left' | 'right';
  steps?: Record<LayerId, number>;        // layer -> build step; absent or 0 = always shown
  trans?: Record<number, TransId>;        // step -> transition, default 'fade'
  build?: { dur: 250 | 500 | 900; ease: string; earlier: 'keep' | 'dim'; replace: boolean };   // one timing per slide
  showSteps?: boolean;                    // step dots in Present
};
type TransId = 'fade' | 'rise' | 'slide' | 'scale' | 'wipe' | 'wave' | 'pop' | 'none';
type Layer = {
  id: string; type: 'text' | 'image' | 'shape' | 'icon' | 'component';
  x: number; y: number; w: number; h: number;   // % of the 16:9 slide
  rot?: number; opacity?: number; hidden?: boolean;
  link?: { kind: 'url'; url: string } | { kind: 'slide'; id: string };
  // text: text, style, font ('head'|'body'|'mono'), size, weight, color (a token or hex), align, valign, lh, bullets
  // image: imgKey, fit; shape: shape, fill (a token), fillOpacity, border; icon: icon, color
};
```
The deck's nodes (id, title, notes, children) come from the markdown, not the layout file. Theme colours reach slides as tokens (`primary`, `secondary`, `tertiary`, `impact`, `text`, `muted`, `onPrimary`), so changing the theme restyles every slide. Elements only appear on a step; nothing moves between steps. A step's transition and the slide's timing (default 500 ms, Ease out, earlier items dimmed to 45%, detail panels replace) are the only animation settings. See `builds.ts`.

## Core behaviour

### Tree navigation
- ← → move between siblings only. To reach a cousin you go ↑, across, ↓.
- ↓ goes to the first child (or the last-visited child); ↑ goes to the parent.
- Space / Shift+Space step through the tree in depth-first order.
- With build steps (in Present, or while a Builds preview is showing): → / Space reveal the next step first and only change slide after the last one. ← / Shift+Space go back a step, and into the previous slide on its **last** step. ↑ / ↓ and jumps always land on step 0 (before any reveal). Steps may have gaps (1, 3, 7); the keys walk the ones in use.
- In Build mode without a preview, the arrows move between slides and the stage shows every layer.
- Step dots (a slide's **Show step dots in Present**) draw one dot per step under the slide in Present; click one to jump to it.

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
- **Right panel (resizable), tabs: Content / Theme / Slides / Builds.** Content holds the markdown.
  - **Theme** (the whole deck; not on undo): background (filter by kind: solid, gradient, moving, pattern, image; upload your own image, with scale, repeat, vertical position and offset), colour scheme (Original, presets or Custom), motion settings for moving backgrounds (speed, count, opacity), palette (the slide colour tokens `primary`, `secondary`, `tertiary`, `impact`, `text`, `muted`, `onPrimary`; palettes that pair with the scheme come first), slide surface (Clear, Frosted, Card), typography (heading / body / mono fonts as a set), text styles, and the Canvas section (title page, row and column step, Even steps vs Fit subtrees, transition time). Changing the theme restyles every slide.
  - **Slides:** the template grid (templates that fit this slide's shape first, then the others; click one to apply it), the current template's status with ↺ Reset to default, **This slide / Layout**, rename/delete, **Apply to all**, **Save as template** and **Update “…” from this slide**, template options (Title bar: Band / Underline / None; List panel side: left / right), placeholders (click to edit that text in Content), the selected layer's properties and the layer list (z-order, show/hide, + Text / Image / Shape / Icon / Component). **Your templates** lists the ones you saved, to rename or delete.
  - **Stage toolbar** (above the stage): Select (**V**), Text (**T**), Rectangle (**R**), Rounded rectangle, Ellipse (**O**), Line (**L**), Arrow (**A**). Drag on the slide to draw (Shift: circle or square); a Text click adds a Body text box. The tool then goes back to Select; Esc does too. Shapes take a fill token and fill opacity, a border (width and style) and how overlaps blend (Stack / Blend colours).
  - **Builds** (a port of `design/slides/build/Builds.dc.html`):
    - **Elements:** every layer with its step badge (`–` = always visible) and its transition (" · replaced by next" on detail panels when they replace). **Set order by clicking** starts ordering mode: every layer you click, on the slide or in the list, joins the current step (amber badge); **Next step → N** starts the next one, **Done** ends it on the last step, **Clear and start from step 1** removes every step. Each click is one undo step; the title can't be assigned. While ordering, stacked detail panels show one at a time and the **Stacked here** chips over the slide assign (and reveal) the others. Clicks assign rather than select, and nothing drags.
    - **Step N · enters together:** the step's members and its transition (2×4 grid). Picking one replays the step.
    - **Timing · whole slide:** Quick 250 / Normal 500 / Slow 900 ms; Ease out, Springy or Linear. Changing it replays the selected step.
    - **List behaviour** (list slides): earlier list items Keep or Dim (to 45%); detail panels Replace previous or Build up.
    - **Show step dots in Present.**
    - **Step strip** (under the stage): ◀ ▶, Play / Pause and a chip per step (Step n, its transition). A chip or ◀ ▶ previews that step on the stage; Play walks the steps (one every duration + 1.1 s) and stops at the end. Leaving the tab or Esc ends ordering, play and the preview.
    - Linked-in slides refuse ordering and transition changes ("Linked slides are read-only here…"), but preview works.
- **Undo / redo:** ⌘Z / ⇧⌘Z / ⌘Y covers node, layer, step, transition and template edits (theme and text style edits aren't on undo).

## Design tokens (editor chrome)
- Dark palette: page `#16181D`, panel `#1B1E24`, control `#23262E`, line `#2C3039`, active `#343944`
- Text `#E8EAEE`, secondary text `#C3C8D2`, muted `#9AA1AD`
- Accent `#7AA2FF` (text on accent `#0B1020`), selected card `#2A3A5C`, current step amber `#FBBF24`
- Type:
  - UI: **Bricolage Grotesque** 14px (headers 600–800)
  - Labels: **JetBrains Mono** 10–11px, uppercase, letter-spacing .14em
  - Slide fonts also include DM Serif Display and Newsreader (Google Fonts)
- Radii: 5–10px on controls, 999px on pills. Panel sections are bordered with a 10px radius.

## Assets
- `design/backdrops/`: `countryside-balloons.png` (the default, aspect 1.5 w/h), `london.png` (1), `under-the-sea.png`, `space.png` and `forest.png` (tall, 0.4), plus the tall `sky.svg` and `ocean.svg` templates (≈ 0.4). Users can also upload their own (SVG preferred).

## Files
- `design/strata.dc.html`: the full app (template + logic). This is the source of truth.
- `design/Layers.dc.html`: renders a layer list onto a 16:9 slide (used by the stage, thumbnails and maps).
- `design/backdrops/*`: template backgrounds.

## Suggested build order
1. Data model, store and undo/redo, plus localStorage persistence and JSON import/export.
2. Tree panel (CRUD, reorder, keyboard).
3. Layout and parallax maths, and the present-mode camera with arrow navigation.
4. Breadcrumbs and search.
5. Layer editor (select, drag, resize, rotate, text editing, images, paste).
6. Theme (backgrounds, schemes, palettes, fonts, surface) and templates.
7. Builds (steps, transitions, timing, preview), links, wireframe view and step dots.

### Text styles
Text layers use deck-wide named styles: built-in **H1, H2, H3, Body, Bullets**, plus your own. Theme tab → **Text styles**: rename, size, weight and line height, how many layers use each, **+ New style from selected layer**, and delete (layers using a deleted style keep their look and become Custom). Headings use H1, H2, … by depth and paragraphs Body; fonts and colours come from the theme (`head` / `body` / `mono`, `text`). An extra text layer (one added in Strata) can pick its Style and override its size (↺ resets it); markdown layers take theirs from the markdown. Saved in the layout file (only what differs from the built-ins). Style edits aren't on undo. Linked-in slides use this deck's style of the same name, else their own.

### Templates
A slide's **shape** is its markdown blocks counted by key (e.g. `title ×1 · body ×2`; a list counts once); extras added in Strata don't count. A **template** arranges that content: it matches one shape and places each block in a region. A slide uses its template, else the deck default for its shape, else the first built-in that fits. Picking a template that doesn't fit still applies it: blocks it has regions for are placed, the rest show with a ⚠️ badge. With **This slide**, moving or resizing an element makes a per-slide override; with **Layout**, it updates the shared template instead. Built-in templates can be renamed and updated; your own can be deleted. Saved in the layout file.

Two templates follow markdown conventions:
- **List + detail:** a heading, then a list, then a blank line, then one paragraph per bullet. The list sits in a side panel (left or right) and the paragraphs stack in one place as **detail panels**, so with build steps each bullet can bring in its own detail:
  ```
  # How the theme is built
  - Background
  - Colour theme

  One picture behind the whole deck.

  Primary, secondary and tertiary colours, plus one impact colour.
  ```
- **Statement:** a heading (shown small, as a kicker) and two paragraphs: the statement, then a punchline in the `impact` colour. Pick it from the grid (a heading with two paragraphs defaults to Stacked 2).

### Inline formatting
Inside a text layer, `**bold**`, `*italic*` and `[words]{style=h2 size=72 color=#d9432b font=serif weight=600}` format part of the text (escape with `\*`, `\[`, `\{`; anything malformed shows as typed). While editing a text layer, a formatting bar (**B**, *I*, Style, Size, Colour, Clear; ⌘B/⌘I) wraps the selection for you. Links work the same way: `[the costs]{link=costs}` links words to a slide (linked-in slides too, e.g. `link=team-a.costs`) and `[the report]{href=https://…}` to a web page (only `http(s):` targets); the bar's **Link ▾** sets them. Linked words are underlined and clickable in present mode; a link to a missing slide shows a dashed underline. In the markdown, a `[link:slug][label]` chip or `[text](url)` in the middle of a sentence becomes an inline link (a slide's chip lines, `- [link:slug][Label]` or `- [Label]{link=slug}`, become one bulleted link list in a card, using the built-in **Bullets** style; lines of only web links become source links).

### Components
**+ Component** (Layers) adds a live, sandboxed HTML/CSS/JS snippet you place and animate like any layer. Paste code into its editor and **Apply**. It talks to the slide through a `strata` helper: it hears `enter` (with the slide's current `step` and its number of `steps`) and `step` (`n`, `steps` and the slide's reveal `duration`), can claim the presenter's → / ← (`strata.ready({ steps: true })`, then `next` / `prev`, handing back with `strata.done()` / `strata.back()`), and can `strata.jumpTo('slide')` or `strata.nav('right')`. **Copy AI guide** copies a brief for an AI to write one; **Interact** lets you click into it while editing. A second → overrides a component that stops responding.
