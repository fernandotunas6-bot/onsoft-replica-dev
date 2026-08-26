import type { MiniPautaDocument, MiniPautaStudent } from "../types";
import {
  calculateFinalDisciplineAverage,
  calculateTrimesterAverage,
  deriveElectronicStatusClass,
  formatGrade,
} from "../lib/assessment";
import { DocumentHeader } from "./DocumentHeader";

function resolved(student: MiniPautaStudent) {
  const mt1 = student.t1.mt ?? calculateTrimesterAverage(student.t1.mact, student.t1.npt);
  const mt2 = student.t2.mt ?? calculateTrimesterAverage(student.t2.mact, student.t2.npt);
  const mt3 = student.t3.mt ?? calculateTrimesterAverage(student.t3.mact, student.t3.npt);
  const mfd = student.mfd ?? calculateFinalDisciplineAverage(mt1, mt2, mt3);
  return { mt1, mt2, mt3, mfd };
}

export function MiniPauta({ data }: { data: MiniPautaDocument }) {
  return (
    <section className="sheet sheet-mini">
      <DocumentHeader
        school={data.school}
        context={data.context}
        subject={data.subject}
        title="MINI-PAUTA"
      />
      <div className="table-wrap">
        <table className="grade-table mini-table">
          <thead>
            <tr>
              <th rowSpan={3}>N.º</th>
              <th rowSpan={3}>Código</th>
              <th rowSpan={3}>Nome Completo</th>
              <th rowSpan={3}>Gén.</th>
              <th colSpan={4}>I TRIMESTRE</th>
              <th colSpan={4}>II TRIMESTRE</th>
              <th colSpan={4}>III TRIMESTRE</th>
              <th rowSpan={3}>MFD</th>
              <th rowSpan={3}>Resultado</th>
              <th rowSpan={3}>Observação</th>
            </tr>
            <tr>
              {[1, 2, 3].flatMap((t) => [
                <th key={`${t}-mact`}>MACT</th>,
                <th key={`${t}-npp`}>NPP*</th>,
                <th key={`${t}-npt`}>NPT</th>,
                <th key={`${t}-mt`}>MT{t}</th>,
              ])}
            </tr>
            <tr>
              <th colSpan={12} className="formula-note">
                Perfil 424/25: MT = (MACT + NPT) ÷ 2. NPP* mantido apenas como campo compatível com
                modelos escolares anteriores.
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => {
              const r = resolved(s);
              return (
                <tr key={s.id}>
                  <td>{s.number}</td>
                  <td>{s.code}</td>
                  <td className="name-cell">{s.name}</td>
                  <td>{s.gender}</td>
                  <td>{formatGrade(s.t1.mact)}</td>
                  <td>{formatGrade(s.t1.npp)}</td>
                  <td>{formatGrade(s.t1.npt)}</td>
                  <td className="computed">{formatGrade(r.mt1)}</td>
                  <td>{formatGrade(s.t2.mact)}</td>
                  <td>{formatGrade(s.t2.npp)}</td>
                  <td>{formatGrade(s.t2.npt)}</td>
                  <td className="computed">{formatGrade(r.mt2)}</td>
                  <td>{formatGrade(s.t3.mact)}</td>
                  <td>{formatGrade(s.t3.npp)}</td>
                  <td>{formatGrade(s.t3.npt)}</td>
                  <td className="computed">{formatGrade(r.mt3)}</td>
                  <td className="computed strong">{formatGrade(r.mfd)}</td>
                  <td className={`strong ${deriveElectronicStatusClass(s.status)}`}>{s.status}</td>
                  <td className="obs-cell">{s.observation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <b>Legenda:</b> MACT — Média das Avaliações Contínuas do Trimestre; NPT — Nota da Prova
        Trimestral; MT — Média do Trimestre; MFD — Média Final da Disciplina.
      </div>
      <div className="signatures three">
        <div>
          O(A) Professor(a)
          <span />
        </div>
        <div>
          O(A) Subdirector(a) Pedagógico(a)
          <span />
        </div>
        <div>
          O(A) Director(a) da Escola
          <span />
        </div>
      </div>
    </section>
  );
}
