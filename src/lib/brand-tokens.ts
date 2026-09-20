/**
 * Tokens de marca escolar (hex → CSS variables) com validação de contraste.
 * Usado pela aparência do SIGA para aplicar cores do tenant sem duplicar presets.
 */

const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

export function normalizeBrandHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export function isValidBrandHex(value: string | null | undefined): boolean {
  return normalizeBrandHex(value) !== null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeBrandHex(hex);
  if (!normalized) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function channelLuminance(channel: number) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa WCAG (0–1). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Texto legível sobre a cor de fundo (botões primary). */
export function foregroundForBackground(backgroundHex: string): "#FFFFFF" | "#0A0A0A" {
  const white = contrastRatio("#FFFFFF", backgroundHex);
  const black = contrastRatio("#0A0A0A", backgroundHex);
  return white >= black ? "#FFFFFF" : "#0A0A0A";
}

/** Exige contraste ≥ 4.5:1 entre a cor e o texto automático (WCAG AA). */
export function isReadableBrandColor(hex: string): boolean {
  const normalized = normalizeBrandHex(hex);
  if (!normalized) return false;
  const fg = foregroundForBackground(normalized);
  return contrastRatio(fg, normalized) >= 4.5;
}

export type SchoolBrandColors = {
  primary: string;
  secondary?: string | null;
};

/**
 * Gera tokens CSS a partir das cores institucionais.
 * Usa color-mix para soft/strong — compatível com browsers modernos do SIGA.
 */
export function brandHexToCssVars(
  primary: string,
  secondary?: string | null,
  dark = false,
): Record<string, string> {
  const primaryHex = normalizeBrandHex(primary);
  if (!primaryHex) return {};

  const fg = foregroundForBackground(primaryHex);
  const soft = dark
    ? `color-mix(in oklab, ${primaryHex} 32%, black)`
    : `color-mix(in oklab, ${primaryHex} 12%, white)`;
  const strong = dark
    ? `color-mix(in oklab, ${primaryHex} 72%, white)`
    : `color-mix(in oklab, ${primaryHex} 82%, black)`;
  const accentBg = dark
    ? `color-mix(in oklab, ${primaryHex} 22%, black)`
    : `color-mix(in oklab, ${primaryHex} 10%, white)`;

  const vars: Record<string, string> = {
    "--primary": primaryHex,
    "--primary-foreground": fg,
    "--primary-soft": soft,
    "--primary-strong": strong,
    "--accent": accentBg,
    "--accent-foreground": strong,
    "--ring": primaryHex,
    "--chart-1": primaryHex,
    "--sidebar-primary": primaryHex,
    "--sidebar-primary-foreground": fg,
    "--sidebar-ring": primaryHex,
    "--sidebar-active": strong,
  };

  const secondaryHex = normalizeBrandHex(secondary ?? null);
  if (secondaryHex) {
    const sideFg = foregroundForBackground(secondaryHex);
    vars["--sidebar"] = secondaryHex;
    vars["--sidebar-foreground"] = sideFg;
    vars["--sidebar-muted"] = dark
      ? `color-mix(in oklab, ${secondaryHex} 55%, white)`
      : `color-mix(in oklab, ${secondaryHex} 45%, white)`;
    vars["--sidebar-accent"] = dark
      ? `color-mix(in oklab, ${secondaryHex} 78%, white)`
      : `color-mix(in oklab, ${secondaryHex} 88%, white)`;
    vars["--sidebar-accent-foreground"] = sideFg;
    vars["--sidebar-border"] = dark
      ? `color-mix(in oklab, ${secondaryHex} 70%, white)`
      : `color-mix(in oklab, ${secondaryHex} 82%, white)`;
  }

  return vars;
}
