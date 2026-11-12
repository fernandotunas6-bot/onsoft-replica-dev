import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { PasskeysPanel } from "@/features/auth/PasskeysPanel";
import { MfaSecurityPanel } from "@/features/auth/MfaSecurityPanel";
import { LoginMfaSetting } from "@/features/auth/LoginMfaSetting";
import { listRecentAuditLogs, type RecentAuditLog } from "@/features/school/server";
import type { AuditScope } from "@/features/audit/audit-view";
import { cn } from "@/lib/utils";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import {
  getStudentAccessSettings,
  setStudentNumberLogin,
} from "@/features/access/student-access-server";

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
    <p className="text-sm text-destructive-strong">Não foi possível carregar a auditoria.</p>
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

const STUDENT_ACCESS_KEY = ["student-access-settings"] as const;

/** «Os alunos podem entrar com o número de aluno» — só o Administrador, com 2FA. */
function StudentNumberLoginSetting() {
  const currentUser = useCurrentAccount();
  const isAdministrator = currentUser.role === "Administrador";
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: [...STUDENT_ACCESS_KEY, currentUser.id],
    enabled: isAdministrator,
    staleTime: 60_000,
    queryFn: () => getStudentAccessSettings(),
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) => setStudentNumberLogin({ data: { enabled } }),
    onSuccess: (next) => {
      queryClient.setQueryData([...STUDENT_ACCESS_KEY, currentUser.id], next);
      toast.success(
        next.student_number_login
          ? "Os alunos já podem entrar com o número de aluno."
          : "O número de aluno deixou de servir para entrar.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar."),
  });
  if (!isAdministrator) return null;
  const enabled = settings.data?.student_number_login ?? false;
  return (
    <>
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Acesso dos alunos</h5>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-3 py-3">
          <div className="space-y-1">
            <label htmlFor="student-number-login" className="text-sm font-semibold">
              Entrar com o número de aluno
            </label>
            <p className="text-xs text-muted-foreground">
              O aluno escreve o número (ex.: 1260001) em vez do e-mail, com a senha da conta. Só
              vale no endereço da escola e para alunos com conta ligada. Mudar pede 2FA.
            </p>
            {settings.isError ? (
              <p className="text-xs text-destructive-strong">
                Não foi possível ler esta definição.
              </p>
            ) : null}
          </div>
          <Switch
            id="student-number-login"
            checked={enabled}
            disabled={settings.isLoading || settings.isError || save.isPending}
            onCheckedChange={(checked) => save.mutate(checked)}
          />
        </div>
      </div>
      <Separator />
    </>
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
      <PasskeysPanel />
      <MfaSecurityPanel />
      <LoginMfaSetting />
      <Separator />
      <StudentNumberLoginSetting />
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
