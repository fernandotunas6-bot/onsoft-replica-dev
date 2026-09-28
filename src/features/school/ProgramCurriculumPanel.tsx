import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  listProgramCurriculum,
  addProgramSubject,
  removeProgramSubject,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import {
  getProgramPrerequisites,
  setUnitPrerequisites,
} from "@/features/academic/course-units-server";

/**
 * Currículo do curso (Ensino Superior) — disciplinas por semestre com créditos. Só entra em jogo
 * quando "Ensino Superior" está activo nos níveis de ensino (PedagogicalSettingsPanel).
 */
export function ProgramCurriculumPanel({
  courses,
  subjects,
  canEdit,
}: {
  courses: PedagogicalWorkspace["courses"];
  subjects: PedagogicalWorkspace["subjects"];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [programId, setProgramId] = useState<string>(courses[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState<string>("");
  const [semester, setSemester] = useState<string>("1");
  const [credits, setCredits] = useState<string>("6");
  const [saving, setSaving] = useState(false);

  const curriculumQuery = useQuery({
    queryKey: ["academic", "program-curriculum", programId],
    queryFn: () => listProgramCurriculum({ data: { programId } }),
    enabled: Boolean(programId),
  });

  const prerequisitesQuery = useQuery({
    queryKey: ["academic", "program-prerequisites", programId],
    queryFn: () => getProgramPrerequisites({ data: { programId } }),
    enabled: Boolean(programId),
    retry: false,
  });
  const [editingPrereq, setEditingPrereq] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["academic", "program-curriculum", programId] });

  const savePrerequisites = async (programSubjectId: string, requiredIds: string[]) => {
    try {
      await setUnitPrerequisites({ data: { programId, programSubjectId, requiredIds } });
      await queryClient.invalidateQueries({
        queryKey: ["academic", "program-prerequisites", programId],
      });
      toast.success("Precedências guardadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    }
  };

  const handleAdd = async () => {
    if (!programId || !subjectId) {
      toast.error("Escolha o curso e a disciplina.");
      return;
    }
    const semesterNum = Number(semester);
    const creditsNum = Number(credits);
    if (!Number.isInteger(semesterNum) || semesterNum < 1) {
      toast.error("Semestre inválido.");
      return;
    }
    if (!Number.isFinite(creditsNum) || creditsNum <= 0) {
      toast.error("Créditos inválidos.");
      return;
    }
    setSaving(true);
    try {
      await addProgramSubject({
        data: { programId, subjectId, semester: semesterNum, credits: creditsNum },
      });
      await refresh();
      setSubjectId("");
      toast.success("Disciplina adicionada ao currículo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeProgramSubject({ data: { id } });
      await refresh();
      toast.success("Disciplina removida do currículo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  };

  if (courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Ainda não há cursos cadastrados nesta escola.</p>
    );
  }

  const entries = curriculumQuery.data?.entries ?? [];
  const bySemester = new Map<number, typeof entries>();
  for (const entry of entries) {
    bySemester.set(entry.semester, [...(bySemester.get(entry.semester) ?? []), entry]);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground">Curso</Label>
        <select
          aria-label="Programa"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
          value={programId}
          onChange={(event) => setProgramId(event.target.value)}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
      </div>

      {curriculumQuery.data && !curriculumQuery.data.available ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          A tabela de currículo ainda não foi aplicada à base de dados
          (supabase/migrations/20260811151500_program_subjects_curriculum.sql).
        </p>
      ) : (
        <>
          {[...bySemester.entries()]
            .sort(([a], [b]) => a - b)
            .map(([sem, items]) => (
              <div key={sem} className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">{sem}.º Semestre</p>
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {items.map((entry) => {
                    const required = prerequisitesQuery.data?.[entry.id] ?? [];
                    const nameOf = (id: string) =>
                      entries.find((item) => item.id === id)?.subjectName ?? "—";
                    return (
                      <div key={entry.id} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block font-medium text-foreground">
                              {entry.subjectName}
                            </span>
                            {required.length ? (
                              <span className="block text-xs text-muted-foreground">
                                Exige: {required.map(nameOf).join(", ")}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {canEdit && prerequisitesQuery.data ? (
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() =>
                                  setEditingPrereq((current) =>
                                    current === entry.id ? null : entry.id,
                                  )
                                }
                              >
                                Precedências
                              </button>
                            ) : null}
                            {entry.credits} ECTS
                            {canEdit ? (
                              <button
                                type="button"
                                className="text-destructive hover:underline"
                                onClick={() => handleRemove(entry.id)}
                                aria-label={`Remover ${entry.subjectName} do currículo`}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            ) : null}
                          </span>
                        </div>
                        {editingPrereq === entry.id ? (
                          <PrerequisiteEditor
                            options={entries.filter(
                              (item) => item.id !== entry.id && item.semester <= entry.semester,
                            )}
                            value={required}
                            onSave={async (ids) => {
                              await savePrerequisites(entry.id, ids);
                              setEditingPrereq(null);
                            }}
                            onCancel={() => setEditingPrereq(null)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Este curso ainda não tem disciplinas no currículo.
            </p>
          ) : null}
        </>
      )}

      {canEdit ? (
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <select
            aria-label="Disciplina"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            <option value="">Disciplina…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
            placeholder="Sem."
            aria-label="Semestre"
          />
          <input
            type="number"
            min={0.5}
            step={0.5}
            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            placeholder="ECTS"
            aria-label="Créditos ECTS"
          />
          <Button type="button" size="sm" disabled={saving} onClick={handleAdd}>
            Adicionar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PrerequisiteEditor({
  options,
  value,
  onSave,
  onCancel,
}: {
  options: Array<{ id: string; subjectName: string; semester: number }>;
  value: string[];
  onSave: (ids: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(value);
  const [saving, setSaving] = useState(false);
  if (!options.length) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Não há cadeiras de semestres anteriores que possam ser precedência.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        Só se inscreve nesta cadeira quem tiver aprovado:
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() =>
                setSelected((list) =>
                  on ? list.filter((id) => id !== option.id) : [...list, option.id],
                )
              }
              className={
                on
                  ? "rounded-full border border-primary bg-primary/5 px-3 py-1 text-xs"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted/60"
              }
            >
              {option.subjectName}
              <span className="ml-1 text-muted-foreground">{option.semester}.º sem.</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(selected);
            } finally {
              setSaving(false);
            }
          }}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}
