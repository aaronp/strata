# Strata: markdown as the source of truth

## Intent
A Strata deck is **a markdown file plus a layout file**. Anyone can keep a deck in a GitHub repo, present it from a URL, fork it and edit the markdown in any editor. Slides can link to other people's markdown files as their children, so a presenter owns the top-level slides and the look, and others own the branches they link to. It works like Wikipedia linking, but for decks.

Today markdown is imported once into `deck.json` (`importer.ts`, `markdown.ts`) and the deck is the source of truth. This flips it: the markdown and layout are saved, and the deck is rebuilt from them in memory on every load and edit. Keep as much existing code as possible: the importer, styles, layouts, grafting, present mode and breadcrumbs all carry over.

## Goals
- `.md` + `<name>-layout.json` are the only saved forms of a deck.
- Side-by-side editing: markdown on one side, the slide on the other. Typing in the markdown updates the slide live.
- Layout editing works as today, and can apply to **this slide only** or **update the shared layout**.
- Load any deck from a URL (`?src=`), including GitHub raw URLs. GitHub Pages presents from it.
- Any heading can link to other markdown files as its children, loaded lazily.
- `#`, `##`, … headings use the H1, H2, … text styles.
- Content that no layout region claims shows a ⚠️ on the slide. Clicking it adds a region for that content.

## Non-goals (for now)
- Slide edits flowing back into the markdown. Text is edited in the markdown only. Layout edits (boxes, styles, frames) go to the layout file.
- Authors pinning content to a region from the markdown (e.g. `<!-- region: right -->`).
- Revealing a list item by item. It'll be designed separately. **"Split lines into layers" is removed.**
- New custom markers like `#important#`. The existing inline `[words]{style=…}` markup covers this for now.
- Writing back to GitHub.
- Migrating existing `deck.json` decks. **All existing deck data can be deleted.**

## Anti-goals
- A markdown file that only reads well in Strata. The files must stay plain, readable markdown for people editing in their own editor or on GitHub.
- Content from someone else's markdown being able to run code or embed things in the presenter's page.

## The three parts
1. **Content:** the markdown. It's typed or pasted in the editor, or loaded from a URL.
2. **Enrichment:** content + layout → the in-memory deck, i.e. today's `nodes` structure. This is a pure function that runs on every edit (debounced). It is never saved.
3. **Layout:** `<name>-layout.json`. It holds everything that isn't content: layouts with named regions, per-slide overrides, styles, frames and sequences, iframe/animation layers, images, and canvas settings (background, spacing, transitions, title page).

## Markdown format
This builds on today's import format (`docs/superpowers/specs/2026-10-06-markdown-import-design.md`):
- **Heading nesting builds the tree inside a file.** `#` → `##` → `###`, with depth relative to the shallowest heading.
- **`slug: <slug>`** on the line after a heading gives the slide's id, as today. Without one, the slug is generated from the heading text. Layout data is keyed by slug, so renaming a heading that has no `slug:` line loses its per-slide layout. That's accepted.
- **Internal links** use `[link:<ref>][label]`, as today. **External links** use ordinary markdown links.
- **Children by link.** An HTML comment directly under a heading (after any `slug:` line) can list other markdown files as that slide's children:
  ```
  ## Team A's work
  slug: team-a
  <!--
  children:
    https://raw.githubusercontent.com/org/repo/main/team-a.md
    ./costs.md
  -->
  ```
  - URLs are absolute, or relative to the file containing them.
  - Each linked file's top-level headings become the child row, in list order, and their own nesting continues below.
  - A heading with `children:` may also have heading children of its own in the same file. The linked children come after them.
- **There is no `right:`/next field.** The parent owns the order of its children.
- **Other HTML comments,** including the leading metadata comment, are ignored.
- **Other raw HTML** in the markdown is shown as literal text and never rendered.

## Linked children (lazy)
- A linked file is fetched only when a viewer navigates into its parent slide, i.e. goes down from it, or a link or search result targets something inside it. The result is cached for the session.
- Until it's loaded, the parent shows a "▸ more" marker where its child row would be. The slide below shows a loading state. Unloaded files are not in Tree/Radial view or search.
- **Ids are namespaced** by the linking slide, dot-separated, exactly as in linked decks (`docs/superpowers/specs/2026-10-08-linked-decks-design.md`). E.g. `team-a.costs`. The same file linked twice gets two namespaces.
- **Fetch failures, non-markdown responses and loops** (a URL already on the chain above) show one error slide in place of the children, titled `Can't link <url>`, with the reason in its body. The rest of the deck works.
- **Internal links across files.** A `[link:ref]` resolves first within its own file (its namespace), then against the host's full ids. A host can link into a linked file by full id (`team-a.costs`). Following such a link loads the file. A ref that doesn't resolve once its file is loaded shows as today's "missing slide" link. It's a warning in the editor, never a parse error.
- **Linked slides are read-only** in the host's markdown editor, because their markdown lives in another file. The Slide tab shows the source URL with an **Open** link (`?src=<url>`).

## Layout resolution
For each slide, the first match wins:
1. **The host's per-slide override,** keyed by full id (e.g. `team-a.costs`).
2. **A host layout** that matches the slide's content shape.
3. **The linked doc's own `-layout.json`,** fetched alongside its `.md` (same path, `.md` → `-layout.json`). A missing one is not an error. Per-slide overrides and layouts in it apply, keyed by the doc's own ids.
4. **The built-in default** for that shape.

The host's canvas, background, transitions and title page always apply. Only slide-level layout falls back to the linked doc.

## Content blocks
A slide's content is split into **blocks**. Blocks are what layouts place and what a slide's shape counts.
| Block | Style key | Notes |
|---|---|---|
| The slide's heading | `title` | One per slide. Its text style is `h<depth>` (below), but its key for matching is always `title`. |
| Each paragraph | `body` | A paragraph is lines separated by blank lines. |
| Each list | `list` | A run of `- `/`* ` lines. |
| Link chips | `links` | All `[link:…][…]`-only paragraphs/items on the slide, as one block. |
| Sources | `sources` | All external-link-only paragraphs, as one block. |
| Each image | `image` | `![alt](url)`. |

- **Grouping.** `<!-- block -->` … `<!-- /block -->` around several paragraphs/lists makes them one `body` block.
- **Shape** is the count of blocks per key, e.g. `{ title: 1, body: 2, list: 1 }`. It replaces today's style-count signature. The built-in layouts are re-expressed in these keys, and a **Stacked** built-in is added for each `title + n × body` with n = 1–4, so prose slides have a layout.
- Free text boxes, shapes, images and iframes added in Strata are **extras**, not blocks. They don't count toward shape and never get ⚠️.

## Layouts and regions
This extends today's layouts (`docs/superpowers/specs/2026-10-09-layouts-design.md`), which match a slide's **signature** (content counted by style, e.g. `{ h1: 1, body: 2 }`) and place it into **slots** by style key and reading order.
- **Slots become named regions.** Each region has a name (e.g. `left`, `right`, `title`), a box, and a **content rule** that picks content by shape: by style key and position, e.g. "the h1", "the 1st body", "the 2nd body", "the list", "the image". Existing slot arrays become regions named after their key and index (`h1`, `body-1`, `body-2`) unless renamed.
- **Regions can be renamed** in the layout panel. Names are for people reading and editing layouts; matching stays by shape.
- **Unclaimed content.** A content block that no region in the slide's layout claims is still shown, at a default position, with a ⚠️ badge. Clicking the badge adds a region for that block to the slide's layout, at the block's current box. Whether that goes into the shared layout or the slide's override follows the current **apply** choice (below).
- **Apply choice.** The layout panel has **This slide** / **Layout** (default **This slide**).
  - **This slide** writes a per-slide override, replacing today's "custom" flag.
  - **Layout** updates the shared layout used by every slide of that shape that has no override. This is today's "Update layout from this slide".
- **Extras** (frames/sequences, free text, iframe animation layers, shapes, images not from the markdown) live in the per-slide override.
- **Per-slide overrides** store region boxes and per-block style overrides keyed by block position (`body-2`), plus extras and frames. Frames show/hide blocks by the same keys. When the markdown changes under an override, the override still wins: extra blocks get ⚠️, and entries for blocks that no longer exist are ignored but kept, so they come back if the block returns.

## Text styles from headings
- A slide's title block uses style `h<depth>`: `h1` for the top level of the host tree, `h2` one level down, and so on, capped at the deepest style that exists. Depth is counted in the host tree, so a linked file's top heading can be `h3`.
- Other blocks use the existing styles (`body`, list bullets, link chips, sources).
- The existing inline markup (`**bold**`, `*italic*`, `[words]{style=…}`) works in the markdown body.

## Editing screen (build mode)
- **Markdown editor beside the slide editor,** in a resizable split. It's a plain `<textarea>` with monospace text, no syntax highlighting, and it scrolls to the current slide's heading when you change slides.
- **Live updates.** Typing re-runs enrichment (debounced ~200 ms) and the slide and tree update. Undo in the textarea is the browser's. Undo for layout edits stays as today.
- **The tree panel** is a view of the markdown structure. Adding, deleting and reordering slides in the tree is **out of scope**. Structure is edited in the markdown. The tree's + / delete / drag controls are removed.
- **Copy markdown** copies the whole file. **Download** saves `<name>.md` and `<name>-layout.json`.

## Loading and saving
- **`?src=<url>`** loads a markdown file and its sibling `-layout.json` (if present). This is the way to present a deck from GitHub Pages. The URL must be `https:` (or same-origin).
- **Local `make dev` server:** decks live at `decks/<slug>/<slug>.md` and `decks/<slug>/<slug>-layout.json`. `?deck=<slug>` loads them, and save writes both files (replacing `PUT /api/decks/<slug>` with the deck JSON). `deck.json` is gone.
- **Static/remote:** no saving. Edits live in the browser (localStorage, keyed by `src`) until downloaded. **Present mode always shows the remote file.** Opening build mode when a local draft exists asks **Use my draft / Discard**.
- **Images** added in Strata are stored in the layout file as today (data URLs or deck-folder paths). Markdown `![alt](url)` images are content, and relative URLs resolve against the markdown file.
- **Existing decks, `importer.ts`'s re-import merge, `make import`, "Copy deck here" and deck-based `include`** are removed. Markdown linking replaces them.

## Security
- Remote markdown is data. Raw HTML is never rendered (see Markdown format). Only `http(s):` link targets are clickable.
- Iframes, scripts and other embeds can come only from a layout file. A linked doc's `-layout.json` is used for boxes and styles only; any iframe/embed layers in it are dropped. Only the host's own layout file can embed.

## Left to the builder
- How the markdown parser in `markdown.ts` is reshaped into the enrichment step, and the shape of the region content rule.
- Parsing of the `children:` comment beyond the format above.
- The visual design of the ⚠️ badge, the "▸ more" marker, the loading state and the split view.
- The exact schema of `-layout.json`, as long as it covers the parts listed under **Layout**.
