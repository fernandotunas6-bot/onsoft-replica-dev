import { useState } from "react";
import { Fingerprint, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  passkeyErrorMessage,
  passkeysSupported,
  verifyWithCode,
  verifyWithPasskey,
  type VerificationFactors,
} from "@/features/auth/verification";

/**
 * Segundo passo da entrada (e da reconfirmação). Com chave de acesso, um
 * toque; o código da aplicação autenticadora fica como recurso.
 */
export function MfaChallenge({
  factors,
  intro,
  onVerified,
  onCancel,
  cancelLabel,
}: {
  factors: VerificationFactors;
  intro?: string;
  onVerified: (method: "passkey" | "code") => void | Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const canUsePasskey = Boolean(factors.passkeyId) && passkeysSupported();
  const [useCode, setUseCode] = useState(!canUsePasskey);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (method: "passkey" | "code") => {
    try {
      await onVerified(method);
    } catch (finishError) {
      setError(
        finishError instanceof Error ? finishError.message : "Não foi possível concluir a entrada.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmWithPasskey = async () => {
    if (!factors.passkeyId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyWithPasskey(factors.passkeyId);
    } catch (passkeyError) {
      setError(passkeyErrorMessage(passkeyError));
      if (factors.totpId) setUseCode(true);
      setBusy(false);
      return;
    }
    await finish("passkey");
  };

  const confirmWithCode = async () => {
    if (!factors.totpId || code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      await verifyWithCode(factors.totpId, code);
    } catch {
      setError("Código inválido ou expirado. Confira a hora do telemóvel e tente de novo.");
      setBusy(false);
      return;
    }
    setCode("");
    await finish("code");
  };

  return (
    <div className="space-y-4">
      {intro ? <p className="text-xs text-muted-foreground">{intro}</p> : null}

      {canUsePasskey && !useCode ? (
        <>
          <Button
            type="button"
            className="h-11 w-full gap-2 text-sm font-semibold"
            disabled={busy}
            onClick={() => void confirmWithPasskey()}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Fingerprint className="size-4" />
            )}
            {busy ? "A confirmar…" : "Confirmar com um toque"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Impressão digital, Face ID, Windows Hello ou PIN do dispositivo.
          </p>
        </>
      ) : null}

      {useCode && factors.totpId ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmWithCode();
          }}
        >
          <Input
            aria-label="Código da aplicação autenticadora"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            required
          />
          <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
            {busy ? "A verificar…" : "Confirmar código"}
          </Button>
        </form>
      ) : null}

      {!canUsePasskey && !factors.totpId ? (
        <p role="alert" className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-foreground">
          Esta conta só tem chave de acesso e este navegador não a consegue usar. Abra o SIGA no
          dispositivo onde criou a chave, ou peça ao administrador para repor o 2FA.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-1">
        {canUsePasskey && factors.totpId ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto gap-1.5 text-xs text-muted-foreground"
            disabled={busy}
            onClick={() => {
              setError(null);
              setUseCode((value) => !value);
            }}
          >
            <KeyRound className="size-3.5" />
            {useCode ? "Usar a chave de acesso" : "Usar o código da aplicação autenticadora"}
          </Button>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel ?? "Cancelar"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
