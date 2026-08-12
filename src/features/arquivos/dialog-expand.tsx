import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Classes de DialogContent com botão de expandir para trabalho em ecrã largo. */
export function useExpandableDialog(defaultExpanded = false) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return {
    expanded,
    setExpanded,
    toggleExpanded: () => setExpanded((value) => !value),
    contentClassName: (base: string) =>
      cn(
        base,
        expanded &&
          "h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-none sm:rounded-xl",
      ),
  };
}

export function DialogExpandButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="absolute right-11 top-3 z-10 size-8 px-0"
      onClick={onToggle}
      aria-label={expanded ? "Reduzir janela" : "Expandir janela"}
      title={expanded ? "Reduzir" : "Expandir"}
    >
      {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
    </Button>
  );
}
