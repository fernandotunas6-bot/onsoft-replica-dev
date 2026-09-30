import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ChevronUp, Circle, CreditCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { getSchoolSetupGuide, type SchoolSetupOverview } from "./setup-guide-server";
import { setupStepTitle, type SetupStep } from "./setup-guide";

const PHASES: SetupStep["phase"][] = ["Base", "Pedagógica", "Financeiro", "Pessoas"];

/** Preferência só visual (minimizado/oculto), por escola e por navegador. */
function storageKey(schoolName: string) {
  return `siga:setup-guide:${schoolName}`;
}
function readPreference(key: string): "open" | "min" | "hidden" {
  try {
    const value = localStorage.getItem(key);
    return value === "min" || value === "hidden" ? value : "open";
  } catch {
    return "open";
  }
}
function writePreference(key: string, value: "open" | "min" | "hidden") {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navegador sem armazenamento — fica só nesta visita */
  }
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StepAction({ step, primary }: { step: SetupStep; primary?: boolean }) {
  const content = (
    <>
      {step.actionLabel} <ArrowRight className="size-3.5" />
    </>
  );
  const variant = primary ? "default" : "outline";
  if (step.action.kind === "settings") {
    const panel = step.action.panel;
    return (
      <Button type="button" size="sm" variant={variant} onClick={() => openSettingsPanel(panel)}>
        {content}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant={variant}>
      <Link to={step.action.to as never} search={step.action.search as never}>
        {content}
      </Link>
    </Button>
  );
}

function SubscriptionLine({ subscription }: { subscription: SchoolSetupOverview["subscription"] }) {
  if (!subscription) return null;
  const trialEnd = formatDate(subscription.trialEndsAt);
  const trialing = subscription.status === "trialing";
  return (
    <Link
      to="/configuracoes/assinatura"
      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      <CreditCard className="size-3.5" />
      {subscription.planName ? `Plano ${subscription.planName}` : "Assinatura"}
      {trialing && trialEnd ? ` · experimental até ${trialEnd}` : ""}
    </Link>
  );
}

/**
 * Guia de arranque no painel do Administrador. Mostra o próximo passo em
 * destaque e o estado de todos os outros, tal como estão na base.
 */
export function SchoolSetupGuide() {
  const query = useQuery({
    queryKey: ["school", "setup-guide"],
    queryFn: () => getSchoolSetupGuide(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const guide = query.data;
  const key = storageKey(guide?.schoolName ?? "");
  const [preference, setPreference] = useState<"open" | "min" | "hidden" | null>(null);

  if (!guide) return null;
  const current = preference ?? readPreference(key);
  const choose = (value: "open" | "min" | "hidden") => {
    writePreference(key, value);
    setPreference(value);
  };

  // Concluído e dispensado: não volta a ocupar o painel.
  if (guide.ready && current === "hidden") return null;

  const percent = Math.round((guide.completed / Math.max(guide.total, 1)) * 100);
  const next = guide.steps.find((step) => step.id === guide.nextStepId) ?? null;

  if (guide.ready) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Check className="size-4 text-success" />
          <span className="font-semibold">A escola está pronta a operar.</span>
          <span className="text-muted-foreground">Todos os passos de arranque estão feitos.</span>
        </div>
        <div className="flex items-center gap-2">
          <SubscriptionLine subscription={guide.subscription} />
          <Button type="button" size="sm" variant="ghost" onClick={() => choose("hidden")}>
            Ocultar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="setup-guide-title"
      className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="setup-guide-title" className="text-sm font-bold">
            Arranque da escola
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {guide.completed} de {guide.total} passos feitos. A ordem segue o que cada passo precisa
            do anterior.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SubscriptionLine subscription={guide.subscription} />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={current !== "min"}
            onClick={() => choose(current === "min" ? "open" : "min")}
          >
            {current === "min" ? (
              <>
                Mostrar <ChevronDown className="size-3.5" />
              </>
            ) : (
              <>
                Minimizar <ChevronUp className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Progresso do arranque"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      {next ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card p-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Próximo passo
            </p>
            <p className="text-sm font-semibold">{next.title}</p>
            <p className="text-xs text-muted-foreground">{next.why}</p>
          </div>
          <StepAction step={next} primary />
        </div>
      ) : null}

      {current === "min" ? null : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {PHASES.map((phase) => {
            const steps = guide.steps.filter((step) => step.phase === phase);
            if (!steps.length) return null;
            return (
              <div key={phase}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {phase}
                </p>
                <ol className="grid gap-1.5">
                  {steps.map((step) => {
                    const blocked = !step.done && step.blockedBy.length > 0;
                    return (
                      <li
                        key={step.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border border-border/60 bg-card p-2.5",
                          step.id === guide.nextStepId && "border-primary/40",
                        )}
                      >
                        <span className="mt-0.5 shrink-0" aria-hidden="true">
                          {step.done ? (
                            <Check className="size-4 text-success" />
                          ) : blocked ? (
                            <Lock className="size-4 text-muted-foreground" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm", step.done && "text-muted-foreground")}>
                            {step.title}
                            {step.optional ? (
                              <span className="ml-1.5 text-[11px] text-muted-foreground">
                                (opcional)
                              </span>
                            ) : null}
                            <span className="sr-only">
                              {step.done ? " — feito" : blocked ? " — bloqueado" : " — por fazer"}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {blocked
                              ? `Primeiro: ${step.blockedBy.map((id) => setupStepTitle(guide, id)).join(" e ")}.`
                              : step.detail}
                          </p>
                        </div>
                        {!step.done && !blocked && step.id !== guide.nextStepId ? (
                          <StepAction step={step} />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
