import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Printer,
  Shuffle,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { InlineLoading } from "@/components/ui/inline-loading";
import { toast } from "@/lib/toast";
import { publicErrorMessage } from "@/lib/public-error";
import { cn } from "@/lib/utils";
import type { LineStatus, OrganizationLine } from "@/features/academic/class-organization";
import {
  applyClassOrganization,
  listOrganizationScopes,
  previewClassOrganization,
} from "@/features/academic/class-organization-server";

const STATUS: Record<LineStatus, { label: string; tone: string }> = {
  move: { label: "Muda", tone: "bg-primary/10 text-primary" },
  same: { label: "Fica", tone: "bg-muted text-muted-foreground" },
  records: {
    label: "Com notas — fica",
    tone: "bg-warning/15 text-warning-foreground dark:text-warning",
  },
  no_birth_date: { label: "Sem data de nascimento", tone: "bg-destructive/10 text-destructive" },
  no_capacity: { label: "Sem vaga", tone: "bg-destructive/10 text-destructive" },
};

const birth = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-AO") : "—";

/**
 * Pessoas → Organizar turmas: uma classe e um turno de cada vez, a turma A com
 * os mais novos. Pré-visualizar não grava; aplicar recalcula no servidor.
 */
export function ClassOrganizationView() {
  const queryClient = useQueryClient();
  const [scopeKey, setScopeKey] = useState("");
  const scopes = useQuery({
    queryKey: ["class-organization", "scopes"],
    queryFn: () => listOrganizationScopes({ data: {} }),
  });
  const selected = scopes.data?.scopes.find(
    (scope) => `${scope.gradeLevelId}|${scope.shift}` === scopeKey,
  );
  const previewKey = ["class-organization", "preview", scopeKey];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: () =>
      previewClassOrganization({
        data: { gradeLevelId: selected!.gradeLevelId, shift: selected!.shift },
      }),
    enabled: Boolean(selected),
  });
  const apply = useMutation({
    mutationFn: () =>
      applyClassOrganization({
        data: {
          gradeLevelId: selected!.gradeLevelId,
          shift: selected!.shift,
          signature: preview.data!.signature,
        },
      }),
    onSuccess: (result) => {
      if (result.failed.length || result.blocked.length) {
        toast.warning(
          `${result.moved} aluno(s) mudaram de turma; ${result.failed.length + result.blocked.length} ficaram por mudar.`,
        );
      } else {
        toast.success(`Turmas organizadas: ${result.moved} aluno(s) mudaram de turma.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["class-organization"] });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível organizar.")),
  });

  const plan = preview.data;
  const byClass = useMemo(() => {
    const groups = new Map<string, OrganizationLine[]>();
    for (const line of plan?.lines ?? []) {
      const list = groups.get(line.toClassId) ?? [];
      list.push(line);
      groups.set(line.toClassId, list);
    }
    return groups;
  }, [plan]);
  const moves = plan?.moves.length ?? 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 print:hidden">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="organizar-classe" className="text-xs font-medium">
            Classe e turno {scopes.data?.year ? `· ${scopes.data.year.name}` : ""}
          </label>
          <select
            id="organizar-classe"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={scopeKey}
            onChange={(event) => setScopeKey(event.target.value)}
          >
            <option value="">Escolha a classe a organizar…</option>
            {(scopes.data?.scopes ?? []).map((scope) => (
              <option
                key={`${scope.gradeLevelId}|${scope.shift}`}
                value={`${scope.gradeLevelId}|${scope.shift}`}
              >
                {scope.programName ? `${scope.programName} · ` : ""}
                {scope.gradeLevelName} · {scope.shiftLabel} — {scope.classes} turma(s),{" "}
                {scope.students} aluno(s)
              </option>
            ))}
          </select>
        </div>
        {plan ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => window.print()}
            >
              <Printer className="size-4" aria-hidden /> Imprimir listas
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={Boolean(plan.blockers.length) || !moves || apply.isPending}
                >
                  <Shuffle className="size-4" aria-hidden />
                  {apply.isPending ? "A organizar…" : `Aplicar (${moves})`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mudar {moves} aluno(s) de turma?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cada mudança fica no histórico do aluno. Quem já tem notas ou presenças não
                    muda. Se alguém matricular entretanto, a escola pede para rever de novo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => apply.mutate()}>Aplicar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </section>

      {!scopeKey ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center print:hidden">
          <IconChip icon={Users} tone="muted" size="md" />
          <p className="max-w-md text-sm text-muted-foreground">
            Escolha uma classe e um turno. A turma A recebe os alunos mais novos, a B os seguintes,
            e assim por diante, até à lotação de cada turma. Nada muda antes de aplicar.
          </p>
        </div>
      ) : preview.isLoading ? (
        <InlineLoading label="A preparar a proposta…" />
      ) : preview.isError || !plan ? (
        <p role="alert" className="text-sm text-destructive">
          {publicErrorMessage(preview.error, "Não foi possível preparar a proposta.")}
        </p>
      ) : (
        <>
          {plan.blockers.length || plan.warnings.length ? (
            <ul className="space-y-1.5 print:hidden" aria-label="Avisos">
              {[...plan.blockers, ...plan.warnings].map((message, index) => (
                <li
                  key={message}
                  className={cn(
                    "flex gap-2 rounded-lg px-3 py-2 text-sm",
                    index < plan.blockers.length
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-foreground",
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success-strong print:hidden">
              <CheckCircle2 className="size-4" aria-hidden /> Todos os alunos ficam ordenados por
              idade.
            </p>
          )}

          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 print:hidden" aria-label="Turmas">
            {plan.classes.map((group) => (
              <li key={group.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
                  {group.letter}
                </span>
                <div className="min-w-0 text-xs">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="text-muted-foreground tabular-nums">
                    {group.current} → {group.proposed} / {group.capacity} alunos
                  </p>
                  <p className="text-muted-foreground tabular-nums">
                    {group.youngest == null
                      ? "Sem idades"
                      : group.youngest === group.oldest
                        ? `${group.youngest} anos`
                        : `${group.youngest} a ${group.oldest} anos`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {plan.classes.map((group) => {
            const lines = byClass.get(group.id) ?? [];
            return (
              <section
                key={group.id}
                aria-label={`Turma ${group.letter}`}
                className="space-y-2 break-inside-avoid print:break-after-page"
              >
                <h2 className="text-sm font-semibold">
                  Turma {group.letter} · {group.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({lines.length}/{group.capacity})
                  </span>
                </h2>
                <div className="w-0 min-w-full overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-normal">Nº</th>
                        <th className="px-3 py-2 font-normal">ID do aluno</th>
                        <th className="px-3 py-2 font-normal">Nome</th>
                        <th className="px-3 py-2 font-normal">Nascimento</th>
                        <th className="px-3 py-2 text-right font-normal">Idade</th>
                        <th className="px-3 py-2 font-normal print:hidden">Turma</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, index) => (
                        <tr key={line.enrollmentId}>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {line.studentNumber || "—"}
                          </td>
                          <td className="px-3 py-2">{line.name}</td>
                          <td className="px-3 py-2 tabular-nums">{birth(line.birthDate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{line.age ?? "—"}</td>
                          <td className="px-3 py-2 print:hidden">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              {line.fromLetter !== line.toLetter ? (
                                <>
                                  {line.fromLetter}
                                  <ArrowRight className="size-3" aria-hidden />
                                </>
                              ) : null}
                              {line.toLetter}
                              <span
                                className={cn(
                                  "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  STATUS[line.status].tone,
                                )}
                              >
                                {line.status === "records" ? (
                                  <Lock className="size-3" aria-hidden />
                                ) : null}
                                {STATUS[line.status].label}
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!lines.length ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                            Sem alunos nesta turma.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
