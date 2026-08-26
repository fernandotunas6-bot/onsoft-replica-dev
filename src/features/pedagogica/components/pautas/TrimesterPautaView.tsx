import { useState } from "react";
import type { TrimesterPautaDocument } from "./types";
import { deriveElectronicStatusClass, formatGrade } from "./assessment";
import { getPeriodNoun } from "@/lib/angola-academic";
import { DocumentHeader } from "./DocumentHeader";
import { GradeAuditModal } from "./GradeAuditModal";

export function TrimesterPautaView({ data }: { data: TrimesterPautaDocument }) {
  const periodNoun = getPeriodNoun(data.context.cycle);
  const termLabel = `${data.context.term || 1}.º ${periodNoun.toUpperCase()}`;
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditState, setAuditState] = useState<{
    studentName?: string | undefined;
    subjectName?: string | undefined;
    mt?: number | null | undefined;
  }>({});

  const handleOpenAudit = (studentName: string, subjectName: string, mt?: number | null) => {
    setAuditState({ studentName, subjectName, mt });
    setAuditOpen(true);
  };

  return (
    <div className="bg-background text-foreground p-4 md:p-6 rounded-xl border border-border shadow-xs overflow-x-auto print:p-0 print:border-none print:shadow-none print:bg-white print:text-black">
      <DocumentHeader
        school={data.school}
        context={data.context}
        title={`PAUTA GERAL DE ${periodNoun.toUpperCase()} — ${termLabel}`}
      />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-center text-xs border-collapse border border-border print:border-black">
          <thead>
            <tr className="bg-muted/50 print:bg-gray-100">
              <th className="border border-border p-2 font-bold print:border-black">N.º</th>
              <th className="border border-border p-2 font-bold print:border-black">Código</th>
              <th className="border border-border p-2 font-bold text-left min-w-[170px] print:border-black">
                Nome Completo
              </th>
              <th className="border border-border p-2 font-bold print:border-black">Gén.</th>
              {data.subjects.map((sub) => (
                <th
                  key={sub.id}
                  className="border border-border p-2 font-bold min-w-[85px] print:border-black"
                >
                  {sub.shortName ?? sub.name}
                </th>
              ))}
              <th className="border border-border p-2 font-bold bg-muted/60 print:border-black">
                {periodNoun === "Semestre" ? "Média Sem." : "Média Trim."}
              </th>
              <th className="border border-border p-2 font-bold print:border-black">Resultado</th>
              <th className="border border-border p-2 font-bold text-left min-w-[130px] print:border-black">
                Observação
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                <td className="border border-border p-1.5 print:border-black">{student.number}</td>
                <td className="border border-border p-1.5 font-mono text-[11px] print:border-black">
                  {student.code}
                </td>
                <td className="border border-border p-1.5 text-left font-medium print:border-black">
                  {student.name}
                </td>
                <td className="border border-border p-1.5 print:border-black">{student.gender}</td>
                {data.subjects.map((sub) => {
                  const grade = student.subjectGrades[sub.id];
                  const isFail = grade !== null && grade !== undefined && grade < 10;
                  return (
                    <td
                      key={sub.id}
                      className={`border border-border p-1.5 print:border-black cursor-pointer hover:bg-primary/20 underline decoration-dotted ${
                        isFail ? "text-destructive font-bold" : ""
                      }`}
                      onClick={() => handleOpenAudit(student.name, sub.name, grade)}
                      title="Clique para auditar a nota desta disciplina"
                    >
                      {formatGrade(grade)}
                    </td>
                  );
                })}
                <td className="border border-border p-1.5 font-bold bg-muted/30 print:border-black">
                  {formatGrade(student.average)}
                </td>
                <td
                  className={`border border-border p-1.5 font-bold print:border-black ${deriveElectronicStatusClass(student.status)}`}
                >
                  {student.status}
                </td>
                <td className="border border-border p-1.5 text-left text-[11px] print:border-black">
                  {student.observation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        <b>Nota explicativa:</b> Pauta de avaliação{" "}
        {periodNoun === "Semestre" ? "semestral" : "trimestral"} da turma. Apresenta a Média do{" "}
        {periodNoun} (MT) em cada disciplina do plano curricular. Clique sobre a nota de qualquer
        disciplina para auditar a sua origem.
      </div>

      <div className="mt-8 grid grid-cols-3 gap-6 text-center text-xs">
        <div>
          <span className="block font-semibold">O(A) Coordenador(a) da Turma</span>
          <div className="mt-8 border-b border-foreground/40 w-3/4 mx-auto" />
        </div>
        <div>
          <span className="block font-semibold">O(A) Subdirector(a) Pedagógico(a)</span>
          <div className="mt-8 border-b border-foreground/40 w-3/4 mx-auto" />
        </div>
        <div>
          <span className="block font-semibold">O(A) Director(a) da Escola</span>
          <div className="mt-8 border-b border-foreground/40 w-3/4 mx-auto" />
        </div>
      </div>

      <GradeAuditModal
        open={auditOpen}
        onOpenChange={setAuditOpen}
        studentName={auditState.studentName}
        subjectName={auditState.subjectName}
        term={data.context.term || 1}
        mac={auditState.mt}
        npt={auditState.mt}
        periodNoun={periodNoun}
      />
    </div>
  );
}
