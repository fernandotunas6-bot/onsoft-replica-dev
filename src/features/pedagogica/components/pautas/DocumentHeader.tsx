import type { ClassContext, SchoolIdentity } from "./types";
import { AngolaEmblem } from "@/features/academic/AngolaEmblem";
import { MediaFrame } from "@/components/ui/media-frame";

type Props = {
  school: SchoolIdentity;
  title: string;
  context: ClassContext;
  subject?: string;
};

export function DocumentHeader({ school, title, context, subject }: Props) {
  return (
    <header className="text-center font-sans space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center mb-1">
        <span aria-hidden="true" />
        <AngolaEmblem className="h-14 w-auto" />
        {school.logoUrl ? (
          <MediaFrame
            src={school.logoUrl}
            alt={`Logótipo de ${school.schoolName}`}
            ratio="1/1"
            rounded="rounded-none"
            className="ml-auto size-14 bg-transparent"
            imgClassName="object-contain"
          />
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 text-[11px] font-bold text-muted-foreground">
        <span>{school.republic ?? "REPÚBLICA DE ANGOLA"}</span>
        {school.province && <span>{school.province}</span>}
        {school.municipality && <span>{school.municipality}</span>}
        {school.educationOffice && <span>{school.educationOffice}</span>}
        <span className="text-foreground text-xs">{school.schoolName}</span>
      </div>
      <h1 className="my-2 text-base font-extrabold tracking-tight text-foreground">{title}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 border border-border bg-card p-2 text-left text-[11px] rounded-md shadow-xs">
        {subject && (
          <span>
            <b>Disciplina:</b> {subject}
          </span>
        )}
        <span>
          <b>Professor(a):</b> {context.teacher || "________________"}
        </span>
        <span>
          <b>Período:</b> {context.period}
        </span>
        <span>
          <b>Classe:</b> {context.className}
        </span>
        <span>
          <b>Turma:</b> {context.classGroup}
        </span>
        <span>
          <b>Sala:</b> {context.room || "___"}
        </span>
        <span>
          <b>Ano Lectivo:</b> {context.academicYear}
        </span>
        {context.pautaNumber && (
          <span>
            <b>N.º Pauta:</b> {context.pautaNumber}
          </span>
        )}
      </div>
    </header>
  );
}
