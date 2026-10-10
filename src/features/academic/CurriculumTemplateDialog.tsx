import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/toast";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EDUCATION_LEVELS,
  planCurriculum,
  summarizePlan,
  type EducationLevelId,
  type TemplateSelection,
} from "./curriculum-templates";
import { applyCatalogStructure, applyCurriculumTemplate } from "./curriculum-templates-server";
import { COUNTRIES } from "@/features/education-catalog/data/countries";
import { globalCourse } from "@/features/education-catalog/data/courses";
import {
  plannableStages,
  planFromCatalog,
  stagesWithoutPlan,
} from "@/features/education-catalog/plan-from-catalog";

/** Angola usa os modelos próprios; os outros países com etapas, o catálogo. */
const CATALOG_COUNTRIES = COUNTRIES.filter(
  (c) => c.code === "AO" || plannableStages(c.code).length > 0,
);

const SHIFTS: Array<{ id: TemplateSelection["shifts"][number]; label: string }> = [
  { id: "morning", label: "Manhã" },
  { id: "afternoon", label: "Tarde" },
  { id: "evening", label: "Noite" },
];

/**
 * Assistente «Usar modelo de estrutura»: a escola escolhe os níveis e cursos
 * que lecciona e o SIGA cria classes numeradas, cursos, disciplinas, turmas e
 * salas. Mostra o que vai criar antes de gravar; aplicar duas vezes não duplica.
 */
export function CurriculumTemplateDialog({
  trigger,
}: {
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("AO");
  const [catalogStages, setCatalogStages] = useState<Record<string, string[]>>({});
  const [courses, setCourses] = useState<Partial<Record<EducationLevelId, string[]>>>({});
  const [groupsPerGrade, setGroupsPerGrade] = useState(1);
  const [shifts, setShifts] = useState<TemplateSelection["shifts"]>(["morning"]);
  const [capacity, setCapacity] = useState(35);
  const [createRooms, setCreateRooms] = useState(true);
  const [saving, setSaving] = useState(false);
  const apply = useServerFn(applyCurriculumTemplate);
  const applyCatalog = useServerFn(applyCatalogStructure);
  const fromCatalog = country !== "AO";
  const queryClient = useQueryClient();

  const selection = useMemo<TemplateSelection>(
    () => ({ courses, groupsPerGrade, shifts, capacity, createRooms }),
    [courses, groupsPerGrade, shifts, capacity, createRooms],
  );
  const catalogSelection = useMemo(
    () => ({ country, stages: catalogStages, groupsPerGrade, shifts, capacity, createRooms }),
    [country, catalogStages, groupsPerGrade, shifts, capacity, createRooms],
  );
  const plan = useMemo(
    () => (fromCatalog ? planFromCatalog(catalogSelection) : planCurriculum(selection)),
    [fromCatalog, catalogSelection, selection],
  );
  const withoutPlan = fromCatalog ? stagesWithoutPlan(catalogSelection) : [];
  const summary = summarizePlan(plan);

  const toggleLevel = (id: EducationLevelId, on: boolean) => {
    const level = EDUCATION_LEVELS.find((l) => l.id === id)!;
    // Nível de curso único liga-se inteiro; nos outros a escola escolhe os cursos.
    const defaults = level.courses.length === 1 ? [level.courses[0]!.code] : [];
    setCourses((prev) => ({ ...prev, [id]: on ? (prev[id]?.length ? prev[id] : defaults) : [] }));
  };
  const toggleCourse = (id: EducationLevelId, code: string, on: boolean) =>
    setCourses((prev) => {
      const list = new Set(prev[id] ?? []);
      if (on) list.add(code);
      else list.delete(code);
      return { ...prev, [id]: [...list] };
    });

  const toggleStage = (id: string, on: boolean) =>
    setCatalogStages((prev) => {
      const next = { ...prev };
      if (on) next[id] = prev[id] ?? [];
      else delete next[id];
      return next;
    });
  const toggleStageCourse = (id: string, code: string, on: boolean) =>
    setCatalogStages((prev) => {
      const list = new Set(prev[id] ?? []);
      if (on) list.add(code);
      else list.delete(code);
      return { ...prev, [id]: [...list] };
    });

  const submit = async () => {
    setSaving(true);
    try {
      const result = fromCatalog
        ? await applyCatalog({ data: catalogSelection })
        : await apply({ data: selection });
      const c = result.created;
      toast.success("Estrutura criada", {
        description:
          `${c.cursos} cursos, ${c.classes} classes, ${c.disciplinas} disciplinas, ${c.turmas} turmas, ${c.salas} salas.` +
          (result.pendingWithoutYear
            ? " As turmas ficam para depois de definir o ano lectivo (Calendário)."
            : ""),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["academic"] }),
        queryClient.invalidateQueries({ queryKey: ["school", "setup-guide"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] }),
      ]);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a estrutura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button type="button" size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <LayoutTemplate className="size-4" /> Usar modelo de estrutura
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modelo de estrutura académica</DialogTitle>
            <DialogDescription>
              Escolha o que a escola lecciona. Criamos as classes numeradas (1ª à 13ª, ou anos no
              superior), os cursos, as disciplinas dos planos curriculares, as turmas e as salas.
              Tudo fica editável depois; o que já existe não é alterado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="tpl-country">Sistema de ensino</Label>
            <select
              id="tpl-country"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setCatalogStages({});
              }}
            >
              {CATALOG_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {fromCatalog ? (
            <div className="grid gap-3">
              {plannableStages(country).map((st) => {
                const on = st.id in catalogStages;
                const label = st.cycle ? `${st.name} — ${st.cycle}` : st.name;
                return (
                  <fieldset key={st.id} className="rounded-lg border border-border/70 p-3">
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(value) => toggleStage(st.id, value === true)}
                        aria-label={label}
                      />
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {st.curriculum.length
                            ? "Com as disciplinas obrigatórias do plano (em revisão)."
                            : "Só classes e turmas: plano curricular por carregar no catálogo."}
                        </span>
                      </span>
                    </label>
                    {on && st.courses.length ? (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 pl-7">
                        {st.courses.map((code) => (
                          <label key={code} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={catalogStages[st.id]?.includes(code) ?? false}
                              onCheckedChange={(value) =>
                                toggleStageCourse(st.id, code, value === true)
                              }
                            />
                            {globalCourse(code)?.name ?? code}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3">
              {EDUCATION_LEVELS.map((level) => {
                const chosen = courses[level.id] ?? [];
                const on = chosen.length > 0;
                return (
                  <fieldset key={level.id} className="rounded-lg border border-border/70 p-3">
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(value) => toggleLevel(level.id, value === true)}
                        aria-label={level.label}
                      />
                      <span>
                        <span className="block text-sm font-medium">{level.label}</span>
                        <span className="block text-xs text-muted-foreground">{level.hint}</span>
                      </span>
                    </label>
                    {level.courses.length > 1 ? (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 pl-7">
                        {level.courses.map((course) => (
                          <label key={course.code} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={chosen.includes(course.code)}
                              onCheckedChange={(value) =>
                                toggleCourse(level.id, course.code, value === true)
                              }
                            />
                            {course.name}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-groups">Turmas por classe</Label>
              <Input
                id="tpl-groups"
                type="number"
                min={1}
                max={10}
                value={groupsPerGrade}
                onChange={(e) =>
                  setGroupsPerGrade(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-capacity">Alunos por turma</Label>
              <Input
                id="tpl-capacity"
                type="number"
                min={5}
                max={120}
                value={capacity}
                onChange={(e) =>
                  setCapacity(Math.min(120, Math.max(5, Number(e.target.value) || 35)))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Turnos</span>
              <div className="flex flex-wrap gap-3">
                {SHIFTS.map((shift) => (
                  <label key={shift.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={shifts.includes(shift.id)}
                      onCheckedChange={(value) =>
                        setShifts((prev) =>
                          value === true
                            ? [...new Set([...prev, shift.id])]
                            : prev.length > 1
                              ? prev.filter((s) => s !== shift.id)
                              : prev,
                        )
                      }
                    />
                    {shift.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={createRooms} onCheckedChange={(v) => setCreateRooms(v === true)} />
            Criar as salas (uma por turma do mesmo turno, e laboratórios/oficina do nível)
          </label>

          <div className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
            {summary.cursos ? (
              <>
                <p className="font-medium">Vai criar</p>
                <p className="text-muted-foreground">
                  {summary.cursos} cursos · {summary.classes} classes · {summary.disciplinas}{" "}
                  disciplinas · {summary.turmas} turmas
                  {summary.salas ? ` · ${summary.salas} salas` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ex.:{" "}
                  {plan.classGroups
                    .slice(0, 3)
                    .map((g) => g.name)
                    .join(", ")}
                  {plan.classGroups.length > 3 ? "…" : ""}
                </p>
                {withoutPlan.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sem disciplinas para:{" "}
                    {withoutPlan
                      .map((s) => (s.cycle ? `${s.name} — ${s.cycle}` : s.name))
                      .join("; ")}
                    . Acrescente-as depois em Disciplinas.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Escolha pelo menos um nível de ensino.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={!summary.cursos || saving}>
              {saving ? "A criar…" : "Criar estrutura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
