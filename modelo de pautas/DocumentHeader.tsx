import type { ClassContext, SchoolIdentity } from '../types';

type Props = {
  school: SchoolIdentity;
  title: string;
  context: ClassContext;
  subject?: string;
};

export function DocumentHeader({ school, title, context, subject }: Props) {
  return (
    <header className="doc-header">
      <div className="identity">
        <strong>{school.republic ?? 'REPÚBLICA DE ANGOLA'}</strong>
        <span>{school.province}</span>
        <span>{school.municipality}</span>
        {school.educationOffice && <span>{school.educationOffice}</span>}
        <span>{school.schoolName}</span>
      </div>
      <h1>{title}</h1>
      <div className="meta-grid">
        {subject && <span><b>Disciplina:</b> {subject}</span>}
        <span><b>Professor(a):</b> {context.teacher || '________________'}</span>
        <span><b>Período:</b> {context.period}</span>
        <span><b>Classe:</b> {context.className}</span>
        <span><b>Turma:</b> {context.classGroup}</span>
        <span><b>Sala:</b> {context.room || '___'}</span>
        <span><b>Ano Lectivo:</b> {context.academicYear}</span>
        {context.pautaNumber && <span><b>N.º:</b> {context.pautaNumber}</span>}
      </div>
    </header>
  );
}
