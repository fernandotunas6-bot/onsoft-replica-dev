import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  Settings2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { SCHOOL_ENVIRONMENTS, type SchoolEnvironmentId } from "@/features/auth/environments";
import {
  getAdminWelcomeStatus,
  repairOwnAdminAccess,
  type AdminWelcomeStatus,
} from "@/features/school/admin-welcome";
import { toast } from "sonner";
import { toastActionError } from "@/lib/action-error-toast";
import { moduleIcons } from "@/lib/app-icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes_/boas-vindas")({
  head: () => ({
    meta: [
      { title: "Onde deseja começar? · SIGA" },
      {
        name: "description",
        content:
          "Estado do acesso do administrador e escolha do ambiente: painel administrativo, portal escolar ou assistente de configuração.",
      },
    ],
  }),
  component: AdminWelcomePage,
});

const WELCOME_QUERY_KEY = ["school", "admin-welcome"] as const;

const ICONS: Record<SchoolEnvironmentId, typeof LayoutDashboard> = {
  admin: LayoutDashboard,
  portal: GraduationCap,
  setup: Settings2,
};

function AdminWelcomePage() {
  const account = useCurrentAccount();
  const isAdmin = account.roles.includes("Administrador");
  const fetchStatus = useServerFn(getAdminWelcomeStatus);
  const query = useQuery({
    queryKey: WELCOME_QUERY_KEY,
    enabled: isAdmin,
    queryFn: () => fetchStatus() as Promise<AdminWelcomeStatus>,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Sistema"
          title="Onde deseja começar?"
          description="A mesma conta abre o painel administrativo, o portal escolar e o assistente de configuração."
          icon={moduleIcons.school}
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Esta página é do Administrador da escola.
            </p>
          </Panel>
        ) : query.isLoading || account.profile.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" aria-label="A verificar o acesso" />
          </div>
        ) : query.isError || !query.data ? (
          <Panel title="Não foi possível verificar">
            <p className="text-sm text-muted-foreground">Tente de novo dentro de instantes.</p>
          </Panel>
        ) : (
          <WelcomeContent status={query.data} />
        )}
      </div>
    </AppShell>
  );
}

function WelcomeContent({ status }: { status: AdminWelcomeStatus }) {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const repairFn = useServerFn(repairOwnAdminAccess);
  const repair = useMutation({
    mutationFn: () => repairFn(),
    onSuccess: async (result) => {
      toast.success(
        result.actions.length ? result.actions.join(" ") : "Não havia nada a corrigir.",
      );
      await queryClient.invalidateQueries({ queryKey: WELCOME_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
    onError: (error) => toastActionError(error, "Não foi possível corrigir o acesso."),
  });

  const { created, access, setup } = status;
  const open = (path: string) => {
    if (account.role !== "Administrador") account.setActiveRole("Administrador");
    void navigate({ to: path as never });
  };

  return (
    <>
      <ol className="grid gap-3 lg:grid-cols-2">
        <StepCard
          index={1}
          title={`${status.schoolName} criada`}
          subtitle="Instituição, administrador e vínculo verificados"
          ok={created.ok && created.issues.length === 0}
        >
          <CheckRow ok label="Instituição registada" />
          <CheckRow ok={created.ok} label="Administrador ligado à escola" />
          {created.issues.map((issue) => (
            <IssueRow key={`${issue.code}-${issue.userId ?? ""}`} message={issue.message} />
          ))}
        </StepCard>

        <StepCard
          index={2}
          title="Autenticação segura"
          subtitle="Conta, verificação em dois passos, escola activa e permissões"
          ok={access.ok && access.twoFactorEnrolled}
        >
          <CheckRow ok={access.emailConfirmed} label="Conta confirmada" />
          <CheckRow
            ok={access.twoFactorEnrolled}
            label={
              access.twoFactorEnrolled
                ? access.sessionTwoFactor
                  ? "Verificação em dois passos activa nesta sessão"
                  : "Verificação em dois passos configurada"
                : "Verificação em dois passos por activar — necessária para gravar"
            }
            action={
              access.twoFactorEnrolled ? null : (
                <Button size="sm" variant="secondary" onClick={() => open("/perfil")}>
                  <ShieldCheck className="size-4" aria-hidden />
                  Activar
                </Button>
              )
            }
          />
          <CheckRow
            ok={access.schoolActive}
            label={access.schoolActive ? "Escola activa" : "Assinatura por regularizar"}
            action={
              access.schoolActive ? null : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => open("/configuracoes/assinatura")}
                >
                  Regularizar
                </Button>
              )
            }
          />
          <CheckRow ok={access.permissions} label="Permissões de administrador" />
          {access.issues
            .filter((issue) => issue.severity !== "info")
            .map((issue) => (
              <IssueRow key={`${issue.code}-${issue.userId ?? ""}`} message={issue.message} />
            ))}
          {status.canSelfRepair ? (
            <Button
              size="sm"
              className="mt-1 self-start"
              onClick={() => repair.mutate()}
              disabled={repair.isPending}
            >
              <Wrench className="size-4" aria-hidden />
              {repair.isPending ? "A corrigir…" : "Corrigir automaticamente"}
            </Button>
          ) : null}
        </StepCard>
      </ol>

      <Panel title="3. Onde deseja começar?">
        <div className="grid gap-3 md:grid-cols-3">
          {SCHOOL_ENVIRONMENTS.map((env) => {
            const Icon = ICONS[env.id];
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => open(env.path)}
                className="group flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <ArrowRight
                    className="ml-auto size-4 opacity-50 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
                <span className="text-sm font-semibold">{env.title}</span>
                <span className="text-xs text-muted-foreground">{env.hint}</span>
                {env.id === "setup" && setup ? (
                  <span className="mt-1 block">
                    <span className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {setup.ready
                          ? "Pronta a funcionar"
                          : `${setup.done} de ${setup.total} passos`}
                      </span>
                      <span className="font-semibold tabular-nums">{setup.percent}% concluído</span>
                    </span>
                    <span
                      className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={setup.percent}
                      aria-label="Configuração concluída"
                    >
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          setup.ready ? "bg-success" : "bg-primary",
                        )}
                        style={{ width: `${setup.percent}%` }}
                      />
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pode mudar de ambiente a qualquer momento no seletor do topo. A Administração Global da
          plataforma é reservada à equipa do SIGA Plus.
        </p>
      </Panel>
    </>
  );
}

function StepCard({
  index,
  title,
  subtitle,
  ok,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        ok ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            ok ? "bg-success/15 text-success-strong" : "bg-warning/15 text-warning-strong",
          )}
          aria-hidden
        >
          {ok ? <CheckCircle2 className="size-4" /> : index}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {index}. {title}
          </p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </li>
  );
}

function CheckRow({ ok, label, action }: { ok: boolean; label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-success-strong" aria-hidden />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        {label}
        <span className="sr-only">{ok ? " (concluído)" : " (pendente)"}</span>
      </span>
      {action}
    </div>
  );
}

function IssueRow({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 text-xs text-warning-strong">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
