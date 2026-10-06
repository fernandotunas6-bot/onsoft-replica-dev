import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeVaultExists, resetNativeVault } from "@/lib/native-stronghold";
import {
  isDesktopSessionRuntime,
  isDesktopSessionUnlocked,
  unlockDesktopSession,
} from "@/lib/desktop-session-vault";

const MIN_PIN = 6;

type Mode = "loading" | "create" | "unlock" | "forgot" | "open";

/**
 * PIN do posto (só na app desktop). A sessão do SIGA fica no cofre cifrado deste
 * computador; o PIN abre-o ao arrancar a app. Até lá, a autenticação espera (ver
 * `desktop-session-vault`). No navegador não mostra nada.
 */
export function DesktopVaultGate() {
  const [mode, setMode] = useState<Mode>("open");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDesktopSessionRuntime() || isDesktopSessionUnlocked()) return;
    setMode("loading");
    nativeVaultExists()
      .then((exists) => setMode(exists ? "unlock" : "create"))
      .catch((reason) => {
        setError(String(reason));
        setMode("unlock");
      });
  }, []);

  if (mode === "open") return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (pin.length < MIN_PIN) {
      setError(`O PIN tem de ter pelo menos ${MIN_PIN} caracteres.`);
      return;
    }
    if (mode === "create" && pin !== confirmation) {
      setError("Os dois PIN não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await unlockDesktopSession(pin);
      setMode("open");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPin("");
      setConfirmation("");
      setBusy(false);
    }
  };

  const forget = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetNativeVault();
      setMode("create");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-vault-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-background p-4"
    >
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          {mode === "create" ? (
            <KeyRound className="size-6 text-primary" aria-hidden="true" />
          ) : (
            <Lock className="size-6 text-primary" aria-hidden="true" />
          )}
          <h1 id="desktop-vault-title" className="text-lg font-semibold">
            {mode === "create"
              ? "Criar o PIN deste computador"
              : mode === "forgot"
                ? "Esqueceu o PIN?"
                : "PIN deste computador"}
          </h1>
        </div>

        {mode === "loading" ? (
          <p className="text-sm text-muted-foreground">A abrir o cofre…</p>
        ) : mode === "forgot" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O cofre deste computador é apagado e cria um PIN novo. Terá de entrar no SIGA outra
              vez; os dados da escola não se perdem.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => void forget()}>
                Apagar e criar PIN novo
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setMode("unlock")}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <p className="text-sm text-muted-foreground">
              {mode === "create"
                ? "A sessão do SIGA fica guardada e cifrada neste computador. Escolha um PIN (6 caracteres ou mais) para a abrir sempre que iniciar a app."
                : "Introduza o PIN para abrir a sessão guardada neste computador."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="desktop-vault-pin">PIN</Label>
              <Input
                id="desktop-vault-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(event) => setPin(event.target.value)}
              />
            </div>
            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="desktop-vault-pin-confirm">Repetir o PIN</Label>
                <Input
                  id="desktop-vault-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "A abrir…" : mode === "create" ? "Criar PIN" : "Abrir"}
            </Button>
            {mode === "unlock" && (
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setError(null);
                  setMode("forgot");
                }}
              >
                Esqueci o PIN
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
