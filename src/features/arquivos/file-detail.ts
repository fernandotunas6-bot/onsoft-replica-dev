import { myFileAccess, type FileMyAccess } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

/**
 * Página de um ficheiro (SIGA Context Engine, contexto Documentos e Arquivos):
 * o ficheiro como a lista de Arquivos o mostra a esta conta, a turma e o aluno a
 * que está ligado. Só a montagem; `getSchoolFileDetail` lê tudo da escola activa
 * e aplica as mesmas regras de visibilidade da lista.
 */

export type SchoolFileDetail = {
  /** Sem `storagePath`: o conteúdo abre-se sempre por `signSchoolFile`. */
  file: SchoolFileRecord;
  /** Se a conta pode abrir o conteúdo (um ficheiro do sistema fica só listável). */
  contentOpen: boolean;
  myAccess: FileMyAccess;
  classGroup: { id: string; name: string } | null;
  /** O aluno cuja pessoa está ligada ao ficheiro, quando o servidor o encontrou. */
  student: { id: string; name: string | null } | null;
};

export function buildSchoolFileDetail(input: {
  file: SchoolFileRecord;
  userId: string;
  role: string;
  contentOpen: boolean;
  classGroup: { id: string; name: string } | null;
  studentId: string | null;
}): SchoolFileDetail {
  const { file } = input;
  return {
    file: {
      ...file,
      storagePath: "",
      // Sem acesso ao conteúdo, a descrição também fica oculta (como na lista).
      description: input.contentOpen ? file.description : null,
    },
    contentOpen: input.contentOpen,
    myAccess: myFileAccess(file, input.userId, input.role),
    classGroup: input.classGroup,
    student: input.studentId ? { id: input.studentId, name: file.relatedPersonName } : null,
  };
}
