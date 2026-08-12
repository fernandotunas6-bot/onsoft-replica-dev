import {
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  Hexagon,
  ImageIcon,
  Presentation,
  Table2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileKindMeta, type FileKind } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

const kindIcon = {
  folder: Folder,
  pdf: FileText,
  word: FileType2,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  csv: Table2,
  png: ImageIcon,
  jpeg: ImageIcon,
  webp: FileImage,
  gif: FileImage,
  svg: Hexagon,
} as const;

/** Ícone de tipo estilo OneDrive, com selo de partilha quando Escola/Público. */
export function FileKindIcon({
  kind,
  visibility,
  size = "md",
  className,
}: {
  kind: FileKind;
  visibility?: SchoolFileRecord["visibility"];
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = fileKindMeta[kind];
  const Icon = kindIcon[kind];
  const shared = visibility === "school" || visibility === "public";
  const box = size === "sm" ? "size-8" : "size-9";
  const glyph = size === "sm" ? "size-3.5" : "size-4";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-lg text-white shadow-sm",
          box,
        )}
        style={{ background: meta.color }}
        aria-hidden
      >
        <Icon className={glyph} />
      </span>
      {shared ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border border-card bg-secondary text-foreground">
          <Users className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}

export function initialsFromName(name: string | null | undefined) {
  if (!name?.trim()) return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}
