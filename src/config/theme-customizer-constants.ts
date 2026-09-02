import type { RadiusOption, BrandColor } from "@/types/theme-customizer";

// Radius options
export const radiusOptions: RadiusOption[] = [
  { name: "0", value: "0rem" },
  { name: "0.3", value: "0.3rem" },
  { name: "0.5", value: "0.5rem" },
  { name: "0.75", value: "0.75rem" },
  { name: "0.875", value: "0.875rem" },
  { name: "1.0", value: "1rem" },
];

// Define brand colors for custom color inputs
export const baseColors: BrandColor[] = [
  { name: "Primária", cssVar: "--primary" },
  { name: "Texto primário", cssVar: "--primary-foreground" },
  { name: "Secundária", cssVar: "--secondary" },
  { name: "Texto secundário", cssVar: "--secondary-foreground" },
  { name: "Destaque", cssVar: "--accent" },
  { name: "Texto de destaque", cssVar: "--accent-foreground" },
  { name: "Atenuada", cssVar: "--muted" },
  { name: "Texto atenuado", cssVar: "--muted-foreground" },
  { name: "Fundo Geral", cssVar: "--background" },
  { name: "Texto Geral", cssVar: "--foreground" },
  { name: "Cartão (Card)", cssVar: "--card" },
  { name: "Borda (Border)", cssVar: "--border" },
  { name: "Sidebar Fundo", cssVar: "--sidebar" },
  { name: "Sidebar Texto", cssVar: "--sidebar-foreground" },
];
