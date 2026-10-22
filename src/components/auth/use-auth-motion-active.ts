import { useEffect, useState } from "react";

/** O painel animado só está visível em desktop; não trabalhar fora dele. */
export function useAuthMotionActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean };
      }
    ).connection;
    const update = () =>
      setActive(wide.matches && !reduced.matches && !document.hidden && !connection?.saveData);

    update();
    wide.addEventListener("change", update);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    connection?.addEventListener?.("change", update);
    return () => {
      wide.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);

  return active;
}
