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
import { ACTIVE_SCHOOL_CHANGED_EVENT } from "@/features/auth/active-school";

interface TenantContextType {
  activeTenant: Tenant | null;
  activeSlug: string;
  isAdminArea: boolean;
  isLoadingTenant: boolean;
  isSuspended: boolean;
  /** Motivo do bloqueio quando `isSuspended`; o ecrã é `TenantAccessBarrier`. */
  accessBlockReason: TenantAccessBlockReason | null;
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
  accessBlockReason: null,
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
    // Troca de escola: no anfitrião `app.` o tenant (marca, plano, bloqueios) vem
    // da escola da sessão; sem isto ficava o da escola anterior até recarregar.
    const onSchoolChanged = () => void loadTenant();
    window.addEventListener(ACTIVE_SCHOOL_CHANGED_EVENT, onSchoolChanged);
    let unsub: (() => void) | undefined;
    void import("@/integrations/supabase/client").then(({ supabase }) => {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") void loadTenant();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => {
      window.removeEventListener(ACTIVE_SCHOOL_CHANGED_EVENT, onSchoolChanged);
      unsub?.();
    };
  }, []);

  const setDevSlug = (slug: string) => {
    if (typeof window !== "undefined" && isLocalDevHostname(window.location.hostname)) {
      localStorage.setItem("siga_dev_tenant_slug", slug);
      loadTenant();
    }
  };

  const access = getTenantAccessBlock(activeTenant);
  const isSuspended = access.blocked;

  return (
    <TenantContext.Provider
      value={{
        activeTenant,
        activeSlug,
        isAdminArea,
        isLoadingTenant,
        isSuspended,
        accessBlockReason: isSuspended ? (access.reason ?? "suspended") : null,
        activePlan,
        refreshTenant: loadTenant,
        setDevSlug,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
