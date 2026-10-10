import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormModal } from "@/components/ui/modal-system";
import {
  createAssessment,
  updateAssessmentItem,
  deleteAssessmentItem,
} from "@/features/academic/server";
import { assessmentComponents, assessmentKinds, assessmentPurposes } from "@/lib/angola-academic";

export type AssessmentItemDraft = {
  id: string;
  name?: string | null;
  kind?: string | null;
  component?: string | null;
  assessed_on?: string | null;
  starts_at?: string | null;
  duration_minutes?: number | null;
  purpose?: string | null;
  max_score?: number | null;
  description?: string | null;
  counts_toward_pauta?: boolean | null;
  allow_recovery?: boolean | null;
};

export function CreateAssessmentDialog({
  open,
  onOpenChange,
  classGroupId,
  subjectId,
  term,
  onCreated,
  editingItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classGroupId?: string | undefined;
  subjectId?: string | undefined;
  term: 1 | 2 | 3;
  onCreated: () => void;
  editingItem?: AssessmentItemDraft | null;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("teste");
  const [component, setComponent] = useState("NPP");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [purpose, setPurpose] = useState("");
  const [maxScore, setMaxScore] = useState("20");
  const [description, setDescription] = useState("");
  const [counts, setCounts] = useState(true);
  const [recovery, setRecovery] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name ?? "");
      setKind(editingItem.kind ?? "teste");
      setComponent(editingItem.component ?? "NPP");
      setDate(editingItem.assessed_on ?? "");
      setTime((editingItem.starts_at ?? "").slice(0, 5));
      setDuration(editingItem.duration_minutes ? String(editingItem.duration_minutes) : "");
      setPurpose(editingItem.purpose ?? "");
      setMaxScore(String(editingItem.max_score ?? "20"));
      setDescription(editingItem.description ?? "");
      setCounts(editingItem.counts_toward_pauta ?? true);
      setRecovery(editingItem.allow_recovery ?? true);
    } else {
      setName("");
      setKind("teste");
      setComponent("NPP");
      setDate("");
      setTime("");
      setDuration("");
      setPurpose("");
      setMaxScore("20");
      setDescription("");
      setCounts(true);
      setRecovery(true);
    }
  }, [editingItem, open]);

  const submit = async () => {
    if (!classGroupId || !subjectId) {
      toast.error("Seleccione turma e disciplina.");
      return;
    }
    const minutes = duration.trim() ? Number(duration) : undefined;
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 5 || minutes > 600)) {
      toast.error("A duração é em minutos, entre 5 e 600.");
      return;
    }
    const schedule = {
      startsAt: time || undefined,
      durationMinutes: minutes,
      purpose: (purpose || undefined) as (typeof assessmentPurposes)[number]["id"] | undefined,
    };
    setSaving(true);
    try {
      if (editingItem) {
        await updateAssessmentItem({
          data: {
            id: editingItem.id,
            name,
            kind: kind as (typeof assessmentKinds)[number]["id"],
            component: component as (typeof assessmentComponents)[number]["id"],
            assessedOn: date || undefined,
            ...schedule,
            maxScore: Number(maxScore) || 20,
            description: description || undefined,
            countsTowardPauta: counts,
            allowRecovery: recovery,
          },
        });
        toast.success("Avaliação actualizada.");
      } else {
        await createAssessment({
          data: {
            classGroupId,
            subjectId,
            term,
            name,
            kind: kind as (typeof assessmentKinds)[number]["id"],
            component: component as (typeof assessmentComponents)[number]["id"],
            assessedOn: date || undefined,
            ...schedule,
            maxScore: Number(maxScore) || 20,
            description: description || undefined,
            countsTowardPauta: counts,
            allowRecovery: recovery,
          },
        });
        toast.success("Avaliação criada.");
      }
      setName("");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem?.id) return;
    if (!confirm(`Tem a certeza que pretende eliminar a avaliação "${editingItem.name}"?`)) {
      return;
    }
    setDeleting(true);
    try {
      try {
        await deleteAssessmentItem({ data: { itemId: editingItem.id, force: false } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("nota(s) lançada(s)")) throw error;
        if (!confirm(`${message} Eliminar mesmo assim?`)) {
          setDeleting(false);
          return;
        }
        await deleteAssessmentItem({ data: { itemId: editingItem.id, force: true } });
      }
      toast.success("Avaliação eliminada.");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível eliminar.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingItem ? "Editar avaliação" : "Criar avaliação"}
      subtitle="A pauta calcula MAC, NPP e NPT a partir destas avaliações."
      submitLabel={editingItem ? "Guardar alterações" : "Criar avaliação"}
      isSubmitting={saving}
      disabled={deleting || name.trim().length < 2}
      onSubmit={submit}
      extraActions={
        editingItem ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={deleting || saving}
            className="gap-1.5"
          >
            <Trash2 className="size-3.5" />
            {deleting ? "A eliminar…" : "Eliminar"}
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="av-name">Nome</Label>
          <Input id="av-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label>Tipo</Label>
          <select
            aria-label="Tipo de avaliação"
            className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {assessmentKinds.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Componente</Label>
          <select
            aria-label="Componente de avaliação"
            className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={component}
            onChange={(event) => setComponent(event.target.value)}
          >
            {assessmentComponents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="av-date">Data</Label>
          <Input
            id="av-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="av-time">Hora</Label>
          <Input
            id="av-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="av-duration">Duração (min)</Label>
          <Input
            id="av-duration"
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </div>
        <div>
          <Label>Finalidade</Label>
          <select
            aria-label="Finalidade da avaliação"
            className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          >
            <option value="">Não indicada</option>
            {assessmentPurposes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="av-max">Cotação</Label>
          <Input
            id="av-max"
            value={maxScore}
            onChange={(event) => setMaxScore(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="av-desc">Descrição</Label>
          <Input
            id="av-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={counts} onCheckedChange={setCounts} /> Conta para a pauta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={recovery} onCheckedChange={setRecovery} /> Permitir recuperação
        </label>
      </div>
    </FormModal>
  );
}
