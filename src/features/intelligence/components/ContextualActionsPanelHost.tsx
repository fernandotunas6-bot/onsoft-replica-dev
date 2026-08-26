import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEntityFocus } from "../entity-focus-context";
import { useRelations } from "../use-relations";
import { useSuggestions } from "../use-suggestions";
import { ContextualActionsPanel } from "./ContextualActionsPanel";

export function ContextualActionsPanelHost() {
  const { focusedEntity, panelCollapsed, setPanelCollapsed } = useEntityFocus();
  const relations = useRelations();
  const suggestions = useSuggestions();
  const [showMore, setShowMore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!focusedEntity) return null;

  const panelProps = {
    title: focusedEntity.label,
    relations,
    suggestions,
    showMore,
    onToggleShowMore: () => setShowMore((value) => !value),
  };

  return (
    <>
      <aside
        aria-label={`Ações relacionadas com ${focusedEntity.label}`}
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-l border-border/50 bg-card/40 backdrop-blur-xs lg:flex lg:flex-col"
        style={{ width: panelCollapsed ? "3.25rem" : "320px" }}
      >
        <ContextualActionsPanel
          {...panelProps}
          isCollapsed={panelCollapsed}
          onToggleCollapse={() => setPanelCollapsed(!panelCollapsed)}
        />
      </aside>

      {suggestions.length > 0 ? (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir ações relacionadas"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg lg:hidden"
        >
          <Sparkles className="size-4" />
          Ações · {suggestions.length}
        </button>
      ) : null}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{focusedEntity.label}</SheetTitle>
          </SheetHeader>
          <div className="h-[60vh]">
            <ContextualActionsPanel
              {...panelProps}
              isCollapsed={false}
              onToggleCollapse={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
