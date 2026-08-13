import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canAccessPath } from "@/features/auth/access-policy";
import type { ModuleGrantMap } from "@/features/auth/access-policy";
import { spotlightCatalog } from "./catalog";
import { listSpotlightConfig } from "./server";
import { resolveSpotlightPath, visibleSpotlights, type SpotlightSurface } from "./schemas";
import { SpotlightCard } from "./SpotlightCard";
import { cn } from "@/lib/utils";

export function SpotlightRail({
  role,
  grants,
  onNavigate,
  onOpenSettings,
  surface = "drawer",
  className,
}: {
  role: string;
  grants?: ModuleGrantMap;
  onNavigate: () => void;
  onOpenSettings?: (panelId?: string) => void;
  surface?: SpotlightSurface;
  className?: string;
}) {
  const configQuery = useQuery({
    queryKey: ["spotlight", "config"],
    queryFn: () => listSpotlightConfig(),
    staleTime: 30_000,
    retry: false,
  });
  const catalog = configQuery.data ?? spotlightCatalog;
  const items = useMemo(
    () =>
      visibleSpotlights(catalog, {
        role,
        ...(grants ? { grants } : {}),
        canAccess: canAccessPath,
        surface,
      }),
    [catalog, grants, role, surface],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [items.map((item) => item.id).join("|")]);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  if (!items.length) return null;
  const item = items[Math.min(index, items.length - 1)]!;
  const href =
    item.link.type === "internal"
      ? resolveSpotlightPath(item, (path) => canAccessPath(path, role, grants))
      : undefined;

  return (
    <div
      className={cn(surface === "home" ? "" : "mt-4", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <SpotlightCard
        item={item}
        href={href ?? undefined}
        onInternal={onNavigate}
        onSettings={(panel) => onOpenSettings?.(panel)}
      />
      {items.length > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-1.5" role="tablist" aria-label="Destaques">
          {items.map((entry, position) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-label={entry.title}
              className={`h-1.5 rounded-full transition-all ${
                position === index ? "w-4 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
              }`}
              onClick={() => setIndex(position)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
