# Strata: named text styles

## Goal
Text layers can use deck-wide **named styles**, as word processors do: built-in **H1, H2, H3, Body**, plus styles you add. A layer chooses a style or stays **Custom**.

A styled layer can override individual settings. When you edit a styled layer, you choose whether the edit changes **this layer** (an override) or **the style**; editing the style updates every layer that uses it.

Styles cover a text layer's text settings and its **Container** (the readability box), which generalises the per-layer container.

**Out of scope:** formatting inside the text (bold/size/font on part of a text box). That is a separate, later design. It may build on these styles (e.g. a selection picks a style).

## Decisions
- **Style + overrides.**
  - A layer stores `style` plus only the settings it overrides.
  - Precedence: renderer defaults < deck readability card < style < layer overrides.
- **Editing switch.** "Edits apply to: **This layer | <Style> style**".
- **Linked decks.** Linked-in slides use the **host's** style of the same id. If the host lacks it, they use the linked deck's own definition.
- **Resolution happens in the app**, before rendering and before frame-change detection. `Layers.dc.html` is unchanged.
- **Existing layers become Custom** and are unchanged. Markdown import uses H1/Body.

## Data
**Style settings** are `STYLE_KEYS = ['font', 'size', 'weight', 'color', 'align', 'valign', 'lh', 'ls', 'bullets', 'gap', 'card', 'box']`. These are the text layer's existing text settings, plus `card` ('' | 'on' | 'off' | 'custom') and `box`, its container. Their meaning is unchanged.

**Built-ins** are constants in the app (`BUILTIN_STYLES`):

| id | name | font | size | weight | align | valign | lh | gap | bullets |
|---|---|---|---|---|---|---|---|---|---|
| `h1` | H1 | grot | 64 | 800 | left | bottom | 1.05 | 0.15 | none |
| `h2` | H2 | grot | 44 | 700 | left | top | 1.1 | 0.15 | none |
| `h3` | H3 | grot | 32 | 600 | left | top | 1.2 | 0.15 | none |
| `body` | Body | grot | 32 | 400 | left | top | 1.35 | 0.35 | none |

- All four have `color: null` and `ls: 0`.
- H1 and Body equal what the markdown importer generated for `md-title` / `md-body` before this change.

**`deck.styles`** (a new key in `DECK_FIELDS`) maps a style id to `{ name?, ...style settings }`. It holds only:
- the differences from a built-in;
- whole styles you've added.

The effective styles are `{ ...BUILTIN_STYLES }`, with each entry merged with `deck.styles[id]`, plus the added ids. Order: built-ins, then added styles in insertion order.

**Ids:**
- A new style's id is `slugify(first name)`, deduplicated against existing ids.
- Renaming changes `name`, never the id.
- Built-ins can be renamed but not deleted.

**Text layer:** gains `style?: string`. Any `STYLE_KEYS` value stored on a layer with a `style` is an override. A layer without `style` is Custom, and every existing layer is one.

## Resolution
`resolveLayer(layer, nodeId)` applies only to text layers with a `style`; everything else passes through unchanged:
```
style = hostStyles[layer.style] ?? (node._from && graftStyles[node._from]?.[layer.style]) ?? null
resolved = { ...pick(style, STYLE_KEYS), ...layer }      // the layer's own keys (its overrides) win
```
- **An unknown style id** (deleted elsewhere, or missing in both decks) resolves as Custom, using the layer's own settings.
- **The deck readability card** stays where it is today, in `Layers.dc.html`. It applies when the resolved layer has no `card`. A style that sets `card` therefore overrides the deck card, as a layer does today.
- **Every layers list** handed to `<dc-import name="Layers">` is resolved by a helper `shown(nodeId, layers)`. That covers the stage (`stageLayers`, `prevLayers`, `ghostLayers`), tree thumbnails, the frame strip, layout previews, and the transition view.
- **Frame-change detection** (the per-change table, tween timing) compares resolved layers. A size or colour that differs between frames because of a style is detected and tweened.
- **Saved layers** keep only `style` plus real overrides.
- **`graft()`** stores each linked deck's `styles` in memory as `graftStyles[deck]`. They are not saved.

## Editing
### The selected text layer (Layers tab)
- **A Style row** heads the text settings. It is a dropdown of **Custom**, then the effective styles by name.
  - **Choosing a style** sets `style` and deletes the layer's `STYLE_KEYS`, so it fully adopts the style. This is one undo step.
  - **Choosing Custom** writes the layer's resolved `STYLE_KEYS` onto it and removes `style`. Its look is unchanged. This is one undo step.
- **A switch, shown when the layer has a style:** "Edits apply to: **This layer | <name> style**". State is `S.styleTarget` ('layer' | 'style'), default 'layer'. It is a session preference, not saved with the deck.
- **This layer:**
  - The text controls (Font, Size, Weight, Align, V-align, Bullets, Line ht, Gap, colour, letter spacing) and the Container section show resolved values.
  - A change writes an override onto the layer.
  - Each overridden setting shows a dot and a **↺** that deletes that key from the layer.
  - **Clear overrides** deletes all of the layer's `STYLE_KEYS`.
- **<name> style:**
  - The same controls show the style's values (`style ?? built-in`) and write to `deck.styles[id]`.
  - Every layer using the style re-renders, except for keys it overrides. Those keep their dot.
- **Custom layers** work exactly as today.
- **Multi-select** offers no style controls. The multi-select panel has no text settings today.

### The Styles section (Canvas tab)
- **One row per effective style:**
  - an editable name;
  - "N layers", the count of text layers across all own (non-grafted) frames with that `style`;
  - **✕** on added styles only.
- **+ New style from selected layer** is enabled when a text layer is selected. It:
  - creates `Style N`, with the layer's resolved `STYLE_KEYS` as its settings;
  - sets the layer's `style` to it and clears its overrides.
- **Delete (✕):** every layer using the style gets the style's resolved `STYLE_KEYS` written onto it and loses `style`, becoming Custom and looking the same. Then the style is removed from `deck.styles`.

### Undo
- Choosing a style, Custom, an override, ↺ and Clear overrides change slides, so they are undoable.
- Editing a style's values, renaming, adding and deleting change `deck.styles`. Undo covers `nodes` only, as for every other Canvas setting, so these are not undoable. For a delete, undo restores the layers' slides but not the style.

### New layers
- **"+ Text"** creates `style: 'body'`, with no style keys of its own beyond its text.
- **Layout presets** and the default title layer of never-edited slides (`defaultLayers`) stay Custom.

## Markdown
**Importer (`importer.ts`, `layersFor`):**
- **`md-title`:** `{ id, type: 'text', style: 'h1', text, x, y, w, h, rot: 0, opacity: 1 }`. It has no other style keys.
- **`md-body`:** `style: 'body'`, plus two content-driven overrides: `size: bodySize(text)` and `bullets` ('disc' if bullets-only, else 'none').
- **Link chips (`md-link-*`) and sources (`md-src-*`):** unchanged and Custom.
- **Re-import (`mergeLayers`):**
  - An existing `md-title`/`md-body` with no `style` gets the generated layer's `style`.
  - Every `STYLE_KEYS` value equal to what the importer used to generate for that layer is deleted. Those values were never edited.
  - Values that differ stay as overrides.
  - A layer that already has a `style` keeps it, and its keys are untouched.
  - Text, link and bullets stay markdown-owned, as now.

**Export (`toMarkdown`):** unaffected.

## Testing
`app.test.ts`:
- **Resolution precedence:** renderer default < readability card < style < override, including a style that sets `card`/`box`.
- **Choosing styles:** choosing a style clears overrides; choosing Custom writes the resolved values and removes `style`. Each is one undo step.
- **This layer mode:** a change writes an override and is reported as overridden (dot); ↺ removes it; Clear overrides removes them all.
- **Style mode:** a change writes `deck.styles[id]`; another layer with the same style re-resolves; a layer overriding that key keeps its value.
- **Managing styles:**
  - new style from the selected layer: id from the name, the layer adopts it;
  - rename keeps the id;
  - delete writes the values onto layers, which become Custom;
  - built-ins have no delete;
  - layer counts are right.
- **Saving:** `deck.styles` stores only differences from the built-ins (an unedited deck saves none) and round-trips.
- **Transitions:** the change table lists a size change between two frames that comes from different styles.
- **Linked decks:** a linked-in layer uses the host style of its id, and falls back to the linked deck's own style when the host lacks it.
- **New layers:** "+ Text" creates a Body layer.
- **Template:** the Style row, the switch and the Styles section exist (and "every {{ name }} is provided" keeps passing).

`importer.test.ts`:
- a fresh import gives `md-title` style `h1` with no style keys, and `md-body` style `body` with only `size` and `bullets`;
- re-importing an older deck adds the styles and drops unedited keys, and an edited key (e.g. size changed in the builder) stays as an override.
