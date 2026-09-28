import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaFrame } from "@/components/ui/media-frame";
import { Separator } from "@/components/ui/separator";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { supabase } from "@/integrations/supabase/client";
import { listRecentAuditLogs, type RecentAuditLog } from "@/features/school/server";
import type { AuditScope } from "@/features/audit/audit-view";
import { cn } from "@/lib/utils";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";

const accessPolicies = [
  { label: "Protecção de rotas por cargo (RouteAccessGate)", state: "Activo" },
  { label: "Escrita sensível via service role no servidor", state: "Activo" },
  { label: "Auditoria recente (audit_logs SGA)", state: "Activo" },
  { label: "2FA TOTP (Supabase Auth MFA)", state: "Disponível" },
  { label: "Restrição por horário escolar", state: "Não configurado" },
];

function AuditLogList() {
  const currentUser = useCurrentAccount();
  const isAdministrator = currentUser.role === "Administrador";
  const [scope, setScope] = useState<AuditScope>("all");
  const auditQuery = useQuery({
    queryKey: ["audit-logs", "recent", currentUser.id, scope],
    enabled: isAdministrator,
    staleTime: 30_000,
    queryFn: () => listRecentAuditLogs({ data: { scope } }) as Promise<RecentAuditLog[]>,
  });
  const scopeToggle = (
    <div className="flex gap-1 text-xs" role="group" aria-label="Filtrar auditoria">
      {(
        [
          ["all", "Tudo"],
          ["academic", "Académica"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={scope === value}
          onClick={() => setScope(value)}
          className={cn(
            "rounded-md px-2 py-1 text-muted-foreground",
            scope === value && "bg-secondary text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (currentUser.profile.isLoading) {
    return <p className="text-sm text-muted-foreground">A confirmar permissões…</p>;
  }
  if (!isAdministrator) {
    return (
      <p className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        O histórico completo está disponível apenas para administradores.
      </p>
    );
  }
  const status = auditQuery.isLoading ? (
    <p className="text-sm text-muted-foreground">A carregar eventos…</p>
  ) : auditQuery.isError ? (
    <p className="text-sm text-destructive">Não foi possível carregar a auditoria.</p>
  ) : !auditQuery.data?.length ? (
    <p className="text-sm text-muted-foreground">Ainda não existem eventos registados.</p>
  ) : null;
  if (status || !auditQuery.data) {
    return (
      <div className="space-y-2">
        {scopeToggle}
        {status}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scopeToggle}
      <ul className="space-y-2 text-sm">
        {auditQuery.data.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5"
          >
            <p>
              {event.summary}
              {event.changed_fields.length ? (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {event.changed_fields.join(", ")}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {event.actor_id
                ? event.actor_id === currentUser.id
                  ? currentUser.name
                  : (event.actor_name ?? `Utilizador ${event.actor_id.slice(0, 8)}`)
                : "Sistema"}
              {" · "}
              {new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(
                new Date(event.created_at),
              )}
            </p>
            {event.reason ? (
              <p className="mt-1 text-xs text-muted-foreground">Motivo: {event.reason}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TwoFactorEnroll() {
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <h5 className="text-xs font-bold text-muted-foreground">Autenticação em dois passos</h5>
      <p className="text-sm text-muted-foreground">
        Associe uma aplicação autenticadora (Google Authenticator, Authy ou 1Password). No próximo
        login o SIGA pede o código TOTP.
      </p>
      {qr ? (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
          <MediaFrame
            src={qr}
            alt="QR do autenticador"
            ratio="1/1"
            rounded="rounded-lg"
            className="mx-auto size-40 bg-background p-2"
            imgClassName="object-contain"
          />
          <div className="flex gap-2">
            <Input
              aria-label="Código de autenticação em dois passos"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
            />
            <Button
              disabled={busy || code.length < 6 || !factorId}
              onClick={async () => {
                if (!factorId) return;
                setBusy(true);
                try {
                  const challenge = await supabase.auth.mfa.challenge({ factorId });
                  if (challenge.error) throw challenge.error;
                  const verified = await supabase.auth.mfa.verify({
                    factorId,
                    challengeId: challenge.data.id,
                    code: code.trim(),
                  });
                  if (verified.error) throw verified.error;
                  toast.success("2FA activado nesta conta.");
                  setQr(null);
                  setFactorId(null);
                  setCode("");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Código inválido.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const enrolled = await supabase.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: "SIGA",
              });
              if (enrolled.error) throw enrolled.error;
              setFactorId(enrolled.data.id);
              setQr(enrolled.data.totp.qr_code);
              toast.success("Leia o QR na aplicação autenticadora.");
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Não foi possível iniciar o 2FA.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Activar 2FA nesta conta
        </Button>
      )}
    </div>
  );
}

export function SecurityPanel() {
  const resendOn = useInstalledIntegrations().hasCapability("resend.send");
  return (
    <div className="space-y-8">
      {resendOn ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm">
          <p className="font-semibold">Convites por e-mail</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Com Resend instalado, use{" "}
            <Link to="/acessos" className="font-semibold text-primary hover:underline">
              Acessos
            </Link>{" "}
            para copiar links de convite ou recuperação nos botões Reenviar / E-mail.
          </p>
        </div>
      ) : null}
      <TwoFactorEnroll />
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Políticas de acesso</h5>
        <ul className="space-y-1">
          {accessPolicies.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/60"
            >
              <span className="text-sm">{s.label}</span>
              <Badge variant={s.state === "Activo" ? "default" : "secondary"}>{s.state}</Badge>
            </li>
          ))}
        </ul>
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Auditoria</h5>
        <AuditLogList />
      </div>
    </div>
  );
}
