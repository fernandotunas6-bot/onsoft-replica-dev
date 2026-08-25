import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { FormModal } from "@/components/ui/modal-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";
import { createLessonPlan, updateLessonPlan } from "./server";
import type { LessonPlanComponentInput } from "./schemas";
import { generateAiLessonPlanInide } from "./ai-lesson-plan-generator";

type ClassGroupOption = { id: string; name: string };
type SubjectOption = { id: string; name: string };

export type LessonPlanFormInitial = {
  id?: string;
  classGroupId?: string;
  subjectId?: string;
  term?: 1 | 2 | 3;
  title?: string;
  content?: string | null;
  fileId?: string | null;
  fileName?: string | null;
  status?: "draft" | "published";
  components?: Array<{ kind: "avaliacao" | "prova"; name: string; planned_count: number }>;
};

function emptyComponentRow(kind: LessonPlanComponentInput["kind"]): LessonPlanComponentInput {
  return { kind, name: "", plannedCount: 1 };
}

export function LessonPlanModal({
  open,
  onOpenChange,
  classGroups,
  subjects,
  initial,
  defaultClassGroupId,
  defaultSubjectId,
  defaultTerm,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classGroups: ClassGroupOption[];
  subjects: SubjectOption[];
  initial?: LessonPlanFormInitial | null;
  defaultClassGroupId?: string;
  defaultSubjectId?: string;
  defaultTerm?: 1 | 2 | 3;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial?.id);

  const [classGroupId, setClassGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [term, setTerm] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [publish, setPublish] = useState(false);
  const [avaliacoes, setAvaliacoes] = useState<LessonPlanComponentInput[]>([
    emptyComponentRow("avaliacao"),
  ]);
  const [provas, setProvas] = useState<LessonPlanComponentInput[]>([emptyComponentRow("prova")]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setClassGroupId(initial?.classGroupId ?? defaultClassGroupId ?? classGroups[0]?.id ?? "");
    setSubjectId(initial?.subjectId ?? defaultSubjectId ?? subjects[0]?.id ?? "");
    setTerm(initial?.term ?? defaultTerm ?? 1);
    setTitle(initial?.title ?? "");
    setContent(initial?.content ?? "");
    setFile(
      initial?.fileId ? { id: initial.fileId, name: initial.fileName ?? "Ficheiro anexado" } : null,
    );
    setPublish(initial?.status === "published");
    const initialAvaliacoes = (initial?.components ?? [])
      .filter((row) => row.kind === "avaliacao")
      .map((row) => ({
        kind: "avaliacao" as const,
        name: row.name,
        plannedCount: row.planned_count,
      }));
    const initialProvas = (initial?.components ?? [])
      .filter((row) => row.kind === "prova")
      .map((row) => ({ kind: "prova" as const, name: row.name, plannedCount: row.planned_count }));
    setAvaliacoes(initialAvaliacoes.length ? initialAvaliacoes : [emptyComponentRow("avaliacao")]);
    setProvas(initialProvas.length ? initialProvas : [emptyComponentRow("prova")]);
    setFormError(null);
  }, [open, initial, defaultClassGroupId, defaultSubjectId, defaultTerm, classGroups, subjects]);

  const submit = async () => {
    if (!classGroupId || !subjectId) {
      setFormError("Seleccione a turma e a disciplina.");
      return;
    }
    if (!title.trim()) {
      setFormError("Indique um título para o plano.");
      return;
    }
    const components = [...avaliacoes, ...provas].filter((row) => row.name.trim().length >= 2);
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        classGroupId,
        subjectId,
        term,
        title: title.trim(),
        content: content.trim() || undefined,
        fileId: file?.id,
        fileName: file?.name,
        status: (publish ? "published" : "draft") as "draft" | "published",
        components,
      };
      if (isEdit && initial?.id) {
        await updateLessonPlan({ data: { ...payload, id: initial.id } });
      } else {
        await createLessonPlan({ data: payload });
      }
      toast.success(isEdit ? "Plano de aula actualizado" : "Plano de aula criado", {
        description:
          components.length > 0
            ? `${components.length} avaliação/prova ligada ao Centro de Avaliação.`
            : undefined,
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível guardar o plano.");
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (
    rows: LessonPlanComponentInput[],
    setRows: (rows: LessonPlanComponentInput[]) => void,
    index: number,
    patch: Partial<LessonPlanComponentInput>,
  ) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar plano de aula" : "Novo plano de aula"}
      subtitle="Título, conteúdo e a estrutura de avaliações/provas do trimestre."
      submitLabel={isEdit ? "Guardar alterações" : "Criar plano"}
      isSubmitting={saving}
      onSubmit={submit}
      size="lg"
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="lp-turma">Turma</Label>
            <select
              id="lp-turma"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={classGroupId}
              onChange={(event) => setClassGroupId(event.target.value)}
            >
              {classGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-disciplina">Disciplina</Label>
            <select
              id="lp-disciplina"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-trimestre">Trimestre</Label>
            <select
              id="lp-trimestre"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={term}
              onChange={(event) => setTerm(Number(event.target.value) as 1 | 2 | 3)}
            >
              <option value={1}>1º Trimestre</option>
              <option value={2}>2º Trimestre</option>
              <option value={3}>3º Trimestre</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-titulo">Título</Label>
          <Input
            id="lp-titulo"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Fracções — introdução e operações"
            maxLength={180}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="lp-conteudo">Conteúdo / Sumário</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const selectedSubj = subjects.find((s) => s.id === subjectId)?.name ?? "Disciplina";
                const generated = generateAiLessonPlanInide(
                  selectedSubj,
                  title || "Unidade Curricular",
                );
                setContent(
                  `SUMÁRIO:\n${generated.summary}\n\nOBJETIVOS GERAIS:\n- ${generated.generalObjectives.join("\n- ")}\n\nMETODOLOGIA:\n${generated.methodology}\n\nRECURSOS DIDÁTICOS:\n- ${generated.didacticResources.join("\n- ")}\n\nAVALIAÇÃO:\n${generated.evaluationMethod}`,
                );
                toast.success("Sumário AI Gerado (INIDE/MED)", {
                  description: "Conteúdo preenchido com base no programa curricular nacional.",
                });
              }}
              className="gap-1.5 text-xs h-7 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 shadow-2xs"
            >
              <Sparkles className="size-3.5 text-primary" />
              Gerar com AI (INIDE/MED)
            </Button>
          </div>
          <Textarea
            id="lp-conteudo"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder="Sumário, objectivos, métodos e recursos da aula…"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Arquivo (opcional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <PickFileButton
              label={file ? "Trocar arquivo" : "Anexar arquivo"}
              area="escola"
              onPick={(picked: SchoolFileRecord) => setFile({ id: picked.id, name: picked.name })}
            />
            {file ? (
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs">
                <FileText className="size-3.5" />
                {file.name}
                <button
                  type="button"
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  onClick={() => setFile(null)}
                  aria-label="Remover anexo"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Da biblioteca de arquivos SIGA.</span>
            )}
          </div>
        </div>

        <ComponentGroup
          title="Avaliações"
          hint="Nome definido pelo professor — cada uma gera um item MAC no Centro de Avaliação."
          rows={avaliacoes}
          onChange={setAvaliacoes}
          onUpdateRow={(index, patch) => updateRow(avaliacoes, setAvaliacoes, index, patch)}
          addLabel="Adicionar avaliação"
          kind="avaliacao"
        />

        <ComponentGroup
          title="Provas"
          hint="Nome definido pelo professor — cada uma gera um item NPP no Centro de Avaliação."
          rows={provas}
          onChange={setProvas}
          onUpdateRow={(index, patch) => updateRow(provas, setProvas, index, patch)}
          addLabel="Adicionar prova"
          kind="prova"
        />

        <label className="flex items-start gap-2 rounded-xl border border-border bg-primary/5 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            aria-label="Publicar plano"
            checked={publish}
            onChange={(event) => setPublish(event.target.checked)}
          />
          <span>
            <span className="font-medium text-foreground">Publicar plano</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Planos em rascunho ficam visíveis só para si; publicados ficam visíveis à escola.
            </span>
          </span>
        </label>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      </div>
    </FormModal>
  );
}

function ComponentGroup({
  title,
  hint,
  rows,
  onChange,
  onUpdateRow,
  addLabel,
  kind,
}: {
  title: string;
  hint: string;
  rows: LessonPlanComponentInput[];
  onChange: (rows: LessonPlanComponentInput[]) => void;
  onUpdateRow: (index: number, patch: Partial<LessonPlanComponentInput>) => void;
  addLabel: string;
  kind: LessonPlanComponentInput["kind"];
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => onChange([...rows, emptyComponentRow(kind)])}
        >
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`${title}: nome do item ${index + 1}`}
              value={row.name}
              onChange={(event) => onUpdateRow(index, { name: event.target.value })}
              placeholder={
                kind === "avaliacao" ? "Ex.: Trabalho de casa" : "Ex.: Prova de Matemática"
              }
              className="flex-1"
            />
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`${kind}-count-${index}`} className="text-xs text-muted-foreground">
                Qtd.
              </Label>
              <Input
                id={`${kind}-count-${index}`}
                type="number"
                min={1}
                max={20}
                value={row.plannedCount}
                onChange={(event) =>
                  onUpdateRow(index, {
                    plannedCount: Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                  })
                }
                className="w-16"
              />
            </div>
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                aria-label="Remover"
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
