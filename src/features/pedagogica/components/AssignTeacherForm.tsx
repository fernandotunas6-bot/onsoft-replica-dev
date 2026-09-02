import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { assignClassSubjectTeacher } from "@/features/academic/server";

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
  defaultTurma?: string;
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
  onAssigned: () => Promise<void>;
}) {
  return (
    <QuickFormModal
      title="Atribuir professor"
      eyebrow="Pedagógica"
      description="Liga o docente à disciplina desta turma. A pauta e a árvore do menu passam a mostrar o professor certo."
      icon={<UserPlus className="size-5" />}
      submitLabel="Atribuir"
      successDescription="Professor ligado à disciplina da turma."
      onSubmit={async (values) => {
        const classGroupId = resolveOptionId(turmaOptions, values["turma"], turmaIds);
        const subjectId = resolveOptionId(subjectOptions, values["disciplina"], subjectIds);
        const teacherId = resolveOptionId(teacherOptions, values["professor"], teacherIds);
        if (!classGroupId || !subjectId || !teacherId) {
          throw new Error("Seleccione turma, disciplina e professor.");
        }
        await assignClassSubjectTeacher({
          data: { classGroupId, subjectId, teacherId },
        });
        await onAssigned();
      }}
      fields={[
        {
          name: "turma",
          label: "Turma",
          type: "select",
          options: turmaOptions,
          required: true,
          defaultValue: defaultTurma,
          full: true,
        },
        {
          name: "disciplina",
          label: "Disciplina",
          type: "select",
          options: subjectOptions,
          required: true,
          full: true,
        },
        {
          name: "professor",
          label: "Professor",
          type: "select",
          options: teacherOptions,
          required: true,
          full: true,
        },
      ]}
      trigger={(open) => (
        <Button size={triggerSize} variant="outline" className="gap-1.5" onClick={open}>
          <UserPlus className="size-3.5" /> {triggerLabel}
        </Button>
      )}
    />
  );
}
