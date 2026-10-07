# Strata: title page

## Goal
An optional **title page**: one slide above the top row, with no siblings. Its background is the whole canvas (the Wireframe view's backdrop, without rects or lines) scaled into the 16:9 slide, so the viewer sees the whole presentation at once. Otherwise it is an ordinary slide: layers, frames, frame transitions, links.

## Decisions
- **ROOT is the title page.** `ROOT` already has no siblings and sits above the top row. No new node, no re-parenting.
- **Opt-in.** A deck flag turns it on. Decks without the flag behave exactly as they do now.
- **No rect in the canvas layout.** `derive()` and `layout()` are unchanged, so slide sizes and level count stay the same.
- **Zoom/pan framing.** At zoom 1 the whole canvas fits the slide's width, letterboxed in `base` colour. The user can zoom in and pan.
- **Camera-zoom transition** between the title page and the top row.

## Data
```ts
type Deck = { …;
  titlePage?: boolean;                                // title page on; absent/false = current behaviour
  titleView?: { zoom: number; x: number; y: number }; // zoom ≥ 1 (multiple of fit-to-width); x, y ∈ [0,1] focus point on the canvas
};                                                    // default titleView: { zoom: 1, x: 0.5, y: 0.5 }
```
- `titlePage` and `titleView` join `DECK_FIELDS` (saved, loaded, published).
- With the flag on, `ROOT` uses the normal slide fields: `title`, `frames`, `ftrans`, `showFrames`.
- **First enable:** if `ROOT` has no `title` and no `frames`, set `ROOT.title` to the deck title (`S.title`, falling back to the first top-level slide's name). The existing `defaultLayers()` then render it as a big centred title, with no frame seeding needed. Enabling also navigates to ROOT.
- **Disable:** clear the flag only. `ROOT`'s frames stay, so turning it back on restores them.
- **Markdown re-import** already keeps `old.ROOT`'s fields (`importer.ts:41`), so the title page survives. The importer leaves `titlePage`/`titleView` untouched, the same as other deck fields.

## Navigation (only when `titlePage` is on)
- `neighbour(id, 'up')`: a top-level slide (parent `ROOT`) returns `'ROOT'`, not `null`.
- `neighbour('ROOT', 'down')`: `lastChild.ROOT` if it is still a child, else `ROOT.children[0]`. This already falls out of the existing code, because `nav()` records `lastChild` up the path; the loop just has to also record `lastChild.ROOT`.
- `neighbour('ROOT', 'left' | 'right')`: `null`. ← / → only step frames.
- **Space / Shift+Space:** the depth-first order is `['ROOT', ...D.order]`. `step()` uses this list, and `dd` treats ROOT as depth −1.
- **Opening a deck** (the builder or the published site) starts on `ROOT`. The builder's Present button keeps the current slide, as it does now.
- **Valid `cur`:** everywhere that currently falls back with `N[cur] ? cur : ROOT.children[0]` (`curId()`, `render()`, load, delete) accepts `'ROOT'` only when the flag is on. Turning the flag off while on ROOT moves `cur` to `ROOT.children[0]`.
- **Links:** `slideOptions` lists ROOT first (as "Title page") when the flag is on. `jumpTo('ROOT')` works.

## Rendering

### Camera
- `camOf(id)` always returns `translate(tx%, ty%) scale(s)` with `transform-origin: 0 0`. Normal slides: `s = 1` and the same translate as now, so their output doesn't change. Using the same function list on every slide lets CSS interpolate between them.
- **`camOf('ROOT')`:** the camera plane is `CW / L.w` stage-widths wide (`CW = L.CW + L.w`, which includes one viewport of right-hand slack) and `H / L.h` stage-heights tall, at `s = 1`. The framing uses the **content width `L.CW`**, not `CW`, so the slack doesn't show as an empty band.
  - `s = zoom · L.w / L.CW` makes the content width equal the stage width at zoom 1.
  - The scaled content is `Wc = L.CW·s / L.w` stage-widths by `Hc = H·s / L.h` stage-heights.
  - **Per axis:** if the scaled size is ≤ 1, centre it (`t = (1 − size) / 2`). Otherwise put the focus point at the stage centre (`t = 0.5 − focus·size`), clamped to `[1 − size, 0]`.
  - Translate percentages are relative to the plane's own unscaled size, so divide `t` by the plane's size in stage units: `tx% = t_x / (CW / L.w) · 100`, and likewise for y.
- **Fit** = zoom 1. **Cover** = the zoom at which `Hc = 1`, i.e. `zoom = L.CW·L.h / (H·L.w)`, which is ≥ 1 for any canvas wider than 16:9.
- The tree thumbnail and the stage share `camOf`, so ROOT's thumbnail shows the real framing.

### Transition
- `nav()` between `'ROOT'` and any slide uses a new type, `'zoom'`. The camera transitions as now (`camTransition`), and the layer planes crossfade (the same plane opacity handling as `'fade'`).
- ponytail: separately interpolating translate and scale makes the path drift a little instead of locking onto a fixed point. If that looks off, the upgrade is a rAF tween of a fixed-point zoom.

### Editing the framing
On the right panel's Slide tab, when `cur === 'ROOT'`, a **Title view** box contains:
- a **Zoom** slider (1×–8×, plus whatever Cover needs if that is higher), with **Fit** and **Cover** buttons;
- **Pan X** and **Pan Y** sliders (0–100%). They have no effect on an axis where the canvas is letterboxed; the hint text says so.
- Edits are not on undo/redo. Undo covers `nodes` only, the same as every other Canvas setting.
- Skipped: dragging on the stage to pan. It clashes with marquee/layer selection. Add as Alt-drag if wanted.

### Tree panel
- With the flag on, `ROOT` is a node centred above the top row and joins the existing top-row connector bar. Everything else moves down one row (`TPY` + one row).
- Allowed: select, rename (the title fills the deck-title fallback), and a "+ below" button that adds a top-level slide.
- Not allowed: delete, drag, + sibling, and Enter/⌫ on ROOT, which do nothing.
- Collapse is not offered on ROOT.

### Canvas tab
A **Title page** checkbox sets `titlePage` (first enable seeds as above).

### Breadcrumbs (present view)
- On ROOT: the top row of crumbs with nothing current, plus the ↓ marker under the first step. Clicking a crumb navigates there using `'zoom'`.
- Elsewhere: a small ⌂ crumb before row 1 that jumps to ROOT.
- The bottom ↑ pill on top-level slides reads "↑ Title page", or ROOT's title if it has one.

### Wireframe view
When the flag is on, a dashed rect shows the title page's visible region on the canvas, i.e. the inverse of `camOf('ROOT')`. ROOT has no slide rect.

## Unchanged
- `derive()`, `layout()`, background tiling, and decks without `titlePage`.
- `server.ts` (the card thumbnail still uses the first top-level slide).
- `build.ts`.

## Testing
In `app.test.ts` (the logic class driven headless):
- `neighbour` with the flag off: identical to now (up from top-level → `null`).
- `neighbour` with the flag on: up from a top-level slide → ROOT; ROOT down → the last-visited top-level slide, else the first; ROOT left/right → `null`.
- `step()`: Space from ROOT → the first top-level slide; Shift+Space from the first top-level slide → ROOT.
- `camOf('ROOT')`:
  - zoom 1 on a wide canvas: x translate 0, scale = `L.w/L.CW`, vertically centred;
  - Cover: scaled height fills the stage;
  - pan x = 1 at high zoom: clamped to the right edge.
- Enabling seeds one text layer; disabling keeps `ROOT.frames`; re-enabling doesn't reseed.
- Turning the flag off while `cur === 'ROOT'` moves `cur` to the first top-level slide.
- Save/load round-trips `titlePage` and `titleView`.

In `importer.test.ts`: re-import keeps `ROOT.frames`.

Manual check in `make dev`: enable on `digital-wallets` (canvas 20.5:1), then check Fit/Cover/pan, the ↑/↓ zoom transition, the tree node, breadcrumbs and the wireframe rect, and that present mode opens on the title page.
