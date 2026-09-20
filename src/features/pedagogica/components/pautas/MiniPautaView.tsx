import { useState } from "react";
import type { MiniPautaDocument, MiniPautaStudent, TrimesterRecord } from "./types";
import {
  calculateFinalDisciplineAverage,
  calculateTrimesterAverage,
  deriveElectronicStatusClass,
  formatGrade,
} from "./assessment";
import {
  getPeriodsForCycle,
  getPeriodCountForCycle,
  getPeriodLabelUpper,
  getPeriodNoun,
} from "@/lib/angola-academic";
import { DocumentHeader } from "./DocumentHeader";
import { GradeAuditModal } from "./GradeAuditModal";

function periodRecord(student: MiniPautaStudent, period: number): TrimesterRecord {
  return period === 1 ? student.t1 : period === 2 ? student.t2 : student.t3;
}

function resolved(student: MiniPautaStudent, periodCount: 2 | 3) {
  const mt1 = student.t1.mt ?? calculateTrimesterAverage(student.t1.mact, student.t1.npt);
  const mt2 = student.t2.mt ?? calculateTrimesterAverage(student.t2.mact, student.t2.npt);
  const mt3 = student.t3.mt ?? calculateTrimesterAverage(student.t3.mact, student.t3.npt);
  const mfd = student.mfd ?? calculateFinalDisciplineAverage(mt1, mt2, mt3, periodCount);
  return { 1: mt1, 2: mt2, 3: mt3, mfd } as Record<number, number | null> & { mfd: number | null };
}

export function MiniPautaView({ data }: { data: MiniPautaDocument }) {
  const periods = getPeriodsForCycle(data.context.cycle, data.context.periodCount);
  const periodCount = getPeriodCountForCycle(data.context.cycle, data.context.periodCount);
  const periodNoun = getPeriodNoun(data.context.cycle);
  const colCount = periods.length * 4;
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditState, setAuditState] = useState<{
    studentName?: string | undefined;
    term?: number | undefined;
    mac?: number | null | undefined;
    npp?: number | null | undefined;
    npt?: number | null | undefined;
  }>({});

  const handleOpenAudit = (
    studentName: string,
    term: number,
    mac?: number | null,
    npp?: number | null,
    npt?: number | null,
  ) => {
    setAuditState({ studentName, term, mac, npp, npt });
    setAuditOpen(true);
  };

  return (
    <div className="siga-pauta-sheet bg-background text-foreground p-4 md:p-6 rounded-xl border border-border shadow-xs overflow-x-auto print:p-0 print:border-none print:shadow-none">
      <DocumentHeader
        school={data.school}
        context={data.context}
        subject={data.subject}
        title="MINI-PAUTA"
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-center text-xs border-collapse border border-border">
          <thead>
            <tr className="bg-muted/50 print:bg-muted/10">
              <th rowSpan={3} className="border border-border p-1.5 font-bold">
                N.º
              </th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold">
                Código
              </th>
              <th
                rowSpan={3}
                className="border border-border p-1.5 font-bold text-left min-w-[160px]"
              >
                Nome Completo
              </th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold">
                Gén.
              </th>
              {periods.map((p) => (
                <th key={p} colSpan={4} className="border border-border p-1.5 font-bold">
                  {getPeriodLabelUpper(data.context.cycle, p)}
                </th>
              ))}
              <th rowSpan={3} className="border border-border p-1.5 font-bold">
                MFD
              </th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold">
                Resultado
              </th>
              <th
                rowSpan={3}
                className="border border-border p-1.5 font-bold text-left min-w-[130px]"
              >
                Observação
              </th>
            </tr>
            <tr className="bg-muted/30 print:bg-muted/5">
              {periods.flatMap((t) => [
                <th key={`${t}-mact`} className="border border-border p-1 font-semibold">
                  MACT
                </th>,
                <th key={`${t}-npp`} className="border border-border p-1 font-semibold">
                  NPP*
                </th>,
                <th key={`${t}-npt`} className="border border-border p-1 font-semibold">
                  NPT
                </th>,
                <th key={`${t}-mt`} className="border border-border p-1 font-bold bg-muted/60">
                  MT{t}
                </th>,
              ])}
            </tr>
            <tr className="bg-muted/10 print:bg-transparent">
              <th
                colSpan={colCount}
                className="border border-border p-1 text-[10px] font-normal text-left text-muted-foreground"
              >
                Perfil 424/25: MT = (MACT + NPT) ÷ 2. NPP* mantido apenas como campo compatível com
                modelos escolares anteriores. Clique em qualquer MT para inspecionar a auditoria da
                nota.
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => {
              const r = resolved(s, periodCount);
              return (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="border border-border p-1">{s.number}</td>
                  <td className="border border-border p-1 font-mono text-[11px]">{s.code}</td>
                  <td className="border border-border p-1 text-left font-medium">{s.name}</td>
                  <td className="border border-border p-1">{s.gender}</td>
                  {periods.flatMap((p) => {
                    const rec = periodRecord(s, p);
                    return [
                      <td key={`${p}-mact`} className="border border-border p-1">
                        {formatGrade(rec.mact)}
                      </td>,
                      <td
                        key={`${p}-npp`}
                        className="border border-border p-1 text-muted-foreground"
                      >
                        {formatGrade(rec.npp)}
                      </td>,
                      <td key={`${p}-npt`} className="border border-border p-1">
                        {formatGrade(rec.npt)}
                      </td>,
                      <td
                        key={`${p}-mt`}
                        className="border border-border p-1 font-semibold bg-muted/20 cursor-pointer hover:bg-primary/20 underline decoration-dotted"
                        onClick={() => handleOpenAudit(s.name, p, rec.mact, rec.npp, rec.npt)}
                        title="Clique para auditar origem da nota"
                      >
                        {formatGrade(r[p])}
                      </td>,
                    ];
                  })}
                  <td className="border border-border p-1 font-bold bg-muted/40">
                    {formatGrade(r.mfd)}
                  </td>
                  <td
                    className={`border border-border p-1 font-bold ${deriveElectronicStatusClass(s.status)}`}
                  >
                    {s.status}
                  </td>
                  <td className="border border-border p-1 text-left text-[11px]">
                    {s.observation}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        <b>Legenda:</b> MACT — Média das Avaliações Contínuas do {periodNoun}; NPT — Nota da Prova{" "}
        {periodNoun === "Semestre" ? "Semestral" : "Trimestral"}; MT — Média do {periodNoun}; MFD —
        Média Final da Disciplina.
      </div>

      <div className="mt-8 grid grid-cols-3 gap-6 text-center text-xs">
        <div>
          <span className="block font-semibold">O(A) Professor(a)</span>
          <div className="mt-6 border-b border-foreground/40 w-3/4 mx-auto" />
        </div>
        <div>
          <span className="block font-semibold">O(A) Subdirector(a) Pedagógico(a)</span>
          <div className="mt-6 border-b border-foreground/40 w-3/4 mx-auto" />
        </div>
        <div>
          <span className="block font-semibold">O(A) Director(a) da Escola</span>
          <div className="mt-6 border-b border-foreground/40 w-3/4 mx-auto" />
        </div>
      </div>

      <GradeAuditModal
        open={auditOpen}
        onOpenChange={setAuditOpen}
        studentName={auditState.studentName}
        subjectName={data.subject}
        term={auditState.term}
        mac={auditState.mac}
        npp={auditState.npp}
        npt={auditState.npt}
        teacherName={data.context.teacher}
        periodNoun={periodNoun}
      />
    </div>
  );
}
