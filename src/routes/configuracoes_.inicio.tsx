import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastActionError } from "@/lib/action-error-toast";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Circle, LoaderCircle, RefreshCw, Star } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  applySchoolStructure,
  getSchoolSetupStatus,
  type SchoolSetupStatus,
} from "@/features/school/setup-status";
import type { SetupStep } from "@/features/school/setup-steps";
import { moduleIcons } from "@/lib/app-icons";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes_/inicio")({
  head: () => ({
    meta: [
      { title: "Configurar a escola · SIGA" },
      {
        name: "description",
        content:
          "Passos para pôr uma escola nova a funcionar: dados, ano lectivo, turmas, propinas e equipa.",
      },
    ],
  }),
  component: SchoolSetupPage,
});

const SCHOOL_SETUP_QUERY_KEY = ["school", "setup-status"] as const;

function SchoolSetupPage() {
  const account = useCurrentAccount();
  const isAdmin = account.role === "Administrador";
  const fetchStatus = useServerFn(getSchoolSetupStatus);
  const query = useQuery({
    queryKey: SCHOOL_SETUP_QUERY_KEY,
    enabled: isAdmin,
    queryFn: () => fetchStatus() as Promise<SchoolSetupStatus>,
    // Volta a verificar quando a pessoa regressa de um formulário noutro separador.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Sistema"
          title="Configurar a escola"
          description="Os passos para pôr a escola a funcionar. Pode usar o SIGA enquanto os completa."
          icon={moduleIcons.school}
          actions={
            isAdmin ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />
                Verificar de novo
              </Button>
            ) : undefined
          }
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Só o Administrador da escola configura a instalação.
            </p>
          </Panel>
        ) : query.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" aria-label="A verificar a configuração" />
          </div>
        ) : query.isError || !query.data ? (
          <Panel title="Não foi possível verificar">
            <p className="text-sm text-muted-foreground">Tente de novo dentro de instantes.</p>
          </Panel>
        ) : (
          <SetupContent status={query.data} />
        )}
      </div>
    </AppShell>
  );
}

function SetupContent({ status }: { status: SchoolSetupStatus }) {
  const { summary, steps } = status;
  const groups = [...new Set(steps.map((step) => step.group))];

  return (
    <>
      <section
        className={cn(
          "rounded-xl border p-5",
          summary.ready ? "border-success/30 bg-success/5" : "border-primary/20 bg-primary/5",
        )}
        aria-label="Progresso da configuração"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {summary.ready
                ? "A escola está pronta a funcionar."
                : `Faltam ${summary.essentialsTotal - summary.essentialsDone} passo(s) essencial(is).`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.done} de {summary.total} passos concluídos · essenciais{" "}
              {summary.essentialsDone}/{summary.essentialsTotal}
            </p>
          </div>
          <span className="text-2xl font-bold tabular-nums">{summary.percent}%</span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
          aria-label="Passos concluídos"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              summary.ready ? "bg-success" : "bg-primary",
            )}
            style={{ width: `${summary.percent}%` }}
          />
        </div>
        {summary.nextStep ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">A seguir:</span>
            <span className="font-medium">{summary.nextStep.title}</span>
            <StepActionButton step={summary.nextStep} primary />
          </div>
        ) : null}
      </section>

      {groups.map((group) => (
        <Panel key={group} title={group}>
          <ol className="divide-y">
            {steps
              .filter((step) => step.group === group)
              .map((step) => (
                <li key={step.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
                  <span className="mt-0.5 shrink-0" aria-hidden>
                    {step.done ? (
                      <CheckCircle2 className="size-5 text-success-strong" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {step.title}
                      {step.essential ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-strong">
                          <Star className="size-3" aria-hidden />
                          Essencial
                        </span>
                      ) : null}
                      <span className="sr-only">{step.done ? "(concluído)" : "(pendente)"}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        step.done ? "text-success-strong" : "text-foreground",
                      )}
                    >
                      {step.detail}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StepActionButton step={step} primary={!step.done && step.essential} />
                  </div>
                </li>
              ))}
          </ol>
        </Panel>
      ))}
    </>
  );
}

function StepActionButton({ step, primary }: { step: SetupStep; primary?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const applyStructure = useServerFn(applySchoolStructure);
  const apply = useMutation({
    mutationFn: () => applyStructure(),
    onSuccess: async (result) => {
      toast.success(
        result.seeded.length
          ? `Criado: ${result.seeded.join(", ")}.`
          : "A estrutura já estava completa.",
      );
      await queryClient.invalidateQueries({ queryKey: SCHOOL_SETUP_QUERY_KEY });
    },
    onError: (error) => toastActionError(error, "Não foi possível criar a estrutura."),
  });
  const action = step.action;
  const run = () => {
    if (action.type === "panel") {
      openSettingsPanel(action.panel);
      return;
    }
    if (action.type === "apply-structure") {
      apply.mutate();
      return;
    }
    void navigate({
      to: action.to as never,
      search: (action.search ?? {}) as never,
    });
  };
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : step.done ? "ghost" : "secondary"}
      onClick={run}
      disabled={apply.isPending}
    >
      {apply.isPending ? "A criar…" : step.done ? "Rever" : step.actionLabel}
      <ArrowRight className="size-4" aria-hidden />
    </Button>
  );
}
