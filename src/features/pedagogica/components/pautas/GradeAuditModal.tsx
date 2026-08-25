import { FormModal } from "@/components/ui/modal-system";
import { Badge } from "@/components/ui/badge";
import { Calculator, Calendar, UserCheck, ShieldCheck, CheckCircle2 } from "lucide-react";
import { calculateTrimesterAverage } from "./assessment";

interface GradeAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName?: string;
  subjectName?: string;
  term?: number;
  mac?: number | null;
  npp?: number | null;
  npt?: number | null;
  teacherName?: string;
  updatedAt?: string;
}

export function GradeAuditModal({
  open,
  onOpenChange,
  studentName = "Aluno",
  subjectName = "Disciplina",
  term = 1,
  mac = null,
  npp = null,
  npt = null,
  teacherName = "Docente Responsável",
  updatedAt,
}: GradeAuditModalProps) {
  const mt = calculateTrimesterAverage(mac, npt, npp);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Origem da Nota — ${subjectName}`}
      subtitle={`Auditoria pedagógica de notas de ${studentName} no ${term}.º Trimestre`}
      submitLabel="Fechar"
      onSubmit={() => onOpenChange(false)}
    >
      <div className="space-y-4 py-2 text-xs">
        {/* Card de Resumo */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
          <div>
            <span className="block text-muted-foreground font-medium">Média do Trimestre (MT)</span>
            <span className="text-xl font-extrabold text-foreground">{mt !== null ? mt : "—"}</span>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Calculator className="size-3.5" /> MT = (MACT + NPT) ÷ 2
            </span>
          </div>
        </div>

        {/* Detalhe dos Lançamentos */}
        <div className="space-y-2">
          <p className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Componentes de Avaliação</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-md border border-border bg-card">
              <span className="block text-[10px] text-muted-foreground font-medium">MACT</span>
              <span className="text-sm font-bold text-foreground">{mac !== null ? mac : "—"}</span>
              <span className="block text-[9px] text-muted-foreground mt-0.5">Avaliação Contínua</span>
            </div>

            <div className="p-2.5 rounded-md border border-border bg-card">
              <span className="block text-[10px] text-muted-foreground font-medium">NPP*</span>
              <span className="text-sm font-bold text-muted-foreground">{npp !== null ? npp : "—"}</span>
              <span className="block text-[9px] text-muted-foreground mt-0.5">Prova do Professor</span>
            </div>

            <div className="p-2.5 rounded-md border border-border bg-card">
              <span className="block text-[10px] text-muted-foreground font-medium">NPT</span>
              <span className="text-sm font-bold text-foreground">{npt !== null ? npt : "—"}</span>
              <span className="block text-[9px] text-muted-foreground mt-0.5">Prova Trimestral</span>
            </div>
          </div>
        </div>

        {/* Rastreabilidade e Auditoria */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserCheck className="size-3.5 text-primary" />
            <span>Lançado por: <b className="text-foreground">{teacherName}</b></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-3.5 text-primary" />
            <span>Última atualização: <b className="text-foreground">{updatedAt || "Data oficial da sessão"}</b></span>
          </div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-3.5" />
            <span>Registo auditado e assinado no SIGA SGA</span>
          </div>
        </div>
      </div>
    </FormModal>
  );
}
