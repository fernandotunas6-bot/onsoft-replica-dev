import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { Fingerprint, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaChallenge } from "./MfaChallenge";
import { STEP_UP_REQUIRED_EVENT } from "@/lib/step-up";
import {
  listVerificationFactors,
  passkeyErrorMessage,
  passkeysSupported,
  registerPasskey,
  verifyWithPassword,
  type VerificationFactors,
} from "@/features/auth/verification";

/**
 * Reconfirmação antes de uma acção crítica. Abre quando o servidor recusa
 * com `STEP_UP_PREFIX` (ver `lib/step-up.ts`). Não termina a sessão nem perde
 * o que estava no ecrã: confirma e a pessoa repete a acção.
 */
export function StepUpDialog({ email }: { email: string | null }) {
  const [action, setAction] = useState<string | null>(null);
  const [factors, setFactors] = useState<VerificationFactors | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      setAction(detail?.action || "esta acção");
      setLoading(true);
      void listVerificationFactors()
        .then(setFactors, () => setFactors({ passkeyId: null, totpId: null }))
        .finally(() => setLoading(false));
    };
    window.addEventListener(STEP_UP_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(STEP_UP_REQUIRED_EVENT, onRequired);
  }, []);

  const close = () => {
    setAction(null);
    setFactors(null);
  };

  const done = () => {
    close();
    toast.success("Identidade confirmada. Repita a acção.", {
      description: "Durante 15 minutos não volta a ser pedido.",
    });
  };

  const hasFactor = Boolean(factors?.passkeyId || factors?.totpId);

  return (
    <Dialog open={action !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Confirme que é você
          </DialogTitle>
          <DialogDescription>
            «{action}» é uma acção protegida. Confirme a sua identidade para continuar.
          </DialogDescription>
        </DialogHeader>

        {loading || !factors ? (
          <div className="flex justify-center py-6">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasFactor ? (
          <MfaChallenge factors={factors} onVerified={done} onCancel={close} />
        ) : (
          <PasswordOrPasskey email={email} onDone={done} onCancel={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Conta sem 2FA: senha de novo, ou criar já uma chave de acesso (fica com 2FA). */
function PasswordOrPasskey({
  email,
  onDone,
  onCancel,
}: {
  email: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      onDone();
    } catch (passkeyError) {
      setError(passkeyErrorMessage(passkeyError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {passkeysSupported() ? (
        <>
          <Button
            type="button"
            className="h-11 w-full gap-2"
            disabled={busy}
            onClick={() => void createPasskey()}
          >
            <Fingerprint className="size-4" /> Criar chave de acesso e confirmar
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Fica com 2FA activo: das próximas vezes basta um toque.
          </p>
        </>
      ) : null}

      {email ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!password) return;
            setBusy(true);
            setError(null);
            void verifyWithPassword(email, password)
              .then(onDone, () => setError("Senha incorrecta."))
              .finally(() => setBusy(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="step-up-password" className="text-xs">
              Ou a sua senha
            </Label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={busy || !password}>
            Confirmar com a senha
          </Button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}
