import React, { createContext, useContext, useEffect, useState } from "react";
import type { Tenant, Plan } from "./types";
import {
  isLocalDevHostname,
  resolveTenantLookup,
  isAdminSubdomain,
} from "@/lib/saas/tenant-resolver";
import {
  getTenantByHostname,
  getTenantBySlug,
  getTenantForCurrentUser,
} from "@/features/saas/server";
import { getTenantAccessBlock, type TenantAccessBlockReason } from "@/features/saas/tenant-access";
import { DOC_PATHS, getDocUrl, getPricingUrl } from "@/lib/ecosystem-urls";

interface TenantContextType {
  activeTenant: Tenant | null;
  activeSlug: string;
  isAdminArea: boolean;
  isLoadingTenant: boolean;
  isSuspended: boolean;
  activePlan: Plan | null;
  refreshTenant: () => Promise<void>;
  setDevSlug: (slug: string) => void;
}

const TenantContext = createContext<TenantContextType>({
  activeTenant: null,
  activeSlug: "minha-escola",
  isAdminArea: false,
  isLoadingTenant: true,
  isSuspended: false,
  activePlan: null,
  refreshTenant: async () => {},
  setDevSlug: () => {},
});

const DEV_SINGLE_SCHOOL_FALLBACK: Tenant = {
  id: "ten-default-001",
  name: "Colégio SIGA",
  slug: "minha-escola",
  status: "active",
  subscription_status: "active",
  max_students: 1000,
  max_storage_gb: 20,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSlug, setActiveSlug] = useState<string>("minha-escola");
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState<boolean>(true);
  const [isAdminArea, setIsAdminArea] = useState<boolean>(false);

  const loadTenant = async () => {
    setIsLoadingTenant(true);
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const lookup = resolveTenantLookup(hostname);
    const slug =
      lookup.mode === "slug" ? lookup.slug : lookup.hostname.split(".")[0] || "minha-escola";
    setActiveSlug(slug);

    const isAdmin = isAdminSubdomain(hostname);
    const allowDevFallback = isLocalDevHostname(hostname);
    setIsAdminArea(isAdmin);

    try {
      const tenant =
        lookup.mode === "hostname"
          ? await getTenantByHostname({ data: { hostname: lookup.hostname } })
          : await getTenantBySlug({ data: { slug: lookup.slug } });

      if (tenant) {
        setActiveTenant(tenant);
        setActivePlan(tenant.plans ?? null);
      } else if (allowDevFallback) {
        setActiveTenant({ ...DEV_SINGLE_SCHOOL_FALLBACK, slug });
        setActivePlan(null);
      } else {
        // O hostname não resolveu. Antes de desistir, tentar a escola da
        // sessão: enquanto o wildcard `*.PLATFORM_DOMAIN` não existir, os
        // subdomínios das escolas não resolvem e o único host alcançável é
        // `app.PLATFORM_DOMAIN`, que é reservado. Sem isto, uma conta com
        // escola atribuída entra e não vê instituição nenhuma.
        //
        // Continua a falhar fechado: a escola vem da membership resolvida no
        // servidor, e se não houver membership activa fica null como antes.
        // Só pedir ao servidor quando há sessão: sem ela o pedido é recusado
        // (401) e, antes de iniciar sessão, isso deixava o ecrã em branco.
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sessionData } = await supabase.auth.getSession();
        const fromMembership = sessionData.session
          ? await getTenantForCurrentUser().catch(() => null)
          : null;
        setActiveTenant(fromMembership ?? null);
        setActivePlan(fromMembership?.plans ?? null);
      }
    } catch (err) {
      console.warn("[TenantProvider] Error loading tenant:", err);
      if (allowDevFallback) {
        setActiveTenant({ ...DEV_SINGLE_SCHOOL_FALLBACK, slug });
      } else {
        setActiveTenant(null);
      }
      setActivePlan(null);
    } finally {
      setIsLoadingTenant(false);
    }
  };

  useEffect(() => {
    loadTenant();
    let unsub: (() => void) | undefined;
    void import("@/integrations/supabase/client").then(({ supabase }) => {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") void loadTenant();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, []);

  const setDevSlug = (slug: string) => {
    if (typeof window !== "undefined" && isLocalDevHostname(window.location.hostname)) {
      localStorage.setItem("siga_dev_tenant_slug", slug);
      loadTenant();
    }
  };

  const access = getTenantAccessBlock(activeTenant);
  const isSuspended = access.blocked;

  const blockCopy: Record<TenantAccessBlockReason, { title: string; body: string }> = {
    suspended: {
      title: "Assinatura Suspensa",
      body: "A assinatura encontra-se temporariamente suspensa por razões administrativas.",
    },
    trial_expired: {
      title: "Período de Trial Expirado",
      body: "O período experimental terminou. Escolha um plano para continuar a usar o SIGA Plus.",
    },
    cancelled: {
      title: "Assinatura Cancelada",
      body: "A subscrição desta instituição foi cancelada. Reactive no portal comercial.",
    },
  };

  const blockReason = access.reason ?? "suspended";
  const copy = blockCopy[blockReason];

  return (
    <TenantContext.Provider
      value={{
        activeTenant,
        activeSlug,
        isAdminArea,
        isLoadingTenant,
        isSuspended,
        activePlan,
        refreshTenant: loadTenant,
        setDevSlug,
      }}
    >
      {isSuspended && !isAdminArea ? (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/20 text-warning">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">{copy.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {copy.body} Instituição{" "}
              <strong className="text-foreground">{activeTenant?.name}</strong>.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Regularize a assinatura no portal comercial ou contacte o suporte da plataforma.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <a
                href={getPricingUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-card"
              >
                Ver planos e renovar
              </a>
              <a
                href={getDocUrl(DOC_PATHS.guideSupport)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                Suporte institucional
              </a>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
