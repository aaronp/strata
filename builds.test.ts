import { test, expect } from "bun:test";
import { stepList, isVisible, buildStyle, pruneSteps } from "./builds";

const L = (...ids: string[]) => ids.map((id) => ({ id }));
test("stepList", () => {
  expect(stepList({ a: 1, b: 3, c: 7, d: 0 }, ["a", "b", "c", "d"])).toEqual([1, 3, 7]);
  expect(stepList({ a: 1, b: 3, c: 7, d: 0 }, ["a", "b", "d"])).toEqual([1, 3]);
});
test("isVisible by step", () => {
  expect(isVisible({ id: "b" }, 2, { b: 3 }, L("b"), true)).toBe(false);
  expect(isVisible({ id: "b" }, 3, { b: 3 }, L("b"), true)).toBe(true);
  expect(isVisible({ id: "z" }, 0, {}, L("z"), true)).toBe(true);
});
test("detail replace", () => {
  const ls = [{ id: "d1", kind: "detail" }, { id: "d2", kind: "detail" }];
  const s = { d1: 1, d2: 2 };
  expect(isVisible(ls[0], 2, s, ls, true)).toBe(false);
  expect(isVisible(ls[0], 2, s, ls, false)).toBe(true);
  expect(isVisible(ls[1], 2, s, ls, true)).toBe(true);
});
test("dim earlier items", () => {
  const ls = [{ id: "i", kind: "item" }];
  expect(buildStyle(ls[0], 2, { i: 1 }, ls, { 1: "fade" }).opacity).toBe(0.45);
  expect(buildStyle(ls[0], 2, { i: 1 }, ls, { 1: "fade" }, { dur: 500, ease: "linear", earlier: "keep", replace: true }).opacity).toBe(1);
});
test("hidden transforms and cut", () => {
  expect(buildStyle({ id: "a" }, 0, { a: 1 }, L("a"), { 1: "rise" }).transform).toBe("translateY(3cqw)");
  expect(buildStyle({ id: "a" }, 0, { a: 1 }, L("a"), { 1: "wipe" }).clip).toBe("inset(0 100% 0 0)");
  expect(buildStyle({ id: "a" }, 0, { a: 1 }, L("a"), { 1: "none" }).transition).toBe("none");
  expect(buildStyle({ id: "a" }, 0, {}, L("a"), {}).transition).toBe("none");
});
test("wave stagger", () => {
  const ls = L("a", "b");
  expect(buildStyle(ls[1], 0, { a: 1, b: 1 }, ls, { 1: "wave" }).transition).toContain("120ms");
  expect(buildStyle(ls[0], 0, { a: 1, b: 1 }, ls, { 1: "wave" }).transition).not.toContain("120ms");
});
test("pruneSteps", () => expect(pruneSteps({ a: 1, x: 2 }, ["a"])).toEqual({ a: 1 }));
