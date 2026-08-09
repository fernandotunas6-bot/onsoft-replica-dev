import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Tenant = {
  id: string;
  nome: string;
  sigla: string;
  municipio: string;
  plano: "Essencial" | "Avançado" | "Premium";
  alunos: number;
  cor: string;
};

/** Instituições (tenants) disponíveis — dados de demonstração. */
export const tenants: Tenant[] = [
  {
    id: "sede-luanda",
    nome: "Colégio SIGA — Sede",
    sigla: "SG",
    municipio: "Luanda",
    plano: "Premium",
    alunos: 1284,
    cor: "var(--primary)",
  },
  {
    id: "polo-viana",
    nome: "Complexo Escolar Viana",
    sigla: "CV",
    municipio: "Viana",
    plano: "Avançado",
    alunos: 742,
    cor: "var(--primary)",
  },
  {
    id: "polo-benguela",
    nome: "Instituto Médio de Benguela",
    sigla: "IB",
    municipio: "Benguela",
    plano: "Essencial",
    alunos: 396,
    cor: "var(--primary)",
  },
];

const STORAGE_KEY = "siga.tenant";

type TenantContextValue = {
  tenant: Tenant;
  tenants: Tenant[];
  setTenantId: (id: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantIdState] = useState<string>(tenants[0]!.id);

  // Lê a preferência apenas no cliente para não quebrar a hidratação.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && tenants.some((t) => t.id === stored)) setTenantIdState(stored);
  }, []);

  const setTenantId = useCallback((id: string) => {
    setTenantIdState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant: tenants.find((t) => t.id === tenantId) ?? tenants[0]!,
      tenants,
      setTenantId,
    }),
    [tenantId, setTenantId],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant deve ser usado dentro de <TenantProvider>");
  return ctx;
}

/** Factor determinístico por tenant, para escalar os dados de demonstração. */
export function tenantFactor(tenant: Tenant) {
  return tenant.alunos / tenants[0]!.alunos;
}
