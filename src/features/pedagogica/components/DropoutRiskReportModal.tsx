import { useState } from "react";
import { AlertOctagon, AlertTriangle, UserX, PhoneCall, FileText, CheckCircle2, ShieldAlert } from "lucide-react";
import { PremiumModal } from "@/components/ui/premium-modal";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { generateDropoutRiskReport, type DropoutRiskStudent } from "../dropout-risk-predictor";
import { toast } from "sonner";

interface DropoutRiskReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DropoutRiskReportModal({ open, onOpenChange }: DropoutRiskReportModalProps) {
  const riskStudents: DropoutRiskStudent[] = generateDropoutRiskReport();

  const handleContactGuardian = (studentName: string) => {
    toast.success(`Contacto Iniciado`, {
      description: `Mensagem de alerta enviada ao encarregado de ${studentName}.`,
    });
  };

  return (
    <PremiumModal
      open={open}
      onOpenChange={onOpenChange}
      title="Relatório Preditivo de Risco de Desistência"
      eyebrow="AI Co-Pilot Pedagógico"
      description="Identificação precoce de alunos em risco de abandono escolar através do cruzamento de faltas, notas e mensalidades."
      icon={<ShieldAlert className="size-5 text-destructive" />}
      size="lg"
    >
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
              Taxa Prevenção AI
            </span>
            <p className="text-2xl font-black text-foreground">94.2%</p>
          </div>
        </div>

        {/* LISTA DE ALUNOS EM RISCO */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AlertOctagon className="size-4 text-destructive" />
            Alunos Sinalizados Pelo Algoritmo
          </h4>

          <div className="space-y-3 max-h-80 overflow-y-auto no-scrollbar">
            {riskStudents.map((student) => (
              <div
                key={student.studentId}
                className="p-4 rounded-2xl border border-border bg-card space-y-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <div>
                    <h5 className="font-extrabold text-sm text-foreground">{student.studentName}</h5>
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
                    <span className="text-[10px] text-muted-foreground block font-semibold">Assiduidade</span>
                    <span className="font-bold font-mono text-destructive">{student.attendanceRate}% Presença</span>
                  </div>

                  <div className="p-2 rounded-lg bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground block font-semibold">Média Geral</span>
                    <span className="font-bold font-mono text-destructive">{student.averageGrade.toFixed(1)} v.</span>
                  </div>

                  <div className="p-2 rounded-lg bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground block font-semibold">Atraso Propina</span>
                    <span className="font-bold font-mono text-destructive">{student.tuitionOverdueDays} dias</span>
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
                    onClick={() => handleContactGuardian(student.studentName)}
                    className="gap-1.5 text-xs shadow-2xs"
                  >
                    <PhoneCall className="size-3.5 text-primary" />
                    Notificar Encarregado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Concluído
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}
