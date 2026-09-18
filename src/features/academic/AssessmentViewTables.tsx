import { Button } from "@/components/ui/button";
import { buildClassCourseMap, buildStudentDossier } from "@/features/academic/assessment-views";
import { formatScore } from "@/lib/angola-academic";

export function ClassCourseTable({
  rows,
  onOpen,
}: {
  rows: ReturnType<typeof buildClassCourseMap>;
  onOpen: (groupId: string) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="px-3 py-2 text-left">Classe</th>
            <th className="px-3 py-2 text-left">Curso</th>
            <th className="px-3 py-2 text-left">Turma</th>
            <th className="px-3 py-2 text-right">Alunos</th>
            <th className="px-3 py-2 text-right">Média</th>
            <th className="px-3 py-2 text-right">Transitam</th>
            <th className="px-3 py-2 text-right">Pendentes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t hover:bg-muted/40"
              onClick={() => onOpen(row.id)}
            >
              <td className="px-3 py-2">{row.gradeName}</td>
              <td className="px-3 py-2">{row.courseName}</td>
              <td className="px-3 py-2 font-semibold">{row.name}</td>
              <td className="px-3 py-2 text-right">{row.alunos}</td>
              <td className="px-3 py-2 text-right">{formatScore(row.media)}</td>
              <td className="px-3 py-2 text-right">{row.transitam}</td>
              <td className="px-3 py-2 text-right">{row.pendentes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudentDossierTable({
  studentName,
  rows,
  onBack,
  onOpenSubject,
}: {
  studentName: string;
  rows: ReturnType<typeof buildStudentDossier>;
  onBack: () => void;
  onOpenSubject: (subjectId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{studentName} · todas as disciplinas e trimestres</p>
        <Button size="sm" variant="outline" onClick={onBack}>
          Voltar à grelha
        </Button>
      </div>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="px-3 py-2 text-left">Disciplina</th>
              <th className="px-3 py-2 text-right">1º T</th>
              <th className="px-3 py-2 text-right">2º T</th>
              <th className="px-3 py-2 text-right">3º T</th>
              <th className="px-3 py-2 text-right">MFA</th>
              <th className="px-3 py-2 text-right">Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.subjectId}
                className="cursor-pointer border-t hover:bg-muted/40"
                onClick={() => onOpenSubject(row.subjectId)}
              >
                <td className="px-3 py-2 font-semibold">{row.subjectName}</td>
                {row.terms.map((value, index) => (
                  <td key={index} className="px-3 py-2 text-right">
                    {formatScore(value)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold">{formatScore(row.mfa)}</td>
                <td className="px-3 py-2 text-right">{row.situacao.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
