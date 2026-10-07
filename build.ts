import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { deckList, indexHtml } from "./server";

const HOOK = '<script src="./support.js">';

// With a deck: publish only that deck, and the site root opens it. Without: every deck, and the root lists them.
export async function build(root: string, out: string, deck?: string) {
  if (deck && !existsSync(join(root, "decks", deck, "deck.json"))) throw new Error(`build: no deck "${deck}" in decks/`);
  await rm(out, { recursive: true, force: true });
  await cp(join(root, "design"), join(out, "design"), { recursive: true });
  if (deck) await cp(join(root, "decks", deck), join(out, "decks", deck), { recursive: true });
  else if (existsSync(join(root, "decks"))) await cp(join(root, "decks"), join(out, "decks"), { recursive: true });
  const app = join(out, "design/strata.dc.html");
  const html = await Bun.file(app).text();
  if (!html.includes(HOOK)) throw new Error(`build: ${HOOK} not found in strata.dc.html; cannot inject STRATA_STATIC`);
  await Bun.write(app, html.replace(HOOK, "<script>window.STRATA_STATIC=true</script>\n" + HOOK));
  const decks = await deckList(out);
  await Bun.write(join(out, "decks/index.json"), JSON.stringify(decks, null, 2) + "\n");
  const open = deck && `design/strata.dc.html?deck=${deck}`;
  await Bun.write(join(out, "index.html"), open ? `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${open}"><a href="${open}">Open the presentation</a>\n` : indexHtml(decks, false));
}

if (import.meta.main) {
  const deck = process.argv[2] || undefined;
  await build(process.cwd(), join(process.cwd(), "dist"), deck);
  console.log(deck ? `Built dist/ (publishing deck "${deck}")` : "Built dist/");
}
