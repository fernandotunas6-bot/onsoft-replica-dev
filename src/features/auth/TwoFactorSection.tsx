import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaFrame } from "@/components/ui/media-frame";
import { supabase } from "@/integrations/supabase/client";

const MFA_STATUS_QUERY_KEY = ["auth", "mfa-status"] as const;

async function fetchMfaStatus() {
  const [factorsResult, assuranceResult] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factorsResult.error) throw factorsResult.error;
  if (assuranceResult.error) throw assuranceResult.error;
  const verifiedTotp = factorsResult.data.totp.find((factor) => factor.status === "verified") ?? null;
  const unverifiedTotp = factorsResult.data.totp.filter((factor) => factor.status !== "verified");
  return {
    verifiedTotp,
    unverifiedTotp,
    currentLevel: assuranceResult.data.currentLevel,
    nextLevel: assuranceResult.data.nextLevel,
  };
}

/**
 * Ativação de MFA/TOTP e, quando a sessão actual ainda está em AAL1 mas um
 * factor já foi verificado, o "step-up" que confirma o código e eleva a
 * sessão para AAL2 sem exigir logout/login (AuthGate reage ao evento
 * MFA_CHALLENGE_VERIFIED emitido pelo supabase-js e actualiza a sessão).
 */
export function TwoFactorSection() {
  const queryClient = useQueryClient();
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [busy, setBusy] = useState(false);

  const statusQuery = useQuery({
    queryKey: MFA_STATUS_QUERY_KEY,
    queryFn: fetchMfaStatus,
    staleTime: 10_000,
  });

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: MFA_STATUS_QUERY_KEY });

  const startEnrollment = async () => {
    setBusy(true);
    try {
      const existing = await supabase.auth.mfa.listFactors();
      if (existing.error) throw existing.error;
      for (const factor of existing.data.totp) {
        if (factor.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "SIGA" });
      if (enrolled.error) throw enrolled.error;
      setEnrollment({ factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code });
      toast.success("Leia o QR na aplicação autenticadora.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar o 2FA.");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async () => {
    if (!enrollment) return;
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challenge.data.id,
        code: enrollCode.trim(),
      });
      if (verified.error) throw verified.error;
      toast.success("2FA activado nesta conta.");
      setEnrollment(null);
      setEnrollCode("");
      await refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (factorId: string) => {
    setBusy(true);
    try {
      const result = await supabase.auth.mfa.unenroll({ factorId });
      if (result.error) throw result.error;
      toast.success("2FA desactivado nesta conta.");
      await refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desactivar o 2FA.");
    } finally {
      setBusy(false);
    }
  };

  const confirmStepUp = async (factorId: string) => {
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: stepUpCode.trim(),
      });
      if (verified.error) throw verified.error;
      toast.success("Identidade confirmada. A sessão foi elevada a AAL2.");
      setStepUpCode("");
      await refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  };

  if (statusQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A verificar estado do 2FA…</p>;
  }
  if (statusQuery.isError) {
    return <p className="text-sm text-destructive">Não foi possível obter o estado do 2FA.</p>;
  }

  const status = statusQuery.data;
  if (!status) return null;

  const needsStepUp =
    status.verifiedTotp && status.nextLevel === "aal2" && status.currentLevel !== "aal2";

  if (needsStepUp && status.verifiedTotp) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <ShieldCheck className="size-5 text-amber-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Confirmação de identidade necessária</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Esta conta tem 2FA activo, mas a sessão actual ainda não foi confirmada com o segundo
              factor. Algumas acções sensíveis (matrículas, candidaturas, pagamentos) exigem essa
              confirmação. Introduza o código da aplicação autenticadora para elevar a sessão.
            </p>
          </div>
        </div>
        <div className="flex gap-2 max-w-md">
          <Input
            aria-label="Código de confirmação 2FA"
            value={stepUpCode}
            onChange={(event) => setStepUpCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Código de 6 dígitos"
          />
          <Button
            disabled={busy || stepUpCode.length < 6}
            onClick={() => void confirmStepUp(status.verifiedTotp!.id)}
          >
            Confirmar
          </Button>
        </div>
      </div>
    );
  }

  if (status.verifiedTotp) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <ShieldCheck className="size-5 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Segurança de Dois Fatores</h4>
            <Badge>Activo</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A sua conta está protegida com um segundo factor (TOTP). Necessário para matricular
            alunos, aceitar candidaturas e registar pagamentos.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy}
            onClick={() => void removeFactor(status.verifiedTotp!.id)}
          >
            Desactivar 2FA
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Associe uma aplicação autenticadora (Google Authenticator, Authy ou 1Password). Algumas
        acções sensíveis (matrículas, candidaturas, pagamentos) exigem 2FA activo na sessão.
      </p>
      {enrollment ? (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
          <MediaFrame
            src={enrollment.qr}
            alt="QR do autenticador"
            ratio="1/1"
            rounded="rounded-lg"
            className="mx-auto size-40 bg-background p-2"
            imgClassName="object-contain"
          />
          <div className="flex gap-2">
            <Input
              aria-label="Código de autenticação em dois passos"
              value={enrollCode}
              onChange={(event) => setEnrollCode(event.target.value)}
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
            />
            <Button disabled={busy || enrollCode.length < 6} onClick={() => void confirmEnrollment()}>
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => void startEnrollment()}>
          Ativar 2FA nesta conta
        </Button>
      )}
    </div>
  );
}
