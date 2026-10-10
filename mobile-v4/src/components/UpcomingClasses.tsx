import { useEffect, useState } from "react";
import type { AcademicCatalog } from "../domain/catalog";
import { upcomingSlots } from "../domain/upcoming";
export function UpcomingClasses({
  catalog,
  onNavigate,
}: {
  catalog: AcademicCatalog;
  onNavigate: (id: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const next = upcomingSlots(catalog, now);
  return (
    <>
      <p>{catalog.timetable.length} períodos no horário semanal.</p>
      <p className="small">
        Próximas aulas previstas no horário publicado; alterações, feriados e cancelamentos podem
        modificar a agenda.
      </p>
      {next.map((n) => (
        <button
          className="menurow"
          key={n.date + n.slot.slotId}
          onClick={() => onNavigate(catalog.role === "professor" ? "aulas" : "horario")}
        >
          <span>
            {n.date} · {n.slot.startsAt.slice(0, 5)}–{n.slot.endsAt.slice(0, 5)}
            <br />
            {n.class.subjectName} · {n.class.className}
            {n.slot.room && ` · ${n.slot.room}`}
          </span>
        </button>
      ))}
      {!next.length && <p>Sem períodos previstos no horário publicado nos próximos 14 dias.</p>}
      <button
        className="pill"
        onClick={() => onNavigate(catalog.role === "professor" ? "aulas" : "horario")}
      >
        Consultar horário semanal
      </button>
      <button className="pill" onClick={() => onNavigate("calendario")}>
        Consultar calendário
      </button>
    </>
  );
}
