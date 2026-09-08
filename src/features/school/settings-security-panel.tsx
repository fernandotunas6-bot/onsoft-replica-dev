import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { TwoFactorSection } from "@/features/auth/TwoFactorSection";
import { listRecentAuditLogs, type RecentAuditLog } from "@/features/school/server";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";

const accessPolicies = [
  { label: "Protecção de rotas por cargo (RouteAccessGate)", state: "Activo" },
  { label: "Escrita sensível via service role no servidor", state: "Activo" },
  { label: "Auditoria recente (audit_logs SGA)", state: "Activo" },
  { label: "2FA TOTP (Supabase Auth MFA)", state: "Disponível" },
  { label: "Restrição por horário escolar", state: "Não configurado" },
];

function formatAuditAction(action: string, entityType: string) {
  const operation = action.split(".").at(-1)?.toLowerCase();
  const operationLabel =
    operation === "insert" ? "Criou" : operation === "delete" ? "Eliminou" : "Actualizou";
  const entityLabels: Record<string, string> = {
    schools: "escola",
    people: "pessoa",
    students: "aluno",
    enrollments: "matrícula",
    school_memberships: "conta de acesso",
    roles: "papel",
    member_roles: "função",
    student_guardians: "encarregado",
    finance_invoices: "fatura",
    finance_receipts: "recibo",
    announcements: "comunicado",
    terms: "período lectivo",
    class_groups: "turma",
    document_requests: "documento",
  };
  return `${operationLabel} ${entityLabels[entityType] ?? entityType}`;
}

function AuditLogList() {
  const currentUser = useCurrentAccount();
  const isAdministrator = currentUser.role === "Administrador";
  const auditQuery = useQuery({
    queryKey: ["audit-logs", "recent", currentUser.id],
    enabled: isAdministrator,
    staleTime: 30_000,
    queryFn: () => listRecentAuditLogs() as Promise<RecentAuditLog[]>,
  });

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
  if (auditQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar eventos…</p>;
  }
  if (auditQuery.isError) {
    return <p className="text-sm text-destructive">Não foi possível carregar a auditoria.</p>;
  }
  if (!auditQuery.data?.length) {
    return <p className="text-sm text-muted-foreground">Ainda não existem eventos registados.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {auditQuery.data.map((event) => (
        <li key={event.id} className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5">
          <p className="font-medium">{formatAuditAction(event.action, event.entity_type)}</p>
          <p className="text-xs text-muted-foreground">
            {event.actor_id
              ? event.actor_id === currentUser.id
                ? currentUser.name
                : `Utilizador ${event.actor_id.slice(0, 8)}`
              : "Sistema"}
            {" · "}
            {new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(event.created_at),
            )}
          </p>
          {event.reason ? (
            <p className="mt-1 text-xs text-muted-foreground">{event.reason}</p>
          ) : null}
        </li>
      ))}
    </ul>
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
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Autenticação em dois passos
        </h5>
        <TwoFactorSection />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Políticas de acesso
        </h5>
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
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Auditoria
        </h5>
        <AuditLogList />
      </div>
    </div>
  );
}
