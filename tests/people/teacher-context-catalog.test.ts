import { describe, expect, it } from "vitest";
import {
  availableTeacherTools,
  teacherToolCatalog,
} from "@/features/people/teacher-context-catalog";

const validPaths = new Set([
  "/professores", "/pedagogica", "/planos-aula", "/pedagogica/trabalhos",
  "/pedagogica/risco", "/arquivos", "/aulas-virtuais", "/calendario",
  "/comunicacoes", "/pessoas", "/financeiro/rh", "/financeiro/rh/faltas",
  "/pedagogica/pautas-superior", "/pedagogica/superior",
]);
const self = {
  assignedLevels: ["ii_ciclo"],
  schoolLevels: ["primario", "ii_ciclo", "superior"],
  isSelf: true,
  canManage: false,
  canReadHr: false,
  canOpen: (path: string) => validPaths.has(path),
};
describe("Ferramentas contextuais do professor 360", () => {
  it("não aponta para módulos inexistentes", () => {
    expect(teacherToolCatalog.every((tool) => validPaths.has(tool.path))).toBe(true);
    expect(new Set(teacherToolCatalog.map((tool) => tool.id)).size).toBe(teacherToolCatalog.length);
  });
  it("professor vê somente os seus contextos docentes e nunca salários de outros", () => {
    const tools = availableTeacherTools(self).map((tool) => tool.id);
    expect(tools).toContain("aulas");
    expect(tools).toContain("trabalhos");
    expect(tools).toContain("documentos");
    expect(tools).not.toContain("identidade");
    expect(tools).not.toContain("vencimentos");
    expect(tools).not.toContain("superior_pautas");
  });
  it("o nível Superior não é inferido da escola mista quando ainda não há atribuições", () => {
    const tools = availableTeacherTools({ ...self, assignedLevels: [] });
    expect(tools.some((tool) => "level" in tool)).toBe(false);
  });
  it("o Superior é reconhecido para uma instituição exclusivamente superior", () => {
    const tools = availableTeacherTools({
      ...self, assignedLevels: [], schoolLevels: ["superior"],
    }).map((tool) => tool.id);
    expect(tools).toContain("superior_pautas");
    expect(tools).not.toContain("superior_planos");
  });
  it("direcção tem os contextos de RH e planos apenas com permissões autorizadas", () => {
    const tools = availableTeacherTools({
      ...self, assignedLevels: ["superior"], isSelf: false,
      canManage: true, canReadHr: true,
      canOpen: (path) => path !== "/financeiro/rh/faltas",
    }).map((tool) => tool.id);
    expect(tools).toContain("identidade");
    expect(tools).toContain("vencimentos");
    expect(tools).toContain("superior_planos");
    expect(tools).not.toContain("faltas");
  });
  it("nega tudo para um observador sem autorização própria nem de gestão", () => {
    expect(availableTeacherTools({
      ...self, isSelf: false, canManage: false, canReadHr: false,
    })).toEqual([]);
  });
  it("não apresenta destinos bloqueados pelos grants mesmo com cargo", () => {
    expect(availableTeacherTools({ ...self, canOpen: () => false })).toEqual([]);
  });
});
