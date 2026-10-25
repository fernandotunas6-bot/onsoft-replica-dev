import { useCallback, useReducer } from "react";
import type { WebsiteDraft } from "../content-model";

type History = {
  present: WebsiteDraft;
  past: WebsiteDraft[];
  future: WebsiteDraft[];
  scope: string;
  at: number;
};
type Action =
  | { type: "change"; draft: WebsiteDraft; scope: string; at: number }
  | { type: "undo" | "redo" }
  | { type: "reset" | "rebase"; draft: WebsiteDraft };
function reduce(state: History, action: Action): History {
  if (action.type === "reset")
    return { present: action.draft, past: [], future: [], scope: "", at: 0 };
  if (action.type === "rebase") return { ...state, present: action.draft, scope: "", at: 0 };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      present: state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future].slice(0, 20),
      scope: "",
      at: 0,
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      present: state.future[0],
      past: [...state.past, state.present].slice(-20),
      future: state.future.slice(1),
      scope: "",
      at: 0,
    };
  }
  if (action.type !== "change" || action.draft === state.present) return state;
  const coalesce =
    state.scope === action.scope && action.at - state.at < 800 && !state.future.length;
  return {
    present: action.draft,
    past: coalesce ? state.past : [...state.past, state.present].slice(-20),
    future: [],
    scope: action.scope,
    at: action.at,
  };
}

/** Memory-only, at most 20 immutable snapshots; never stores school content in localStorage. */
export function useStudioHistory(initial: WebsiteDraft) {
  const [state, dispatch] = useReducer(reduce, {
    present: initial,
    past: [],
    future: [],
    scope: "",
    at: 0,
  });
  return {
    draft: state.present,
    change: useCallback(
      (draft: WebsiteDraft, scope: string) =>
        dispatch({ type: "change", draft, scope, at: Date.now() }),
      [],
    ),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    reset: useCallback((draft: WebsiteDraft) => dispatch({ type: "reset", draft }), []),
    rebase: useCallback((draft: WebsiteDraft) => dispatch({ type: "rebase", draft }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
