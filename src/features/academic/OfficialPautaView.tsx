import { AngolaEmblem } from "@/features/academic/AngolaEmblem";

export type PautaExportRow = {
  n: string;
  aluno: string;
  proc: string;
  mac: string;
  npp: string;
  npt: string;
  media: string;
  situacao: string;
};

export function AssessmentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}

export function OfficialPautaView({
  schoolName,
  academicYear,
  meta,
  rows,
}: {
  schoolName: string;
  academicYear: string;
  meta: {
    gradeName?: string;
    courseName?: string;
    className?: string;
    subjectName?: string;
    termLabel?: string;
    validationCode?: string;
  };
  rows: PautaExportRow[];
}) {
  return (
    <div
      id="siga-pauta-oficial"
      className="siga-official-paper mx-auto max-w-4xl px-8 py-10 shadow-soft print:shadow-none"
    >
      <div className="text-center">
        <AngolaEmblem className="mx-auto size-20" />
        <p className="mt-3 text-xs font-bold">República de Angola</p>
        <p className="text-xs">Ministério da Educação</p>
        <h2 className="mt-3 font-display text-2xl font-extrabold">{schoolName}</h2>
        <p className="mt-1 text-sm font-semibold">Pauta de avaliação contínua</p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
        <p>Ano Lectivo: {academicYear}</p>
        <p>Classe: {meta.gradeName ?? "—"}</p>
        <p>Curso: {meta.courseName ?? "—"}</p>
        <p>Turma: {meta.className ?? "—"}</p>
        <p>Disciplina: {meta.subjectName ?? "—"}</p>
        <p>Período: {meta.termLabel ?? "—"}</p>
      </div>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            {["Nº", "Nome do Aluno", "Proc.", "MAC", "NPP", "NPT", "Média", "Situação"].map(
              (label) => (
                <th key={label} className="siga-official-grid border px-2 py-1 text-left">
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.n}>
              <td className="siga-official-grid border px-2 py-1">{row.n}</td>
              <td className="siga-official-grid border px-2 py-1">{row.aluno}</td>
              <td className="siga-official-grid border px-2 py-1">{row.proc}</td>
              <td className="siga-official-grid border px-2 py-1 text-right">{row.mac}</td>
              <td className="siga-official-grid border px-2 py-1 text-right">{row.npp}</td>
              <td className="siga-official-grid border px-2 py-1 text-right">{row.npt}</td>
              <td className="siga-official-grid border px-2 py-1 text-right">{row.media}</td>
              <td className="siga-official-grid border px-2 py-1">{row.situacao}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {meta.validationCode ? (
        <p className="mt-4 text-right text-[11px] font-mono">Validar: {meta.validationCode}</p>
      ) : null}
      <div className="mt-10 grid grid-cols-3 gap-6 text-center text-sm">
        <p>O Professor: __________________</p>
        <p>O Coordenador: ________________</p>
        <p>A Direcção: ___________________</p>
      </div>
    </div>
  );
}
