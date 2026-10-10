import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalFooter, ModalHeader, ModalShell } from "@/components/ui/modal-system";
import { EducationWorkflowVisual } from "@/components/workflows/EducationWorkflowVisual";
import { assignClassSubjectTeacher } from "@/features/academic/server";
import {
  subjectIdsForTeacherAssignment,
  type TeacherAssignmentLink,
} from "@/features/pedagogica/teacher-assignment";

function resolveOptionId(options: string[], selected: string | undefined, ids: string[]) {
  const index = options.indexOf(selected ?? "");
  return index >= 0 ? ids[index] : undefined;
}

export function AssignTeacherForm({
  turmaOptions,
  subjectOptions,
  teacherOptions,
  turmaIds,
  subjectIds,
  teacherIds,
  classSubjectLinks = [],
  defaultTurma,
  triggerLabel = "Professor",
  triggerSize = "sm",
  onAssigned,
}: {
  turmaOptions: string[];
  subjectOptions: string[];
  teacherOptions: string[];
  turmaIds: string[];
  subjectIds: string[];
  teacherIds: string[];
  classSubjectLinks?: TeacherAssignmentLink[];
  defaultTurma?: string;
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
  onAssigned: () => Promise<void>;
}) {
  const defaultTurmaId = resolveOptionId(turmaOptions, defaultTurma, turmaIds) ?? turmaIds[0] ?? "";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classGroupId, setClassGroupId] = useState(defaultTurmaId);
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const filteredSubjectIds = useMemo(
    () =>
      subjectIdsForTeacherAssignment({
        classGroupId,
        subjectIds,
        classSubjectLinks,
      }),
    [classGroupId, classSubjectLinks, subjectIds],
  );

  const filteredSubjects = filteredSubjectIds
    .map((id) => {
      const index = subjectIds.indexOf(id);
      return index >= 0 ? { id, label: subjectOptions[index] ?? id } : null;
    })
    .filter((item): item is { id: string; label: string } => Boolean(item));

  const teacherRows = teacherIds.map((id, index) => ({
    id,
    label: teacherOptions[index] ?? id,
  }));

  const turmaRows = turmaIds.map((id, index) => ({
    id,
    label: turmaOptions[index] ?? id,
  }));

  const resetSelections = (nextClassGroupId = defaultTurmaId) => {
    setClassGroupId(nextClassGroupId);
    setSubjectId("");
    setTeacherId("");
  };

  const submit = async () => {
    if (!classGroupId || !subjectId || !teacherId) {
      toast.error("Seleccione turma, disciplina e professor.");
      return;
    }
    setSaving(true);
    try {
      await assignClassSubjectTeacher({
        data: { classGroupId, subjectId, teacherId },
      });
      await onAssigned();
      toast.success("Professor ligado à disciplina da turma.");
      setOpen(false);
      resetSelections();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atribuir o professor.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        size={triggerSize}
        variant="outline"
        className="gap-1.5"
        onClick={() => {
          resetSelections();
          setOpen(true);
        }}
      >
        <UserPlus className="size-3.5" /> {triggerLabel}
      </Button>

      <ModalShell
        open={open}
        onOpenChange={setOpen}
        size="2xl"
        hasUnsavedChanges={Boolean(classGroupId || subjectId || teacherId)}
      >
        <div className="grid min-h-[70vh] lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]">
          <aside className="hidden overflow-hidden border-r border-border bg-muted/20 lg:block">
            <EducationWorkflowVisual
              scene="teacher"
              eyebrow="Vínculo docente"
              title="Turma → disciplina → professor"
              description="A disciplina é filtrada pela turma escolhida. O vínculo final usa apenas IDs reais do SGA."
            />
          </aside>
          <div className="flex min-h-0 flex-col">
            <ModalHeader
              icon={UserPlus}
              title="Atribuir professor"
              subtitle="Liga o docente à disciplina correcta dentro da turma."
              onClose={() => setOpen(false)}
            />
            <ModalContent>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="assign-teacher-class" className="text-xs font-semibold">
                    Turma
                  </label>
                  <select
                    id="assign-teacher-class"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={classGroupId}
                    onChange={(event) => {
                      setClassGroupId(event.target.value);
                      setSubjectId("");
                    }}
                  >
                    <option value="">Seleccionar turma</option>
                    {turmaRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="assign-teacher-subject" className="text-xs font-semibold">
                    Disciplina
                  </label>
                  <select
                    id="assign-teacher-subject"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                    disabled={!classGroupId}
                  >
                    <option value="">Seleccionar disciplina</option>
                    {filteredSubjects.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                  {classGroupId &&
                  classSubjectLinks.length > 0 &&
                  !classSubjectLinks.some((row) => row.class_group_id === classGroupId) ? (
                    <p className="text-xs text-muted-foreground">
                      Esta turma ainda não tem currículo ligado. A primeira atribuição também
                      associa a disciplina à turma, preservando o fluxo anterior.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="assign-teacher-person" className="text-xs font-semibold">
                    Professor
                  </label>
                  <select
                    id="assign-teacher-person"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={teacherId}
                    onChange={(event) => setTeacherId(event.target.value)}
                  >
                    <option value="">Seleccionar professor</option>
                    {teacherRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </ModalContent>
            <ModalFooter
              onCancel={() => setOpen(false)}
              onSubmit={() => void submit()}
              submitLabel="Atribuir professor"
              isSubmitting={saving}
              disabled={!classGroupId || !subjectId || !teacherId}
            />
          </div>
        </div>
      </ModalShell>
    </>
  );
}
