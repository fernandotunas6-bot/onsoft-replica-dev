import type { ChipSize, ChipTone } from "@/components/ui/icon-chip";

export const toneClass: Record<ChipTone, string> = {
  primary: "bg-primary/12 text-primary-strong",
  success: "bg-success/14 text-success-strong",
  warning: "bg-warning/16 text-warning-strong",
  info: "bg-info/12 text-info-strong",
  destructive: "bg-destructive/12 text-destructive-strong",
  muted: "bg-muted text-muted-foreground",
  sidebar: "bg-sidebar-accent text-sidebar-foreground",
};

export const boxSize: Record<ChipSize, string> = {
  xs: "size-7 rounded-[10px]",
  sm: "size-9 rounded-xl",
  md: "size-11 rounded-[14px]",
  lg: "size-14 rounded-2xl",
};

export const glyphSize: Record<ChipSize, string> = {
  xs: "size-4",
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
};
