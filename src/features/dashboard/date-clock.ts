/** A data e a saudação do início não apresentam minutos nem segundos. */
export function startDashboardDateClock(onDate: (date: Date) => void) {
  if (typeof window === "undefined") return () => {};
  let timer: number | undefined;
  let disposed = false;
  const tick = () => {
    window.clearTimeout(timer);
    if (disposed || document.visibilityState !== "visible") return;
    const now = new Date();
    onDate(now);
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 0, 0);
    timer = window.setTimeout(tick, Math.max(1, next.getTime() - now.getTime()));
  };
  document.addEventListener("visibilitychange", tick);
  tick();
  return () => {
    disposed = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}
