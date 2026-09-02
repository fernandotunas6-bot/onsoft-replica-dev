import { ExternalLink } from "lucide-react";
import { getSqlChecklistDocUrl } from "@/lib/sql-doc-hint";
import { cn } from "@/lib/utils";

/** Ligação viva ao checklist SQL no DOC (banners de schema em falta). */
export function SqlChecklistLink({
  className,
  label = "Checklist SQL (DOC)",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={getSqlChecklistDocUrl()}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline",
        className,
      )}
    >
      {label}
      <ExternalLink className="size-3 opacity-70" aria-hidden />
    </a>
  );
}
