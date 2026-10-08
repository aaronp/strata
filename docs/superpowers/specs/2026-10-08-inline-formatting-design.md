# Strata: inline text formatting

## Goal
Format part of a text layer: make a word or phrase **bold** or *italic*, or give it a different size, colour, font, weight or named style. Layer-level styles, bullets and frame tweens keep working as they do.

This is step A of "A then B":
- **Now:** formatting is stored as light markup inside the text string, edited in today's on-stage textarea with a formatting bar.
- **Later:** a WYSIWYG editor that reads and writes the same markup.

## Decisions
- **Storage:** `text` stays a string, holding Pandoc-style inline markup.
- **Editing:** the existing on-stage textarea shows the markup while editing. A floating formatting bar wraps or unwraps the selection, and the slide shows the formatted result whenever editing ends.
- **Parsing:** done in the app. `resolveLayer()` adds display-only runs (`_lines`), and `Layers.dc.html` renders them as spans.
- **Markdown:** import keeps the markup instead of stripping `**`, so it round-trips.

## Markup grammar (per line)
| Markup | Meaning |
|---|---|
| `**words**` | bold: `font-weight: bolder`, relative to the inherited weight |
| `*words*` | italic |
| `***words***` | bold and italic |
| `[words]{k=v k=v}` | a span with attributes |
| `\*` `\[` `\]` `\{` `\}` `\\` | literal characters |

**Span attributes**, as space-separated `key=value` pairs with no quotes or spaces in values:
- `style=<id>`: that style's **character** settings only, `font, size, weight, color, ls`. Paragraph settings (align, valign, lh, bullets, gap, card, box) remain the layer's.
- `size=<number>`: px, the same unit as the layer's Size.
- `color=<#hex | CSS colour name>`
- `font=<font key>`: grot, serif, mono, etc., as used by the layer's Font.
- `weight=<100–900>`

Explicit attributes in a span override that span's `style`.

**Nesting:**
- Spans may contain bold, italic and spans; bold and italic may contain spans.
- The innermost setting wins.

**Spans never cross lines.** A line is the unit, because bullets are per line.

**Forgiving parsing.** Each of these is rendered **literally**, as typed:
- an unclosed `**`/`*`;
- a `[…]` not immediately followed by `{`;
- a `{…}` that doesn't close.

Nothing is ever dropped. `[text](url)` and `[link:x][label]` are therefore never spans.

**Unknown keys or invalid values** are ignored; the span still applies its valid attributes. An unknown `style` id contributes nothing.

## Runs
- **`parseRich(line, lookupStyle)`** is a module-level pure function in the app. It returns an array of runs: `{ text, b?, i?, size?, color?, font?, weight?, ls? }`.
  - Adjacent runs with identical settings are merged.
  - An empty line gives `[{ text: ' ' }]`.
- **`plainText(text)`** strips markup, turning escapes into literal characters and keeping the text of spans.
- **`resolveLayer(l, nodeId)`**, for every text layer whether styled or not, adds
  ```
  _lines = String(text).split('\n').map(line => parseRich(line, id => style lookup))
  ```
  - The style lookup is the same as for layer styles: the host's style, else a linked deck's own (`_graftStyles`).
  - `_lines` is display-only and never saved. Resolved layers are never written back.

## Rendering (`Layers.dc.html`)
- **Each line becomes a sequence of run spans,** inside the same `white-space: pre-wrap` line container:
  - `b` → `font-weight: bolder`, unless the run has `weight`, which wins;
  - `i` → `font-style: italic`;
  - `size` → `(size/16)cqw`, the layer's own scaling;
  - `color`, `font` (through the existing font map) and `ls` (letter spacing, as the layer uses it).
  - An unset run setting is left empty, so it is inherited from the layer.
- **Bullets and numbering** are still computed from the raw lines, so they're unchanged.
- **A layer without `_lines`** (e.g. rendered from raw data) is treated as one run per line. Its output looks identical to today's.

## Formatting bar
- **Shown while a text layer is being edited** (`S.editing`), as a small bar positioned above the editor overlay, or below it when the layer's top is within the bar's height of the slide top. It is marked `data-role="fmtbar"`.
- **Controls:**
  - **B**, *I*;
  - **Style ▾**: Plain, then the non-deleted named styles;
  - **Size ▾**: the Size list;
  - **Colour**: a colour input;
  - **Clear formatting**.
- **`applyFormat(text, start, end, op) → { text, start, end }`** is a module-level pure function. `op` is one of:
  - **`{ bold: true }` / `{ italic: true }`:** toggle. If the selected range is exactly `**…**` content (the markers sit just outside the range), the markers are removed; otherwise the selection is wrapped. A multi-line selection is wrapped line by line, skipping empty lines.
  - **`{ attrs: { size | color | font | weight | style: value | null } }`:**
    - If the selection is exactly the content of a span `[…]{…}`, that span's attributes are updated.
    - Otherwise the selection is wrapped in a new span.
    - A `null` value removes that attribute, and a span left with no attributes is unwrapped.
  - **`{ clear: true }`:** the selection is replaced by its `plainText`. With an empty selection, the whole text is cleared of markup.
  - The returned `start`/`end` cover the same words after the change.
- **Applying a format:** `updLayer(cur, lid, { text })`, which is one undo step. Then focus and selection go back to the textarea.
- **Remembered selection:** the textarea stores its last selection (`this._sel`) on select, keyup and pointerup. The bar uses it when focus has moved to a dropdown or the colour input.
- **Not ending editing too early:** bar buttons call `preventDefault()` on pointer-down, so the textarea keeps focus. The textarea's `onBlur` defers `stopEditing` by a tick and skips it if `document.activeElement` is inside `[data-role="fmtbar"]`. After a dropdown or colour change, focus returns to the textarea.
- **Keyboard:** while the editor has focus, ⌘B / Ctrl+B and ⌘I / Ctrl+I apply bold and italic. This is handled in `onKey`'s typing branch when `t === editRef.current`.

## Markdown
**`markdown.ts`:**
- `parseBody` no longer strips `**`.
- Heading titles keep their markup (`Section.title`).
- `plainText` is exported for the importer.

**`importer.ts`:**
- The `md-title` layer text is `s.title`, with its markup.
- `node.title` is `plainText(s.title)`.
- Slugs auto-generated from titles use the plain title.

**Export (`toMarkdown`):**
- Bodies come from layer text, so their markup is preserved.
- Headings come from `node.title`, which is plain, so heading markup isn't exported. This is a known limit; the `md-title` layer keeps its markup in the deck.

**`plainText`** has two copies, one in `markdown.ts` and one in the app, because the app can't import TypeScript. Both are tested with the same cases.

## Plain-text views (app)
These use `plainText()`:
- `lname` (the layer list and transition rows);
- slide-link labels and hotspot titles;
- the text used when a layer's name is shown anywhere.

Node titles are plain already.

## Unchanged
- Layout presets: they carry text, markup included, into the rearranged layers.
- Frame tweens: a markup change between frames swaps instantly, like text changes today.
- Layer styles: these set the baseline that runs inherit from.
- Linked decks, apart from style lookups inside spans.
- Search, which matches node titles and bodies.

## Testing
`app.test.ts`:
- **`parseRich`:**
  - bold, italic, `***x***`;
  - each span attribute, combinations, and nesting where the innermost wins;
  - `style=` brings character settings only, and explicit attributes override it;
  - an unknown key, a bad value or an unknown style is ignored;
  - malformed markup (an unclosed `**`, `[x]` with no `{`, an unclosed `{`) is literal;
  - escapes;
  - adjacent identical runs merge.
- **`plainText`.**
- **`applyFormat`:**
  - bold on and off (toggle);
  - multi-line, wrapped line by line, skipping empty lines;
  - size wrapping the selection, and updating an existing span when the selection is exactly its content;
  - a `null` attribute removed, and an empty span unwrapped;
  - clear on a selection and on the whole text;
  - the returned selection covers the same words.
- **`resolveLayer`** adds `_lines`, with style lookups host first, then linked deck.
- **The formatting bar:**
  - its render values appear only while editing;
  - ⌘B in the editor formats the remembered selection;
  - a blur into the bar keeps editing, and a blur elsewhere stops it.
- **`lname`** shows plain text.

`layers.test.ts`:
- runs render with the expected font weight and style, `cqw` size, colour and font;
- a layer without markup renders exactly as before.

`markdown.test.ts` / `importer.test.ts`:
- a body keeps `**`, `*` and spans;
- a heading with markup gives a plain `node.title` and a marked-up `md-title`;
- export followed by re-parse keeps body markup;
- the `plainText` cases match the app's.
