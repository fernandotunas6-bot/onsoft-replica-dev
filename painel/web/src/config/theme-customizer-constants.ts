import type { 
  SidebarVariant, 
  SidebarCollapsibleOption, 
  SidebarSideOption, 
  RadiusOption, 
  BrandColor 
} from '@/types/theme-customizer'

// Radius options
export const radiusOptions: RadiusOption[] = [
  { name: "0", value: "0rem" },
  { name: "0.3", value: "0.3rem" },
  { name: "0.5", value: "0.5rem" },
  { name: "0.75", value: "0.75rem" },
  { name: "1.0", value: "1rem" },
]

// Sidebar variant options
export const sidebarVariants: SidebarVariant[] = [
  { name: "Predefinição", value: "sidebar", description: "Barra lateral padrão" },
  { name: "Flutuante", value: "floating", description: "Barra flutuante com bordo" },
  { name: "Embebida", value: "inset", description: "Barra embebida com cantos arredondados" },
]

// Sidebar collapsible options
export const sidebarCollapsibleOptions: SidebarCollapsibleOption[] = [
  { name: "Fora do ecrã", value: "offcanvas", description: "Desliza para fora" },
  { name: "Ícone", value: "icon", description: "Reduz só a ícones" },
  { name: "Nenhuma", value: "none", description: "Sempre visível" },
]

// Sidebar side options
export const sidebarSideOptions: SidebarSideOption[] = [
  { name: "Esquerda", value: "left" },
  { name: "Direita", value: "right" },
]

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
]
