import { useEffect, useLayoutEffect } from "react";

// Install/remove the browser warning with the committed editor state. Waiting
// for passive effects can leave the previous warning active after Save is visible.
const useWarningEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Warn on tab closure/reload only while this school's editor has an unsaved draft. */
export function useDraftUnloadWarning(dirty: boolean) {
  useWarningEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
}
