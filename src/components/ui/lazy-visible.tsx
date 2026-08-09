import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders heavy children (charts, tables, media) only when they get close to
 * the viewport. Keeps the first paint light so toques respondem de imediato.
 * Visual/colours unchanged — the placeholder uses the muted token.
 */
export function LazyVisible({
  children,
  minHeight = 220,
  rootMargin = "240px",
  className,
}: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={cn("contain-content", className)}>
      {visible ? (
        children
      ) : (
        <div
          aria-hidden
          className="animate-pulse rounded-xl bg-muted/60"
          style={{ minHeight }}
        />
      )}
    </div>
  );
}
