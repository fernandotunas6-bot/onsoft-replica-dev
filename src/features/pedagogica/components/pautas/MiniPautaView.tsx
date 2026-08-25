import type { MiniPautaDocument, MiniPautaStudent } from './types';
import { calculateFinalDisciplineAverage, calculateTrimesterAverage, deriveElectronicStatusClass, formatGrade } from './assessment';
import { DocumentHeader } from './DocumentHeader';

function resolved(student: MiniPautaStudent) {
  const mt1 = student.t1.mt ?? calculateTrimesterAverage(student.t1.mact, student.t1.npt);
  const mt2 = student.t2.mt ?? calculateTrimesterAverage(student.t2.mact, student.t2.npt);
  const mt3 = student.t3.mt ?? calculateTrimesterAverage(student.t3.mact, student.t3.npt);
  const mfd = student.mfd ?? calculateFinalDisciplineAverage(mt1, mt2, mt3);
  return { mt1, mt2, mt3, mfd };
}

export function MiniPautaView({ data }: { data: MiniPautaDocument }) {
  return (
    <div className="bg-background text-foreground p-4 md:p-6 rounded-xl border border-border shadow-xs overflow-x-auto print:p-0 print:border-none print:shadow-none print:bg-white print:text-black">
      <DocumentHeader school={data.school} context={data.context} subject={data.subject} title="MINI-PAUTA" />
      
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-center text-xs border-collapse border border-border print:border-black">
          <thead>
            <tr className="bg-muted/50 print:bg-gray-100">
              <th rowSpan={3} className="border border-border p-1.5 font-bold print:border-black">N.º</th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold print:border-black">Código</th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold text-left min-w-[160px] print:border-black">Nome Completo</th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold print:border-black">Gén.</th>
              <th colSpan={4} className="border border-border p-1.5 font-bold print:border-black">I TRIMESTRE</th>
              <th colSpan={4} className="border border-border p-1.5 font-bold print:border-black">II TRIMESTRE</th>
              <th colSpan={4} className="border border-border p-1.5 font-bold print:border-black">III TRIMESTRE</th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold print:border-black">MFD</th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold print:border-black">Resultado</th>
              <th rowSpan={3} className="border border-border p-1.5 font-bold text-left min-w-[130px] print:border-black">Observação</th>
            </tr>
            <tr className="bg-muted/30 print:bg-gray-50">
              {[1, 2, 3].flatMap((t) => [
                <th key={`${t}-mact`} className="border border-border p-1 font-semibold print:border-black">MACT</th>,
                <th key={`${t}-npp`} className="border border-border p-1 font-semibold print:border-black">NPP*</th>,
                <th key={`${t}-npt`} className="border border-border p-1 font-semibold print:border-black">NPT</th>,
                <th key={`${t}-mt`} className="border border-border p-1 font-bold bg-muted/60 print:border-black">MT{t}</th>,
              ])}
            </tr>
            <tr className="bg-muted/10 print:bg-white">
              <th colSpan={12} className="border border-border p-1 text-[10px] font-normal text-left text-muted-foreground print:border-black">
                Perfil 424/25: MT = (MACT + NPT) ÷ 2. NPP* mantido apenas como campo compatível com modelos escolares anteriores.
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => {
              const r = resolved(s);
              return (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="border border-border p-1 print:border-black">{s.number}</td>
                  <td className="border border-border p-1 print:border-black font-mono text-[11px]">{s.code}</td>
                  <td className="border border-border p-1 text-left font-medium print:border-black">{s.name}</td>
                  <td className="border border-border p-1 print:border-black">{s.gender}</td>
                  <td className="border border-border p-1 print:border-black">{formatGrade(s.t1.mact)}</td>
                  <td className="border border-border p-1 text-muted-foreground print:border-black">{formatGrade(s.t1.npp)}</td>
                  <td className="border border-border p-1 print:border-black">{formatGrade(s.t1.npt)}</td>
                  <td className="border border-border p-1 font-semibold bg-muted/20 print:border-black">{formatGrade(r.mt1)}</td>
                  <td className="border border-border p-1 print:border-black">{formatGrade(s.t2.mact)}</td>
                  <td className="border border-border p-1 text-muted-foreground print:border-black">{formatGrade(s.t2.npp)}</td>
                  <td className="border border-border p-1 print:border-black">{formatGrade(s.t2.npt)}</td>
                  <td className="border border-border p-1 font-semibold bg-muted/20 print:border-black">{formatGrade(r.mt2)}</td>
                  <td className="border border-border p-1 print:border-black">{formatGrade(s.t3.mact)}</td>
                  <td className="border border-border p-1 text-muted-foreground print:border-black">{formatGrade(s.t3.npp)}</td>
                  <td className="border border-border p-1 print:border-black">{formatGrade(s.t3.npt)}</td>
                  <td className="border border-border p-1 font-semibold bg-muted/20 print:border-black">{formatGrade(r.mt3)}</td>
                  <td className="border border-border p-1 font-bold bg-muted/40 print:border-black">{formatGrade(r.mfd)}</td>
                  <td className={`border border-border p-1 font-bold print:border-black ${deriveElectronicStatusClass(s.status)}`}>{s.status}</td>
                  <td className="border border-border p-1 text-left text-[11px] print:border-black">{s.observation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">
        <b>Legenda:</b> MACT — Média das Avaliações Contínuas do Trimestre; NPT — Nota da Prova Trimestral; MT — Média do Trimestre; MFD — Média Final da Disciplina.
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
    </div>
  );
}
