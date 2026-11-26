export const TRANSITIONS = [
  { id: "fade", label: "Fade", hint: "Opacity only", hidden: "none", clip: false, stagger: false },
  { id: "rise", label: "Rise", hint: "Fade up a little", hidden: "translateY(3cqw)", clip: false, stagger: false },
  { id: "slide", label: "Slide in", hint: "From the left", hidden: "translateX(-5cqw)", clip: false, stagger: false },
  { id: "scale", label: "Grow", hint: "Scale up from small", hidden: "scale(0.6)", clip: false, stagger: false },
  { id: "wipe", label: "Wipe", hint: "Reveal left to right", hidden: "none", clip: true, stagger: false },
  { id: "wave", label: "Wave", hint: "Rise, one after another", hidden: "translateY(3cqw)", clip: false, stagger: true },
  { id: "pop", label: "Pop", hint: "Grow with a bounce", hidden: "scale(0.3)", clip: false, stagger: false },
  { id: "none", label: "Cut", hint: "Appear instantly", hidden: "none", clip: false, stagger: false },
];
export const DURATIONS = [{ value: 250, label: "Quick" }, { value: 500, label: "Normal" }, { value: 900, label: "Slow" }];
export const EASINGS = [
  { value: "cubic-bezier(0.2, 0.7, 0.2, 1)", label: "Ease out" },
  { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Springy" },
  { value: "linear", label: "Linear" },
];
export const DEFAULT_BUILD = { dur: 500, ease: "cubic-bezier(0.2, 0.7, 0.2, 1)", earlier: "dim", replace: true };

export type BuildLayer = { id: string; kind?: "item" | "detail" | string };
type Steps = Record<string, number>;

export function stepList(steps: Steps, ids: string[]): number[] {
  const n = ids.map((id) => steps[id] ?? 0).filter((v) => v > 0);
  return [...new Set(n)].sort((a, b) => a - b);
}

export function isVisible(l: BuildLayer, at: number, steps: Steps, layers: BuildLayer[], replace: boolean): boolean {
  const step = steps[l.id] ?? 0;
  if (step === 0) return true;
  if (step > at) return false;
  if (l.kind === "detail" && replace)
    return !layers.some((o) => o.kind === "detail" && o.id !== l.id && (steps[o.id] ?? 0) > step && (steps[o.id] ?? 0) <= at);
  return true;
}

export function buildStyle(l: BuildLayer, at: number, steps: Steps, layers: BuildLayer[], trans: Record<number, string>, b = DEFAULT_BUILD) {
  const step = steps[l.id] ?? 0;
  const t = step === 0 ? TRANSITIONS[7] : TRANSITIONS.find((x) => x.id === trans[step]) ?? TRANSITIONS[0];
  const visible = isVisible(l, at, steps, layers, b.replace);
  const delay = t.stagger ? layers.filter((o) => (steps[o.id] ?? 0) === step).findIndex((o) => o.id === l.id) * 120 : 0;
  const earlier = l.kind === "item" && step > 0 && step < at;
  return {
    opacity: visible ? (earlier && b.earlier === "dim" ? 0.45 : 1) : 0,
    transform: visible ? "none" : t.hidden,
    clip: !visible && t.clip ? "inset(0 100% 0 0)" : "inset(0 0 0 0)",
    transition: t.id === "none" ? "none" : ["opacity", "transform", "clip-path"].map((p) => `${p} ${b.dur}ms ${b.ease} ${delay}ms`).join(", "),
  };
}

export function pruneSteps(steps: Steps, ids: string[]): Steps {
  return Object.fromEntries(Object.entries(steps).filter(([k]) => ids.includes(k)));
}
