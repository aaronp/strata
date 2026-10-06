# Strata: save-to-repo and static publish

## Goal
Clone the repo → `make dev` → author a deck in the browser → save it into the repo → push → GitHub Pages serves a present-only version.

## Decisions
- Evolve the existing prototype (`design/*.dc.html` + `support.js`) in place; no React rewrite.
- Multiple decks per repo, one folder each.
- Published site is present-only; editing happens locally via `make dev`.

## Repo layout
```
Makefile                      dev / build / clean
server.ts                     bun dev server, no dependencies
design/strata.dc.html         app (renamed from "Strata v7.dc.html")
design/Layers.dc.html, support.js, backdrops/   unchanged
decks/<slug>/deck.json        deck data
decks/<slug>/img/<hash>.<ext> extracted images and custom background
.github/workflows/pages.yml   build + deploy to Pages
```

## Deck file (`deck.json`)
Persisted fields only (no UI state such as `mode`, `view`, `navW`, `secOpen`):
`nodes, bg, customBg, customAspect, opacity, base, offset, margin, gap, tone, speed, tdef, images`.
`images[key]` and `customBg` are paths relative to the deck folder (e.g. `img/3f2a….png`), or `data:` URLs before save.

## Dev server (`server.ts`, run by `make dev`)
- Static: `/` → generated deck list page (links + "New deck" form); `/design/*` and `/decks/*` → files.
- `GET /api/decks` → `["slug", …]`.
- `PUT /api/decks/:slug` → body is the deck JSON. Every `data:` URL in `images` and `customBg` is decoded, written to `decks/<slug>/img/<sha1-12>.<ext>` (ext from MIME type), and replaced by that relative path. Then `deck.json` is written (pretty-printed for diffable commits). Responds with the rewritten deck.
- Slugs are validated as `^[a-z0-9-]+$`; anything else gets a 400 (no path traversal).
- Binds to localhost only.

## App changes (`strata.dc.html`)
- Reads `?deck=<slug>`. If present, fetches `../decks/<slug>/deck.json` and resolves relative image paths against the deck folder. A missing deck starts from `seed()`.
- No `?deck` → current localStorage behaviour (scratch mode).
- localStorage keeps only UI preferences (panel widths, section open state).
- Build mode gains a **Save** button and ⌘S, which call `PUT /api/decks/:slug` and apply the returned deck. A dirty indicator shows unsaved changes. Save failures show the error inline and keep the unsaved state.
- If `window.STRATA_STATIC` is set: force `mode: 'present'` and hide the mode tabs, undo/redo and Save.

## Publish (`make build` → `dist/`)
- Copies `design/` and `decks/` into `dist/`.
- Writes `dist/decks/index.json` (slugs + titles) and a static `dist/index.html` that lists decks and links to `design/strata.dc.html?deck=<slug>`.
- Injects `<script>window.STRATA_STATIC=true</script>` into `dist/design/strata.dc.html`.
- All URLs are relative, so it works under `https://<user>.github.io/<repo>/`.
- `pages.yml`: on push to `main`, set up bun, run `make build`, then upload and deploy `dist/` with `actions/upload-pages-artifact` + `actions/deploy-pages`.

## Testing
- `server.test.ts` (`bun test`): PUT a deck containing a data-URL image → file exists in `img/`, `deck.json` holds the relative path, and a bad slug is rejected.
- Manual check: `make dev` → create deck → add image → save → `make build` → serve `dist/` → deck presents with the image, and build UI is absent.

## Out of scope
Auth, concurrent edits, orphaned-image pruning (later: `make prune`), the React rewrite.
