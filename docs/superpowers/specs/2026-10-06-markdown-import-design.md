# Strata: markdown import and deck composition

## Goal
Write a presentation as a markdown file and turn it into a Strata deck. Heading depth becomes slide depth, and `[link:…]` references become clickable layers between slides. The markdown stays the source of truth for content: re-importing updates text and structure but keeps layout work done in the builder. Each markdown file maps 1:1 to a deck via `make import`. Bigger presentations are built in the builder by **live-including** other decks at any slide.

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
| `md-link-<n>` | text + `link: { type: 'slide', id }` | `label →` | x 66, y 24 + n·11, w 28, h 9, size 22; chip look via its own container (`card: 'custom'`, white 75%, radius 12, padding 12). Earlier imports used a separate `md-linkbg-<n>` shape, which re-import removes |
| `md-src-<n>` | text + `link: { kind: 'url', url }` | `text ↗`, font mono, size 18 | x 6 + n·30, y 88, w 28, h 6 |

The body font size shrinks with text length: `size = clamp(22, 40, round(40 − (chars − 120) / 20))`.

The deck title is set from the first top-level heading only when the deck has no `title` yet. The deck records `source` (the repo-relative path of the markdown file) when imported from the CLI.

## Re-import merge
The markdown owns the deck's whole slide tree. Re-importing into an existing `decks/<slug>/deck.json` works as follows:

1. **Structure.** After the import, the slides are exactly the markdown's sections, with their parentage and sibling order. Slides that aren't in the markdown are removed (git restores them).
2. **Identity.** A slide whose slug already exists is the same slide.
3. **Content, owned by the markdown** and rewritten on every import: node `title`, node `body`, and the text and `link` of every `md-*` layer. `md-*` layers that are no longer generated are removed from every frame. New ones are added to every frame with default geometry.
4. **Presentation, owned by the builder** and kept on re-import:
   - the geometry and style (x, y, w, h, rot, opacity, hidden, font, size, weight, color, align, fill…) of existing `md-*` layers;
   - all non-`md-*` layers;
   - the frames themselves, `ftrans` and `showFrames`;
   - each slide's `include`;
   - all deck-level settings, including `title` once it is set.

## Deck composition (live include)
- **Setting an include.** Any slide without child slides can carry `include: "<deck-slug>"`. In the builder, the Slide tab has an **Include deck** dropdown (None, or any other deck from `GET /api/decks`). It is disabled when the slide has children, with the hint "Remove child slides first".
- **Loading (runtime graft).** After a deck loads, every `include` is resolved. The app fetches `../decks/<B>/deck.json` and grafts B's slides under the including slide T:
  - B's slides become T's children, in B's order.
  - Grafted node ids are prefixed with the include path (`B:` for B's slides, `B:C:` for a deck C that B itself includes).
  - Slide links (`link.kind === 'slide'`) inside grafted layers get the same prefix.
  - B's image keys are prefixed too, and their paths are resolved against B's folder (`../decks/B/img/…`).
  - T keeps its own title, body and layers as an intro slide.
  - B's deck settings (background, theme, title) are ignored.
- **Read-only in the including deck.** Grafted slides can be viewed, navigated, presented and linked to, but not edited. One guard enforces this: when a nodes change touches a grafted node or an including slide's children, the change is reverted and the header shows "Included from <B>; open it to edit". The Slide tab shows an **Open <B>** link for grafted slides.
- **Saving.** Grafted nodes and images are stripped before saving. Including slides are saved with `children: []`. A deck's `deck.json` never contains another deck's slides.
- **Failures.** A missing deck, or an include cycle (A→B→A), shows an error slide in place of the graft ("Can't include <B>: …"). The rest of the deck still works.
- **Links.** Slides in A may link to grafted slides, and those links are saved with their prefixed ids (e.g. `B:seller`). Markdown can't link across decks.
- **Published site.** Includes resolve the same way, because `make build` copies every deck.

## Errors
The import aborts without writing anything if it finds any of the following. All of them are reported together, each with its line number:
- a duplicate slug in the file;
- an internal link ref that resolves to nothing;
- a short ref that matches more than one slide;
- a heading that skips a level (e.g. `#` then `###`);
- an invalid explicit slug.

Missing slug lines produce warnings only.

## Components
- `markdown.ts`: `parseMarkdown(text) → { sections: Section[], warnings, errors }`. This is a pure function with no I/O.
- `importer.ts`:
  - `importInto(deck, sections) → { deck, errors }`, also pure. It resolves links against the merged deck and applies the merge rules.
  - A CLI entry point: `bun importer.ts <file.md> [slug]`, or `bun importer.ts --deck <slug>` to re-import from the recorded `source`. It loads `decks/<slug>/deck.json` if present, runs the import, and writes through `saveDeck`.
- `Makefile`: `import:` → `bun importer.ts $(MD) $(SLUG)`, or `--deck $(DECK)`.
- `design/strata.dc.html`:
  - grafting includes after load (`graftIncludes`);
  - the read-only guard (in `componentDidUpdate`, next to `histTrack`);
  - stripping grafts in `save()`;
  - the Include deck dropdown and the Open <B> link in the Slide tab (both hidden when `STRATA_STATIC` is set).

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
  - a slide's `include` survives re-import.
- An end-to-end test: importing `examples/current-situation.md` (copied to a test fixture) yields 55 slides (5 levels), and every `md-link-*` layer targets an existing node.
- `app.test.ts`:
  - including a deck grafts its slides with prefixed ids, links and images;
  - editing a grafted slide is reverted;
  - saving strips grafts;
  - a missing deck or a cycle shows an error slide;
  - the Include dropdown is hidden when static.

## Out of scope
Markdown import from the builder UI, including decks by copy, editing included slides in place, cross-deck links written in markdown, rich inline text (mixed bold and links within one text layer), images in markdown, live file watching, and exporting a deck back to markdown.
