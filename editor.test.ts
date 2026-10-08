// The WYSIWYG editor's DOM glue, driven in happy-dom (no globals are registered: the app's other tests rely on there being no document).
import { test, expect } from "bun:test";
import { join } from "node:path";
import { Window } from "happy-dom";

const html = await Bun.file(join(import.meta.dir, "design/strata.dc.html")).text();
const js = html.split('<script type="text/x-dc" data-dc-script>')[1].split("</script>")[0];
const g = { location: { search: "" }, window: {}, localStorage: { getItem: () => null, setItem() {} }, fetch: async () => new Response("{}"), setTimeout, requestAnimationFrame() {} };
const C = new Function("DCLogic", "React", ...Object.keys(g), js + "\nreturn Component;")(class {}, { createRef: () => ({ current: null }) }, ...Object.values(g));
const R = C.rich;
const fresh = () => { const w = new Window(); const root = w.document.createElement("div"); root.setAttribute("contenteditable", "true"); w.document.body.appendChild(root); return { w, root }; };
const look = (id: string) => (id === "h2" ? { size: 44, weight: 700 } : null);

test("buildEditor renders lines, marks, styled run spans and empty lines", () => {
  const { root } = fresh();
  R.buildEditor(root, R.linesOf("a **b** [c]{style=h2 link=k}\n"), { bullets: "disc" }, look);
  const lines = root.querySelectorAll("[data-line]");
  expect(lines.length).toBe(2);
  expect(lines[0].querySelector("[data-mark]").textContent).toBe("• ");
  const runs = lines[0].querySelectorAll("[data-run]");
  expect([...runs].map((s: any) => s.textContent)).toEqual(["a ", "b", " ", "c"]);
  expect(runs[1].getAttribute("style")).toContain("font-weight:bolder");
  expect(runs[3].getAttribute("style")).toContain("font-size:2.75cqw");
  expect(runs[3].getAttribute("style")).toContain("text-decoration:underline");
  expect(lines[1].querySelector("br")).toBeTruthy(); expect(lines[1].querySelector("[data-mark]")).toBeNull();   // empty lines get no mark
});

test("getOffsets / setOffsets round-trip across lines and around marks", () => {
  const { root } = fresh();
  R.buildEditor(root, R.linesOf("ab **cd**\nef"), { bullets: "number" }, null);
  for (const [s, e] of [[0, 0], [1, 4], [3, 8], [8, 8], [5, 5]]) { R.setOffsets(root, s, e); expect(R.getOffsets(root)).toEqual({ start: s, end: e }); }
});

test("readLines reads edited spans, bare text nodes, emptied spans and stray root text back into runs", () => {
  const { w, root } = fresh(); const L = R.linesOf("ab **cd**\nef");
  R.buildEditor(root, L, {}, null);
  const [l0, l1] = root.querySelectorAll("[data-line]");
  l0.querySelectorAll("[data-run]")[1].textContent = "cdX";             // typed inside the bold run
  l0.appendChild(w.document.createTextNode("!"));                       // the browser added bare text after it
  l1.querySelectorAll("[data-run]")[0].textContent = "";                // emptied
  root.appendChild(w.document.createTextNode("tail"));                  // stray text under the root
  expect(R.textOf(R.readLines(root, L))).toBe("ab **cdX!**\ntail");
});

test("wysBefore takes over Enter, paste, bold, and deletes that cross or join lines", () => {
  const { root } = fresh(); let L = R.linesOf("say hello\nnow");
  const run = (inputType: string, s: number, e: number, data?: string) => { R.buildEditor(root, L, {}, null); R.setOffsets(root, s, e);
    return R.wysBefore(root, L, { inputType, dataTransfer: data == null ? null : { getData: () => data } }); };
  expect(R.textOf(run("insertParagraph", 3, 3).lines)).toBe("say\n hello\nnow");
  expect(run("insertParagraph", 3, 3).start).toBe(4);
  expect(R.textOf(run("insertFromPaste", 4, 9, "big\nday").lines)).toBe("say big\nday\nnow");
  expect(R.textOf(run("formatBold", 4, 9).lines)).toBe("say **hello**\nnow");
  expect(R.textOf(run("deleteContentBackward", 10, 10).lines)).toBe("say hellonow");    // Backspace at a line start joins
  expect(R.textOf(run("deleteContentForward", 9, 9).lines)).toBe("say hellonow");     // Delete at a line end joins
  expect(R.textOf(run("deleteContentBackward", 7, 11).lines)).toBe("say helow");       // a selection across the break
  expect(run("insertText", 3, 3)).toBeNull(); expect(run("deleteContentBackward", 5, 5)).toBeNull();   // left to the browser
});
