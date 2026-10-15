import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, Phone, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineLoading } from "@/components/ui/inline-loading";
import {
  archiveClassTask,
  createClassTask,
  getLessonDetail,
  saveLessonDetail,
  type LessonDetail,
} from "@/features/academic/timetable-lessons";
import {
  DELIVERY_MODES,
  LESSON_TYPES,
  TASK_KINDS,
  DELIVERY_MODE_LABELS,
  LESSON_TYPE_LABELS,
  TASK_KIND_LABELS,
} from "@/features/academic/lesson-messages";
import { publicErrorMessage } from "@/lib/public-error";
import { safeHref } from "@/lib/safe-url";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const selectClass = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

function formatDue(iso: string | null) {
  if (!iso) return "Sem data de entrega";
  const [y, m, d] = iso.split("-");
  return `Entrega: ${d}/${m}/${y}`;
}

/**
 * Detalhe de uma aula do horário. Quem pode editar (professor da disciplina,
 * direcção) vê também o formulário da aula e das tarefas.
 */
export function LessonDetailDialog({
  slotId,
  studentId,
  onOpenChange,
}: {
  slotId: string | null;
  studentId?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryKey = ["lesson-detail", slotId, studentId ?? "self"];
  const query = useQuery({
    queryKey,
    enabled: Boolean(slotId),
    queryFn: () =>
      getLessonDetail({
        data: { slotId: slotId!, ...(studentId ? { studentId } : {}) },
      }) as Promise<LessonDetail>,
  });
  const detail = query.data;

  return (
    <Dialog open={Boolean(slotId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        {query.isLoading || !detail ? (
          <>
            <DialogHeader>
              <DialogTitle>Aula</DialogTitle>
              <DialogDescription>Detalhes da aula</DialogDescription>
            </DialogHeader>
            {query.isError ? (
              <p className="text-sm text-muted-foreground">
                {publicErrorMessage(query.error, "Não foi possível abrir a aula.")}
              </p>
            ) : (
              <InlineLoading label="A carregar a aula…" />
            )}
          </>
        ) : (
          <LessonDetailBody detail={detail} queryKey={queryKey} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LessonDetailBody({ detail, queryKey }: { detail: LessonDetail; queryKey: unknown[] }) {
  const [editing, setEditing] = useState(false);
  const online = detail.deliveryMode !== "presencial";

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{detail.subjectName}</DialogTitle>
        <DialogDescription>
          {WEEKDAYS[detail.weekday]} · {detail.startsAt}–{detail.endsAt} · {detail.className}
          {detail.room && !online ? ` · Sala ${detail.room}` : ""}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Tipo de aula</dt>
          <dd>{LESSON_TYPE_LABELS[detail.lessonType] ?? detail.lessonType}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Modo</dt>
          <dd className="flex items-center gap-1.5">
            {DELIVERY_MODE_LABELS[detail.deliveryMode] ?? detail.deliveryMode}
            {online && detail.onlineUrl ? (
              <a
                href={safeHref(detail.onlineUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                Entrar <ExternalLink className="size-3" />
              </a>
            ) : null}
          </dd>
        </div>
        {detail.topic ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Tema</dt>
            <dd>{detail.topic}</dd>
          </div>
        ) : null}
        {detail.notes ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Notas do professor</dt>
            <dd className="whitespace-pre-line text-muted-foreground">{detail.notes}</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Professor</dt>
          <dd>{detail.teacher?.name ?? "Ainda sem professor atribuído"}</dd>
          {detail.teacher?.email || detail.teacher?.phone ? (
            <dd className="mt-1 flex flex-wrap gap-3 text-xs">
              {detail.teacher.email ? (
                <a
                  href={`mailto:${detail.teacher.email}`}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="size-3.5" /> {detail.teacher.email}
                </a>
              ) : null}
              {detail.teacher.phone ? (
                <a
                  href={`tel:${detail.teacher.phone}`}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Phone className="size-3.5" /> {detail.teacher.phone}
                </a>
              ) : null}
            </dd>
          ) : detail.teacher?.name ? (
            <dd className="mt-0.5 text-xs text-muted-foreground">
              O professor optou por não mostrar o contacto.
            </dd>
          ) : null}
        </div>
      </dl>

      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium">Tarefas</h3>
        {detail.tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem tarefas por fazer.</p>
        ) : (
          <ul className="divide-y divide-border">
            {detail.tasks.map((task) => (
              <TaskRow key={task.id} task={task} canEdit={detail.canEdit} queryKey={queryKey} />
            ))}
          </ul>
        )}
      </section>

      {detail.canEdit ? (
        detail.detailsAvailable ? (
          <div className="space-y-4 border-t border-border pt-3">
            {editing ? (
              <EditLessonForm
                detail={detail}
                queryKey={queryKey}
                onDone={() => setEditing(false)}
              />
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                Editar aula
              </Button>
            )}
            <NewTaskForm slotId={detail.slotId} queryKey={queryKey} />
          </div>
        ) : (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            A edição das aulas e das tarefas fica disponível depois de a escola aplicar a
            actualização da base de dados.
          </p>
        )
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  canEdit,
  queryKey,
}: {
  task: LessonDetail["tasks"][number];
  canEdit: boolean;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: () => archiveClassTask({ data: { taskId: task.id } }),
    onSuccess: () => {
      toast.success("Tarefa arquivada.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível arquivar.")),
  });
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm">
          <span className="text-muted-foreground">
            {TASK_KIND_LABELS[task.kind] ?? "Tarefa"} ·{" "}
          </span>
          {task.title}
        </p>
        {task.description ? (
          <p className="whitespace-pre-line text-xs text-muted-foreground">{task.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">{formatDue(task.dueOn)}</p>
      </div>
      {canEdit ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Arquivar tarefa"
          disabled={archive.isPending}
          onClick={() => archive.mutate()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </li>
  );
}

function EditLessonForm({
  detail,
  queryKey,
  onDone,
}: {
  detail: LessonDetail;
  queryKey: unknown[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [lessonType, setLessonType] = useState(detail.lessonType);
  const [deliveryMode, setDeliveryMode] = useState(detail.deliveryMode);
  const [onlineUrl, setOnlineUrl] = useState(detail.onlineUrl ?? "");
  const [topic, setTopic] = useState(detail.topic ?? "");
  const [notes, setNotes] = useState(detail.notes ?? "");
  useEffect(() => {
    if (deliveryMode === "presencial") setOnlineUrl("");
  }, [deliveryMode]);

  const save = useMutation({
    mutationFn: () =>
      saveLessonDetail({
        data: {
          slotId: detail.slotId,
          lessonType: lessonType as (typeof LESSON_TYPES)[number],
          deliveryMode: deliveryMode as (typeof DELIVERY_MODES)[number],
          onlineUrl,
          topic,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success("Aula actualizada.");
      void queryClient.invalidateQueries({ queryKey });
      onDone();
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível guardar.")),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lesson-type" className="text-xs">
            Tipo de aula
          </Label>
          <select
            id="lesson-type"
            className={selectClass}
            value={lessonType}
            onChange={(e) => setLessonType(e.target.value)}
          >
            {LESSON_TYPES.map((t) => (
              <option key={t} value={t}>
                {LESSON_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lesson-mode" className="text-xs">
            Modo
          </Label>
          <select
            id="lesson-mode"
            className={selectClass}
            value={deliveryMode}
            onChange={(e) => setDeliveryMode(e.target.value)}
          >
            {DELIVERY_MODES.map((m) => (
              <option key={m} value={m}>
                {DELIVERY_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {deliveryMode !== "presencial" ? (
        <div className="space-y-1">
          <Label htmlFor="lesson-url" className="text-xs">
            Ligação da aula (Zoom, Meet…)
          </Label>
          <Input
            id="lesson-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={onlineUrl}
            onChange={(e) => setOnlineUrl(e.target.value)}
            required
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="lesson-topic" className="text-xs">
          Tema
        </Label>
        <Input
          id="lesson-topic"
          maxLength={200}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lesson-notes" className="text-xs">
          Notas para os alunos
        </Label>
        <Textarea
          id="lesson-notes"
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "A guardar…" : "Guardar aula"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function NewTaskForm({ slotId, queryKey }: { slotId: string; queryKey: unknown[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof TASK_KINDS)[number]>("tpc");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createClassTask({
        data: { slotId, kind, title, description, dueOn, notifyStudents: true },
      }),
    onSuccess: (result) => {
      toast.success(
        result.notified
          ? `Tarefa criada. ${result.notified} ${result.notified === 1 ? "aluno avisado" : "alunos avisados"}.`
          : "Tarefa criada.",
      );
      setTitle("");
      setDescription("");
      setDueOn("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível criar a tarefa.")),
  });

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Nova tarefa para a turma
      </Button>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <div className="space-y-1">
          <Label htmlFor="task-kind" className="text-xs">
            Tipo
          </Label>
          <select
            id="task-kind"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof TASK_KINDS)[number])}
          >
            {TASK_KINDS.map((k) => (
              <option key={k} value={k}>
                {TASK_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="task-title" className="text-xs">
            Título
          </Label>
          <Input
            id="task-title"
            required
            minLength={2}
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="task-description" className="text-xs">
          O que fazer
        </Label>
        <Textarea
          id="task-description"
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="task-due" className="text-xs">
          Data de entrega
        </Label>
        <Input id="task-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Os alunos da turma recebem um aviso no portal.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "A criar…" : "Criar tarefa"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
