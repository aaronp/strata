import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseMarkdown, plainText } from "./markdown";

export const SLUG = /^[a-z0-9-]+$/;
export type DeckInfo = { slug: string; title: string };

export async function deckList(root: string): Promise<DeckInfo[]> {
  const dir = join(root, "decks");
  const ents = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: DeckInfo[] = [];
  for (const e of ents) {
    if (!e.isDirectory() || !SLUG.test(e.name)) continue;
    const f = Bun.file(join(dir, e.name, e.name + ".md"));
    if (!(await f.exists())) continue;
    const h = parseMarkdown(await f.text()).sections[0];
    out.push({ slug: e.name, title: (h && plainText(h.title)) || e.name });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const TOUR = "https://github.com/aaronp/strata/blob/master/examples/strata-tour/strata-tour.md";

export function indexHtml(decks: DeckInfo[], dev: boolean): string {
  const items = decks.map(d => `<li><a href="design/strata.dc.html?deck=${d.slug}">${esc(d.title)}</a> <code>${d.slug}</code></li>`).join("\n");
  const form = dev ? `<form action="design/strata.dc.html"><input name="deck" required pattern="[a-z0-9-]+" placeholder="new-deck-slug"> <button>New deck</button></form>` : "";
  // Static (GitHub Pages): /?src=…&slide=… presents straight away.
  const redirect = dev ? "" : `<script>if (/[?&]src=/.test(location.search)) location.replace('design/strata.dc.html' + location.search)</script>`;
  const open = `<h2>Open from a URL</h2><form action="design/strata.dc.html"><input name="src" type="url" required size="40" placeholder="https://github.com/you/repo/blob/main/talk.md"> <button>Open</button></form>
<p>Example: <a href="design/strata.dc.html?src=${encodeURIComponent(TOUR)}">Strata tour</a></p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strata decks</title>${redirect}
<style>body{font:16px system-ui,sans-serif;background:#f2eee5;color:#1d1b17;max-width:640px;margin:48px auto;padding:0 16px}a{color:#d9432b}code{color:#6b6458;font-size:12px}li{margin:8px 0}input{max-width:100%}</style></head>
<body><h1>Strata</h1><ul>${items || "<li>No decks yet.</li>"}</ul>${form}${open}</body></html>`;
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

export async function saveDeck(root: string, slug: string, { md, layout }: { md: string; layout: any }) {
  const dir = join(root, "decks", slug), imgDir = join(dir, "img"), d = layout?.deck ?? {};
  const images: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d.images ?? {})) images[k] = await extract(v, imgDir);
  const out = { ...layout, deck: { ...d, images, customBg: d.customBg ? await extract(d.customBg, imgDir) : null } };
  await Bun.write(join(dir, slug + ".md"), md);
  await Bun.write(join(dir, slug + "-layout.json"), JSON.stringify(out, null, 2) + "\n");
  return { layout: out };
}

// The parser as a classic script: window.StrataMd = { parseMarkdown, plainText }.
export async function mdBundle(root: string): Promise<string> {
  const entry = join(root, "md-entry.ts");
  const r = await Bun.build({
    entrypoints: [entry], format: "iife", minify: false,
    files: { [entry]: `import { parseMarkdown, plainText } from "./markdown"; window.StrataMd = { parseMarkdown, plainText };` },
  });
  if (!r.success) throw new Error("md.js: " + r.logs.join("\n"));
  return await r.outputs[0].text();
}

export function handler(root: string) {
  return async (req: Request): Promise<Response> => {
    let p: string;
    try { p = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response("bad path", { status: 400 }); }
    // Writes only from this origin: a sandboxed component (Origin: null) or another site can't change decks.
    const origin = req.headers.get("origin");
    if (req.method !== "GET" && req.method !== "HEAD" && origin && origin !== new URL(req.url).origin) return new Response("cross-origin write refused", { status: 403 });
    if (p === "/api/decks" && req.method === "GET") return Response.json(await deckList(root));
    const m = /^\/api\/decks\/(.+)$/.exec(p);
    if (m && req.method === "PUT") {
      if (!SLUG.test(m[1])) return new Response("bad slug", { status: 400 });
      const body = await req.json().catch(() => null);
      if (typeof body?.md !== "string") return new Response("bad deck: expected { md, layout }", { status: 400 });
      return Response.json(await saveDeck(root, m[1], body));
    }
    if (p === "/" || p === "/index.html") return new Response(indexHtml(await deckList(root), true), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/design/md.js") return new Response(await mdBundle(root), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    if ((p.startsWith("/design/") || p.startsWith("/decks/") || p.startsWith("/examples/")) && !p.includes("..")) {
      const f = Bun.file(join(root, p));
      if (await f.exists()) return new Response(f, { headers: { "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3067);
  Bun.serve({ hostname: "127.0.0.1", port, fetch: handler(process.cwd()) });
  console.log(`Strata dev server: http://127.0.0.1:${port}/`);
}
