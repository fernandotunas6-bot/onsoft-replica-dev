import { useVirtualClassrooms } from "./useVirtualClassrooms";

type Props = { schoolId: string };

export default function VirtualClassroomCalendarSection({ schoolId }: Props) {
  const { sessions, loading, error, refresh } = useVirtualClassrooms(schoolId);
  return (
    <section className="rounded-xl border p-4 space-y-3" aria-label="Aulas virtuais">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Aulas virtuais</h2>
          <p className="text-sm text-muted-foreground">
            Aulas autorizadas para a sua conta escolar.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Actualizar
        </button>
      </div>
      {loading && (
        <p role="status" className="text-sm">
          A carregar...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma aula virtual agendada.</p>
      )}
      {!loading &&
        !error &&
        sessions.map((session) => (
          <article key={session.id} className="rounded-lg border p-3">
            <p className="font-medium">{session.title}</p>
            <p className="text-sm text-muted-foreground">
              {new Date(session.starts_at).toLocaleString("pt-AO")} —{" "}
              {new Date(session.ends_at).toLocaleString("pt-AO")}
            </p>
            <p className="text-xs text-muted-foreground">Estado: {session.status}</p>
          </article>
        ))}
    </section>
  );
}
