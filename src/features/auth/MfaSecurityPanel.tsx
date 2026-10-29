import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MediaFrame } from "@/components/ui/media-frame";
import { supabase } from "@/integrations/supabase/client";

export function MfaSecurityPanel() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState<{ id: string; qrCode: string } | null>(null);
  const [incompleteFactorId, setIncompleteFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    let active = true;

    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        toast.error("Não foi possível verificar o estado do 2FA.");
      } else {
        setEnabled(Boolean(data?.totp.some((factor) => factor.status === "verified")));
        // `data.totp` só traz factores verificados (auth-js: `Factor<K,'verified'>[]`),
        // logo procurar ali por "unverified" nunca encontrava nada e a recuperação
        // de um enrolamento a meio não chegava a acontecer. `data.all` traz os dois.
        setIncompleteFactorId(
          data?.all.find(
            (factor) => factor.factor_type === "totp" && factor.status === "unverified",
          )?.id ?? null,
        );
      }
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const discardIncompleteEnrollment = async (factorId: string) => {
    setEnrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setPending(null);
      setIncompleteFactorId(null);
      setCode("");
      toast.success("Configuração 2FA incompleta removida.");
    } catch {
      toast.error("Não foi possível remover a configuração 2FA incompleta.");
    } finally {
      setEnrolling(false);
    }
  };

  const enroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "SIGA Authenticator",
      });
      if (error || !data?.totp?.qr_code) throw error ?? new Error("QR code indisponível.");
      setPending({ id: data.id, qrCode: data.totp.qr_code });
      setCode("");
    } catch {
      toast.error("Não foi possível iniciar o 2FA. Tente novamente.");
    } finally {
      setEnrolling(false);
    }
  };

  const confirm = async () => {
    if (!pending || code.trim().length < 6) return;
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: pending.id });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) throw verified.error;
      setEnabled(true);
      setPending(null);
      setCode("");
      window.dispatchEvent(new Event("siga:mfa-factors-changed"));
      toast.success("Autenticador configurado. Active o pedido no login se desejar.");
    } catch {
      toast.error("Código 2FA inválido ou expirado. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="size-4 text-primary" /> Verificação em dois passos (opcional)
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pode trabalhar no SIGA Plus sem configurar esta opção. Para reforçar a segurança da
            conta, siga o guia abaixo quando desejar.
          </p>
        </div>
        <Badge variant={enabled ? "default" : "outline"}>
          {checking ? "A verificar…" : enabled ? "Configurado" : "Não configurado"}
        </Badge>
      </div>

      {!checking && !enabled ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <h4 className="font-medium">Como activar, passo a passo</h4>
          <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">
            <li>Instale uma aplicação autenticadora no seu telemóvel. Escolha uma das opções abaixo.</li>
            <li>Nesta página, clique em <strong>Configurar 2FA</strong>.</li>
            <li>Na aplicação do telemóvel, toque em <strong>Adicionar conta</strong> e leia o código QR apresentado no SIGA.</li>
            <li>Introduza no SIGA os seis números mostrados pela aplicação e clique em <strong>Activar</strong>.</li>
            <li>Se também quiser pedir o código ao entrar, active <strong>Código ao iniciar sessão</strong> no painel seguinte.</li>
          </ol>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              Google Authenticator — Android
            </a>
            <a href="https://apps.apple.com/us/app/google-authenticator/id388497605" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              Google Authenticator — iPhone
            </a>
            <a href="https://support.microsoft.com/en-us/authenticator/download-microsoft-authenticator" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              Microsoft Authenticator — Android e iPhone
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            A configuração é facultativa. Não partilhe o código QR nem os códigos de seis números.
          </p>
        </div>
      ) : null}

      {!checking && !enabled && !pending && !incompleteFactorId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void enroll()}
          disabled={enrolling}
        >
          {enrolling ? "A preparar…" : "Configurar 2FA"}
        </Button>
      ) : null}

      {!checking && !enabled && !pending && incompleteFactorId ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
          <span>Existe uma configuração 2FA incompleta.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void discardIncompleteEnrollment(incompleteFactorId)}
            disabled={enrolling}
          >
            Remover e configurar novamente
          </Button>
        </div>
      ) : null}

      {pending ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {/*
            O fundo do QR é branco em qualquer tema — não é decoração: um leitor
            de códigos precisa do contraste máximo entre módulo e fundo, e no
            tema escuro um fundo escuro torna o código ilegível. `siga-official-paper`
            é o utilitário que o sistema já tem para "papel branco invariável".
          */}
          <MediaFrame
            src={pending.qrCode}
            alt="QR code para configurar autenticação de dois fatores"
            ratio="1/1"
            rounded="rounded-md"
            priority
            className="size-40 border"
            imgClassName="siga-official-paper object-contain p-2"
          />
          <p className="text-xs text-muted-foreground">
            Abra a aplicação autenticadora no telemóvel, escolha adicionar conta e
            leia este QR. Depois introduza abaixo o código de seis números.
          </p>
          <Label htmlFor="mfa-setup-code">Código da aplicação autenticadora</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="mfa-setup-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              placeholder="000000"
              maxLength={6}
            />
            <Button
              type="button"
              onClick={() => void confirm()}
              disabled={verifying || code.length !== 6}
            >
              {verifying ? "A confirmar…" : "Ativar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void discardIncompleteEnrollment(pending.id)}
              disabled={verifying || enrolling}
            >
              Cancelar configuração
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
