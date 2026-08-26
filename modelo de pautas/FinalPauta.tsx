import type { FinalPautaDocument } from "../types";
import {
  calculateFinalDisciplineAverage,
  deriveElectronicStatusClass,
  formatGrade,
} from "../lib/assessment";
import { DocumentHeader } from "./DocumentHeader";

export function FinalPauta({ data }: { data: FinalPautaDocument }) {
  return (
    <section className="sheet sheet-final">
      <DocumentHeader
        school={data.school}
        context={data.context}
        title={`PAUTA FINAL ${data.context.pautaNumber ? `N.º ${data.context.pautaNumber}` : ""}`}
      />
      <div className="table-wrap">
        <table className="grade-table final-table">
          <thead>
            <tr>
              <th rowSpan={2}>N.º</th>
              <th rowSpan={2}>Código</th>
              <th rowSpan={2}>Nome Completo</th>
              <th rowSpan={2}>Gén.</th>
              {data.subjects.map((s) => (
                <th key={s.id} colSpan={4}>
                  {s.shortName ?? s.name}
                </th>
              ))}
              <th rowSpan={2}>Resultado</th>
              <th rowSpan={2}>Observação</th>
            </tr>
            <tr>
              {data.subjects.flatMap((s) =>
                ["MT1", "MT2", "MT3", "MFD"].map((x) => <th key={`${s.id}-${x}`}>{x}</th>),
              )}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr key={student.id}>
                <td>{student.number}</td>
                <td>{student.code}</td>
                <td className="name-cell">{student.name}</td>
                <td>{student.gender}</td>
                {data.subjects.flatMap((subject) => {
                  const r = student.subjects.find((x) => x.subjectId === subject.id);
                  const mfd = r?.mfd ?? calculateFinalDisciplineAverage(r?.mt1, r?.mt2, r?.mt3);
                  return [
                    <td key={`${student.id}-${subject.id}-1`}>{formatGrade(r?.mt1)}</td>,
                    <td key={`${student.id}-${subject.id}-2`}>{formatGrade(r?.mt2)}</td>,
                    <td key={`${student.id}-${subject.id}-3`}>{formatGrade(r?.mt3)}</td>,
                    <td key={`${student.id}-${subject.id}-f`} className="computed strong">
                      {formatGrade(mfd)}
                    </td>,
                  ];
                })}
                <td className={`strong ${deriveElectronicStatusClass(student.status)}`}>
                  {student.status}
                </td>
                <td className="obs-cell">{student.observation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <b>Fórmula base:</b> MFD = (MT1 + MT2 + MT3) ÷ 3. A situação final não é inferida pelo
        template; deve vir do motor pedagógico/conselho de notas do SIGA.
      </div>
      <div className="footer-block">
        <div className="jury">
          <b>O CORPO DE JÚRI</b>
          <span>1. _______________________________________</span>
          <span>2. _______________________________________</span>
          <span>3. _______________________________________</span>
        </div>
        <div className="signatures two">
          <div>
            O(A) Subdirector(a) Pedagógico(a)
            <span />
          </div>
          <div>
            O(A) Director(a) da Escola
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
