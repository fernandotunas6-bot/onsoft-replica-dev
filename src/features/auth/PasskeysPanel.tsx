import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { reportPossibleStepUp } from "@/lib/step-up";
import {
  passkeyErrorMessage,
  passkeysSupported,
  registerPasskey,
} from "@/features/auth/verification";

type Passkey = { id: string; name: string; createdAt: string };

/**
 * Chaves de acesso da conta: a forma principal de confirmar a identidade
 * (um toque). O código da aplicação autenticadora fica como recurso.
 */
export function PasskeysPanel() {
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = passkeysSupported();

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setKeys([]);
      return;
    }
    setKeys(
      (data?.webauthn ?? []).map((factor) => ({
        id: factor.id,
        name: factor.friendly_name || "Chave de acesso",
        createdAt: factor.created_at,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      await registerPasskey();
      toast.success("Chave de acesso criada. Da próxima vez basta um toque.");
      await load();
    } catch (error) {
      toast.error(passkeyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast.success("Chave de acesso removida.");
      await load();
    } catch (error) {
      if (!reportPossibleStepUp(error)) {
        toast.error("Não foi possível remover a chave. Confirme o 2FA e tente de novo.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Fingerprint className="size-4 text-primary" /> Chaves de acesso
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirme que é você com a impressão digital, Face ID, Windows Hello ou o PIN do
            dispositivo. Um toque, sem códigos.
          </p>
        </div>
        <Badge variant={keys?.length ? "default" : "outline"}>
          {keys === null ? "A verificar…" : keys.length ? `${keys.length} activa(s)` : "Nenhuma"}
        </Badge>
      </div>

      {keys?.length ? (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-background">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="min-w-0 truncate">{key.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover ${key.name}`}
                disabled={busy}
                onClick={() => void remove(key.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {supported ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5"
          disabled={busy}
          onClick={() => void add()}
        >
          <Fingerprint className="size-3.5" />
          {keys?.length ? "Adicionar outro dispositivo" : "Criar chave de acesso"}
        </Button>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Este navegador não suporta chaves de acesso. Use o código da aplicação autenticadora.
        </p>
      )}
    </section>
  );
}
