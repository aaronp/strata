# Strata: WYSIWYG text editing

## Goal
Edit a text layer in place, looking as it does on the slide. Bold shows bold and linked words show underlined; you select words and format or link them directly. This is step B of "A then B": the stored form stays the inline markup from `2026-10-08-inline-formatting-design.md`, so markdown, export, search and present-mode rendering are unchanged.

## Decisions
- **A small editor of our own, built on runs**, in a `contentEditable` box. No editor library.
- **WYSIWYG is the default.** A **</>** toggle switches the same layer to today's markup textarea.
- **Operations work on source runs by plain-text offset,** then the runs are turned back into markup. The browser handles typing within a line; everything structural is taken over.
- **Links are never followed while editing.** A popover shows a link's target, with Change and Remove.
- **Tests:** pure parts are tested headless with Bun. Browser glue is tested with **happy-dom**, the project's first dev dependency. The real-browser behaviour that's left (typing, IME, paste from other apps, popover position) goes on a manual checklist for Chrome and Safari.

## Model
### Source runs
`parseRich(line, lookup, { raw: true })` returns runs holding only what the markup states:
```
{ text, b?, i?, style?, size?, color?, font?, weight?, link?, href? }
```
- `style` is kept as the id. It is not expanded.
- **Innermost wins.** When a span sets `style`, character settings inherited from an outer span (`font, size, weight, color, ls`) are dropped unless that same span sets them.
- Non-raw parsing, as used for display, is unchanged.

**Display of a source run** = its style's character settings, overlaid by its explicit ones. That matches what `resolveLayer`'s `_lines` gives today.

### `runsToMarkup(runs) → string` (one line)
- **Merging:** adjacent runs with identical keys are merged first.
- **Escaping:** text escapes `\ * [ ] { }`.
- **Span attributes:** a run with any of `style, size, color, font, weight, link, href` becomes `[inner]{k=v …}`, with keys in that order.
- **Bold and italic:** `inner` is the text wrapped as `**t**`, `*t*` or `***t***` for b, i or both.
- **Spaces:** leading and trailing whitespace is moved outside the emphasis markers, and outside the span when the span has only emphasis. A run that is entirely whitespace isn't wrapped in emphasis.
- **Empty runs** are dropped. An empty line becomes `''`.

**Round trip:** `parseRich(runsToMarkup(R), _, {raw:true})` equals `normalise(R)`, where `normalise` merges adjacent identical runs and drops empty ones and emphasis on whitespace-only runs.

### Lines and offsets
- The editor model is `lines: SourceRun[][]`.
- A plain offset counts characters line by line, with each line break counting as 1.
- `toPlain(lines)` gives the joined plain text.

### Operations
These are pure functions, `(lines, …) → lines`:
- **`setAttr(lines, start, end, patch)`:** splits runs at `start` and `end`, applies the patch to every run in between (`null` deletes a key), and merges.
- **`toggle(lines, start, end, key)`:** for `key ∈ {b, i}`, if every non-empty run in range has `key` it is removed, otherwise added. With `start === end`, the range becomes the word around the cursor (`\w` characters plus apostrophes), and nothing happens if there is no word.
- **`clear(lines, start, end)`:** keeps only `text` for runs in the range.
- **`insertBreak(lines, at)`:** splits the line at `at`. Both halves keep their runs' settings.
- **`insertPlain(lines, at, text)`:** inserts plain text. Its line breaks split lines, and the inserted text takes the settings of the run at `at` (the run before `at` when at a run boundary).
- **`deleteRange(lines, start, end)`:** removes the range, joining lines when it crosses a line break.

**Saving after any change:** `text = lines.map(runsToMarkup).join('\n')`, then `updLayer(cur, lid, { text })`.
- Bar and keyboard actions save at once, one undo step each.
- Typing saves on each `input` and is grouped by the existing 450 ms undo window.

## Editor surface
**The template** renders `<div contenteditable="true" data-role="wysiwyg" ref="{{ wysRef }}" …>` in place of the textarea when `S.editMode !== 'markup'`. Its position, size, font, colour, alignment, line height and container are the same as today's overlay's (`ed.*`, resolved). The template gives it no children: the app fills it.

**`buildEditor(root, lines, layer, look)`**, module-level DOM glue, sets the content:
- each line is `<div data-line="n">`;
- if the layer has bullets, a `<span contenteditable="false" data-mark>` holds the mark (•, –, ✓, →, or the number);
- each run is `<span data-run="k">` with inline styles matching `Layers`: weight or bolder, italic, `size/16` cqw, colour, font family, and underline for links;
- an empty line contains `<br>` so it has height.

**When the editor is rebuilt:** when editing opens, after an operation or a markup-view switch, and after an undo/redo that changes the edited layer's text. It is never rebuilt after ordinary typing.

**`getOffsets(root) / setOffsets(root, start, end)`** convert between the document selection and plain offsets. They walk the `data-line` divs and skip `data-mark`. They use `root.ownerDocument.getSelection()` and create `Range` objects from `root.ownerDocument`.

**`readLines(root, prevLines) → lines`** reads the edited box back:
- For each `data-line` div, it walks child nodes:
  - a `data-run` span gives `{ ...prevLines[n][k] (without text), text: span.textContent }`;
  - a bare text node, or an unknown element's text, takes the settings of the previous run on the line, or none if it's first;
  - `data-mark` and `<br>` are skipped.
- Empty runs are dropped and the line is merged.
- Text directly under `root`, outside any line div, goes into the last line.

**`beforeinput` handler** (`onWysBeforeInput`). For these input types the default is prevented and the given operation runs. The editor is then rebuilt, the selection restored, and the text saved.

| inputType | operation |
|---|---|
| `insertParagraph`, `insertLineBreak` | `insertBreak` at the selection (replacing a non-empty selection first via `deleteRange`) |
| `insertFromPaste`, `insertFromDrop` | `insertPlain` with `dataTransfer.getData('text/plain')` (replacing the selection) |
| `formatBold`, `formatItalic` | `toggle('b' / 'i')` |
| `deleteContentBackward` when the selection is collapsed at a line start, or `deleteContentForward` at a line end, or any `delete*` whose selection spans lines | `deleteRange` |
| `historyUndo`, `historyRedo` | ignored by the editor; the app's own ⌘Z handles undo |

All other input types are left to the browser.

**`input` handler** (`onWysInput`): unless a composition is in progress, `lines = readLines(root, lines)` and the text is saved. `compositionstart` sets a flag, and `compositionend` clears it and reads back.

**Keyboard** (in `onKey`'s typing branch when the target is the editor):
- ⌘B and ⌘I toggle.
- ⌘K opens the link chooser for the selection (see Links).
- Esc ends editing.

## Links while editing
- The editor has no click handler for links and never navigates.
- **`linkAt(lines, offset)`** returns the link run under the cursor and its range.
- **When the cursor is in a link run,** a popover (`data-role="fmtbar"`, so it counts as part of the bar) is positioned above the run. It uses the selection's `getBoundingClientRect()` relative to the stage, clamped like the bar. It shows:
  - **→ <slide name>** or the URL;
  - **Change**, which shows the same choices as the bar's Link ▾ (slides, Web address…) inline and applies `setAttr({ link | href })` to the link's range;
  - **Remove**, which applies `setAttr({ link: null, href: null })` to the link's range.
- **⌘K with a selection** opens the popover's chooser for that selection, so a link can be created without the bar.

## Formatting bar
- **Unchanged controls**, plus **</>**, which toggles `S.editMode` between 'rich' (default) and 'markup'. It's a session preference.
- **In 'rich' mode,** bar actions use the run operations on the editor's selection:
  - B and I use `toggle`;
  - Style, Size, Colour and Link use `setAttr`, with "Plain" or "Default" as `null`;
  - Clear uses `clear`.
- **In 'markup' mode,** they use `applyFormat` on the textarea, as now.
- **Switching modes** saves first, then opens the other view with the cursor at the end.

## Dependencies and CI
- **`package.json`** with `"devDependencies": { "happy-dom": "<current>" }`, plus `bun.lock`. `node_modules` is added to `.gitignore`.
- **`.github/workflows/pages.yml`** runs `bun install` before `bun test`.
- **`make test`** stays `bun test`. It needs `bun install` once locally, which the README notes.
- **Editor-glue tests** create their own happy-dom `Window` (`new Window()`) and pass its document's elements to the glue functions. Nothing is registered globally, so the existing tests, which check that `document` is undefined, are unaffected.

## Testing
**`app.test.ts`** (pure, through `Component.rich`):
- `parseRich` raw mode: `style` kept, inherited character settings dropped under an inner `style`, links kept. Existing non-raw tests are unchanged.
- `runsToMarkup`: escaping, span attributes in order, emphasis inside spans, spaces moved outside, merging, empty runs dropped.
- Round trip over a table of tricky cases, plus 500 seeded random run lists.
- Each operation: `setAttr` splitting and removing; `toggle` all-on, mixed and on the word at the cursor; `clear`; `insertBreak`; `insertPlain` multi-line with inherited settings; `deleteRange` within and across lines; `linkAt`.
- App glue with the editor stubbed:
  - in rich mode, bar actions update `text` through the run operations;
  - in markup mode, bar actions use `applyFormat`;
  - </> switches the mode;
  - the popover's values with the cursor in a link run;
  - Remove clears the whole link run.
- The template has the editor container, the popover and the toggle, and every `{{ name }}` is provided.

**`editor.test.ts`** (happy-dom):
- `buildEditor` structure: lines, marks, run spans and their styles, an empty line with `<br>`.
- `getOffsets` / `setOffsets` round-trip across lines and around marks.
- `readLines` after editing a span's text, inserting a bare text node, emptying a span, and putting stray text under the root.
- `onWysBeforeInput`:
  - Enter splits;
  - paste inserts plain text across lines;
  - Backspace at a line start joins lines;
  - a delete across lines joins;
  - `formatBold` toggles.

  Each prevents the default and leaves the expected `text`.
- An input during composition isn't read back until `compositionend`.

**Manual, in Chrome and Safari:** typing inside and at the edges of formatted runs, accents and IME, autocorrect, paste from a web page (formatting stripped), the popover's position near the slide's edges, and ⌘B / ⌘I / ⌘K.
