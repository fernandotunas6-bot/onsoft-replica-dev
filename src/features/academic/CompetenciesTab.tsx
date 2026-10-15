import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoading } from "@/components/ui/inline-loading";
import { toastActionError } from "@/lib/action-error-toast";
import { cn } from "@/lib/utils";
import {
  archiveCompetency,
  getCompetencyBoard,
  saveCompetency,
  setItemCompetencies,
  type CompetencyBoard,
} from "./competencies";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function Bar({ value }: { value: number | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full bg-primary/50"
          style={{ width: `${value ?? 0}%` }}
        />
      </span>
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {value == null ? "—" : `${value}%`}
      </span>
    </span>
  );
}

/**
 * Competências por disciplina: definir (coordenação), ligar às avaliações
 * (professor da disciplina) e ver o domínio da turma e de cada aluno.
 */
export function CompetenciesTab() {
  const queryClient = useQueryClient();
  const [classGroupId, setClassGroupId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const key = ["academic", "competencies", classGroupId ?? "", subjectId ?? ""];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      getCompetencyBoard({
        data: {
          ...(classGroupId ? { classGroupId } : {}),
          ...(subjectId ? { subjectId } : {}),
        },
      }) as Promise<CompetencyBoard>,
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["academic", "competencies"] });

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [onlyThisLevel, setOnlyThisLevel] = useState(false);
  const board = query.data;

  const create = useMutation({
    mutationFn: () =>
      saveCompetency({
        data: {
          subjectId: board!.subjectId!,
          gradeLevelId: onlyThisLevel ? (board!.gradeLevel?.id ?? null) : null,
          code: code.trim(),
          description: description.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Competência acrescentada.");
      setCode("");
      setDescription("");
      refresh();
    },
    onError: (e) => toastActionError(e, "Não foi possível guardar a competência."),
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveCompetency({ data: { id } }),
    onSuccess: refresh,
    onError: (e) => toastActionError(e, "Não foi possível arquivar."),
  });
  const link = useMutation({
    mutationFn: (input: { itemId: string; competencyIds: string[] }) =>
      setItemCompetencies({ data: input }),
    onSuccess: refresh,
    onError: (e) => toastActionError(e, "Não foi possível ligar a competência."),
  });

  if (query.isLoading) return <InlineLoading label="A carregar competências…" />;
  if (query.isError || !board) {
    return (
      <p className="surface-card p-5 text-sm text-muted-foreground">
        {query.error instanceof Error ? query.error.message : "Não foi possível carregar."}
      </p>
    );
  }
  if (!board.classGroups.length) {
    return (
      <p className="surface-card p-5 text-sm text-muted-foreground">
        Não há turmas no ano lectivo activo.
      </p>
    );
  }

  const rateOf = new Map(board.mastery.competencies.map((c) => [c.competencyId, c]));
  const masteryOf = new Map(board.mastery.students.map((s) => [s.enrollmentId, s]));
  const subjectName = board.subjects.find((s) => s.id === board.subjectId)?.name ?? "";

  return (
    <div className="space-y-5">
      <section className="surface-card flex flex-wrap items-end gap-3 p-5">
        <label className="space-y-1.5">
          <span className="block text-xs text-muted-foreground">Turma</span>
          <select
            aria-label="Turma"
            className={selectClass}
            value={board.classGroupId ?? ""}
            onChange={(e) => {
              setClassGroupId(e.target.value);
              setSubjectId(undefined);
            }}
          >
            {board.classGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-xs text-muted-foreground">Disciplina</span>
          <select
            aria-label="Disciplina"
            className={selectClass}
            value={board.subjectId ?? ""}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!board.subjects.length}
          >
            {board.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          Dominada quando a média das avaliações ligadas atinge {board.passing} (nota de aprovação
          do modelo).
        </p>
      </section>

      {!board.subjectId ? (
        <p className="surface-card p-5 text-sm text-muted-foreground">
          Esta turma ainda não tem disciplinas.
        </p>
      ) : (
        <>
          <section className="surface-card space-y-3 p-5">
            <h2 className="text-sm font-medium">Competências de {subjectName}</h2>
            {board.competencies.length ? (
              <ul className="divide-y divide-border">
                {board.competencies.map((c) => {
                  const rate = rateOf.get(c.id);
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-muted-foreground">{c.code}</span> · {c.description}
                        <span className="block text-xs text-muted-foreground">
                          {rate?.linkedItems
                            ? `${rate.linkedItems} avaliação(ões) · ${rate.masteredStudents} de ${rate.assessedStudents} alunos`
                            : "Sem avaliações ligadas"}
                          {c.gradeLevelId ? ` · só ${board.gradeLevel?.name ?? "esta classe"}` : ""}
                        </span>
                      </span>
                      <Bar value={rate?.percentage ?? null} />
                      {board.canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => archive.mutate(c.id)}
                        >
                          Arquivar
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ainda não há competências para esta disciplina.
              </p>
            )}

            {board.canManage ? (
              <form
                className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[110px_1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate();
                }}
              >
                <Input
                  aria-label="Código da competência"
                  placeholder="Código (ex.: C1)"
                  value={code}
                  maxLength={20}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Input
                  aria-label="Descrição da competência"
                  placeholder="O aluno é capaz de…"
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9"
                  disabled={!code.trim() || description.trim().length < 3 || create.isPending}
                >
                  Acrescentar
                </Button>
                {board.gradeLevel ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
                    <input
                      type="checkbox"
                      aria-label={`Só para a ${board.gradeLevel.name}`}
                      className="accent-primary"
                      checked={onlyThisLevel}
                      onChange={(e) => setOnlyThisLevel(e.target.checked)}
                    />
                    Só para a {board.gradeLevel.name} (sem marcar, vale para todas as classes)
                  </label>
                ) : null}
              </form>
            ) : null}
          </section>

          <section className="surface-card space-y-3 p-5">
            <h2 className="text-sm font-medium">Avaliações e competências</h2>
            {!board.items.length ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há avaliações desta disciplina na turma.
              </p>
            ) : !board.competencies.length ? (
              <p className="text-sm text-muted-foreground">
                Defina as competências primeiro para as ligar às avaliações.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {board.items.map((item) => (
                  <li key={item.id} className="space-y-1.5 py-2.5">
                    <p className="text-sm">
                      {item.name}
                      {item.term ? (
                        <span className="text-muted-foreground"> · {item.term}.º período</span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {board.competencies.map((c) => {
                        const on = item.competencyIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            title={c.description}
                            aria-pressed={on}
                            disabled={!board.canLink || link.isPending}
                            onClick={() =>
                              link.mutate({
                                itemId: item.id,
                                competencyIds: on
                                  ? item.competencyIds.filter((id) => id !== c.id)
                                  : [...item.competencyIds, c.id],
                              })
                            }
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                              on
                                ? "border-primary/40 bg-primary-soft text-primary-strong"
                                : "border-border text-muted-foreground hover:bg-muted",
                              !board.canLink && "cursor-default",
                            )}
                          >
                            {c.code}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!board.canLink && board.items.length ? (
              <p className="text-xs text-muted-foreground">
                Só o professor da disciplina ou a coordenação liga avaliações a competências.
              </p>
            ) : null}
          </section>

          <section className="surface-card space-y-3 p-5">
            <h2 className="text-sm font-medium">Domínio por aluno</h2>
            {!board.students.length ? (
              <p className="text-sm text-muted-foreground">Sem alunos matriculados.</p>
            ) : (
              <ul className="divide-y divide-border">
                {board.students.map((s) => {
                  const m = masteryOf.get(s.enrollmentId);
                  return (
                    <li
                      key={s.enrollmentId}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                    >
                      <span className="text-sm">{s.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {m?.assessed
                            ? `${m.mastered} de ${m.assessed} competência(s)`
                            : "Por avaliar"}
                        </span>
                        <Bar value={m?.percentage ?? null} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
