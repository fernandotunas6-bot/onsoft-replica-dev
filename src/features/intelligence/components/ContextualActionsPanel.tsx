import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SuggestionCard } from "./SuggestionCard";
import type { RelationEdge, RelationStatus, Suggestion } from "../types";

const statusDotClass: Record<RelationStatus, string> = {
  ok: "bg-success",
  attention: "bg-warning",
  critical: "bg-destructive",
  empty: "bg-muted-foreground/40",
};

const VISIBLE_SUGGESTIONS = 6;

export function ContextualActionsPanel({
  title,
  relations,
  suggestions,
  isCollapsed,
  onToggleCollapse,
  showMore,
  onToggleShowMore,
}: {
  title: string;
  relations: RelationEdge[];
  suggestions: Suggestion[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  showMore: boolean;
  onToggleShowMore: () => void;
}) {
  if (isCollapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-3 py-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="header-icon-btn"
          aria-label="Expandir painel de ações relacionadas"
          onClick={onToggleCollapse}
        >
          <ChevronLeft className="size-4" />
        </Button>
      </div>
    );
  }

  const visibleSuggestions = showMore ? suggestions : suggestions.slice(0, VISIBLE_SUGGESTIONS);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Relacionado
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="header-icon-btn shrink-0"
          aria-label="Recolher painel de ações relacionadas"
          onClick={onToggleCollapse}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {relations.length > 0 ? (
            <div className="space-y-1">
              {relations.map((relation) =>
                relation.route ? (
                  <Link
                    key={relation.key}
                    to={relation.route}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground/90 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        statusDotClass[relation.status],
                      )}
                    />
                    <span className="flex-1 truncate">{relation.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {relation.summary}
                    </span>
                  </Link>
                ) : null,
              )}
            </div>
          ) : null}

          {visibleSuggestions.length > 0 ? (
            <div>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Próximas ações
              </p>
              <div className="space-y-1">
                {visibleSuggestions.map((suggestion) => (
                  <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                ))}
              </div>
              {suggestions.length > VISIBLE_SUGGESTIONS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full justify-center text-xs"
                  onClick={onToggleShowMore}
                >
                  {showMore
                    ? "Ver menos"
                    : `Ver mais (${suggestions.length - VISIBLE_SUGGESTIONS})`}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
