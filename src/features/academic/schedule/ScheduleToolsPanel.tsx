import { useMemo, useState } from "react";
import {
  CalendarPlus,
  DoorOpen,
  FileSpreadsheet,
  Gauge,
  UserRoundCheck,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { todayInLuanda } from "@/features/calendar/dates";
import { exportCsv } from "@/lib/export-csv";
import { errorMessage } from "@/lib/error-message";
import { toast } from "@/lib/toast";
import type {
  ScheduleClassGroup,
  ScheduleClassSubject,
  ScheduleRoom,
  ScheduleSlot,
  ScheduleSlotInput,
  ScheduleSubject,
  ScheduleTeacher,
} from "./types";
import { proposeTimetable } from "./utils/autoSchedule";
import {
  downloadTextFile,
  fileSlug,
  sortedForExport,
  timetableCsvColumns,
  timetableIcs,
} from "./utils/exporters";
import {
  classTimetableQuality,
  freeRooms,
  lessonWindows,
  roomOccupancy,
  substituteCandidates,
  teacherLoads,
} from "./utils/insights";

const WEEKDAYS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export type ApplyProposalResult = { created: number; failed: string[] };

/**
 * Ferramentas do horário, na página e por separadores: análise (qualidade da turma,
 * carga dos professores, ocupação das salas), disponibilidade (salas livres e
 * substitutos), exportação (CSV reimportável e iCalendar) e proposta automática.
 */
export function ScheduleToolsPanel({
  slots,
  visibleSlots,
  viewLabel,
  classGroups,
  subjects,
  classSubjects,
  rooms,
  teachers,
  selectedClassGroupId,
  canManage,
  yearEndsOn,
  onApplyProposal,
}: {
  slots: ScheduleSlot[];
  visibleSlots: ScheduleSlot[];
  viewLabel: string;
  classGroups: ScheduleClassGroup[];
  subjects: ScheduleSubject[];
  classSubjects: ScheduleClassSubject[];
  rooms: ScheduleRoom[];
  teachers: ScheduleTeacher[];
  selectedClassGroupId: string;
  canManage: boolean;
  yearEndsOn?: string | null;
  onApplyProposal?: (lessons: ScheduleSlotInput[]) => Promise<ApplyProposalResult>;
}) {
  const selectedGroup = classGroups.find((group) => group.id === selectedClassGroupId);
  const classSlots = useMemo(
    () => slots.filter((slot) => slot.class_group_id === selectedClassGroupId),
    [slots, selectedClassGroupId],
  );
  const quality = useMemo(() => classTimetableQuality(classSlots), [classSlots]);
  const loads = useMemo(() => teacherLoads(slots, teachers), [slots, teachers]);
  const occupancy = useMemo(() => roomOccupancy(slots, rooms), [slots, rooms]);
  const windows = useMemo(() => lessonWindows(slots), [slots]);

  return (
    <section
      className="surface-card space-y-4 p-4 print:hidden sm:p-5"
      aria-label="Ferramentas do horário"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Ferramentas do horário</h3>
        <p className="text-xs text-muted-foreground">
          Análise, disponibilidade e exportação sobre as aulas carregadas. Só a proposta automática
          grava, e apenas depois de a confirmar.
        </p>
      </div>
      <Tabs defaultValue="analise">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="analise" className="gap-1.5">
            <Gauge className="size-3.5" aria-hidden /> Análise
          </TabsTrigger>
          <TabsTrigger value="disponibilidade" className="gap-1.5">
            <DoorOpen className="size-3.5" aria-hidden /> Disponibilidade
          </TabsTrigger>
          <TabsTrigger value="exportar" className="gap-1.5">
            <FileSpreadsheet className="size-3.5" aria-hidden /> Exportar
          </TabsTrigger>
          {canManage && onApplyProposal ? (
            <TabsTrigger value="proposta" className="gap-1.5">
              <Wand2 className="size-3.5" aria-hidden /> Proposta automática
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="analise" className="space-y-5 pt-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Qualidade do horário{selectedGroup ? ` · ${selectedGroup.name}` : ""}
              </p>
              {classSlots.length ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    quality.score >= 85
                      ? "bg-success/12 text-success-strong"
                      : quality.score >= 60
                        ? "bg-warning/15 text-warning-strong"
                        : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {quality.score}/100
                </span>
              ) : null}
            </div>
            {classSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                A turma ainda não tem aulas no horário.
              </p>
            ) : quality.issues.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem furos, sem disciplinas repetidas no dia e com os dias equilibrados.
              </p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {quality.issues.map((issue) => (
                  <li key={issue.message}>{issue.message}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Carga dos professores</p>
            {loads.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ainda não há aulas com professor.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Professor</th>
                      <th className="py-1.5 pr-3 font-medium">Aulas</th>
                      <th className="py-1.5 pr-3 font-medium">Horas</th>
                      <th className="py-1.5 pr-3 font-medium">Dias</th>
                      <th className="py-1.5 pr-3 font-medium">Seguidas</th>
                      <th className="py-1.5 font-medium">Furos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load) => (
                      <tr key={load.teacherId} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-medium text-foreground">{load.name}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{load.lessons}</td>
                        <td
                          className={`py-1.5 pr-3 tabular-nums ${load.overLimit ? "font-semibold text-destructive" : ""}`}
                        >
                          {hours(load.minutes)}
                          {load.overLimit && load.maxWeekly ? ` (máx. ${load.maxWeekly}h)` : ""}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">{load.days}</td>
                        <td
                          className={`py-1.5 pr-3 tabular-nums ${load.longestRun >= 5 ? "text-warning-strong" : ""}`}
                        >
                          {load.longestRun}
                        </td>
                        <td className="py-1.5 tabular-nums">
                          {load.gaps ? `${load.gaps} (${hours(load.gapMinutes)})` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Ocupação das salas</p>
            {occupancy.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem salas no cadastro.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {occupancy.map((room) => (
                  <li key={room.roomId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{room.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {Math.round(room.share * 100)}% · {room.lessons} aulas
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="meter"
                      aria-label={`Ocupação de ${room.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(room.share * 100)}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(room.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="disponibilidade" className="space-y-5 pt-3">
          <FreeRoomsFinder
            slots={slots}
            rooms={rooms}
            windows={windows}
            minCapacity={selectedGroup?.enrolled_count ?? 0}
          />
          <SubstituteFinder slots={slots} teachers={teachers} candidates={visibleSlots} />
        </TabsContent>

        <TabsContent value="exportar" className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground">
            Exporta a vista actual ({viewLabel}, {visibleSlots.length} aulas). O CSV usa as colunas
            do modelo de importação: pode corrigi-lo no Excel e voltar a importá-lo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={visibleSlots.length === 0}
              onClick={() =>
                exportCsv(
                  `horario-${fileSlug(viewLabel)}`,
                  timetableCsvColumns(new Map(classGroups.map((g) => [g.id, g.code || g.name]))),
                  sortedForExport(visibleSlots),
                )
              }
            >
              <FileSpreadsheet className="size-3.5" aria-hidden /> CSV (Excel)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={visibleSlots.length === 0 || !yearEndsOn}
              title={yearEndsOn ? undefined : "Configure o fim do ano lectivo no calendário."}
              onClick={() =>
                downloadTextFile(
                  `horario-${fileSlug(viewLabel)}.ics`,
                  timetableIcs(visibleSlots, {
                    calendarName: `Horário · ${viewLabel}`,
                    from: todayInLuanda(),
                    until: yearEndsOn!,
                  }),
                  "text/calendar;charset=utf-8",
                )
              }
            >
              <CalendarPlus className="size-3.5" aria-hidden /> Calendário (.ics)
            </Button>
          </div>
        </TabsContent>

        {canManage && onApplyProposal ? (
          <TabsContent value="proposta" className="pt-3">
            <ProposalPanel
              slots={slots}
              group={selectedGroup}
              subjects={subjects}
              classSubjects={classSubjects}
              teachers={teachers}
              rooms={rooms}
              onApply={onApplyProposal}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  );
}

function FreeRoomsFinder({
  slots,
  rooms,
  windows,
  minCapacity,
}: {
  slots: ScheduleSlot[];
  rooms: ScheduleRoom[];
  windows: Array<{ startsAt: string; endsAt: string }>;
  minCapacity: number;
}) {
  const [weekday, setWeekday] = useState(1);
  const [windowKey, setWindowKey] = useState("");
  const chosen = windows.find((w) => `${w.startsAt}-${w.endsAt}` === windowKey) ?? windows[0];
  const free = chosen
    ? freeRooms({
        slots,
        rooms,
        weekday,
        startsAt: chosen.startsAt,
        endsAt: chosen.endsAt,
        minCapacity,
      })
    : [];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Salas livres</p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Dia"
          className={selectClass}
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6].map((day) => (
            <option key={day} value={day}>
              {WEEKDAYS[day]}
            </option>
          ))}
        </select>
        <select
          aria-label="Tempo"
          className={selectClass}
          value={chosen ? `${chosen.startsAt}-${chosen.endsAt}` : ""}
          onChange={(e) => setWindowKey(e.target.value)}
          disabled={windows.length === 0}
        >
          {windows.map((w) => (
            <option key={`${w.startsAt}-${w.endsAt}`} value={`${w.startsAt}-${w.endsAt}`}>
              {w.startsAt}–{w.endsAt}
            </option>
          ))}
        </select>
      </div>
      {!chosen ? (
        <p className="text-xs text-muted-foreground">Ainda não há tempos no horário.</p>
      ) : free.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todas as salas estão ocupadas neste tempo.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Salas livres neste tempo">
          {free.map((room) => (
            <li
              key={room.id}
              className={`rounded-full border px-2.5 py-1 text-xs ${room.fits ? "border-success/40 bg-success/8 text-foreground" : "border-border text-muted-foreground"}`}
              title={
                room.fits
                  ? undefined
                  : `Lotação ${room.capacity ?? "?"}: não cabe a turma (${minCapacity})`
              }
            >
              {room.name}
              {room.capacity ? ` · ${room.capacity}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubstituteFinder({
  slots,
  teachers,
  candidates,
}: {
  slots: ScheduleSlot[];
  teachers: ScheduleTeacher[];
  candidates: ScheduleSlot[];
}) {
  const lessons = useMemo(
    () =>
      [...candidates]
        .filter((slot) => slot.teacher_id)
        .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at)),
    [candidates],
  );
  const [slotId, setSlotId] = useState("");
  const target = lessons.find((slot) => slot.id === slotId) ?? lessons[0];
  const ranked = target ? substituteCandidates({ slots, teachers, target }).slice(0, 8) : [];
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden /> Substituir um
        professor
      </p>
      {!target ? (
        <p className="text-xs text-muted-foreground">Não há aulas com professor nesta vista.</p>
      ) : (
        <>
          <select
            aria-label="Aula a cobrir"
            className={`${selectClass} max-w-full`}
            value={target.id}
            onChange={(e) => setSlotId(e.target.value)}
          >
            {lessons.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {WEEKDAYS[slot.weekday]} {slot.starts_at.slice(0, 5)} · {slot.subject_name} ·{" "}
                {slot.class_group_name} · {slot.teacher_name}
              </option>
            ))}
          </select>
          {ranked.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum professor está livre neste tempo.
            </p>
          ) : (
            <ol className="space-y-1" aria-label="Professores livres, do mais indicado">
              {ranked.map((candidate) => (
                <li
                  key={candidate.teacherId}
                  className="flex flex-wrap items-center gap-1.5 text-xs"
                >
                  <span className="font-medium text-foreground">{candidate.name}</span>
                  {candidate.knowsSubject ? <Tag>conhece a disciplina</Tag> : null}
                  {candidate.knowsClass ? <Tag>conhece a turma</Tag> : null}
                  {candidate.adjacent ? <Tag>já está na escola</Tag> : null}
                  <span className="text-muted-foreground">
                    · {candidate.lessonsThatDay} {candidate.lessonsThatDay === 1 ? "aula" : "aulas"}{" "}
                    nesse dia
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-primary-soft px-2 py-px text-[11px] text-primary-strong">
      {children}
    </span>
  );
}

function ProposalPanel({
  slots,
  group,
  subjects,
  classSubjects,
  teachers,
  rooms,
  onApply,
}: {
  slots: ScheduleSlot[];
  group: ScheduleClassGroup | undefined;
  subjects: ScheduleSubject[];
  classSubjects: ScheduleClassSubject[];
  teachers: ScheduleTeacher[];
  rooms: ScheduleRoom[];
  onApply: (lessons: ScheduleSlotInput[]) => Promise<ApplyProposalResult>;
}) {
  const [applying, setApplying] = useState(false);
  const [generatedFor, setGeneratedFor] = useState<string | null>(null);
  const proposal = useMemo(
    () =>
      group && generatedFor === group.id
        ? proposeTimetable({
            classGroupId: group.id,
            shift: group.shift,
            classSubjects,
            subjects,
            teachers,
            slots,
          })
        : null,
    [group, generatedFor, classSubjects, subjects, teachers, slots],
  );
  if (!group) return <p className="text-xs text-muted-foreground">Seleccione uma turma.</p>;

  const apply = async () => {
    if (!proposal || applying) return;
    setApplying(true);
    try {
      const scheduleId =
        slots.find((slot) => slot.class_group_id === group.id)?.schedule_id ?? null;
      const result = await onApply(
        proposal.placements.map((lesson) => ({
          classGroupId: group.id,
          scheduleId,
          subjectId: lesson.subjectId,
          weekday: lesson.weekday,
          startsAt: lesson.startsAt,
          endsAt: lesson.endsAt,
          teacherId: lesson.teacherId,
          roomId: lesson.roomId,
          label: rooms.find((room) => room.id === lesson.roomId)?.name ?? "Sala",
        })),
      );
      if (result.failed.length === 0)
        toast.success(`${result.created} aulas adicionadas ao horário.`);
      else
        toast.warning(
          `${result.created} aulas adicionadas; ${result.failed.length} recusadas: ${result.failed[0]}`,
        );
      setGeneratedFor(null);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível aplicar a proposta."));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Preenche os tempos que faltam à turma {group.name} segundo a carga semanal: sem conflitos de
        turma, professor ou sala, até 2 aulas da mesma disciplina por dia e sem furos. Nada é
        gravado até aplicar; cada aula passa pelas validações do servidor.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setGeneratedFor(group.id)}
      >
        <Wand2 className="size-3.5" aria-hidden /> Gerar proposta
      </Button>
      {proposal ? (
        <div className="space-y-3">
          {proposal.placements.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Não há tempos em falta que se possam marcar automaticamente.
            </p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Aulas propostas">
              {proposal.placements.map((lesson) => (
                <li
                  key={`${lesson.weekday}-${lesson.startsAt}`}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {WEEKDAYS[lesson.weekday]} {lesson.startsAt}–{lesson.endsAt}
                  </span>
                  <span className="block font-medium text-foreground">{lesson.subjectName}</span>
                  {lesson.teacherName ? (
                    <span className="text-muted-foreground">{lesson.teacherName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {proposal.unplaced.length ? (
            <ul
              className="list-disc space-y-1 pl-5 text-xs text-warning-strong"
              aria-label="Não couberam"
            >
              {proposal.unplaced.map((item) => (
                <li key={item.subjectId}>
                  {item.subjectName} ({item.missing} em falta): {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {proposal.placements.length ? (
            <Button size="sm" onClick={() => void apply()} disabled={applying}>
              {applying ? "A aplicar…" : `Aplicar ${proposal.placements.length} aulas`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
