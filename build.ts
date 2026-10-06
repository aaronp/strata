import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { deckList, indexHtml } from "./server";

const HOOK = '<script src="./support.js">';

export async function build(root: string, out: string) {
  await rm(out, { recursive: true, force: true });
  await cp(join(root, "design"), join(out, "design"), { recursive: true });
  if (existsSync(join(root, "decks"))) await cp(join(root, "decks"), join(out, "decks"), { recursive: true });
  const app = join(out, "design/strata.dc.html");
  const html = await Bun.file(app).text();
  if (!html.includes(HOOK)) throw new Error(`build: ${HOOK} not found in strata.dc.html; cannot inject STRATA_STATIC`);
  await Bun.write(app, html.replace(HOOK, "<script>window.STRATA_STATIC=true</script>\n" + HOOK));
  const decks = await deckList(root);
  await Bun.write(join(out, "decks/index.json"), JSON.stringify(decks, null, 2) + "\n");
  await Bun.write(join(out, "index.html"), indexHtml(decks, false));
}

if (import.meta.main) {
  await build(process.cwd(), join(process.cwd(), "dist"));
  console.log("Built dist/");
}
