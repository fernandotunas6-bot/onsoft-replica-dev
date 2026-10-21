import { useEffect } from "react";

/** Warn on tab closure/reload only while this school's editor has an unsaved draft. */
export function useDraftUnloadWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
}
