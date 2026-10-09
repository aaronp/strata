# Strata: layouts per slide type

## Goal
Layouts are named, editable arrangements, like styles.
- **Slide type:** a slide's *type* is its **signature**: its content elements counted by style, e.g. `{ h1: 1, body: 2 }`.
- **Matching:** a layout matches one signature, and places the slide's existing elements into its **slots**. Only position, size and rotation change.
- **Defaults:** the deck has a default layout per signature.
- **Custom slides:** each slide is either following its layout or **custom**, meaning you've arranged it by hand.
- **Apply to all:** updates every non-custom slide of a type.
- **Editing by example:** layouts are created and edited from slides (**Save as layout**, **Update layout from this slide**).
- **The panel** shows each layout's match, how many slides use it, and which ones, with links.

This replaces the eight content-rebuilding presets (`SLIDE_LAYOUTS`, `layoutContent`, `applyLayout`).

## Decisions
- **Layouts as deck data**, with slots filled by style key, then reading order. Applying a layout never touches content, styles, links, frames or containers.
- **Apply to all** sets the type's default and updates only slides that aren't custom. Custom slides are kept.
- **Custom** is set by any hand edit to a counted element's box, detected centrally. Layout actions, undo, and loading don't set it.
- **By example:** layouts are created and edited from slides; there's no separate layout editor.
- **Exact matching:** a layout applies only to slides with the same signature.
- **Multi-frame slides** count as custom; layouts act on single-frame slides.
- **Linked-in slides** are read-only and skipped.

## Data
```jsonc
"layouts": { "<id>": { "name": "…", "match": { "h1": 1, "body": 2 }, "slots": { "h1": [Box], "body": [Box, Box] } } },   // yours + edited built-ins (whole)
"layoutDefaults": { "body:2,h1:1": "cols-2" },                                                                                // signature key → layout id
// node:
"layout": "cols-2",   // the layout last applied; absent = never laid out
"custom": true        // a hand edit to its arrangement
```
- `Box = { x, y, w, h, rot }`, in % of the slide.
- `layouts` and `layoutDefaults` join `DECK_FIELDS`.
- **Effective layouts** are `{ ...BUILTIN_LAYOUTS, ...deck.layouts }` (a same-id entry replaces the built-in), in that order.
- **Built-ins** can be renamed and updated but not deleted. Your own layouts can be deleted.

### Built-in layouts (`BUILTIN_LAYOUTS`; `rot: 0` throughout)
| id | name | match | slots (x, y, w, h) |
|---|---|---|---|
| `title` | Title | h1:1 | h1 8,38,84,22 |
| `stacked` | Title + text | h1:1 body:1 | h1 6,6,88,14 · body 6,24,88,66 |
| `text-links` | Text + links | h1:1 body:1 bullets:1 | h1 6,6,88,14 · body 6,24,56,66 · bullets 66,24,28,60 |
| `links` | Title + links | h1:1 bullets:1 | h1 6,6,88,14 · bullets 6,24,60,66 |
| `cols-2` | Two columns | h1:1 body:2 | h1 6,6,88,14 · body 6,24,42,66 / 52,24,42,66 |
| `stack-2` | Two stacked | h1:1 body:2 | h1 6,6,88,14 · body 6,24,88,31 / 6,59,88,31 |
| `cols-3` | Three columns | h1:1 body:3 | h1 6,6,88,14 · body 6,24,27.3,66 / 36.3,24,27.3,66 / 66.6,24,27.3,66 |
| `grid-4` | Grid of four | h1:1 body:4 | h1 6,6,88,14 · body 6,24,42,31 / 52,24,42,31 / 6,59,42,31 / 52,59,42,31 |
| `image-right` | Image right | h1:1 body:1 image:1 | h1 6,6,88,14 · body 6,24,42,66 · image 52,24,42,66 |
| `image-full` | Full image | h1:1 image:1 | image 0,0,100,100 · h1 6,72,88,18 |
| `body-1` | Text | body:1 | body 8,10,84,80 |
| `body-2` | Two texts | body:2 | body 6,10,42,80 / 52,10,42,80 |
| `body-3` | Three texts | body:3 | body 6,10,27.3,80 / 36.3,10,27.3,80 / 66.6,10,27.3,80 |

## Signatures and matching
**`sigOf(layers)`** counts **counted** layers by key.
- **Counted:** visible (`!hidden`) text layers **without** a layer-level `link`, and visible image layers.
- **Not counted:** shapes, icons, components, hidden layers, and text layers with a layer-level link (sources).
- **Key:** for a text layer, its `style` if that style exists and isn't deleted, otherwise `'text'`; for an image layer, `'image'`.
- **`sigKey(counts)`** = the entries sorted by key, as `k:n` joined by `,` (e.g. `body:2,h1:1`). An empty signature gives `''`.

**A layout matches** when `sigKey(layout.match) === sigKey(sigOf(slide layers))`.

**`effectiveLayout(node)`**, for a slide's current (single) frame, is the first of:
1. `node.layout`, if it exists and matches;
2. `layouts[layoutDefaults[sig]]`, if it matches;
3. the first effective layout that matches;
4. none.

## Slot filling
**`fillSlots(layers, layout) → { [layerId]: Box }`** (pure):
1. Group the counted layers by key, and sort each group by reading order (`y`, then `x`).
2. The *i*-th layer of key *k* gets `slots[k][i]`.

Applying writes these boxes to the slide's frame 0. No other layer field changes, and uncounted layers are untouched.

## Custom tracking
**`markCustom()`** runs in `componentDidUpdate`, right after `guardGrafts()`, comparing `_lastNodes` to `state.nodes`:
- It applies to own nodes (not `_from`) present in both, with exactly one frame, and not already `custom`.
- If any counted layer, matched by id, changed `x`, `y`, `w`, `h` or `rot`, it sets `custom: true` with `setState`. The existing 450 ms burst merges that into the same undo step.

**Skipped when:**
- the commit is the one named by `allowLayout(nodes)` (a token, like `allowGraft`);
- `_restoring` is set (undo/redo), since `custom` is stored and comes back with the node;
- there's no `_lastNodes` (a load).

**Not geometry changes:** adding, removing or restyling layers.

**A slide with more than one frame** is treated as custom wherever it matters: the status label and Apply to all. Nothing is stored for it.

## Actions
Each action changes `nodes` as one undo step, and names its commit with `allowLayout`. Layout and default edits are deck settings, not on undo.
- **`applyLayout(nodeId, layoutId)`:** writes `fillSlots`, sets `layout = id` and clears `custom`. It does nothing on a slide with more than one frame, or on a linked-in slide.
- **`applyToAll(layoutId)`:**
  - sets `layoutDefaults[sig] = id`;
  - applies the layout to every own, single-frame, non-custom node whose signature matches;
  - flashes `Updated N slides · kept M custom`, where M counts matching nodes that are custom or multi-frame.
- **`resetToDefault(nodeId)`:** applies `layouts[layoutDefaults[sig]]`, falling back to the first match.
- **`saveAsLayout(nodeId)`:**
  - `match` = the signature, and `slots` = the counted boxes by key in reading order;
  - the name is `Layout N`, and the id is slugified from it and deduplicated;
  - it's added to `deck.layouts`, and the slide gets `layout = id` with `custom` cleared.
- **`updateLayoutFrom(nodeId)`:**
  - The slide's effective layout `L` gets `slots` from this slide's boxes, stored whole under `deck.layouts[L.id]` (with its `name` and `match`).
  - Then every own, single-frame, non-custom node whose effective layout is `L` is re-laid out.
  - This slide's `custom` is cleared.
- **`renameLayout(id, name)`.**
- **`deleteLayout(id)`**, for your own layouts only:
  - removes the layout from `deck.layouts`, and removes `layoutDefaults` entries pointing to it;
  - nodes with `layout === id` lose `layout` and get `custom: true`. Their boxes are kept.

## Layout panel (Slide tab → Layout)
1. **This slide:**
   - the signature as chips (`H1 ×1`, `Body ×2`, using style names, `Text`, `Image`);
   - a status: `Default · <layout>` / `Custom (<layout>) · ↺ Reset to default` / `Animated (N frames) · layouts don't apply` / `No layout for this type yet`.
2. **Layouts for this type:** a tile per matching layout.
   - The thumbnail is drawn from this slide's layers with `fillSlots` applied, rendered through `shown()`, so styles and markup are resolved.
   - The name can be edited inline.
   - **★** marks the deck default for this type.
   - **N slides** expands into a list of slide names (nodes whose effective layout is this one); clicking one jumps there and keeps the Layout tab open.
   - Each tile has **Apply** and **Apply to all**, plus **✕** for your own layouts.
3. **Actions:** **Save as layout**, and **Update "<name>" from this slide** when an effective layout exists.
4. **All layouts** (collapsible, closed): every effective layout with its match chips, slide count and jump list.

Linked-in slides show the panel read-only. Multi-frame slides show the status and nothing else.

## Removed
`SLIDE_LAYOUTS`, `layoutContent`, the old `applyLayout(lid)`, and their template and tests.

## Testing (`app.test.ts`)
- **`sigOf` / `sigKey`:** counting by style, Custom counting as `text`, images counted, and hidden layers, layer-linked text and decorations excluded; the key is canonical.
- **Matching and `effectiveLayout` fallbacks.**
- **`fillSlots`:** key plus reading order to slots; only boxes change; decorations untouched.
- **`markCustom`:**
  - a geometry edit sets `custom`, in one undo step with the edit;
  - layout actions, undo and a load don't;
  - adding a layer doesn't;
  - multi-frame slides count as custom.
- **`applyLayout`:** a multi-frame slide is untouched.
- **`applyToAll`:** sets the default, updates only matching single-frame non-custom own slides, skips linked-in slides, flashes the counts, and is one undo step.
- **`resetToDefault`.**
- **`saveAsLayout`:** match and slots from the slide, the slide uses it, deduplicated id.
- **`updateLayoutFrom`:** new slots, default slides re-laid out, custom ones kept, a built-in stored whole.
- **`deleteLayout`:** defaults cleaned, slides keep their boxes and become custom; built-ins can't be deleted.
- **Panel values:** status, tiles with ★ and counts, slide lists jump, and All layouts. Every `{{ name }}` is provided.
- **`BUILTIN_LAYOUTS`:** slot counts equal match counts, and every box lies within 0–100.
