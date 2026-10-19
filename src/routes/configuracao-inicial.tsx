import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Circle,
  ClipboardList,
  GraduationCap,
  LayoutTemplate,
  Lock,
  School,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Aurora, GlassTile } from "@/components/brand/aurora";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  getSchoolSetupGuide,
  type SchoolSetupOverview,
} from "@/features/school/setup-guide-server";
import { setupStepTitle, type SetupStep } from "@/features/school/setup-guide";
import {
  FIRST_RUN_SCREENS,
  firstRunStorageKey,
  resumeScreen,
  screenDone,
  writeFirstRunPreference,
  type FirstRunScreenId,
} from "@/features/school/first-run";
import { saveAcademicCalendar } from "@/features/academic/academic-calendar";
import { currentSchoolStartYear, medCalendar } from "@/features/academic/med-calendar";
import { CurriculumTemplateDialog } from "@/features/academic/CurriculumTemplateDialog";

export const Route = createFileRoute("/configuracao-inicial")({
  head: () => ({
    meta: [
      { title: "Configuração inicial · SIGA Plus" },
      {
        name: "description",
        content:
          "Prepare a escola nova passo a passo: dados, calendário, turmas, propinas e equipa.",
      },
    ],
  }),
  component: FirstRunPage,
});

const SCREEN_ICON: Record<FirstRunScreenId, typeof School> = {
  "boas-vindas": Sparkles,
  escola: School,
  calendario: CalendarDays,
  estrutura: GraduationCap,
  "avaliacao-propinas": ClipboardList,
  equipa: Users,
  pronto: Check,
};

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

/**
 * Configuração inicial em ecrã próprio, sem o menu do sistema: a escola nova
 * vê só o que tem de preparar, por ordem, e começa a trabalhar no fim.
 */
function FirstRunPage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["school", "setup-guide"],
    queryFn: () => getSchoolSetupGuide(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const guide = query.data;
  const [screenId, setScreenId] = useState<FirstRunScreenId | null>(null);

  useEffect(() => {
    if (guide && screenId === null) setScreenId(resumeScreen(guide));
  }, [guide, screenId]);

  if (!account.profile.isLoading && account.role !== "Administrador") {
    return (
      <CenteredMessage
        title="Configuração reservada ao Administrador"
        body="Peça ao Administrador da escola para concluir a configuração inicial."
      />
    );
  }
  if (query.isError) {
    return (
      <CenteredMessage
        title="Não foi possível abrir a configuração"
        body={query.error instanceof Error ? query.error.message : "Tente novamente."}
      />
    );
  }
  if (!guide || !screenId) {
    return <CenteredMessage title="A preparar a sua escola…" body="Só um momento." />;
  }

  const key = firstRunStorageKey(guide.schoolName);
  const index = FIRST_RUN_SCREENS.findIndex((s) => s.id === screenId);
  const screen = FIRST_RUN_SCREENS[index]!;
  const percent = Math.round((guide.completed / Math.max(guide.total, 1)) * 100);
  const go = (delta: number) => {
    const next =
      FIRST_RUN_SCREENS[Math.min(FIRST_RUN_SCREENS.length - 1, Math.max(0, index + delta))]!;
    setScreenId(next.id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const leave = (preference: "skipped" | "finished") => {
    writeFirstRunPreference(key, preference);
    void navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground" data-tone="marca">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden">
        <Aurora variant="soft" />
      </div>
      <header className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            SIGA Plus · Configuração inicial
          </p>
          <p className="truncate text-lg font-bold">{guide.schoolName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => leave("skipped")}>
          Configurar mais tarde
        </Button>
      </header>

      <div className="relative mx-auto mt-6 grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Passos da configuração" className="lg:sticky lg:top-6 lg:self-start">
          <div
            className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Progresso da configuração"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:grid lg:overflow-visible">
            {FIRST_RUN_SCREENS.map((item) => {
              const Icon = SCREEN_ICON[item.id];
              const done = screenDone(item, guide);
              const current = item.id === screenId;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => setScreenId(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60",
                      current &&
                        "bg-card font-medium text-foreground shadow-sm ring-1 ring-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border",
                        done && "border-success bg-success/15 text-success",
                        current && !done && "border-primary text-primary",
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                    </span>
                    <span className="whitespace-nowrap">{item.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0">
          <Panel title={screen.title} description={screen.lead}>
            <ScreenBody screenId={screen.id} guide={guide} onStart={() => go(1)} />
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => go(-1)}>
                <ArrowLeft className="size-4" /> Anterior
              </Button>
              {screen.id === "pronto" ? (
                <Button onClick={() => leave("finished")}>
                  Ir para o painel <ArrowRight className="size-4" />
                </Button>
              ) : screen.id === "boas-vindas" ? null : (
                <Button
                  variant={screenDone(screen, guide) ? "default" : "outline"}
                  onClick={() => go(1)}
                >
                  {screenDone(screen, guide) ? "Continuar" : "Fazer depois"}{" "}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/">Ir para o painel</Link>
        </Button>
      </div>
    </div>
  );
}

function ScreenBody({
  screenId,
  guide,
  onStart,
}: {
  screenId: FirstRunScreenId;
  guide: SchoolSetupOverview;
  onStart: () => void;
}) {
  const screen = FIRST_RUN_SCREENS.find((s) => s.id === screenId)!;
  const steps = screen.steps
    .map((id) => guide.steps.find((s) => s.id === id))
    .filter((s): s is SetupStep => Boolean(s));

  if (screenId === "boas-vindas") return <WelcomeBody guide={guide} onStart={onStart} />;
  if (screenId === "pronto") return <DoneBody guide={guide} />;

  return (
    <div className="grid gap-4">
      {screenId === "calendario" && !screenDone(screen, guide) ? <MedCalendarCard /> : null}
      {screenId === "estrutura" && !steps.find((s) => s.id === "estrutura")?.done ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="min-w-0 text-sm">
            <p className="font-medium">Modelo pronto por tipo de escola</p>
            <p className="text-muted-foreground">
              Primário, I e II Ciclo, Técnico-profissional ou Superior: classes 1ª–13ª, cursos,
              disciplinas, turmas e salas criadas de uma vez. Mostra tudo antes de gravar.
            </p>
          </div>
          <CurriculumTemplateDialog
            trigger={(open) => (
              <Button onClick={open}>
                <LayoutTemplate className="size-4" /> Escolher níveis e cursos
              </Button>
            )}
          />
        </div>
      ) : null}
      <ol className="grid gap-2">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} guide={guide} />
        ))}
      </ol>
      {screenId === "equipa" ? (
        <p className="text-xs text-muted-foreground">
          Pode convidar a equipa a qualquer momento em Acessos. Cada convite chega por e-mail.
        </p>
      ) : null}
    </div>
  );
}

function StepRow({ step, guide }: { step: SetupStep; guide: SchoolSetupOverview }) {
  const blocked = !step.done && step.blockedBy.length > 0;
  const action =
    step.action.kind === "settings" ? (
      <Link to="/configuracoes" search={{ painel: step.action.panel } as never}>
        {step.actionLabel}
      </Link>
    ) : (
      <Link to={step.action.to as never} search={step.action.search as never}>
        {step.actionLabel}
      </Link>
    );
  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-lg border border-border/70 bg-card p-3",
        step.done && "border-success/30 bg-success/5",
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
        <p className="text-sm font-medium">
          {step.title}
          <span className="sr-only">
            {step.done ? " — feito" : blocked ? " — bloqueado" : " — por fazer"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {blocked
            ? `Primeiro: ${step.blockedBy.map((id) => setupStepTitle(guide, id)).join(" e ")}.`
            : step.done
              ? step.detail
              : step.why}
        </p>
      </div>
      {!step.done && !blocked ? (
        <Button asChild size="sm" variant="outline">
          {action}
        </Button>
      ) : null}
    </li>
  );
}

function WelcomeBody({ guide, onStart }: { guide: SchoolSetupOverview; onStart: () => void }) {
  const working = FIRST_RUN_SCREENS.filter((s) => s.steps.length);
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <span className="relative size-14 shrink-0" aria-hidden="true">
          <GlassTile tone="blue" size={56} tilt={-8} depth={0} className="left-0 top-0">
            <School className="size-7 drop-shadow" />
          </GlassTile>
        </span>
        <p className="text-sm text-muted-foreground">
          {guide.subscription?.planName ? `Plano ${guide.subscription.planName}. ` : ""}
          Ainda não há alunos, turmas nem propinas: tudo é preparado por si, com sugestões do MED e
          modelos por tipo de escola. Pode sair e voltar — o progresso fica guardado.
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {working.map((item, i) => {
          const Icon = SCREEN_ICON[item.id];
          const done = screenDone(item, guide);
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-3"
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
                  done && "bg-success/15 text-success",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-3.5 text-muted-foreground" /> {item.title}
                </p>
                <p className="text-xs text-muted-foreground">{item.lead}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <Button size="lg" onClick={onStart}>
          Começar a configuração <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Ano lectivo e trimestres do calendário do MED, gravados num clique. */
function MedCalendarCard() {
  const save = useServerFn(saveAcademicCalendar);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const calendar = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return medCalendar(currentSchoolStartYear(today));
  }, []);

  const apply = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          yearName: calendar.name,
          startsOn: calendar.startsOn,
          endsOn: calendar.endsOn,
          terms: calendar.terms.map((t) => ({
            sequence: t.sequence,
            name: t.name,
            startsOn: t.startsOn,
            endsOn: t.endsOn,
          })),
        },
      });
      toast.success(`Ano lectivo ${calendar.name} criado com os três trimestres.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["school", "setup-guide"] }),
        queryClient.invalidateQueries({ queryKey: ["academic"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o ano lectivo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Ano lectivo {calendar.name}</p>
          <p className="text-xs text-muted-foreground">
            {shortDate(calendar.startsOn)} a {shortDate(calendar.endsOn)} · {calendar.source.label}
          </p>
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Sugestão do MED
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {calendar.terms.map((term) => (
          <li key={term.sequence} className="rounded-lg bg-background p-2.5 text-xs">
            <p className="font-medium">{term.name}</p>
            <p className="text-muted-foreground">
              {shortDate(term.startsOn)} – {shortDate(term.endsOn)}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void apply()} disabled={saving}>
          {saving ? "A criar…" : "Usar estas datas"}
        </Button>
        <Button asChild variant="ghost">
          <Link to="/calendario">Ajustar no calendário</Link>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ensino superior: os semestres não seguem o MED — defina-os no calendário.
      </p>
    </div>
  );
}

function DoneBody({ guide }: { guide: SchoolSetupOverview }) {
  const pending = guide.steps.filter((s) => !s.done && !s.optional);
  return (
    <div className="grid gap-4">
      {pending.length ? (
        <p className="text-sm text-muted-foreground">
          Faltam {pending.length} passo(s): {pending.map((s) => s.title.toLowerCase()).join(", ")}.
          Continuam visíveis no painel, no cartão «Arranque da escola».
        </p>
      ) : (
        <p className="text-sm">
          <span className="text-aurora font-semibold">Parabéns!</span> Todos os passos estão feitos.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/alunos" search={{ action: "matricular" } as never}>
            Matricular o primeiro aluno
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/configuracoes" search={{ painel: "matricula" } as never}>
            Abrir a matrícula online
          </Link>
        </Button>
      </div>
    </div>
  );
}
