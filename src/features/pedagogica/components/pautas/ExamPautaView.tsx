import type { ExamPautaDocument } from "./types";
import { deriveElectronicStatusClass, formatGrade } from "./assessment";
import { DocumentHeader } from "./DocumentHeader";

export function ExamPautaView({ data }: { data: ExamPautaDocument }) {
  const isTechnical = data.isTechnical ?? false;

  return (
    <div className="bg-background text-foreground p-4 md:p-6 rounded-xl border border-border shadow-xs overflow-x-auto print:p-0 print:border-none print:shadow-none print:bg-white print:text-black">
      <DocumentHeader
        school={data.school}
        context={data.context}
        subject={data.subject}
        title={
          isTechnical
            ? "PAUTA DE AVALIAÇÃO FINAL E PROVA DE APTIDÃO PROFISSIONAL (PAP)"
            : "PAUTA DE EXAMES E RECURSO"
        }
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
              <th className="border border-border p-2 font-bold print:border-black">MFD</th>
              {isTechnical ? (
                <>
                  <th className="border border-border p-2 font-bold print:border-black">
                    PAP (Defesa)
                  </th>
                  <th className="border border-border p-2 font-bold print:border-black">Estágio</th>
                  <th className="border border-border p-2 font-bold bg-muted/60 print:border-black">
                    Média Final Curso
                  </th>
                </>
              ) : (
                <>
                  <th className="border border-border p-2 font-bold print:border-black">
                    Nota do Exame
                  </th>
                  <th className="border border-border p-2 font-bold bg-muted/60 print:border-black">
                    Nota Final (NF)
                  </th>
                </>
              )}
              <th className="border border-border p-2 font-bold print:border-black">
                Resultado Final
              </th>
              <th className="border border-border p-2 font-bold text-left min-w-[140px] print:border-black">
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
                <td className="border border-border p-1.5 print:border-black">
                  {formatGrade(student.mfd)}
                </td>
                {isTechnical ? (
                  <>
                    <td className="border border-border p-1.5 font-semibold print:border-black">
                      {formatGrade(student.papGrade)}
                    </td>
                    <td className="border border-border p-1.5 font-semibold print:border-black">
                      {formatGrade(student.internshipGrade)}
                    </td>
                    <td className="border border-border p-1.5 font-bold bg-muted/30 print:border-black">
                      {formatGrade(student.finalGrade)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border border-border p-1.5 font-semibold print:border-black">
                      {formatGrade(student.examGrade)}
                    </td>
                    <td className="border border-border p-1.5 font-bold bg-muted/30 print:border-black">
                      {formatGrade(student.finalGrade)}
                    </td>
                  </>
                )}
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
        <b>Normativa:</b>{" "}
        {isTechnical
          ? "Regulamento do Ensino Técnico-Profissional Decreto 424/25 — PAP e Estágio Curricular."
          : "Regulamento de Exames e Época de Recurso MINED."}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
        <div>
          <span className="block font-bold uppercase tracking-wider text-muted-foreground">
            JÚRI DE DEFESA / EXAME
          </span>
          <div className="mt-2 space-y-2 text-left pl-2">
            <p>1. Presidente: _______________________________________</p>
            <p>2. Vogal 1: ___________________________________________</p>
            <p>3. Arguição/Vogal 2: ___________________________________</p>
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
    </div>
  );
}
