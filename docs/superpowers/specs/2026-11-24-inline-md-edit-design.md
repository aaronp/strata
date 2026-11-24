# In-place editing of markdown text (write-back)

## Intent
Since `5e273e9`, markdown-owned text (headings, paragraphs, bullets) is read-only on the slide; only extra text boxes edit in place. The user wants the in-place editor back for markdown text, with edits written back into the markdown. Markdown stays the source of truth: the slide edit *is* a markdown edit.

## Behaviour (approved by the user)
- **Double-click** a markdown text layer on the stage (title, body paragraph, list bullet) in build mode → the existing WYSIWYG editor opens on it (bold/italic/links/formatting bar, `</>` markup toggle) exactly as for extra text boxes.
- **On commit** (blur / Esc / clicking away), the edited text replaces that block's source lines in `state.md`:
  - heading → its `#…` line (keep the `#` level, keep the `slug:` line and any `<!-- children -->` comment below it);
  - body paragraph → its lines (multi-line paragraph → multiple lines; `<!-- block -->` groups: replace only that paragraph's lines);
  - list bullet (`md-list-<n>-<i>`) → only that `- `/`* ` line (keep its marker and indentation).
  Then re-enrich as a markdown edit does today. The Content tab shows the change and scrolls to it.
- **One undo step** per commit (⌘Z restores the previous markdown and layout).
- **Enter**: inside a bullet → a new bullet line after it (new layer `md-list-<n>-<i+1>`; later bullets renumber, as any markdown edit does); inside a paragraph → a line break within the paragraph; in a heading → ignored (one line).
- **Empty commit**: an emptied bullet removes its line; an emptied paragraph removes its lines; an emptied heading is refused (restore the old text, flash "A slide needs a title — delete it in Content").
- **Not editable in place** (keep today's behaviour: select + Content tab): link-chip lists (`links` block), source-link lines (`sources`), images, linked-child (`_from`) slides (flash `RO_MSG`), and `gen-*` layers.
- **Text mapping**: the stage shows inline markup (bold `**`, italic `*`, spans `[..]{..}`) which is also valid in the markdown, so the edited layer text is written back verbatim (after the editor's existing `runsToMarkup`). Markdown that the importer rewrote (`[text](url)` mid-sentence → `[text]{href=…}`, `[link:slug][Label]` mid-sentence → `[Label]{link=slug}`) comes back in the span form; that is accepted.
- **Line positions**: blocks know their start line (`Block.line`); the writer needs each block's line span. Add `endLine` (inclusive) to `Block` in `markdown.ts` and carry `line`/`endLine` (and the bullet's own line) on md layers (not saved to the layout file).

## Non-goals
Editing linked child decks; editing chip/source blocks in place; preserving the original `[text](url)` spelling after an in-place edit.

## Tests (bun, app.test.ts / markdown.test.ts)
- `parseMarkdown` gives `endLine` for heading, multi-line paragraph, list (and per-item lines).
- Editing a title in place rewrites only the heading line (slug line kept); a paragraph edit rewrites its lines; a bullet edit rewrites only its line; the rest of `md` is byte-identical.
- Enter in a bullet adds a `- ` line; emptied bullet removes its line; emptied heading is refused.
- One undo restores the previous `md`.
- Linked slide / links block / gen layer: double-click does not open the editor.
- Steps on other bullets survive a bullet text edit.
