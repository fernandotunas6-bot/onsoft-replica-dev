import { Link } from "@tanstack/react-router";
import {
  FileText,
  GraduationCap,
  type LucideIcon,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import { IconChip, type ChipTone } from "@/components/ui/icon-chip";
import type { Suggestion, SuggestionCategory } from "../types";

const categoryIcon: Record<SuggestionCategory, LucideIcon> = {
  matricula: GraduationCap,
  financeiro: Wallet,
  documentos: FileText,
  academico: GraduationCap,
  encarregado: UserCheck,
  geral: Sparkles,
};

const categoryTone: Record<SuggestionCategory, ChipTone> = {
  matricula: "warning",
  financeiro: "destructive",
  documentos: "info",
  academico: "primary",
  encarregado: "warning",
  geral: "muted",
};

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  return (
    <Link
      to={suggestion.route}
      className="group flex items-start gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-secondary/60 focus-visible:border-border focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconChip
        icon={categoryIcon[suggestion.category]}
        tone={categoryTone[suggestion.category]}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{suggestion.title}</span>
        {suggestion.description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {suggestion.description}
          </span>
        ) : null}
        <span className="mt-1 block text-[11px] text-muted-foreground/80">{suggestion.reason}</span>
      </span>
    </Link>
  );
}
