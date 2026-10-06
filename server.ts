import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const SLUG = /^[a-z0-9-]+$/;
export type DeckInfo = { slug: string; title: string };

export async function deckList(root: string): Promise<DeckInfo[]> {
  const dir = join(root, "decks");
  const ents = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: DeckInfo[] = [];
  for (const e of ents) {
    if (!e.isDirectory() || !SLUG.test(e.name)) continue;
    const f = Bun.file(join(dir, e.name, "deck.json"));
    if (!(await f.exists())) continue;
    const d = await f.json().catch(() => null);
    const first = d?.nodes?.[d?.nodes?.ROOT?.children?.[0]];
    out.push({ slug: e.name, title: d?.title || first?.title || e.name });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function indexHtml(decks: DeckInfo[], dev: boolean): string {
  const items = decks.map(d => `<li><a href="design/strata.dc.html?deck=${d.slug}">${esc(d.title)}</a> <code>${d.slug}</code></li>`).join("\n");
  const form = dev ? `<form action="design/strata.dc.html"><input name="deck" required pattern="[a-z0-9-]+" placeholder="new-deck-slug"> <button>New deck</button></form>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strata decks</title>
<style>body{font:16px system-ui,sans-serif;background:#f2eee5;color:#1d1b17;max-width:640px;margin:48px auto;padding:0 16px}a{color:#d9432b}code{color:#6b6458;font-size:12px}li{margin:8px 0}</style></head>
<body><h1>Strata</h1><ul>${items || "<li>No decks yet.</li>"}</ul>${form}</body></html>`;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" };

async function extract(url: unknown, imgDir: string): Promise<unknown> {
  if (typeof url !== "string") return url;
  const m = /^data:([^;,]+)((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(url);
  if (!m) return url;
  const bytes = m[3] ? Buffer.from(m[4], "base64") : Buffer.from(decodeURIComponent(m[4]));
  const name = createHash("sha1").update(bytes).digest("hex").slice(0, 12) + "." + (EXT[m[1]] ?? "bin");
  await Bun.write(join(imgDir, name), bytes);
  return "img/" + name;
}

export async function saveDeck(root: string, slug: string, deck: any) {
  const dir = join(root, "decks", slug), imgDir = join(dir, "img");
  const images: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(deck.images ?? {})) images[k] = await extract(v, imgDir);
  const out = { ...deck, images, customBg: deck.customBg ? await extract(deck.customBg, imgDir) : null };
  await Bun.write(join(dir, "deck.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}

export function handler(root: string) {
  return async (req: Request): Promise<Response> => {
    let p: string;
    try { p = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response("bad path", { status: 400 }); }
    if (p === "/api/decks" && req.method === "GET") return Response.json(await deckList(root));
    const m = /^\/api\/decks\/(.+)$/.exec(p);
    if (m && req.method === "PUT") {
      if (!SLUG.test(m[1])) return new Response("bad slug", { status: 400 });
      const deck = await req.json().catch(() => null);
      if (!deck?.nodes?.ROOT) return new Response("bad deck: expected { nodes: { ROOT } }", { status: 400 });
      return Response.json(await saveDeck(root, m[1], deck));
    }
    if (p === "/" || p === "/index.html") return new Response(indexHtml(await deckList(root), true), { headers: { "content-type": "text/html; charset=utf-8" } });
    if ((p.startsWith("/design/") || p.startsWith("/decks/")) && !p.includes("..")) {
      const f = Bun.file(join(root, p));
      if (await f.exists()) return new Response(f, { headers: { "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ hostname: "127.0.0.1", port, fetch: handler(process.cwd()) });
  console.log(`Strata dev server: http://127.0.0.1:${port}/`);
}
