import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  UserX,
  PhoneCall,
  FileText,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import {
  generateDropoutRiskReport,
  type DropoutRiskStudent,
  type RawStudentRiskInput,
} from "@/features/pedagogica/dropout-risk-predictor";

interface DropoutRiskReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawStudents?: RawStudentRiskInput[];
}

export function DropoutRiskReportModal({
  open,
  onOpenChange,
  rawStudents = [],
}: DropoutRiskReportModalProps) {
  const riskStudents: DropoutRiskStudent[] = generateDropoutRiskReport(rawStudents);

  const handleContactGuardian = async (student: DropoutRiskStudent) => {
    const text = `Alerta SIGA — Risco de desistência: ${student.studentName} (${student.className}, proc. ${student.processNumber}). Motivo: ${student.primaryRiskReason}. Pedimos que contacte a secretaria para uma reunião pedagógica urgente.`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto do alerta copiado", {
        description: "Cole na conversa de WhatsApp ou e-mail do encarregado para enviar.",
      });
    } catch {
      toast.error("Não foi possível copiar o texto", {
        description: "Copie manualmente os dados do aluno para contactar o encarregado.",
      });
    }
  };

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="xl">
      <div className="flex flex-col h-full">
        <ModalHeader
          icon={ShieldAlert}
          title="Relatório Preditivo de Risco de Desistência"
          subtitle="Identificação precoce de alunos em risco por cruzamento de faltas, notas e propinas."
          onClose={() => onOpenChange(false)}
        />
        <ModalContent>
          <div className="space-y-6">
            {/* CABEÇALHO RESUMO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 space-y-1">
                <span className="text-xs font-bold text-destructive uppercase tracking-wider">
                  Casos Críticos
                </span>
                <p className="text-2xl font-black text-foreground">
                  {riskStudents.filter((s) => s.riskLevel === "CRÍTICO").length} Alunos
                </p>
              </div>

              <div className="p-4 rounded-xl border border-warning/30 bg-warning/10 space-y-1">
                <span className="text-xs font-bold text-warning-strong uppercase tracking-wider">
                  Risco Alto / Moderado
                </span>
                <p className="text-2xl font-black text-foreground">
                  {riskStudents.filter((s) => s.riskLevel !== "CRÍTICO").length} Alunos
                </p>
              </div>

              <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">
                  Status Preditivo
                </span>
                <p className="text-2xl font-black text-foreground">
                  {riskStudents.length > 0 ? "Ativo" : "Sem Riscos"}
                </p>
              </div>
            </div>

            {/* LISTA DE ALUNOS EM RISCO */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertOctagon className="size-4 text-destructive" />
                Alunos Sinalizados Pelo Algoritmo
              </h4>

              {riskStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl space-y-2">
                  <CheckCircle2 className="size-8 mx-auto text-success" />
                  <p className="font-bold text-foreground">
                    Nenhum aluno em risco crítico identificado.
                  </p>
                  <p>
                    Os dados de assiduidade, aproveitamento pedagógico e propinas encontram-se
                    regulares.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto no-scrollbar">
                  {riskStudents.map((student) => (
                    <div
                      key={student.studentId}
                      className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                        <div>
                          <h5 className="font-extrabold text-sm text-foreground">
                            {student.studentName}
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            Proc. #{student.processNumber} · {student.className}
                          </p>
                        </div>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                            student.riskLevel === "CRÍTICO"
                              ? "bg-destructive/20 text-destructive border-destructive/40"
                              : "bg-warning/20 text-warning-strong border-warning/40"
                          }`}
                        >
                          Risco {student.riskLevel} ({student.riskScore}%)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-secondary/30">
                          <span className="text-[10px] text-muted-foreground block font-semibold">
                            Assiduidade
                          </span>
                          <span className="font-bold font-mono text-destructive">
                            {student.attendanceRate}% Presença
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-secondary/30">
                          <span className="text-[10px] text-muted-foreground block font-semibold">
                            Média Geral
                          </span>
                          <span className="font-bold font-mono text-destructive">
                            {student.averageGrade.toFixed(1)} v.
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-secondary/30">
                          <span className="text-[10px] text-muted-foreground block font-semibold">
                            Atraso Propina
                          </span>
                          <span className="font-bold font-mono text-destructive">
                            {student.tuitionOverdueDays} dias
                          </span>
                        </div>
                      </div>

                      <div className="text-xs bg-secondary/20 p-2.5 rounded-xl border border-border">
                        <span className="font-bold text-foreground">Causa Primária: </span>
                        <span className="text-muted-foreground">{student.primaryRiskReason}</span>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleContactGuardian(student)}
                          className="gap-1.5 text-xs shadow-2xs"
                        >
                          <PhoneCall className="size-3.5 text-primary" />
                          Notificar Encarregado
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalContent>
        <ModalFooter onCancel={() => onOpenChange(false)} cancelLabel="Fechar" />
      </div>
    </ModalShell>
  );
}
