/**
 * Uma limpeza E2E de produção exige confirmação explícita do contacto do tenant.
 * O prefixo do slug não chega para demonstrar que a escola é descartável.
 * Função pura: testes não precisam de segredos nem de tocar na base.
 */
export function assertProductionE2ECleanupIdentity(adminEmail, tenantContactEmail) {
  const requested = String(adminEmail ?? "").trim().toLowerCase();
  const recorded = String(tenantContactEmail ?? "").trim().toLowerCase();
  if (!requested.endsWith("@siga-plus.test") || !recorded || requested !== recorded) {
    throw new Error(
      "Limpeza em produção bloqueada: confirme o contacto @siga-plus.test exacto registado no tenant.",
    );
  }
}
