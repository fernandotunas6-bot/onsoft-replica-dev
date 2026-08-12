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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileKindMeta, type FileKind } from "./kinds";

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

export function FileCover({
  kind,
  name,
  selected,
  previewUrl,
  className,
}: {
  kind: FileKind;
  name: string;
  selected?: boolean;
  previewUrl?: string | null;
  className?: string;
}) {
  const meta = fileKindMeta[kind];
  const Icon = kindIcon[kind];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-soft transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border",
        className,
      )}
    >
      <div
        className="relative flex h-24 items-center justify-center overflow-hidden"
        style={{ background: `color-mix(in oklch, ${meta.color} 18%, white)` }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span
            className="flex size-12 items-center justify-center rounded-xl text-white shadow-md"
            style={{ background: meta.color }}
          >
            <Icon className="size-6" aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <p className="truncate text-xs font-semibold text-foreground" title={name}>
          {name}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </p>
      </div>
    </div>
  );
}
