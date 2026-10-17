import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "@/lib/toast";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { actionIcons, moduleIcons } from "@/lib/app-icons";
import { materializeTeacherLessons } from "@/features/hr/materialize-lessons";
import { createTeacherLessonQr, listTeacherQrOccurrences } from "@/features/hr/teacher-lessons";
import { schoolTodayIso } from "@/features/hr/schoolClock";

type VisibleQr = {
  occurrenceId: string;
  purpose: "check_in" | "check_out";
  expiresAt: string;
  imageUrl: string;
  label: string;
};

function addDaysIso(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function TeacherQrIssuerPanel() {
  const queryClient = useQueryClient();
  const [visibleQr, setVisibleQr] = useState<VisibleQr | null>(null);
  const lessons = useQuery({
    queryKey: ["hr", "teacher-qr-occurrences"],
    queryFn: () => listTeacherQrOccurrences(),
    retry: false,
  });

  const synchronize = useMutation({
    mutationFn: () => {
      const from = schoolTodayIso(new Date());
      return materializeTeacherLessons({ data: { from, to: addDaysIso(from, 14) } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "teacher-qr-occurrences"] });
      toast.success("Horário sincronizado", {
        description:
          result.inserted > 0
            ? `${result.inserted} ocorrência(s) docente(s) criada(s).`
            : "As próximas aulas já estavam sincronizadas.",
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível sincronizar."),
  });

  const generateQr = useMutation({
    mutationFn: async (input: {
      occurrenceId: string;
      purpose: "check_in" | "check_out";
      label: string;
    }) => {
      const result = await createTeacherLessonQr({
        data: { occurrenceId: input.occurrenceId, purpose: input.purpose },
      });
      const imageUrl = await QRCode.toDataURL(result.token, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
      });
      return { ...result, occurrenceId: input.occurrenceId, imageUrl, label: input.label };
    },
    onSuccess: (result) => setVisibleQr(result),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR."),
  });

  const QrIcon = moduleIcons.qrPresence;
  const RefreshIcon = actionIcons.refresh;
  const rows = lessons.data ?? [];

  return (
    <Panel
      title="Presença docente por QR"
      description="Sincronize as aulas publicadas e mostre o QR apenas na sala. O professor atribuído faz a leitura no seu portal; entrada e saída usam desafios distintos."
      action={
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={synchronize.isPending}
          onClick={() => synchronize.mutate()}
        >
          <RefreshIcon className="size-3.5" />
          {synchronize.isPending ? "A sincronizar…" : "Sincronizar 14 dias"}
        </Button>
      }
    >
      {lessons.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar aulas publicadas…</p>
      ) : lessons.isError ? (
        <p className="text-sm text-destructive">
          {lessons.error instanceof Error
            ? lessons.error.message
            : "Não foi possível carregar as aulas."}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={QrIcon}
          title="Sem ocorrências docentes sincronizadas"
          description="Confirme o horário publicado, a atribuição do professor, o vínculo RH e o contrato activo; depois sincronize os próximos 14 dias."
          compact
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Aula</th>
                <th className="py-3 pr-4 font-medium">Professor</th>
                <th className="py-3 pr-4 font-medium">Data e hora</th>
                <th className="py-3 pr-4 font-medium">Estado</th>
                <th className="py-3 text-right font-medium">QR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lesson) => {
                const checkedIn = Boolean(lesson.actualStartedAt);
                const checkedOut = Boolean(lesson.actualEndedAt);
                const disabled = ["confirmed", "rejected", "cancelled"].includes(lesson.status);
                const purpose = checkedIn ? "check_out" : "check_in";
                const label = `${lesson.classGroupName} · ${lesson.subjectName} · ${lesson.teacherName}`;
                return (
                  <tr key={lesson.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{lesson.classGroupName}</p>
                      <p className="text-xs text-muted-foreground">{lesson.subjectName}</p>
                    </td>
                    <td className="py-3 pr-4">{lesson.teacherName}</td>
                    <td className="py-3 pr-4">
                      {lesson.lessonDate} · {lesson.startsAt.slice(0, 5)}–
                      {lesson.endsAt.slice(0, 5)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        status={checkedOut ? "paid" : checkedIn ? "pending" : "inactive"}
                        label={
                          checkedOut ? "Concluída" : checkedIn ? "Em curso" : "Aguardando entrada"
                        }
                      />
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled || generateQr.isPending}
                        onClick={() =>
                          generateQr.mutate({ occurrenceId: lesson.id, purpose, label })
                        }
                      >
                        <QrIcon className="mr-2 size-4" />
                        {checkedIn ? "QR saída" : "QR entrada"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibleQr ? (
        <div className="mt-6 grid gap-5 rounded-xl border bg-muted/20 p-5 md:grid-cols-[220px_1fr] md:items-center">
          <div
            role="img"
            aria-label={`QR temporário de ${visibleQr.purpose === "check_in" ? "entrada" : "saída"}`}
            className="mx-auto size-[220px] rounded-lg bg-background bg-contain bg-center bg-no-repeat p-2"
            style={{ backgroundImage: `url(${visibleQr.imageUrl})` }}
          />
          <div className="space-y-2">
            <p className="font-semibold">
              {visibleQr.purpose === "check_in" ? "Entrada" : "Saída"} · {visibleQr.label}
            </p>
            <p className="text-sm text-muted-foreground">
              Expira em cinco minutos, aceita apenas o professor atribuído e deixa de funcionar
              depois do primeiro uso. Não envie fotografia nem o código por mensagem.
            </p>
            <p className="text-sm">
              Validade: <strong>{new Date(visibleQr.expiresAt).toLocaleString("pt-AO")}</strong>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setVisibleQr(null)}>
              Fechar QR
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
