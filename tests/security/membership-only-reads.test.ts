import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `resolveSgaMembershipAdmin` só diz que a conta pertence à escola, e isso
// inclui alunos e encarregados. Uma função do servidor que fica por aí, sem
// verificar papel, âmbito do aluno ou dono, entrega a qualquer membro o que
// ler com a chave de serviço. Foi assim que `searchPeople` dava a um aluno os
// contactos, o BI e a morada de toda a escola, e que as aulas do dia deixavam
// um aluno criar sessões de presença.
//
// As funções abaixo foram revistas (2026-09-29): dados de estrutura da escola
// (anos, turmas, salas, calendário, modelos de impressão), dados da própria
// conta, ou leituras que filtram pelo utilizador. Uma função nova que só
// verifique a pertença tem de ser revista e acrescentada aqui com o motivo.
const REVISTAS: Record<string, string> = {
  listProgramCurriculum: "estrutura curricular da escola",
  listSubjectTypes: "estrutura curricular da escola",
  listCurriculumAreas: "estrutura curricular da escola",
  listRooms: "salas da escola",
  listSchoolShifts: "turnos da escola",
  listCurricula: "estrutura curricular da escola",
  getActivePassingValue: "nota de aprovação em vigor",
  listAcademicCalendar: "calendário lectivo",
  listLessonPlans: "alunos e encarregados só vêem os planos publicados",
  getLessonPlan: "alunos e encarregados só vêem os planos publicados",
  redeemTeacherLessonQr:
    "o professor regista a própria presença; a base valida o token do QR e a ligação conta↔professor",
  listSpotlightConfig: "configuração da pesquisa",
  getSchoolSettings: "definições públicas da escola",
  listAcademicYears: "anos lectivos",
  listAcademicTerms: "períodos",
  requestEmailChangeFn: "a própria conta",
  requestPhoneChangeOtpFn: "a própria conta",
  getFinanceSchemaStatus: "estado do esquema, sem dados",
  completeZoomOAuth: "regresso do OAuth da própria conta",
  listInstalledCapabilities: "integrações activas da escola",
  listAcademicDirectory: "anos, cursos, classes e turmas",
  getTenantForCurrentUser: "a escola da própria conta",
  listDirectThread: "só as mensagens em que a conta é remetente ou destinatária",
  listInboxPreviews: "só as mensagens da própria conta",
  listCalendarEvents: "calendário da escola",
  getActiveAcademicYear: "ano lectivo em vigor",
  listPrintTemplates: "modelos de impressão",
  getPrintTemplate: "modelos de impressão",
  // Chat escolar (2026-10-02): as restantes funções de chat-server.ts já
  // verificam mais do que a pertença e por isso não entram aqui.
  listSchoolColleagues:
    "casca de loadSchoolColleagues, que filtra o directório por papel (ver messaging-scope)",
  listChatContacts:
    "casca de loadSchoolColleagues, como listSchoolColleagues (ver messaging-scope)",
  // Filtra por `sender_id`, que o VERIFICA acima não reconhece — e alargá-lo a
  // `sender_id` em geral deixaria passar funções que só o usam para escrever.
  deleteChatMessage: 'apaga só a própria mensagem: .eq("sender_id", context.userId)',
  openChatAttachment:
    "assertMember: só quem participa na conversa da mensagem abre o anexo (siga_chat_members)",
};

// Sinais de que a função verifica mais do que a pertença.
const VERIFICA =
  /appRole|assertCanSee|loadStudentScope|requireSga|isStaff|STAFF|canManage|assertTeacher|teacher_id|user_id", context\.userId|\.eq\("user_id"|created_by", context|isPlatformAdmin|hasPermission|has_permission|roleCode|role_code|linked\./;

function funcoesSoComPertenca() {
  const files = execSync("git ls-files src", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.endsWith(".ts"));
  const found: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("resolveSgaMembershipAdmin(")) continue;
    const parts = source.split(/\nexport const (\w+) = createServerFn\(/);
    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i]!;
      const body = parts[i + 1]!;
      if (!body.includes("resolveSgaMembershipAdmin(")) continue;
      const after = body.split("resolveSgaMembershipAdmin(").slice(1).join("");
      if (!VERIFICA.test(after)) found.push(name);
    }
  }
  return found;
}

describe("funções do servidor que só verificam a pertença à escola", () => {
  const found = funcoesSoComPertenca();

  it("todas foram revistas", () => {
    expect(found.filter((name) => !(name in REVISTAS))).toEqual([]);
  });

  it("a lista de revistas não guarda funções que já verificam mais", () => {
    expect(Object.keys(REVISTAS).filter((name) => !found.includes(name))).toEqual([]);
  });

  it("searchPeople é da Secretaria", () => {
    const source = readFileSync("src/features/people/server.ts", "utf8");
    const start = source.indexOf("export const searchPeople ");
    const fn = source.slice(start, source.indexOf("export const ", start + 1));
    expect(fn).toMatch(
      /requireSgaWriterFor\("pessoas"[\s\S]{0,80}"Administrador",\s*"Secretaria",\s*\]/,
    );
    expect(fn).not.toMatch(/resolveSgaMembershipAdmin\(/);
  });
});
