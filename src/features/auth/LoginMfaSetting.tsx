import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { reportPossibleStepUp } from "@/lib/step-up";
import { forgetTrustedDevice } from "@/features/auth/trusted-device";
import { isLoginMfaEnabled } from "./login-mfa-policy";
import { setLoginMfaPreference } from "./login-mfa-server";

/** Único controlo por conta, partilhado entre Perfil e Definições → Segurança. */
export function LoginMfaSetting() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [userResult, factorsResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (userResult.error || !userResult.data.user || factorsResult.error) {
      throw new Error("Não foi possível consultar as definições de segurança.");
    }
    setEnabled(isLoginMfaEnabled(userResult.data.user.app_metadata));
    setConfigured(Boolean(factorsResult.data?.all.some((factor) => factor.status === "verified")));
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void load()
        .then(
          () => {
            if (active) setError(false);
          },
          () => {
            if (active) setError(true);
          },
        )
        .finally(() => {
          if (active) setChecking(false);
        });
    };
    refresh();
    window.addEventListener("siga:mfa-factors-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("siga:mfa-factors-changed", refresh);
    };
  }, [load]);

  const change = async (next: boolean) => {
    setSaving(true);
    try {
      await setLoginMfaPreference({ data: { enabled: next } });
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      // A preferência já foi gravada; não afirmar que falhou se apenas a
      // actualização da sessão local teve problema.
      if (refreshError || !data.session) {
        setEnabled(next);
        toast.warning("Preferência guardada. Volte a entrar para actualizar a sessão.");
      } else {
        setEnabled(next);
        if (!next) forgetTrustedDevice(data.session.user.id);
        toast.success(
          next
            ? "Verificação no início de sessão activada para todas as escolas."
            : "Entrada sem código activada para todas as escolas.",
        );
      }
    } catch (saveError) {
      if (!reportPossibleStepUp(saveError)) {
        toast.error(saveError instanceof Error ? saveError.message : "Não foi possível guardar.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Código ao iniciar sessão
          </h3>
          <p className="text-xs text-muted-foreground">
            Opcional e desligado por omissão: pode entrar e trabalhar sem código adicional. Depois
            de configurar o autenticador acima, active esta opção apenas se desejar pedir um código
            ao iniciar sessão. Algumas operações financeiras e outras acções sensíveis continuam a
            ter verificações próprias.
          </p>
          {!configured && !checking && !error ? (
            <p className="text-xs text-muted-foreground">
              Configure primeiro um factor de segurança no painel acima.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              Não foi possível consultar o estado.
            </p>
          ) : null}
        </div>
        <Switch
          aria-label="Pedir código ao iniciar sessão"
          checked={enabled}
          disabled={checking || saving || error || (!configured && !enabled)}
          onCheckedChange={(next) => void change(next)}
        />
      </div>
    </section>
  );
}
