import type { ChipSize, ChipTone } from "@/components/ui/icon-chip";

export const toneClass: Record<ChipTone, string> = {
  // Tons discretos: tinta leve + contorno fino, sem círculos saturados.
  primary: "bg-primary/8 text-primary-strong ring-1 ring-inset ring-primary/12",
  success: "bg-success/10 text-success-strong ring-1 ring-inset ring-success/15",
  warning: "bg-warning/12 text-warning-strong ring-1 ring-inset ring-warning/20",
  info: "bg-info/8 text-info-strong ring-1 ring-inset ring-info/15",
  destructive: "bg-destructive/8 text-destructive-strong ring-1 ring-inset ring-destructive/15",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border/70",
  sidebar: "bg-sidebar-accent text-sidebar-foreground",
};

export const boxSize: Record<ChipSize, string> = {
  xs: "size-7 rounded-md",
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-[10px]",
  lg: "size-12 rounded-xl",
};

export const glyphSize: Record<ChipSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};
