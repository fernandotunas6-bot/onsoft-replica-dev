import { useState } from "react";
import type { FinalPautaDocument } from "./types";
import {
  calculateFinalDisciplineAverage,
  deriveElectronicStatusClass,
  formatGrade,
} from "./assessment";
import { getPeriodCountForCycle, getPeriodNoun } from "@/lib/angola-academic";
import { DocumentHeader } from "./DocumentHeader";
import { GradeAuditModal } from "./GradeAuditModal";

export function FinalPautaView({ data }: { data: FinalPautaDocument }) {
  const periodCount = getPeriodCountForCycle(data.context.cycle, data.context.periodCount);
  const periods = periodCount === 2 ? ([1, 2] as const) : ([1, 2, 3] as const);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditState, setAuditState] = useState<{
    studentName?: string;
    subjectName?: string;
    term?: number;
    mt?: number | null | undefined;
  }>({});

  const handleOpenAudit = (
    studentName: string,
    subjectName: string,
    term: number,
    mt?: number | null,
  ) => {
    setAuditState({ studentName, subjectName, term, mt });
    setAuditOpen(true);
  };

  return (
    <div className="siga-pauta-sheet bg-background text-foreground p-4 md:p-6 rounded-xl border border-border shadow-xs overflow-x-auto print:p-0 print:border-none print:shadow-none">
      <DocumentHeader
        school={data.school}
        context={data.context}
        title={`PAUTA FINAL ${data.context.pautaNumber ? `N.º ${data.context.pautaNumber}` : ""}`}
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-center text-xs border-collapse border border-border">
          <thead>
            <tr className="bg-muted/50 print:bg-muted/10">
              <th rowSpan={2} className="border border-border p-1.5 font-bold">
                N.º
              </th>
              <th rowSpan={2} className="border border-border p-1.5 font-bold">
                Código
              </th>
              <th
                rowSpan={2}
                className="border border-border p-1.5 font-bold text-left min-w-[160px]"
              >
                Nome Completo
              </th>
              <th rowSpan={2} className="border border-border p-1.5 font-bold">
                Gén.
              </th>
              {data.subjects.map((s) => (
                <th
                  key={s.id}
                  colSpan={periods.length + 1}
                  className="border border-border p-1.5 font-bold"
                >
                  {s.shortName ?? s.name}
                </th>
              ))}
              <th rowSpan={2} className="border border-border p-1.5 font-bold">
                Resultado
              </th>
              <th
                rowSpan={2}
                className="border border-border p-1.5 font-bold text-left min-w-[130px]"
              >
                Observação
              </th>
            </tr>
            <tr className="bg-muted/30 print:bg-muted/5">
              {data.subjects.flatMap((s) =>
                [...periods.map((p) => `MT${p}`), "MFD"].map((x) => (
                  <th
                    key={`${s.id}-${x}`}
                    className={`border border-border p-1 font-semibold ${x === "MFD" ? "bg-muted/60 font-bold" : ""}`}
                  >
                    {x}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                <td className="border border-border p-1">{student.number}</td>
                <td className="border border-border p-1 font-mono text-[11px]">{student.code}</td>
                <td className="border border-border p-1 text-left font-medium">{student.name}</td>
                <td className="border border-border p-1">{student.gender}</td>
                {data.subjects.flatMap((subject) => {
                  const r = student.subjects.find((x) => x.subjectId === subject.id);
                  const mfd =
                    r?.mfd ?? calculateFinalDisciplineAverage(r?.mt1, r?.mt2, r?.mt3, periodCount);
                  const mtByPeriod: Record<number, number | null | undefined> = {
                    1: r?.mt1,
                    2: r?.mt2,
                    3: r?.mt3,
                  };
                  return [
                    ...periods.map((p) => (
                      <td
                        key={`${student.id}-${subject.id}-${p}`}
                        className="border border-border p-1 cursor-pointer hover:bg-primary/20 underline decoration-dotted"
                        onClick={() =>
                          handleOpenAudit(student.name, subject.name, p, mtByPeriod[p])
                        }
                        title={`Clique para auditar MT${p}`}
                      >
                        {formatGrade(mtByPeriod[p])}
                      </td>
                    )),
                    <td
                      key={`${student.id}-${subject.id}-f`}
                      className="border border-border p-1 font-bold bg-muted/30"
                    >
                      {formatGrade(mfd)}
                    </td>,
                  ];
                })}
                <td
                  className={`border border-border p-1 font-bold ${deriveElectronicStatusClass(student.status)}`}
                >
                  {student.status}
                </td>
                <td className="border border-border p-1 text-left text-[11px]">
                  {student.observation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        <b>Fórmula base:</b> MFD = ({periods.map((p) => `MT${p}`).join(" + ")}) ÷ {periods.length}.
        A situação final obedece à aprovação pedagógica e deliberação do conselho de notas do SIGA.
        Clique em qualquer MT para inspecionar a auditoria da nota.
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
        <div className="space-y-2">
          <span className="block font-bold uppercase tracking-wider text-muted-foreground">
            O CORPO DE JÚRI
          </span>
          <div className="space-y-2 text-left pl-2">
            <p>1. _______________________________________</p>
            <p>2. _______________________________________</p>
            <p>3. _______________________________________</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <span className="block font-semibold">O(A) Subdirector(a) Pedagógico(a)</span>
            <div className="mt-8 border-b border-foreground/40 w-3/4 mx-auto" />
          </div>
          <div>
            <span className="block font-semibold">O(A) Director(a) da Escola</span>
            <div className="mt-8 border-b border-foreground/40 w-3/4 mx-auto" />
          </div>
        </div>
      </div>

      <GradeAuditModal
        open={auditOpen}
        onOpenChange={setAuditOpen}
        studentName={auditState.studentName}
        subjectName={auditState.subjectName}
        term={auditState.term || 1}
        mac={auditState.mt}
        npt={auditState.mt}
        periodNoun={getPeriodNoun(data.context.cycle)}
      />
    </div>
  );
}
