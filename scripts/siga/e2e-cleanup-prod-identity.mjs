/**
 * Uma limpeza E2E de produção exige confirmação explícita do contacto do tenant.
 * O prefixo do slug não chega para demonstrar que a escola é descartável.
 * Função pura: testes não precisam de segredos nem de tocar na base.
 */
export function assertProductionE2ECleanupIdentity(adminEmail, tenantContactEmail) {
  const requested = String(adminEmail ?? "")
    .trim()
    .toLowerCase();
  const recorded = String(tenantContactEmail ?? "")
    .trim()
    .toLowerCase();
  if (!requested.endsWith("@siga-plus.test") || !recorded || requested !== recorded) {
    throw new Error(
      "Limpeza em produção bloqueada: confirme o contacto @siga-plus.test exacto registado no tenant.",
    );
  }
}

/**
 * Por defeito o comando de limpeza mostra apenas o inventário.
 * Nunca aceitar eliminação de todos os tenants num único comando.
 */
export function parseE2ECleanupArgs(args) {
  let execute = false;
  let dryRunRequested = false;
  let tenantId = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--execute") {
      execute = true;
    } else if (arg === "--dry-run") {
      dryRunRequested = true;
    } else if (arg === "--tenant-id" || arg.startsWith("--tenant-id=")) {
      const value = arg === "--tenant-id" ? args[++i] : arg.slice("--tenant-id=".length);
      if (
        tenantId !== null ||
        !value ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
      ) {
        throw new Error("Limpeza bloqueada: indique um único --tenant-id UUID válido.");
      }
      tenantId = value.toLowerCase();
    } else {
      throw new Error(`Limpeza bloqueada: argumento desconhecido «${arg}».`);
    }
  }
  if (execute && dryRunRequested) {
    throw new Error("Limpeza bloqueada: --execute e --dry-run são incompatíveis.");
  }
  if (execute && !tenantId) {
    throw new Error("Limpeza bloqueada: --execute exige --tenant-id explícito (um tenant).");
  }
  return { execute, tenantId };
}

/** Uma única linha existente impede a eliminação automática em produção. */
export function assertProductionArtifactCount(table, count) {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Limpeza em produção bloqueada: não foi possível auditar ${table}.`);
  }
  if (count > 0) {
    throw new Error(`Limpeza em produção bloqueada: existem registos em ${table}.`);
  }
}
