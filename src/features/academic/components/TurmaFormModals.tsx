import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";
import { SubModal } from "@/components/ui/modal-system";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { assignClassSubjectTeacher, updateClassGroup } from "@/features/academic/server";
import { isClassTeacherLevel } from "@/lib/academic-nav";

export type SalaOption = { id: string; name: string; capacity: number | null };

export const shiftLabelMap: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};
const shiftValueMap: Record<string, string> = {
  Manhã: "morning",
  Tarde: "afternoon",
  Noite: "evening",
};

export function TurmaEditSubModal({
  open,
  onOpenChange,
  turma,
  salas,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salas: SalaOption[];
  turma: {
    id: string;
    code: string;
    name: string;
    shift: string;
    capacity: number | null;
    campus_id: string | null;
    room_id: string | null;
    status: string;
    whatsapp_invite_url?: string | null;
    whatsapp_group_name?: string | null;
  };
  onSaved: () => Promise<void>;
}) {
  const whatsappOn = useInstalledIntegrations().hasCapability("whatsapp.class_groups");
  const [code, setCode] = useState(turma.code);
  const [name, setName] = useState(turma.name);
  const [shift, setShift] = useState(shiftLabelMap[turma.shift] ?? "Manhã");
  const [capacity, setCapacity] = useState(String(turma.capacity ?? 35));
  const [roomId, setRoomId] = useState(turma.room_id ?? "");
  const [whatsappGroupName, setWhatsappGroupName] = useState(turma.whatsapp_group_name ?? "");
  const [whatsappInviteUrl, setWhatsappInviteUrl] = useState(turma.whatsapp_invite_url ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await updateClassGroup({
        data: {
          id: turma.id,
          code,
          name,
          shift: (shiftValueMap[shift] ?? "morning") as "morning" | "afternoon" | "evening",
          capacity: Number(capacity) || undefined,
          // Só envia a sala quando muda: "" tira a sala fixa.
          ...(roomId !== (turma.room_id ?? "") ? { roomId: roomId || null } : {}),
          // Vazio apaga o link/nome (null); antes ausente também apagava.
          whatsappInviteUrl: whatsappInviteUrl.trim() || null,
          whatsappGroupName: whatsappGroupName.trim(),
        },
      });
      await onSaved();
      toast.success("Turma actualizada.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível guardar a turma.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubModal
      open={open}
      onOpenChange={onOpenChange}
      title="Editar turma"
      subtitle="Código, nome, sala, turno e capacidade."
      icon={Pencil}
      submitLabel="Guardar"
      isSubmitting={saving}
      hasUnsavedChanges={
        code !== turma.code ||
        name !== turma.name ||
        roomId !== (turma.room_id ?? "") ||
        whatsappGroupName !== (turma.whatsapp_group_name ?? "") ||
        whatsappInviteUrl !== (turma.whatsapp_invite_url ?? "")
      }
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label htmlFor="turma-edit-name" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Designação</span>
          <input
            id="turma-edit-name"
            aria-label="Designação da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label htmlFor="turma-edit-code" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Código</span>
          <input
            id="turma-edit-code"
            aria-label="Código da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label htmlFor="turma-edit-room" className="space-y-1 text-xs sm:col-span-2">
          <span className="font-semibold text-muted-foreground">Sala</span>
          <select
            id="turma-edit-room"
            aria-label="Sala da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">Sem sala fixa</option>
            {salas.map((sala) => (
              <option key={sala.id} value={sala.id}>
                {sala.capacity ? `${sala.name} (${sala.capacity} lugares)` : sala.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="turma-edit-shift" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Turno</span>
          <select
            id="turma-edit-shift"
            aria-label="Turno da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          >
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Noite</option>
          </select>
        </label>
        <label htmlFor="turma-edit-capacity" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Capacidade</span>
          <input
            id="turma-edit-capacity"
            aria-label="Capacidade da turma"
            type="number"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        {whatsappOn ? (
          <>
            <label htmlFor="turma-whatsapp-group" className="space-y-1 text-xs">
              <span className="font-semibold text-muted-foreground">Sala WhatsApp</span>
              <input
                id="turma-whatsapp-group"
                aria-label="Sala WhatsApp"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={whatsappGroupName}
                onChange={(e) => setWhatsappGroupName(e.target.value)}
                placeholder={`Turma ${turma.name}`}
              />
            </label>
            <label htmlFor="turma-whatsapp-invite" className="space-y-1 text-xs sm:col-span-2">
              <span className="font-semibold text-muted-foreground">Link do grupo WhatsApp</span>
              <input
                id="turma-whatsapp-invite"
                aria-label="Link do grupo WhatsApp"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={whatsappInviteUrl}
                onChange={(e) => setWhatsappInviteUrl(e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
              />
            </label>
          </>
        ) : null}
      </div>
    </SubModal>
  );
}

export function TurmaAssignTeacherSubModal({
  open,
  onOpenChange,
  classGroupId,
  gradeName,
  subjectOptions,
  subjectIds,
  teacherOptions,
  teacherIds,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classGroupId: string;
  gradeName: string;
  subjectOptions: string[];
  subjectIds: string[];
  teacherOptions: string[];
  teacherIds: string[];
  onAssigned: () => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [saving, setSaving] = useState(false);

  // Primário e iniciação: um só professor titular leciona todas as disciplinas da turma
  // (monodocência) — mesma detecção usada na navegação lateral (src/lib/academic-nav.ts), para nunca
  // divergir sobre que turmas são monodocentes.
  const monodocente = isClassTeacherLevel(gradeName);

  const handleSubmit = async () => {
    const teacherId = teacherIds[teacherOptions.indexOf(teacher)];
    if (!teacherId) {
      toast.error("Seleccione o professor.");
      return;
    }
    if (monodocente) {
      if (subjectIds.length === 0) {
        toast.error("Não há disciplinas no catálogo da escola para atribuir.");
        return;
      }
      setSaving(true);
      try {
        await Promise.all(
          subjectIds.map((subjectId) =>
            assignClassSubjectTeacher({ data: { classGroupId, subjectId, teacherId } }),
          ),
        );
        await onAssigned();
        toast.success(`Professor titular atribuído a ${subjectIds.length} disciplina(s).`);
        setTeacher("");
        onOpenChange(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Não foi possível atribuir o professor titular.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const subjectId = subjectIds[subjectOptions.indexOf(subject)];
    if (!subjectId) {
      toast.error("Seleccione a disciplina e o professor.");
      return;
    }
    setSaving(true);
    try {
      await assignClassSubjectTeacher({ data: { classGroupId, subjectId, teacherId } });
      await onAssigned();
      toast.success("Professor atribuído à disciplina.");
      setSubject("");
      setTeacher("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atribuir o professor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubModal
      open={open}
      onOpenChange={onOpenChange}
      title={monodocente ? "Professor titular da turma" : "Atribuir professor"}
      subtitle={
        monodocente
          ? "Turma de regime monodocente — este professor fica responsável por todas as disciplinas."
          : "Liga um docente a uma disciplina desta turma."
      }
      icon={UserPlus}
      submitLabel={monodocente ? "Atribuir a todas as disciplinas" : "Atribuir"}
      isSubmitting={saving}
      hasUnsavedChanges={Boolean(subject || teacher)}
      onSubmit={handleSubmit}
    >
      <div className="space-y-3">
        {!monodocente ? (
          <label htmlFor="turma-assign-subject" className="block space-y-1 text-xs">
            <span className="font-semibold text-muted-foreground">Disciplina</span>
            <select
              id="turma-assign-subject"
              aria-label="Disciplina"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {subjectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Regime monodocente: ao gravar, este professor é atribuído às {subjectIds.length}{" "}
            disciplina(s) do catálogo da escola nesta turma.
          </p>
        )}
        <label htmlFor="turma-assign-teacher" className="block space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Professor</span>
          <select
            id="turma-assign-teacher"
            aria-label="Professor"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="">Seleccione…</option>
            {teacherOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
    </SubModal>
  );
}
