import {
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  Hexagon,
  ImageIcon,
  Lock,
  Presentation,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaFrame } from "@/components/ui/media-frame";
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
  locked,
  className,
}: {
  kind: FileKind;
  name: string;
  selected?: boolean | undefined;
  previewUrl?: string | null;
  locked?: boolean | undefined;
  className?: string | undefined;
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
        {previewUrl && !locked ? (
          <MediaFrame
            src={previewUrl}
            alt={`Pré-visualização de ${name}`}
            ratio="1/1"
            rounded="rounded-none"
            className="absolute inset-0 size-full"
          />
        ) : (
          <span
            className="flex size-12 items-center justify-center rounded-xl text-primary-foreground shadow-md"
            style={{ background: meta.color }}
          >
            <Icon className="size-6" aria-hidden />
          </span>
        )}
        {locked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80">
            <Lock className="size-5 text-muted-foreground" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sistema
            </span>
          </div>
        ) : null}
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <p className="truncate text-xs font-semibold text-foreground" title={name}>
          {name}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {locked ? "Protegido" : meta.label}
        </p>
      </div>
    </div>
  );
}
