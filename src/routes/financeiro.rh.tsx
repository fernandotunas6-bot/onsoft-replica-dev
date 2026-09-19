import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Banknote, BriefcaseBusiness, FileCheck2, QrCode, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getHrDashboard, listHrPayrollRuns } from "@/features/hr/server";
import {
  createTeacherLessonQr,
  listHrTeacherLessonOccurrences,
} from "@/features/hr/teacher-lessons";
import { kwanza } from "@/lib/currency";

export const Route = createFileRoute("/financeiro/rh")({
  head: () => ({
    meta: [
      { title: "RH e Folha Salarial · SIGA" },
      {
        name: "description",
        content:
          "Recursos Humanos, contratos, remuneração de funcionários e professores e folhas salariais da escola.",
      },
    ],
  }),
  component: HrPayrollPage,
});

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type VisibleQr = {
  occurrenceId: string;
  purpose: "check_in" | "check_out";
  expiresAt: string;
  imageUrl: string;
};

function HrPayrollPage() {
  const [visibleQr, setVisibleQr] = useState<VisibleQr | null>(null);
  const dashboard = useQuery({
    queryKey: ["hr", "dashboard"],
    queryFn: () => getHrDashboard(),
    retry: false,
  });
  const payrolls = useQuery({
    queryKey: ["hr", "payroll-runs"],
    queryFn: () => listHrPayrollRuns(),
    retry: false,
  });
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

  const data = dashboard.data;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças"
          title="RH e Folha Salarial"
          description="Vínculos funcionais, contratos, salários mensais, pagamento por hora/aula e processamento da folha salarial — integrado à identidade única de Pessoas."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/financeiro/rh/folha">Processar folha</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh/presenca">Validação de presença</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh/faltas">Faltas e assiduidade</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro">Voltar às Finanças</Link>
              </Button>
            </div>
          }
        />

        {dashboard.isError ? (
          <Panel title="Acesso ao RH">
            <p className="text-sm text-destructive">
              {dashboard.error instanceof Error
                ? dashboard.error.message
                : "Não foi possível carregar o módulo de RH."}
            </p>
          </Panel>
        ) : data && !data.ready ? (
          <Panel title="Fundação do RH pronta para migração">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                A interface está instalada, mas as tabelas de RH ainda não foram encontradas no
                banco de dados desta escola.
              </p>
              <p>
                Aplique as migrations de RH antes de cadastrar vínculos, validar aulas ou processar
                folhas.
              </p>
            </div>
          </Panel>
        ) : (
          <>
            <StatGrid
              items={[
                {
                  label: "Funcionários activos",
                  value: String(data?.employeeCount ?? 0),
                  hint: "Vínculos funcionais activos",
                  icon: Users,
                },
                {
                  label: "Contratos activos",
                  value: String(data?.activeContractCount ?? 0),
                  hint: "Mensal, hora ou hora/aula",
                  icon: BriefcaseBusiness,
                },
                {
                  label: "Folhas em preparação",
                  value: String(data?.payrollDraftCount ?? 0),
                  hint: "Rascunho, cálculo ou revisão",
                  icon: FileCheck2,
                },
                {
                  label: "Último líquido",
                  value: data?.latestPayroll ? kwanza(data.latestPayroll.total_net_kz) : "—",
                  hint: data?.latestPayroll
                    ? `${monthNames[data.latestPayroll.competence_month - 1]} ${data.latestPayroll.competence_year}`
                    : "Nenhuma folha processada",
                  icon: Banknote,
                },
              ]}
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
                      Este desafio expira em até 5 minutos e o primeiro uso válido torna-o
                      inutilizável.
                    </p>
                    <p className="text-sm">
                      Validade:{" "}
                      <strong>{new Date(visibleQr.expiresAt).toLocaleString("pt-AO")}</strong>
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setVisibleQr(null)}>
                      Fechar QR
                    </Button>
                  </div>
                </div>
              ) : null}
            </Panel>

            <Panel
              title="Folhas salariais"
              description="Histórico das últimas 36 competências. Os totais permanecem separados do caixa até a etapa de integração financeira/aprovação."
            >
              {payrolls.isLoading ? (
                <p className="text-sm text-muted-foreground">A carregar folhas salariais…</p>
              ) : payrolls.isError ? (
                <p className="text-sm text-destructive">
                  Não foi possível carregar as folhas salariais.
                </p>
              ) : (payrolls.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="font-medium">Ainda não existem folhas salariais.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Crie e processe a competência no espaço operacional da folha salarial.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-3 pr-4 font-medium">Competência</th>
                        <th className="py-3 pr-4 font-medium">Estado</th>
                        <th className="py-3 pr-4 text-right font-medium">Bruto</th>
                        <th className="py-3 pr-4 text-right font-medium">Descontos</th>
                        <th className="py-3 text-right font-medium">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payrolls.data ?? []).map((run) => (
                        <tr key={String(run.id)} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">
                            {monthNames[Number(run.competence_month) - 1]}{" "}
                            {String(run.competence_year)}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge
                              status={
                                run.status === "paid" || run.status === "approved"
                                  ? "paid"
                                  : run.status === "processed"
                                    ? "pending"
                                    : run.status === "draft"
                                      ? "inactive"
                                      : "cancelled"
                              }
                              label={
                                run.status === "draft"
                                  ? "Rascunho"
                                  : run.status === "processed"
                                    ? "Processada"
                                    : run.status === "approved"
                                      ? "Aprovada"
                                      : run.status === "paid"
                                        ? "Paga"
                                        : String(run.status)
                              }
                            />
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {kwanza(Number(run.total_gross_kz ?? 0))}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {kwanza(Number(run.total_deductions_kz ?? 0))}
                          </td>
                          <td className="py-3 text-right font-semibold">
                            {kwanza(Number(run.total_net_kz ?? 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Cadastro funcional">
                <p className="text-sm text-muted-foreground">
                  Usa Pessoas como identidade única e adiciona vínculo, departamento, cargo e número
                  funcional sem duplicar professores ou funcionários.
                </p>
              </Panel>
              <Panel title="Professor por hora/aula">
                <p className="text-sm text-muted-foreground">
                  Horário, ocorrência real, check-in e check-out QR ficam separados. Só a aula
                  confirmada produz evento remunerável.
                </p>
              </Panel>
              <Panel title="Folha auditável">
                <p className="text-sm text-muted-foreground">
                  Cada cálculo preserva contrato, período, componentes e eventos remuneráveis.
                  Descontos legais serão configurados de forma versionada antes da produção.
                </p>
              </Panel>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
