"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PayflowBrandIcon } from "@/features/finance/components/PayflowBrandIcon";
import { createPayflowAdminLaunch } from "@/features/finance/server";
import { getPayflowAdminUrl } from "@/lib/ecosystem-urls";
import { cn } from "@/lib/utils";

type PayflowAdminLaunchButtonProps = {
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  children: ReactNode;
  /** Quando true, renderiza como item de menu (sem estilos de botão cheios). */
  asMenuItem?: boolean;
};

/**
 * Lança o PayFlow /admin com SSO assinado (form POST → cookie HttpOnly).
 * Se o SSO não estiver configurado, cai no URL directo (sandbox / chave local).
 */
export function PayflowAdminLaunchButton({
  className,
  variant = "outline",
  size = "default",
  children,
  asMenuItem = false,
}: PayflowAdminLaunchButtonProps) {
  const [busy, setBusy] = useState(false);

  async function launch() {
    try {
      setBusy(true);
      const launch = await createPayflowAdminLaunch();
      const form = document.createElement("form");
      form.method = "POST";
      form.action = launch.exchangeUrl;
      form.target = "_blank";
      form.style.display = "none";

      const assertion = document.createElement("input");
      assertion.type = "hidden";
      assertion.name = "assertion";
      assertion.value = launch.assertion;
      form.appendChild(assertion);

      const redirect = document.createElement("input");
      redirect.type = "hidden";
      redirect.name = "redirect_to";
      redirect.value = "/admin";
      form.appendChild(redirect);

      document.body.appendChild(form);
      form.submit();
      form.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o PayFlow.";
      const fallback = getPayflowAdminUrl();
      if (fallback && /PAYFLOW_SSO_SECRET|VITE_PAYFLOW_URL/i.test(message)) {
        toast.message("A abrir PayFlow sem SSO (configure PAYFLOW_SSO_SECRET para produção).");
        window.open(fallback, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (asMenuItem) {
    return (
      <button
        type="button"
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none",
          "hover:bg-accent hover:text-accent-foreground",
          className,
        )}
        disabled={busy}
        onClick={() => void launch()}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PayflowBrandIcon size={14} />}
        {children}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      disabled={busy}
      onClick={() => void launch()}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <PayflowBrandIcon size={16} />}
      {children}
    </Button>
  );
}
