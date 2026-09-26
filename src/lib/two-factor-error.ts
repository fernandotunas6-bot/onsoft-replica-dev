/**
 * Recusas do servidor por falta de verificação em duas etapas. As mensagens
 * vêm de enrollment/server.ts, students/server.ts e people/server.ts
 * ("… precisa de 2FA activo …" / "… verificação em duas etapas (2FA) …").
 */
export function isTwoFactorRequiredMessage(message: string): boolean {
  return /\b2FA\b|duas etapas/i.test(message);
}

/** Destino para activar o 2FA: separador Segurança do perfil. */
export const TWO_FACTOR_SETUP_PATH = "/perfil?tab=seguranca";
