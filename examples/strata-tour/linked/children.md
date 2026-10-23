<!--
Linked into strata-tour.md by the "Stitching decks" slide. Its slide ids are namespaced: stitching.<slug>.
-->

# Another file
slug: another-file

These slides live in `linked/children.md`. They're read-only from the host deck: open the file itself to edit them.

# How it joins
slug: joining
<!--
children:
  ./deeper.md
-->

A `children:` comment under a heading lists files, by URL or relative to this file. Press ↓ again: the slides below come from `linked/deeper.md`.

# Loops are caught
slug: loops

A file that links back to one above it shows a single `Can't link` slide instead of looping forever.
