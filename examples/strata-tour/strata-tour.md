<!--
Presentation source: Strata tour
Purpose: a deck that explains Strata by being one. Open it in Strata to see each point in action.

Parsing conventions:
- Heading depth defines parentage; siblings form the horizontal sequence.
- Each heading is immediately followed by slug: <unique-short-slug>.
- Slug lines and this comment are metadata, not slide content.
- Internal navigation uses [link:<slug>][label]; external sources use ordinary Markdown links.
-->

# Strata tour
slug: tour

A deck is one markdown file. Slides form a tree, not a line: go → for the next topic, ↓ to dig into one.

[link:headings][How slides are made]
[link:keys][Presenting]
[link:sharing][Sharing a deck]

# Headings are slides
slug: headings

Every heading is a slide. `#` headings are the top row; a `##` under one is its child, one level down.

Put `slug: <id>` on the line after a heading so the slide keeps its id (and its layout) when you rename it.

## Depth
slug: depth

This is a `##` slide: press ↑ to go back up to its parent, ← → to move between its siblings.

### Deeper still
slug: deeper-still

A `###` slide, two levels down. The tree can go as deep as the story needs.

## Blocks
slug: blocks

Each paragraph is a body block, each list a list block, each image an image block.

- `- ` or `* ` lines make a list
- `![alt](url)` makes an image, relative to the markdown file
- lines of `[link:slug][Label]` make a row of chips that jump to that slide

<!-- block -->
Wrap paragraphs in a block comment…

…and they become one body block, laid out together.
<!-- /block -->

# Layouts
slug: layouts

The markdown holds the words; `strata-tour-layout.json` beside it holds everything else: layouts, per-slide overrides, styles, frames, the background.

In the Slide tab, **This slide** edits just this slide; **Layout** edits the shared layout for every slide with the same blocks. Content no layout region claims still shows, with a ⚠️ badge: click it to give it a place.

# Links
slug: links

Jump anywhere in the tree with a link line, or cite a source with an ordinary markdown link.

[link:tour][Back to the start]
[link:deeper-still][The deepest slide]

[The Strata repository](https://github.com/aaronp/strata)

# Stitching decks
slug: stitching
<!--
children:
  ./linked/children.md
-->

A slide can take its children from other markdown files. Press ↓: the slides below this one come from `linked/children.md`, fetched only when you get there.

# Presenting
slug: keys

- ← → siblings, ↑ ↓ levels
- Space / Shift+Space step through every slide in order
- / searches, T cycles Slides · Tree · Radial
- B shows or hides the breadcrumbs, F toggles fit

# Sharing a deck
slug: sharing

Put the markdown anywhere public (a GitHub repo works) and share a link:

- `https://aaronp.github.io/strata/?src=<markdown url>`
- add `&slide=<id>` to open on a slide, e.g. `&slide=stitching.joining`
- GitHub `blob` links are fine: Strata fetches the raw file
