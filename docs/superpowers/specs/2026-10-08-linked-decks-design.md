# Strata: linked decks (live sub-decks)

## Goal
A **linked node** is a slide in your deck that references another deck. The linked node is an ordinary slide you design, move and delete. Its children are the linked deck's slides: its top row and everything below it, kept live from that deck. The host deck's canvas, levels, layout and background apply throughout; only the slide nodes (layers, frames) come from the linked deck. Linked decks can contain linked nodes of their own (chaining).

**Copy deck here** stays as it is, for independent copies.

This replaces the earlier live "Include deck" (`990cf7a`, removed in `57e10d2`). Its grafting approach comes back, with three changes: an id scheme that allows the same deck to be linked twice, a linked node that can be moved and deleted freely, and markdown/publishing support.

## Decisions
- **Graft at load.**
  - Opening a deck fetches each linked deck (recursively) and adds its slides to the in-memory tree under the linked node.
  - Saving strips them again, so `deck.json` only stores the link.
  - Every existing feature (layout, navigation, breadcrumbs, search, present mode, export) works on grafted slides unchanged.
- **Ids are namespaced by the linked node, dot-separated.**
  - Slide `costs` of the deck linked at `wallets` is `wallets.costs`; through a chained linked node `future`, a slide becomes `wallets.future.y`.
  - This matches markdown's existing dotted-path links.
- **Grafted slides are read-only in the host.** You edit them by opening their deck.
- **The linked deck's own title page and canvas settings are ignored.**

## Data
```jsonc
"wallets": { "id": "wallets", "title": "Digital wallets", "body": "", "frames": [ … ],  // the linked node: your own slide
             "include": "digital-wallets", "children": [] }                           // children never saved
```
- **The id is a readable slug** (`SLUG`: `[a-z0-9-]+`), chosen when the link is created. It defaults to the linked deck's slug, with `-2`, `-3`… added if taken. It can't be renamed afterwards.
- **No children of its own.** A linked node's `children` (in memory) are exactly the graft. Adding a child or dropping a slide into it is refused, with a message.
- **The "old live include → copies" migration in `loadDeck()` is removed.** `include` means "live link" again. Decks already migrated have no `include` fields, so nothing changes for them.

### Grafted nodes (in memory only)
For linked node `L` (full id, e.g. `wallets` or `wallets.future`) linking deck `B`, every non-ROOT node `k` of B becomes node `L.k`, built as follows:
- `id: 'L.k'`, `children` mapped to `'L.' + c`, and `_from: 'B'`.
- Layer slide links are prefixed, `{ type: 'slide', id: 'L.' + id }`, across every frame (and legacy `layers`).
- Layer `imgKey`s are prefixed `'L.' + key`. `images['L.' + key]` is B's image URL, resolved into B's folder with `deckUrl(B, …)`.
- A node of B with `include: C` is itself a linked node. It is grafted recursively, with prefix `L.k`.
- The linked node's in-memory `children` are `B.ROOT.children.map(c => 'L.' + c)`.

### Errors
These become one error slide `L.!error` under the linked node, marked `_from: B`:
- a missing deck (`fetchDeck` fails);
- a loop (B is already on the include chain, starting with the host deck);
- a deck that isn't a deck.

The error slide's title is `Can't link B` and its body gives the reason. The rest of the deck loads normally. The same deck linked twice is fine, because the namespaces differ.

### Links from the host into a graft
These store the full id, e.g. `{ type: 'slide', id: 'wallets.costs' }`. If the slide disappears from B, it shows as the existing "missing slide" link.

## Saving and loading
- **`graft(nodes)`** runs on every load (builder, scratch, present, static). It returns `{ nodes, images }` with the grafts added. Loading sets `_lastNodes` so it isn't an undo step, and `markSaved()` after it, so it isn't dirty.
- **`stripGrafts(nodes)`** is used for `save()` and for the scratch-mode localStorage snapshot. It:
  - drops every node with `_from`;
  - sets every `include` node's `children` to `[]`.
- **Image keys:** save drops image keys containing `.`. Own image keys are `'im' + uid()` and never contain one.

## Builder behaviour
### Creating a link
On the Slide tab, the **Insert deck** section's mode toggle gains a third mode, **Link (live)**, beside "As children" and "Replace this slide".

In Link mode, the section shows:
- the deck dropdown;
- a **slug** input, pre-filled with the chosen deck's slug, deduplicated against existing ids and validated against `SLUG`;
- a **Link** button.

Link adds a linked node as the last child of the current slide, with:
- `title`: the linked deck's `title`, or its first top-level slide's name;
- no frames (default layers render the title);
- `include: B`.

It then re-runs `graft` and selects the new node. Creating the link is one undo step. Undo removes the node and its graft.

### The linked node
- **Editable and movable.** You edit its layers, frames and title like any slide. You can drag it anywhere, and the graft moves with it.
- **Delete** removes it and its graft immediately. There's no "delete or keep children" dialog, since the children aren't yours. It flashes "Removed link to B", and undo restores it.
- **Its Slide tab** shows: "Linked deck: **B** · `wallets` · Open it →" (`?deck=B`).
- **Refused:** "+ below", Tab, and drops "inside" it. The message is "Its slides come from B".

### Grafted slides
These are the nodes with `_from`.
- **Stage:** not editable. There are no selection overlays, layer drag, text editing or layer adding, the same as `editable` being false.
- **Slide tab:** shows "From **B**: read-only here. Open it →", and hides the editing sections (layout, frames, layers, insert deck, title input).
- **Tree:** no + / ✕ buttons and no drag. A drag attempt, Enter, Tab or ⌫ on one flashes "Slides from B can't be changed here: open B, or move/delete "<linked node title>"".
- **Catch-all guard:** if a `nodes` change alters any `_from` node, or the `children` of an `include` node (other than through `graft` itself), it is reverted with that message. This is the old `guardGrafts`, keyed on `_from`/`include`.
- **Export markdown is unavailable on grafted slides.** The button reads "Open B to export these slides".

### Tree look
- Grafted nodes get a light blue tint (`#eef3f9`, border `#9db8d3`) and a `title` of "From B".
- Linked nodes get a small ⛓ badge.
- Collapse and Focus work as usual.

### Freshness
Grafts load when the deck opens. Edits to B made elsewhere show after reloading the host. Nothing polls.

### Copy deck here
When the copied deck contains linked nodes, `copyDeck` keeps them as live links, rather than recursively copying them (today's behaviour for old includes). Copying works like this:
- A copied linked node keeps its id if free, otherwise gets `-2`… added, instead of a fresh `s…` id.
- Its `include` is kept, and `children: []`.
- After the copy, `graft` re-runs.

## Markdown
### Format
```md
## Digital wallets
slug: wallets
include: digital-wallets

Why we're looking at wallets at all.
```
The `include:` line goes immediately after the `slug:` line. The body that follows is the linked node's own slide body.

### Parser (`markdown.ts`, stays pure)
- `Section` gains `include?: string`.
- **Errors:**
  - `include:` with no `slug:` line: "a linked slide needs a slug line".
  - An invalid deck slug: "invalid deck slug".
  - Child headings under a linked section: "a linked slide's slides come from <deck>; it can't have its own".
- **Dotted links into a graft:** in `resolve()`, a dotted path whose walk reaches a section with `include` stops there. The link gets `target = ref` (the full dotted id) and `into: '<deck>'`, and it is **not** an error.
  - A bare ref (`[link:costs]`) never searches inside linked decks.

### Importer
- `importInto` writes `include` onto the node.
- `importMarkdown` checks every link with `into`. It reads `decks/<deck>/deck.json` and looks the next segment up as a node id anywhere in that deck (graft ids are flat), following a chained `include` for each further segment. Each unresolved link is a **warning**, not an error ("link target "wallets.costs" not found in deck digital-wallets", or "deck digital-wallets not found"). Imports never fail because of a link into a linked deck.

### Export (`toMarkdown`)
- A node with `include` writes its `include:` line after `slug:`, then its own body. Its children (the graft) are not emitted.
- The branch set used for keeping link chips includes grafted ids, so `[link:wallets.costs]` chips from inside the exported branch stay chips.
- `_from` nodes are never emitted on their own. The app doesn't offer export from a grafted slide; the route returns 400 if asked.

## Publishing
- **`build(root, out, deck)`** copies `deck`, plus every deck reachable through `include` fields in saved `deck.json` files, followed transitively, with loops tolerated.
- **A missing linked deck fails the build:** `build: deck "x" links to "y", which isn't in decks/`. In CI this catches a linked deck that wasn't `git add -f`'d.
- **`decks/index.json`** lists every published deck. The site root still opens `deck`.

## Unchanged
- Layout and derive maths.
- The title page.
- Copy deck "As children" / "Replace this slide" for ordinary slides.
- `server.ts` deck listing.

## Testing
`app.test.ts` (with linked decks written to the temp root):
- **Grafting:**
  - grafted ids are `L.k`, and children are mapped;
  - layer slide links and imgKeys are prefixed, and images resolve into B's folder;
  - a chain gives `wallets.future.y`;
  - the same deck linked twice works side by side.
- **Error slides:** a missing deck and a loop each give `L.!error` with the reason, while the rest of the deck loads.
- **Load and save:** the load is not dirty and not an undo step; save writes the linked node with `children: []`, and neither grafted nodes nor `.` image keys.
- **Creating a link:** creates the node with a deduplicated slug, grafts immediately, is one undo step, and undo removes the graft.
- **The linked node:**
  - dragging it moves the graft with it;
  - deleting it is immediate, with no dialog, and undo restores it;
  - "+ below", Tab and drop-inside are refused.
- **Grafted slides:**
  - add, delete and drag are refused with the message;
  - the guard reverts an edit;
  - `renderVals` reports them as not editable, with the read-only banner.
- **Copy deck:** copying a deck with a linked node keeps it as a live link with its slug.
- **Links:** a slide link from the host to `wallets.costs` navigates.

`markdown.test.ts`:
- `include:` parsing;
- the three new errors;
- a dotted link into an include, resolved without error and carrying `into`;
- `toMarkdown` writing the `include:` line, skipping the graft and keeping `wallets.*` chips.

`importer.test.ts`:
- `include` written to the node;
- a warning (not an error) for a missing linked deck and for a missing slide in it;
- no warning when the slide exists, including through a chain.

`server.test.ts`: export from a `_from` node gives 400.

`build.test.ts`:
- `DECK` publishes its linked chain;
- a missing linked deck fails the build.
