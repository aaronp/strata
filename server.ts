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

// The site root opens the app (keeping ?src=…&slide=…); its File menu does New / Open / Save / Download and lists the decks.
export function indexHtml(): string {
  return `<!doctype html><meta charset="utf-8"><title>Strata</title><script>location.replace('design/strata.dc.html' + location.search)</script><a href="design/strata.dc.html">Open Strata</a>\n`;
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

// The parser as a classic script: window.StrataMd (all of markdown.ts), plus StrataTheme, StrataBuilds and StrataSanitize.
export async function mdBundle(root: string): Promise<string> {
  const entry = join(root, "md-entry.ts");
  const r = await Bun.build({
    entrypoints: [entry], format: "iife", minify: false,
    files: { [entry]: `import * as StrataMd from "./markdown"; import * as StrataTheme from "./theme"; import * as StrataBuilds from "./builds"; import * as StrataSanitize from "./layout-sanitize"; window.StrataMd = StrataMd; window.StrataTheme = StrataTheme; window.StrataBuilds = StrataBuilds; window.StrataSanitize = StrataSanitize;` },
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
    if (p === "/" || p === "/index.html") return new Response(indexHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/design/md.js") return new Response(await mdBundle(root), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    if ((p.startsWith("/design/") || p.startsWith("/decks/") || p.startsWith("/examples/")) && !p.includes("..")) {
      const f = Bun.file(join(root, p));
      if (await f.exists()) return new Response(f, { headers: { "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  };
}

if (import.meta.main) {
  const opts = { hostname: "127.0.0.1", fetch: handler(process.cwd()) };
  let server;
  try { server = Bun.serve({ ...opts, port: Number(process.env.PORT ?? 3067) }); }
  catch (e: any) { if (e?.code !== "EADDRINUSE") throw e; server = Bun.serve({ ...opts, port: 0 }); }   // taken: let the OS pick a free one
  console.log(`Strata dev server: http://127.0.0.1:${server.port}/`);
}
