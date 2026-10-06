# Strata: markdown import

## Goal
Write a presentation as a markdown file and turn it into a Strata deck. Heading depth becomes slide depth, and `[link:…]` references become clickable layers between slides. The markdown stays the source of truth for content: re-importing updates text and structure but keeps layout work done in the builder. Imports run from the CLI (`make import`) or from the builder UI, into any node of the tree.

Reference input: `examples/current-situation.md`.

## Markdown format
- An optional leading `<!-- … -->` comment is metadata and is ignored.
- Headings `#`…`######` define slides. A heading's depth relative to the shallowest heading in the file sets its level. Siblings appear in file order.
- The line directly after a heading may be `slug: <slug>`, with the slug matching `^[a-z0-9-]+$`. That becomes the slide's id. If it is missing, the slug is generated from the heading text (lowercase, non-alphanumerics → `-`, trimmed) and a warning is printed.
- A section's **body** is the lines after its heading (and slug line) up to the next heading of any depth. Content belonging to descendant sections is excluded.
- Inside a body:
  - **Paragraphs** are separated by blank lines.
  - **Lists** are lines starting with `- ` or `* `.
  - **`**bold**`** markers are removed, keeping the text.
  - **`[text](url)`** is an external link.
  - **`[link:<ref>][label]`** is an internal link. A paragraph or list item that consists only of one internal link becomes a **link chip**. If the link appears inside other text, the label stays in that text and a chip is also added.
  - A paragraph made only of external links (e.g. `[Source: X](url) · [Y](url)`) becomes **source** layers, one per link. External links inside other text keep their link text in the body and also add a source layer.
- `<ref>` is either a slug that is unique in the deck, or a dotted path of slugs from the import root, e.g. `current.starting-again.repeat-information`.

## Mapping to the deck
For each section, a node is created with `id = slug`, `title = heading text`, and `body = the section's raw markdown body` (the slide notes). Children follow heading nesting. The node gets one frame (`id: 'f1'`) with these layers, all positioned in % of the 16:9 slide:

| Layer id | Type | Content | Default geometry |
|---|---|---|---|
| `md-title` | text | heading text, size 64, weight 800 | x 6, y 6, w 88, h 14 |
| `md-body` | text | paragraphs and plain list items, one per line; list items keep `bullets: 'disc'` only when the whole body is a list, otherwise prefixed `• ` | x 6, y 24, w links ? 56 : 88, h 60 |
| `md-link-<n>` | text + `link: { kind: 'slide', id }` | `label →` | x 66, y 24 + n·11, w 28, h 9, size 26, filled chip look: a shape layer `md-linkbg-<n>` behind it |
| `md-src-<n>` | text + `link: { kind: 'url', url }` | `text ↗`, font mono, size 18 | x 6 + n·30, y 88, w 28, h 6 |

The body font size shrinks with text length: `size = clamp(22, 40, round(40 − (chars − 120) / 20))`.

The deck title is set from the first top-level heading only when the deck has no `title` yet. The deck records `source` (the repo-relative path of the markdown file) when imported from the CLI.

## Import scope and merge
An import targets a node **T** (the hidden `ROOT` for CLI imports). The markdown's top-level sections become T's children, and **T's whole subtree is owned by the markdown**:

1. **Structure.** After the import, T's descendants are exactly the markdown's sections, with their parentage and sibling order. Descendants of T that aren't in the markdown are removed. Undo restores them in the UI, and git restores them on the CLI.
2. **Identity.** A slug that already exists in T's subtree is the same slide. A slug that exists elsewhere in the deck (outside T's subtree) is an error.
3. **Content, owned by the markdown** and rewritten on every import: node `title`, node `body`, and the text and `link` of every `md-*` layer. `md-*` layers that are no longer generated are removed from every frame. New ones are added to every frame with default geometry.
4. **Presentation, owned by the builder** and kept on re-import:
   - the geometry and style (x, y, w, h, rot, opacity, hidden, font, size, weight, color, align, fill…) of existing `md-*` layers;
   - all non-`md-*` layers;
   - the frames themselves, `ftrans` and `showFrames`;
   - all deck-level settings, including `title` once it is set.
5. T itself (unless it is ROOT) keeps its own title, body and layers. Only its children change.

## Errors
The import aborts without writing anything if it finds any of the following. All of them are reported together, each with its line number:
- a duplicate slug in the file;
- a slug that clashes with a node outside T's subtree;
- an internal link ref that resolves to nothing;
- a short ref that matches more than one slide;
- a heading that skips a level (e.g. `#` then `###`);
- an invalid explicit slug.

Missing slug lines produce warnings only.

## Components
- `markdown.ts`: `parseMarkdown(text) → { sections: Section[], warnings, errors }`. This is a pure function with no I/O.
- `importer.ts`:
  - `importInto(deck, sections, targetId) → { deck, errors }`, also pure. It resolves links against the merged deck and applies the merge rules.
  - A CLI entry point: `bun importer.ts <file.md> [slug]`, or `bun importer.ts --deck <slug>` to re-import from the recorded `source`. It loads `decks/<slug>/deck.json` if present, runs the import, and writes through `saveDeck`.
- `Makefile`: `import:` → `bun importer.ts $(MD) $(SLUG)`, or `--deck $(DECK)`.
- `server.ts`: `POST /api/import` with the JSON body `{ deck, markdown, target }`. It responds with `{ deck }`, or with a 400 and `{ errors }`. Dev server only.
- `design/strata.dc.html`:
  - **"Import markdown…"** in the Slide tab imports under the current slide.
  - **"⇣ Import"** next to the tree panel's add-top-level button imports at the top level.
  - Both open a file picker for `.md`, POST to `/api/import`, and then replace `nodes` (and `title` if it was empty). This is one undo step, and autosave persists it.
  - Errors are shown in the header message area.
  - Neither control appears when `STRATA_STATIC` is set.

## Testing
- `markdown.test.ts`:
  - nesting and sibling order;
  - explicit and generated slugs;
  - body excludes descendant content;
  - link chips vs inline links;
  - source paragraphs;
  - each error case, with its line number.
- `importer.test.ts`:
  - fresh import builds the expected nodes and layers;
  - short and dotted refs resolve;
  - re-import keeps a moved `md-body` geometry, keeps a hand-added image layer and extra frames, updates text, and removes deleted sections;
  - import under a non-root node leaves the rest of the deck untouched;
  - a slug clash outside the target is an error.
- An end-to-end test: importing `examples/current-situation.md` (copied to a test fixture) yields 55 slides (5 levels), and every `md-link-*` layer targets an existing node.
- `server.test.ts`: `POST /api/import` happy path and the 400 error path.
- `app.test.ts`: the import controls exist in the template and are hidden when static.

## Out of scope
Rich inline text (mixed bold and links within one text layer), images in markdown, live file watching, remembering a per-node markdown source for UI imports, and exporting a deck back to markdown.
