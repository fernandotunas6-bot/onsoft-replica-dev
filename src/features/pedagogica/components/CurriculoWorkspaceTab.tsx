import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Layers, Clock, Plus, Tag, CheckCircle2, Save } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listSubjectTypes,
  createSubjectType,
  listCurriculumAreas,
  createCurriculumArea,
  listSchoolShifts,
  saveSchoolShift,
  listCurricula,
} from "@/features/academic/server";
import { toast } from "sonner";

export function CurriculoWorkspaceTab({
  canManage,
  courses,
  gradeLevels,
}: {
  canManage: boolean;
  courses: Array<{ id: string; name: string }>;
  gradeLevels: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<"matriz" | "tipos" | "areas" | "turnos">("matriz");

  const { data: subjectTypes = [] } = useQuery({
    queryKey: ["academic", "subject-types"],
    queryFn: () => listSubjectTypes(),
  });

  const { data: curriculumAreas = [] } = useQuery({
    queryKey: ["academic", "curriculum-areas"],
    queryFn: () => listCurriculumAreas(),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["academic", "school-shifts"],
    queryFn: () => listSchoolShifts(),
  });

  const { data: curricula = [] } = useQuery({
    queryKey: ["academic", "curricula"],
    queryFn: () => listCurricula({ data: {} }),
  });

  const handleCreateSubjectType = async (values: Record<string, string | undefined>) => {
    try {
      await createSubjectType({
        data: {
          code: values["codigo"]?.trim() || "",
          name: values["nome"]?.trim() || "",
          description: values["descricao"]?.trim() || undefined,
          countsForGpa: values["contaMedia"] !== "false",
          appearsInPauta: values["aparecePauta"] !== "false",
          hasExam: values["temExame"] === "true",
          canFail: values["podeReprovar"] !== "false",
          isMandatory: values["obrigatoria"] !== "false",
          defaultWeight: Number(values["peso"] || 1),
          requiresSpecialRoom: values["salaEspecial"] === "true",
          color: values["cor"]?.trim() || "#3b82f6",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "subject-types"] });
      toast.success("Tipo de disciplina criado com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar tipo de disciplina.");
    }
  };

  const handleCreateArea = async (values: Record<string, string | undefined>) => {
    try {
      await createCurriculumArea({
        data: {
          code: values["codigo"]?.trim() || "",
          name: values["nome"]?.trim() || "",
          description: values["descricao"]?.trim() || undefined,
          color: values["cor"]?.trim() || "#6366f1",
          displayOrder: Number(values["ordem"] || 1),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "curriculum-areas"] });
      toast.success("Área curricular criada com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar área curricular.");
    }
  };

  const handleSaveShift = async (values: Record<string, string | undefined>) => {
    try {
      await saveSchoolShift({
        data: {
          code: values["codigo"]?.trim() || "",
          name: values["nome"]?.trim() || "",
          startsAt: values["inicio"]?.trim() || "07:00",
          endsAt: values["fim"]?.trim() || "12:30",
          defaultLessonDuration: Number(values["duracao"] || 45),
          defaultBreakDuration: Number(values["intervalo"] || 15),
          activeDays: [1, 2, 3, 4, 5],
          color: values["cor"]?.trim() || "#3b82f6",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "school-shifts"] });
      toast.success("Turno salvo com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar turno.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navegação do Currículo */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          variant={subTab === "matriz" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("matriz")}
        >
          <BookOpen className="mr-1.5 size-3.5" /> Matrizes Curriculares
        </Button>

        <Button
          variant={subTab === "tipos" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("tipos")}
        >
          <Tag className="mr-1.5 size-3.5" /> Tipos de Disciplinas ({subjectTypes.length})
        </Button>

        <Button
          variant={subTab === "areas" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("areas")}
        >
          <Layers className="mr-1.5 size-3.5" /> Áreas Curriculares ({curriculumAreas.length})
        </Button>

        <Button
          variant={subTab === "turnos" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("turnos")}
        >
          <Clock className="mr-1.5 size-3.5" /> Turnos & Períodos ({shifts.length})
        </Button>
      </div>

      {/* 1. ABA MATRIZ CURRICULAR */}
      {subTab === "matriz" && (
        <Panel
          title="Matrizes Curriculares da Instituição"
          description="A matriz curricular define a carga horária, aulas semanais e obrigatoriedade das disciplinas para cada Curso e Classe."
        >
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
            <BookOpen className="mx-auto size-10 text-muted-foreground/60" />
            <h4 className="text-sm font-semibold">Estrutura Curricular Unificada</h4>
            <p className="max-w-md mx-auto text-xs text-muted-foreground">
              A matriz curricular substitui a vinculação manual e solta de disciplinas, alimentando
              automaticamente turmas, horários e cargas docentes sem duplicações.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Cursos Registados: {courses.length}
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                Classes / Níveis: {gradeLevels.length}
              </span>
            </div>
          </div>
        </Panel>
      )}

      {/* 2. ABA TIPOS DE DISCIPLINAS */}
      {subTab === "tipos" && (
        <Panel
          title="Tipos de Disciplinas"
          description="Classificação institucional com impacto em médias, pautas, salas especiais e exames."
          action={
            canManage && (
              <QuickFormModal
                title="Novo Tipo de Disciplina"
                eyebrow="Currículo"
                description="Cadastre uma classificação pedagógica (ex: Formação Geral, Formação Específica, Laboratorial)."
                icon={<Plus className="size-5" />}
                submitLabel="Criar Tipo"
                onSubmit={handleCreateSubjectType}
                fields={[
                  { name: "codigo", label: "Código", placeholder: "Ex: tecnica", required: true },
                  {
                    name: "nome",
                    label: "Nome do Tipo",
                    placeholder: "Ex: Formação Técnica",
                    required: true,
                  },
                  {
                    name: "peso",
                    label: "Peso Padrão na Média",
                    type: "number",
                    defaultValue: "1.0",
                    required: true,
                  },
                  {
                    name: "descricao",
                    label: "Descrição",
                    placeholder: "Finalidade formativa deste tipo",
                    required: false,
                  },
                  {
                    name: "cor",
                    label: "Cor Visual (Hex)",
                    placeholder: "#3b82f6",
                    defaultValue: "#3b82f6",
                  },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Novo Tipo
                  </Button>
                )}
              />
            )
          }
        >
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-semibold">Código</TableHead>
                  <TableHead className="text-xs font-semibold">Designação</TableHead>
                  <TableHead className="text-xs font-semibold text-center">
                    Conta p/ Média
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-center">Pauta Oficial</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Tem Exame</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Peso</TableHead>
                  <TableHead className="text-xs font-semibold">Exige Sala Especial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjectTypes.map((type: any) => (
                  <TableRow key={type.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {type.code}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-xs text-foreground flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: type.color || "#3b82f6" }}
                        />
                        {type.name}
                      </span>
                      {type.description && (
                        <p className="text-[10px] text-muted-foreground">{type.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {type.counts_for_gpa ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {type.appears_in_pauta ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {type.has_exam ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs font-bold">
                      {type.default_weight}x
                    </TableCell>
                    <TableCell className="text-xs">
                      {type.requires_special_room ? "Sim (Laboratório/Oficina)" : "Não"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}

      {/* 3. ABA ÁREAS CURRICULARES */}
      {subTab === "areas" && (
        <Panel
          title="Áreas Curriculares"
          description="Agrupamento disciplinar para comparação de desempenho, relatórios e equilíbrio pedagógico."
          action={
            canManage && (
              <QuickFormModal
                title="Nova Área Curricular"
                eyebrow="Currículo"
                description="Cadastre um agrupamento (ex: Ciências Exatas, Línguas e Comunicação)."
                icon={<Plus className="size-5" />}
                submitLabel="Criar Área"
                onSubmit={handleCreateArea}
                fields={[
                  { name: "codigo", label: "Código", placeholder: "Ex: exatas", required: true },
                  {
                    name: "nome",
                    label: "Nome da Área",
                    placeholder: "Ex: Ciências Exatas",
                    required: true,
                  },
                  {
                    name: "ordem",
                    label: "Ordem de Apresentação",
                    type: "number",
                    defaultValue: "1",
                  },
                  { name: "descricao", label: "Descrição", placeholder: "Disciplinas abrangidas", required: false },
                  { name: "cor", label: "Cor Visual (Hex)", defaultValue: "#2563eb" },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Nova Área
                  </Button>
                )}
              />
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {curriculumAreas.map((area: any) => (
              <div
                key={area.id}
                className="rounded-xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: area.color || "#6366f1" }}
                  />
                  <h5 className="text-xs font-bold text-foreground">{area.name}</h5>
                </div>
                {area.description && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{area.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground font-mono">
                  <span>Código: {area.code}</span>
                  <span>Ordem: #{area.display_order}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 4. ABA TURNOS ESCOLARES */}
      {subTab === "turnos" && (
        <Panel
          title="Turnos & Horários Institucionais"
          description="Defina os turnos escolares e seus limites de início e fim. O motor de horários bloqueia aulas fora destes limites."
          action={
            canManage && (
              <QuickFormModal
                title="Novo Turno Escolar"
                eyebrow="Turnos"
                description="Configure um turno (Manhã, Tarde, Noite, Integral, Pós-Laboral, etc.)."
                icon={<Plus className="size-5" />}
                submitLabel="Salvar Turno"
                onSubmit={handleSaveShift}
                fields={[
                  {
                    name: "codigo",
                    label: "Identificador (Código)",
                    placeholder: "Ex: morning",
                    required: true,
                  },
                  {
                    name: "nome",
                    label: "Nome do Turno",
                    placeholder: "Ex: Manhã (Regular)",
                    required: true,
                  },
                  {
                    name: "inicio",
                    label: "Hora Inicial",
                    type: "time",
                    defaultValue: "07:00",
                    required: true,
                  },
                  {
                    name: "fim",
                    label: "Hora Final",
                    type: "time",
                    defaultValue: "12:30",
                    required: true,
                  },
                  {
                    name: "duracao",
                    label: "Duração Padrão por Bloco (min)",
                    type: "number",
                    defaultValue: "45",
                  },
                  {
                    name: "intervalo",
                    label: "Duração do Recreio/Intervalo (min)",
                    type: "number",
                    defaultValue: "15",
                  },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Novo Turno
                  </Button>
                )}
              />
            )
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {shifts.map((shift: any) => (
              <div
                key={shift.id}
                className="rounded-xl border border-border bg-card p-5 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-bold text-foreground">{shift.name}</h5>
                  <span className="font-mono text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                    {shift.starts_at?.slice(0, 5)} – {shift.ends_at?.slice(0, 5)}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>• Duração da aula: {shift.default_lesson_duration || 45} minutos</p>
                  <p>• Recreio padrão: {shift.default_break_duration || 15} minutos</p>
                  <p>
                    • Código institucional: <span className="font-mono">{shift.code}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
