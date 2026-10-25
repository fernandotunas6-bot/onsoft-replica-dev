import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createTeacherLessonQr,
  listHrTeacherLessonOccurrences,
} from "@/features/hr/teacher-lessons";

/**
 * Assiduidade docente: emissão do QR de presença por ocorrência de aula.
 *
 * O painel vivia em `/financeiro/rh`, onde quem entra espera salários e
 * folhas. A função é a mesma — ocorrência, check-in, check-out e validade do
 * desafio — e continua a alimentar o cálculo remuneratório; só deixou de ser
 * a primeira coisa visível na página da folha salarial.
 *
 * Este QR é de presença, nunca de pagamento nem de verificação documental:
 * o token é opaco, expira em minutos e o primeiro uso válido inutiliza-o.
 */
export const Route = createFileRoute("/financeiro/rh/aulas")({
  head: () => ({
    meta: [
      { title: "Assiduidade Docente · RH · SIGA" },
      {
        name: "description",
        content:
          "Ocorrências de aula e emissão do QR temporário de check-in e check-out do professor.",
      },
    ],
  }),
  component: TeacherLessonAttendancePage,
});

type VisibleQr = {
  occurrenceId: string;
  purpose: "check_in" | "check_out";
  expiresAt: string;
  imageUrl: string;
};

function TeacherLessonAttendancePage() {
  const [visibleQr, setVisibleQr] = useState<VisibleQr | null>(null);
  const lessons = useQuery({
    queryKey: ["hr", "teacher-lessons"],
    queryFn: () => listHrTeacherLessonOccurrences(),
    retry: false,
  });
  const generateQr = useMutation({
    mutationFn: async (input: { occurrenceId: string; purpose: "check_in" | "check_out" }) => {
      const result = await createTeacherLessonQr({ data: input });
      const imageUrl = await QRCode.toDataURL(result.token, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
      });
      return { ...result, occurrenceId: input.occurrenceId, imageUrl };
    },
    onSuccess: (result) => {
      setVisibleQr({
        occurrenceId: result.occurrenceId,
        purpose: result.purpose,
        expiresAt: result.expiresAt,
        imageUrl: result.imageUrl,
      });
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Assiduidade Docente"
          description="Ocorrências de aula e emissão do QR temporário de presença do professor. Só a aula confirmada produz evento remunerável na folha salarial."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/financeiro/rh/presenca">Validação de presença</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh">Voltar ao RH</Link>
              </Button>
            </div>
          }
        />

        <Panel
          title="Presença docente por QR"
          description="Cada QR é temporário, pertence a uma aula concreta e só pode ser usado pelo professor atribuído. Check-in inicia a presença; check-out encerra e valida a ocorrência conforme o modelo remuneratório do contrato."
        >
          {lessons.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar ocorrências de aulas…</p>
          ) : lessons.isError ? (
            <p className="text-sm text-destructive">
              {lessons.error instanceof Error
                ? lessons.error.message
                : "Não foi possível carregar as ocorrências de aulas."}
            </p>
          ) : (lessons.data ?? []).length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="Ainda não existem ocorrências de aula"
              description="As ocorrências são materializadas a partir do horário antes da emissão do QR de presença docente."
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Data</th>
                    <th className="py-3 pr-4 font-medium">Horário</th>
                    <th className="py-3 pr-4 font-medium">Estado</th>
                    <th className="py-3 pr-4 font-medium">Presença</th>
                    <th className="py-3 text-right font-medium">QR</th>
                  </tr>
                </thead>
                <tbody>
                  {(lessons.data ?? []).slice(0, 40).map((lesson) => {
                    const checkedIn = Boolean(lesson.actual_started_at);
                    const checkedOut = Boolean(lesson.actual_ended_at);
                    const disabled =
                      lesson.status === "confirmed" ||
                      lesson.status === "rejected" ||
                      lesson.status === "cancelled";
                    return (
                      <tr key={lesson.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{lesson.lesson_date}</td>
                        <td className="py-3 pr-4">
                          {lesson.scheduled_starts_at.slice(0, 5)}–
                          {lesson.scheduled_ends_at.slice(0, 5)}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge
                            status={
                              lesson.status === "confirmed"
                                ? "paid"
                                : lesson.status === "scheduled"
                                  ? "pending"
                                  : "cancelled"
                            }
                            label={
                              lesson.status === "confirmed"
                                ? "Confirmada"
                                : lesson.status === "scheduled"
                                  ? "Agendada"
                                  : lesson.status === "rejected"
                                    ? "Rejeitada"
                                    : "Cancelada"
                            }
                          />
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {checkedOut
                            ? "Check-in e check-out concluídos"
                            : checkedIn
                              ? "Check-in concluído"
                              : "Aguardando check-in"}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled || generateQr.isPending}
                            onClick={() =>
                              generateQr.mutate({
                                occurrenceId: lesson.id,
                                purpose: checkedIn ? "check_out" : "check_in",
                              })
                            }
                          >
                            <QrCode className="mr-2 size-4" aria-hidden="true" />
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

          {generateQr.isError ? (
            <p className="mt-4 text-sm text-destructive">
              {generateQr.error instanceof Error
                ? generateQr.error.message
                : "Não foi possível gerar o QR."}
            </p>
          ) : null}

          {visibleQr ? (
            <div className="mt-6 grid gap-5 rounded-xl border bg-muted/20 p-5 md:grid-cols-[220px_1fr] md:items-center">
              <div
                role="img"
                aria-label={`QR temporário de ${visibleQr.purpose === "check_in" ? "check-in" : "check-out"} do professor`}
                className="mx-auto size-[220px] rounded-lg bg-background bg-contain bg-center bg-no-repeat p-2"
                style={{ backgroundImage: `url(${visibleQr.imageUrl})` }}
              />
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <QrCode className="size-5" aria-hidden="true" />
                  {visibleQr.purpose === "check_in" ? "Check-in da aula" : "Check-out da aula"}
                </div>
                <p className="text-sm text-muted-foreground">
                  Este desafio expira em até 5 minutos e o primeiro uso válido torna-o inutilizável.
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
      </div>
    </AppShell>
  );
}
