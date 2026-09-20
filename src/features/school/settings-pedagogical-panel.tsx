import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  resolveGradingProfile,
  DEFAULT_SUPERIOR_GRADING_PROFILE,
} from "@/features/academic/grading-profiles";
import { ProgramCurriculumPanel } from "@/features/school/ProgramCurriculumPanel";
import {
  getSchoolSettings,
  setTermLock,
  updatePedagogySettings,
  type SchoolSettingsBundle,
} from "@/features/school/server";
import {
  createSubject,
  listPedagogicalWorkspace,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import {
  angolaCoreSubjects,
  angolaSecondaryCourses,
  angolaTeachingLevels,
} from "@/lib/angola-academic";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { ModuleShortcutsRow } from "./settings-shortcuts-row";

export { ModuleShortcutsRow } from "./settings-shortcuts-row";

export function PedagogicalSettingsPanel() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador";
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace"],
    queryFn: () => listPedagogicalWorkspace({ data: {} }) as Promise<PedagogicalWorkspace>,
    staleTime: 60_000,
    retry: false,
  });
  const [teachingLevels, setTeachingLevels] = useState<string[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [closedTerms, setClosedTerms] = useState<Array<1 | 2 | 3>>([]);
  const [gradingScale, setGradingScale] = useState<"20_ects" | "gpa4">(
    DEFAULT_SUPERIOR_GRADING_PROFILE.scale,
  );
  const [gradingComponents, setGradingComponents] = useState<"frequencia_exame" | "so_exame">(
    DEFAULT_SUPERIOR_GRADING_PROFILE.components,
  );
  const [saving, setSaving] = useState(false);
  const [creatingCode, setCreatingCode] = useState<string | null>(null);
  const [lockingTerm, setLockingTerm] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    const pedagogy = schoolQuery.data?.pedagogy;
    if (!pedagogy) return;
    setTeachingLevels(pedagogy.teachingLevels ?? []);
    setCourses(pedagogy.courses ?? []);
    setClosedTerms(pedagogy.closedTerms ?? []);
    const resolved = resolveGradingProfile({ schoolDefault: pedagogy.gradingProfile ?? null });
    setGradingScale(resolved.scale);
    setGradingComponents(resolved.components);
  }, [schoolQuery.data?.pedagogy]);

  const existingSubjects = workspaceQuery.data?.subjects ?? [];
  const existingCodes = new Set(
    existingSubjects.map((subject) => String(subject.code ?? "").toUpperCase()),
  );
  const suggestedSubjects = angolaCoreSubjects.filter(
    (subject) =>
      teachingLevels.length === 0 || subject.levels.some((level) => teachingLevels.includes(level)),
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const save = async () => {
    setSaving(true);
    try {
      await updatePedagogySettings({
        data: {
          teachingLevels,
          courses,
          closedTerms,
          gradingProfile: teachingLevels.includes("superior")
            ? { scale: gradingScale, components: gradingComponents }
            : null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
      toast.success("Configuração pedagógica guardada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const addSuggestedSubject = async (code: string, name: string) => {
    setCreatingCode(code);
    try {
      await createSubject({ data: { code, name, weeklyHours: 4 } });
      await queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] });
      toast.success(`${name} adicionada ao catálogo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a disciplina.");
    } finally {
      setCreatingCode(null);
    }
  };

  return (
    <div className="space-y-6">
      <InstalledModuleTools module="pedagogica" />
      <div>
        <h4 className="font-display text-base font-extrabold">Níveis de ensino</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha os ciclos que a escola lecciona. A pauta e o catálogo de disciplinas usam esta
          selecção.
        </p>
        <div className="mt-3 space-y-2">
          {angolaTeachingLevels.map((level) => (
            <label
              key={level.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <Switch
                checked={teachingLevels.includes(level.id)}
                disabled={!canEdit}
                onCheckedChange={() => setTeachingLevels((current) => toggle(current, level.id))}
              />
              <span>
                <span className="block text-sm font-semibold">{level.label}</span>
                <span className="text-xs text-muted-foreground">
                  Classes: {level.classes.join(", ")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-display text-base font-extrabold">Cursos do II Ciclo</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Áreas de formação oferecidas no ensino médio / II ciclo.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {angolaSecondaryCourses.map((course) => (
            <label
              key={course.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <Switch
                checked={courses.includes(course.id)}
                disabled={!canEdit || !teachingLevels.includes("ii_ciclo")}
                onCheckedChange={() => setCourses((current) => toggle(current, course.id))}
              />
              <span>
                <span className="block text-sm font-semibold">{course.short}</span>
                <span className="text-xs text-muted-foreground">{course.label}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {teachingLevels.includes("superior") ? (
        <>
          <Separator />
          <div>
            <h4 className="font-display text-base font-extrabold">
              Motor de notas — Ensino Superior
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Valor por omissão da escola; cada curso pode ter a sua própria regra nas definições do
              curso. Sugestão do sistema:{" "}
              {DEFAULT_SUPERIOR_GRADING_PROFILE.scale === "20_ects"
                ? "0–20 com créditos ECTS"
                : "GPA 0–4"}{" "}
              +{" "}
              {DEFAULT_SUPERIOR_GRADING_PROFILE.components === "frequencia_exame"
                ? "Frequência + Exame Final"
                : "Só Exame Final"}
              .
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Escala de notas
                </Label>
                {[
                  { id: "20_ects" as const, label: "0–20 com créditos ECTS" },
                  { id: "gpa4" as const, label: "GPA 0–4 (notas-letra)" },
                ].map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <Switch
                      checked={gradingScale === option.id}
                      disabled={!canEdit}
                      onCheckedChange={() => setGradingScale(option.id)}
                    />
                    <span className="text-sm font-semibold">{option.label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Estrutura de avaliação
                </Label>
                {[
                  { id: "frequencia_exame" as const, label: "Frequência + Exame Final" },
                  { id: "so_exame" as const, label: "Só Exame Final" },
                ].map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <Switch
                      checked={gradingComponents === option.id}
                      disabled={!canEdit}
                      onCheckedChange={() => setGradingComponents(option.id)}
                    />
                    <span className="text-sm font-semibold">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-display text-base font-extrabold">Currículo dos Cursos</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Disciplinas de cada curso, organizadas por semestre, com créditos ECTS. Usado para
              aplicar automaticamente as disciplinas certas a uma turma desse curso.
            </p>
            <div className="mt-3">
              <ProgramCurriculumPanel
                courses={workspaceQuery.data?.courses ?? []}
                subjects={workspaceQuery.data?.subjects ?? []}
                canEdit={canEdit}
              />
            </div>
          </div>
        </>
      ) : null}

      <Separator />

      <div>
        <h4 className="font-display text-base font-extrabold">Fecho de trimestre</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Com o trimestre fechado, ninguém lança nem altera notas na pauta.
        </p>
        <div className="mt-3 space-y-2">
          {([1, 2, 3] as const).map((term) => {
            const closed = closedTerms.includes(term);
            return (
              <label
                key={term}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <span className="text-sm font-semibold">{term}º trimestre</span>
                <Switch
                  checked={closed}
                  disabled={!canEdit || lockingTerm === term}
                  onCheckedChange={(next) => {
                    setLockingTerm(term);
                    void setTermLock({ data: { term, closed: next } })
                      .then(async () => {
                        await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
                        toast.success(
                          next ? `${term}º trimestre fechado.` : `${term}º trimestre reaberto.`,
                        );
                      })
                      .catch((error) => {
                        toast.error(
                          error instanceof Error ? error.message : "Não foi possível alterar.",
                        );
                      })
                      .finally(() => setLockingTerm(null));
                  }}
                />
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-display text-base font-extrabold">Disciplinas do currículo</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Sugestões MINED para os níveis activos. Pode adicionar as que ainda não existem no
          catálogo.
        </p>
        <ul className="mt-3 space-y-2">
          {suggestedSubjects.map((subject) => {
            const exists = existingCodes.has(subject.code);
            return (
              <li
                key={subject.code}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <span>
                  <span className="text-sm font-semibold">
                    {subject.code} · {subject.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {subject.levels
                      .map(
                        (levelId) =>
                          angolaTeachingLevels.find((level) => level.id === levelId)?.cycle,
                      )
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {exists ? (
                  <Badge variant="secondary">No catálogo</Badge>
                ) : canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creatingCode === subject.code}
                    onClick={() => void addSuggestedSubject(subject.code, subject.name)}
                  >
                    {creatingCode === subject.code ? "A criar…" : "Adicionar"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {canEdit ? (
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "A guardar…" : "Guardar configuração pedagógica"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Só o administrador altera estes níveis.</p>
      )}
    </div>
  );
}
