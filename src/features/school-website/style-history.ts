import type { WebsiteDraft } from "./content-model";
export type StyleSnapshot = WebsiteDraft["design"];
export type StyleHistory = { past: StyleSnapshot[]; future: StyleSnapshot[]; expected: string };
export const styleFingerprint = (design: StyleSnapshot) => JSON.stringify(design ?? null);
const snapshot = (design: StyleSnapshot): StyleSnapshot =>
  design ? structuredClone(design) : undefined;
export function createStyleHistory(design: StyleSnapshot): StyleHistory {
  return { past: [], future: [], expected: styleFingerprint(design) };
}
export function recordStyleHistory(
  history: StyleHistory,
  current: StyleSnapshot,
  next: StyleSnapshot,
): StyleHistory {
  const valid = history.expected === styleFingerprint(current);
  if (styleFingerprint(current) === styleFingerprint(next))
    return valid ? history : createStyleHistory(current);
  return {
    past: [...(valid ? history.past : []), snapshot(current)].slice(-20),
    future: [],
    expected: styleFingerprint(next),
  };
}
/** Moves presentation only; the caller retains the current content draft. */
export function moveStyleHistory(
  history: StyleHistory,
  current: StyleSnapshot,
  direction: "undo" | "redo",
): { history: StyleHistory; design: StyleSnapshot } | null {
  if (history.expected !== styleFingerprint(current)) return null;
  const stack = direction === "undo" ? history.past : history.future;
  if (!stack.length) return null;
  const next = snapshot(stack[stack.length - 1]);
  return {
    design: next,
    history: {
      past:
        direction === "undo"
          ? history.past.slice(0, -1)
          : [...history.past, snapshot(current)].slice(-20),
      future:
        direction === "redo"
          ? history.future.slice(0, -1)
          : [...history.future, snapshot(current)].slice(-20),
      expected: styleFingerprint(next),
    },
  };
}
