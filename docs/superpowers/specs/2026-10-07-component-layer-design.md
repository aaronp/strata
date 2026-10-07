# Strata: component layers (sandboxed iframe)

## Goal
A new **Component** layer type: a self-contained HTML/CSS/JS snippet that renders inside a sandboxed iframe on a slide. You place, size, rotate and tween it like a text or image layer. It is told about navigation (entering the slide, frame changes, next/prev keys) and can ask the deck to move (`done`, `back`, `jumpTo(slug)`, `nav(direction)`). The presenter can step a custom animation with the clicker, and viewers can interact with it on the published site.

## Decisions
- **Code lives inline in the layer** (`deck.json`), edited in a code area in the layer settings. Reuse a component by duplicating the layer or using Insert deck.
- **Isolation:** an `<iframe srcdoc>` with `sandbox="allow-scripts"` and no `allow-same-origin`. The component cannot read the app, deck data, storage or cookies. It may load CDN libraries and fetch public URLs.
- **Communication:** only `postMessage`, with every message tagged `strata: 1`. A small helper is injected ahead of the snippet so component code just uses `strata.on(...)` / `strata.emit(...)`.
- **Keys:** a component may claim → / ← (plus Space / Shift+Space) in Present mode. Otherwise keys behave exactly as now.

## Data
```jsonc
{ "id": "c1", "type": "component", "x": 10, "y": 10, "w": 50, "h": 60,   // plus rot, opacity, hidden, link like any layer
  "name": "Pendulum",                                                       // label in the layers list and placeholder
  "code": "<canvas id=c></canvas><script>strata.on('frame', m => …)</script>" }
```
New-layer default: a small working demo snippet that shows the frame number and steps a counter on `next`, so the protocol is self-documenting.

## Rendering (`design/Layers.dc.html`)
- **Live:** a component item renders `<iframe sandbox="allow-scripts" srcdoc="…" data-lid="…">`, full size and borderless with a transparent background. `srcdoc` = a minimal document (`margin: 0`, full-height body, transparent background) + the helper `<script>` + the snippet. Changing `code` changes `srcdoc`, which reloads the component.
- **Placeholder:** a dark rounded card showing `⧉ <name>`. It is used when the new `live` prop isn't set: thumbnails, layout previews, the frame strip, the transition ghost, and the slide being swiped away. Only the **main stage** passes `live` (the current slide in build and Present mode).
- **Stable keys:** an iframe must keep running across frame changes on the same slide, so the item for a layer id must not remount when frames change. If `sc-for` keys by index, give the item a stable key: the layer id. If the runtime offers no keyed lists, render component items in a separate keyed list. The plan determines which.
- **Pointer events:** the Layers root is `pointer-events: none`; the component wrapper sets `pointer-events: auto`.
  - In build mode the stage's selection overlays sit above it, so clicks select and drag the layer.
  - **Interact** (a toggle in the component's settings) makes that one layer's overlay `pointer-events: none`, so you can use the component in the editor.
  - In Present mode nothing covers it.

## Helper (injected into every component)
```js
strata.on(type, fn)        // 'enter' | 'frame' | 'next' | 'prev'
strata.ready({ steps })    // steps: true claims →/← in Present
strata.done()              // after 'next': nothing left — let the deck advance
strata.back()              // after 'prev': nothing earlier — let the deck go back
strata.jumpTo(slug)        // go to a slide (by id, else by exact title, case-insensitive)
strata.nav(dir)            // 'left' | 'right' | 'up' | 'down' | 'next' | 'prev'
strata.emit(type, data)    // low level
```
- **Automatic messages from the helper:**
  - `hello` once the document has loaded;
  - `ack` after its `next` / `prev` handlers have run;
  - `error` for uncaught errors and unhandled rejections (message + line).

## Protocol (`{ strata: 1, type, ... }`)
**Slide → component:**
- `enter` `{ frame, frames, mode: 'build' | 'present', slide: { id, title } }`: the reply to `hello`.
- `frame` `{ frame, frames }`: whenever the slide's current frame changes, while the component is on screen.
- `next`, `prev`: only to a component that claimed steps, in Present mode.

**Component → slide:**
- `hello`, `ready { steps }`, `ack`, `done`, `back`, `jumpTo { slug }`, `nav { dir }`, `error { message, line }`.

**Accepted from:** messages are accepted only when `event.source` is the window of an iframe in the main stage. The sender is identified by that iframe's `data-lid`. Anything else is ignored.

## Present-mode key routing
- **Claims:** `ready { steps: true }` records a claim for the layer, on the current slide. Claims are cleared when the slide changes or the iframe reloads. If several components claim, the topmost one (last in layer order) gets the keys.
- **→ / Space:** if a claiming component is on screen, send it `next` and do nothing else.
  - **`done`:** the deck performs the normal advance (next frame, else next slide).
  - **`ack` without `done`:** the component handled the step itself.
- **← / Shift+Space:** the same, with `prev` and `back`.
- **Override:** if a forwarded key hasn't been acknowledged (no `ack`, `done` or `back`) by the time the presenter presses the same direction again, that second press bypasses the component and the deck navigates. A hung component can never trap the presenter, while normal fast clicking still steps the component.
- **↑ / ↓, search, breadcrumbs:** behave as now; components can't claim them.
- **Build mode:** keys are never routed to components. Components still receive `enter` and `frame`, with `mode: 'build'`.

## Component-initiated navigation
- **`jumpTo`:** works in build and Present mode, using the deck's existing jump (fade). An unknown slug shows a note "Component asked for unknown slide "<slug>"".
- **`nav`:** maps to the existing tree navigation (`left`/`right`/`up`/`down`) or depth-first step (`next`/`prev`).
- **`done` / `back` without a forwarded key:** treated as `nav('next')` / `nav('prev')`. This lets a component auto-advance, e.g. when a video ends.

## Builder UI (component layer settings)
- **Add:** `+ Component` button next to `+ Text / + Image / + Shape / + Icon`.
- **Settings:**
  - Name field.
  - Code area: monospace, about 14 rows, with tab inserting two spaces. Edits are a draft until **Apply**, which writes `code` and reloads the iframe. **Revert** discards the draft.
  - Last error line: the component's most recent `error`, cleared on Apply.
  - **Interact** toggle.
  - A collapsible "How components talk to the slide" crib with the helper API and a two-line example.
- **Layers list:** glyph `⧉` and the component's name.

## Testing
- `layers.test.ts`:
  - a live component renders an iframe with sandbox `allow-scripts` and a `srcdoc` containing the helper and the code;
  - a non-live one renders the placeholder with its name;
  - the helper text is valid JS (parse it with `new Function`).
- `app.test.ts`, with message handling driven directly through the app's handler and stubbed stage iframes:
  - `hello` → `enter` with frame/frames/mode/slide;
  - frame change → `frame`;
  - messages from unknown sources are ignored;
  - claim plus → in Present: `next` forwarded, deck unmoved; `done` → deck advances; `ack` → no move; an unacknowledged → followed by a second → bypasses;
  - ← / `prev` / `back` symmetric;
  - claims cleared on slide change;
  - `jumpTo` by id and by title, unknown slug → note;
  - `nav` directions;
  - `done` without a forwarded key → advance;
  - build mode never forwards keys;
  - `+ Component` adds a working default;
  - Apply writes code; Revert discards;
  - an error message shows in settings;
  - Interact toggles the overlay's pointer events;
  - the template-names test covers the new render values.

## Out of scope
Component files shared across decks, hosted-URL components, props/config passed to a component, persisting component state across visits, and audience-to-presenter sync.
