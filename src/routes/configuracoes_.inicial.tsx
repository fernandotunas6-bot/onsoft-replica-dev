import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check } from "lucide-react";
import { moduleIcons } from "@/lib/app-icons";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  INSTITUTION_LEVELS,
  INSTITUTION_LEVEL_LABELS,
  INSTITUTION_SHIFTS,
  INSTITUTION_SHIFT_LABELS,
  type InstitutionLevel,
  type InstitutionShift,
} from "@/features/saas/institution-profile";
import {
  applyInstitutionProfile,
  getInstitutionSetup,
  type InstitutionSetupOverview,
} from "@/features/saas/institution-setup-server";
import { setupProgress, type SetupItem } from "@/features/saas/institution-setup";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes_/inicial")({
  head: () => ({
    meta: [
      { title: "Configuração inicial · SIGA Plus" },
      {
        name: "description",
        content: "O que a escola já tem e o que pode configurar depois da criação.",
      },
    ],
  }),
  component: InstitutionSetupPage,
});

const QUERY_KEY = ["saas", "institution-setup"] as const;

function InstitutionSetupPage() {
  const account = useCurrentAccount();
  const isAdmin = account.role === "Administrador";
  const fetchSetup = useServerFn(getInstitutionSetup);
  const query = useQuery({
    queryKey: [...QUERY_KEY, account.schoolId],
    enabled: isAdmin,
    queryFn: () => fetchSetup() as Promise<InstitutionSetupOverview>,
    staleTime: 30_000,
  });
  const items = query.data?.items ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Sistema"
          title="Configuração inicial"
          description="A escola já funciona. O que falta pode ser feito agora ou mais tarde, ao seu ritmo."
          icon={moduleIcons.setup}
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Só o Administrador da escola vê a configuração inicial.
            </p>
          </Panel>
        ) : query.isLoading ? (
          <Panel title="A carregar">
            <p className="text-sm text-muted-foreground">A ver o que a escola já tem…</p>
          </Panel>
        ) : query.isError ? (
          <Panel title="Não foi possível carregar">
            <p className="text-sm text-muted-foreground">Tente de novo dentro de instantes.</p>
          </Panel>
        ) : (
          <SetupOverview items={items} teachingLevels={query.data?.teachingLevels ?? []} />
        )}
      </div>
    </AppShell>
  );
}

/** Progresso, lista e ensino. Exportado para as capturas de ecrã de verificação. */
export function SetupOverview({ items, teachingLevels }: InstitutionSetupOverview) {
  const progress = setupProgress(items);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            {progress.done} de {progress.total} feitos
          </span>
          <span className="text-xs text-muted-foreground">
            {progress.essentialLeft
              ? `${progress.essentialLeft} ${progress.essentialLeft === 1 ? "tarefa essencial" : "tarefas essenciais"} por fazer`
              : "O essencial está feito"}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Checklist title="Essencial" items={items.filter((item) => item.essential)} />
          <Checklist
            title="Pode ficar para depois"
            items={items.filter((item) => !item.essential)}
          />
        </div>
        <div
          className={cn(
            "self-start",
            // No telemóvel, o ensino por escolher vem primeiro.
            !teachingLevels.length && "order-first lg:order-none",
          )}
        >
          <TeachingProfilePanel current={teachingLevels} />
        </div>
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: SetupItem[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.href as never}
              search={item.search as never}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  item.done && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {item.done ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{item.title}</span>
                <span className="block text-xs text-muted-foreground">{item.detail}</span>
              </span>
              {item.done ? null : <ArrowRight className="size-4 shrink-0 text-muted-foreground" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeachingProfilePanel({ current }: { current: string[] }) {
  const queryClient = useQueryClient();
  const apply = useServerFn(applyInstitutionProfile);
  const [levels, setLevels] = useState<InstitutionLevel[]>([]);
  const [shifts, setShifts] = useState<InstitutionShift[]>(["morning"]);
  const [rooms, setRooms] = useState("");
  const already = new Set(current);

  const mutation = useMutation({
    mutationFn: () => apply({ data: { levels, shifts, rooms: Math.min(Number(rooms || 0), 200) } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setLevels([]);
      setRooms("");
      if (result.warnings.length) {
        toast.warning(`Aplicado em parte. Reveja: ${result.warnings.join(", ")}.`);
      } else if (!result.hasActiveYear) {
        toast.success("Ensino aplicado. Crie o ano lectivo para gerar os períodos.");
      } else {
        toast.success("Ensino aplicado: classes, disciplinas, períodos, turnos e salas.");
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível aplicar."),
  });

  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <Panel
      title="Ensino oferecido"
      description="Escolha os níveis que quer acrescentar. Só junta o que falta; nada do que já existe é apagado."
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {INSTITUTION_LEVELS.map((level) => {
            const active = already.has(level);
            const selected = levels.includes(level);
            return (
              <button
                key={level}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => setLevels((list) => toggle(list, level))}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm">{INSTITUTION_LEVEL_LABELS[level].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {active ? "Já activo" : INSTITUTION_LEVEL_LABELS[level].detail}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    selected && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-sm">Turnos</p>
          <div className="flex flex-wrap gap-2">
            {INSTITUTION_SHIFTS.map((shift) => {
              const selected = shifts.includes(shift);
              return (
                <button
                  key={shift}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => setShifts((list) => toggle(list, shift))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {INSTITUTION_SHIFT_LABELS[shift]}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block space-y-2">
          <span className="text-sm">Salas a criar (opcional)</span>
          <Input
            inputMode="numeric"
            value={rooms}
            onChange={(event) => setRooms(event.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="0"
            className="max-w-32"
          />
        </label>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">Pode ajustar tudo depois em Pedagógica.</p>
          <Button
            type="button"
            disabled={!levels.length || !shifts.length || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "A aplicar…" : "Aplicar"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
