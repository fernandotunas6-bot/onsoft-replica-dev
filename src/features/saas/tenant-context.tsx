import React, { createContext, useContext, useEffect, useState } from "react";
import type { Tenant, Plan } from "./types";
import { getTenantSlugFromHostname, isAdminSubdomain } from "@/lib/saas/tenant-resolver";
import { getTenantBySlug } from "@/features/saas/server";

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

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSlug, setActiveSlug] = useState<string>("minha-escola");
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState<boolean>(true);
  const [isAdminArea, setIsAdminArea] = useState<boolean>(false);

  const loadTenant = async () => {
    setIsLoadingTenant(true);
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const slug = getTenantSlugFromHostname(hostname);
    setActiveSlug(slug);

    const isAdmin = isAdminSubdomain(hostname);
    setIsAdminArea(isAdmin);

    try {
      const tenant = await getTenantBySlug({ data: { slug } });

      if (tenant) {
        setActiveTenant(tenant);
        if (tenant.plans) {
          setActivePlan(tenant.plans);
        }
      } else {
        // Fallback default tenant for single-school SIGA client
        setActiveTenant({
          id: "ten-default-001",
          name: "Colégio SIGA",
          slug: slug,
          status: "active",
          subscription_status: "active",
          max_students: 1000,
          max_storage_gb: 20,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("[TenantProvider] Error loading tenant, using default single-school mode:", err);
    } finally {
      setIsLoadingTenant(false);
    }
  };

  useEffect(() => {
    loadTenant();
  }, []);

  const setDevSlug = (slug: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("siga_dev_tenant_slug", slug);
      loadTenant();
    }
  };

  const isSuspended = activeTenant?.status === "suspended" || activeTenant?.status === "past_due";

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
        <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 text-white">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Assinatura Suspensa</h1>
            <p className="mt-2 text-sm text-slate-400">
              A assinatura da instituição{" "}
              <strong className="text-white">{activeTenant?.name}</strong> encontra-se
              temporariamente suspensa por razões administrativas.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Entre em contacto com o suporte do SIGA para regularizar o acesso da sua instituição.
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
