import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { scheduleVirtualClassroom } from "./classroom-api";
import { useVirtualClassrooms } from "./useVirtualClassrooms";

type Props = {
  schoolId: string;
  classGroupId: string;
  teacherId: string;
  canSchedule: boolean;
};

export function VirtualClassroomPanel({ schoolId, classGroupId, teacherId, canSchedule }: Props) {
  const { sessions, loading, error, refresh } = useVirtualClassrooms(schoolId);
  const classroomSessions = sessions.filter((session) => session.class_group_id === classGroupId);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canSchedule) return;
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
        start.getTime() < Date.now() - 60000 || end <= start ||
        end.getTime() - start.getTime() > 8 * 3600000) {
      setFormError("Defina um horário futuro válido, com duração máxima de 8 horas.");
      return;
    }
    setPending(true);
    setSuccess(false);
    setFormError(null);
    try {
      await scheduleVirtualClassroom({
        schoolId, classGroupId, teacherId, title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
      setTitle("");
      setStartsAt("");
      setEndsAt("");
      setSuccess(true);
      void refresh();
    } catch {
      setFormError("Não foi possível agendar a aula. Verifique os dados e as permissões.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-5" aria-label="Aulas virtuais">
      <div>
        <h2 className="text-xl font-semibold">Aulas virtuais</h2>
        <p className="text-sm text-muted-foreground">Sessões autorizadas para a sua escola e turma.</p>
      </div>
      {canSchedule && (
        <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-xl border p-4">
          <h3 className="font-medium">Agendar aula</h3>
          <label className="grid gap-1 text-sm">Título
            <input className="rounded-md border bg-background p-2" required maxLength={200}
              value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">Início
            <input className="rounded-md border bg-background p-2" required type="datetime-local"
              value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">Fim
            <input className="rounded-md border bg-background p-2" required type="datetime-local"
              value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
          <Button type="submit" disabled={pending || !title.trim() || !startsAt || !endsAt}>
            {pending ? "A agendar..." : "Agendar aula"}
          </Button>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          {success && <p role="status" className="text-sm">Aula agendada com sucesso.</p>}
        </form>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Sessões agendadas</h3>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            Actualizar
          </Button>
        </div>
        {loading && <p role="status" className="text-sm">A carregar aulas...</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !error && classroomSessions.length === 0 &&
          <p className="text-sm text-muted-foreground">Ainda não existem aulas virtuais nesta turma.</p>}
        {classroomSessions.map((session) => (
          <article key={session.id} className="rounded-xl border p-3">
            <p className="font-medium">{session.title}</p>
            <p className="text-sm text-muted-foreground">
              {new Date(session.starts_at).toLocaleString("pt-AO")} — {new Date(session.ends_at).toLocaleString("pt-AO")}
            </p>
            <p className="text-xs text-muted-foreground">Estado: {session.status}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
