import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/sga-admin", () => ({}));

const { canShareFileInMessage } = await import("@/features/messages/attachments");
type File = Parameters<typeof canShareFileInMessage>[0];

const DONO = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

const ficheiro = (patch: Partial<File> = {}): File => ({
  id: "33333333-3333-4333-8333-333333333333",
  name: "plano.pdf",
  area: "escola",
  visibility: "school",
  ownerUserId: OUTRO,
  relatedUserId: null,
  isFolder: false,
  isSystem: false,
  storageBackend: "sga",
  storagePath: "escola/plano.pdf",
  ...patch,
});

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const serverFn = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name} = createServerFn`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
};

describe("anexos de mensagens: quem envia só partilha o que pode abrir", () => {
  it("ficheiro partilhado da escola: qualquer pessoa do pessoal", () => {
    for (const role of ["Administrador", "Secretaria", "Tesouraria", "Professor"]) {
      expect(canShareFileInMessage(ficheiro(), DONO, [role])).toBe(true);
    }
  });

  it("alunos e encarregados não anexam ficheiros dos Arquivos", () => {
    expect(canShareFileInMessage(ficheiro(), DONO, ["Aluno"])).toBe(false);
    expect(canShareFileInMessage(ficheiro(), DONO, ["Encarregado"])).toBe(false);
    expect(canShareFileInMessage(ficheiro(), DONO, [])).toBe(false);
  });

  it("a área da secretaria e os ficheiros pessoais de outros ficam fechados", () => {
    expect(canShareFileInMessage(ficheiro({ area: "secretaria" }), DONO, ["Professor"])).toBe(
      false,
    );
    expect(canShareFileInMessage(ficheiro({ area: "pessoal" }), DONO, ["Administrador"])).toBe(
      false,
    );
    expect(
      canShareFileInMessage(ficheiro({ area: "pessoal", ownerUserId: DONO }), DONO, ["Professor"]),
    ).toBe(true);
  });

  it("conteúdo de sistema só com permissão de conteúdo; pastas nunca", () => {
    const sistema = ficheiro({ isSystem: true });
    expect(canShareFileInMessage(sistema, DONO, ["Professor"])).toBe(false);
    expect(canShareFileInMessage(sistema, DONO, ["Secretaria"])).toBe(true);
    expect(canShareFileInMessage(ficheiro({ isFolder: true }), DONO, ["Administrador"])).toBe(
      false,
    );
  });

  it("basta um dos cargos da pessoa nesta escola", () => {
    expect(canShareFileInMessage(ficheiro(), DONO, ["Encarregado", "Professor"])).toBe(true);
  });
});

describe("anexos de mensagens: servidor", () => {
  const chat = read("src/features/messages/chat-server.ts");
  const direct = read("src/features/messages/server.ts");
  const sign = read("src/features/messages/attachment-server.ts");

  it("o envio verifica o anexo e grava o nome da base, não o do browser", () => {
    for (const body of [serverFn(chat, "sendChatMessage"), serverFn(direct, "sendDirectMessage")]) {
      expect(body).toMatch(/assertSenderMayAttach\(db, \{/);
      expect(body).toMatch(/attachment_file_id: attachment\?\.id \?\? null/);
      expect(body).toMatch(/attachment_file_name: attachment\?\.name \?\? null/);
      expect(body).not.toMatch(/attachment_file_name: data\.attachmentFileName/);
    }
  });

  it("abrir pela mensagem: só quem participa, e a regra volta a valer para quem enviou", () => {
    const body = serverFn(sign, "signMessageAttachment");
    expect(body).toMatch(/\.eq\("school_id", membership\.schoolId\)/);
    expect(body).toMatch(/from\("siga_chat_members"\)/);
    expect(body).toMatch(/Não participa nesta conversa/);
    expect(body).toMatch(/message\.recipient_id\) !== userId/);
    expect(body).toMatch(/schoolRolesOf\(db, membership\.schoolId, senderId\)/);
    expect(body).toMatch(/canShareFileInMessage\(file, senderId, senderRoles\)/);
  });

  it("os messengers abrem anexos gravados pela mensagem", () => {
    expect(read("src/features/messages/ChatDock.tsx")).toMatch(
      /signMessageAttachment\(\{ data: \{ source: "chat", messageId: message\.id \} \}\)/,
    );
    expect(read("src/features/messages/StaffMessenger.tsx")).toMatch(
      /signMessageAttachment\(\{ data: \{ source: "direct", messageId \} \}\)/,
    );
  });
});

describe("conversa directa", () => {
  const chat = read("src/features/messages/chat-server.ts");
  const start = serverFn(chat, "startDirectConversation");

  it("a regra de quem fala com quem usa os cargos nesta escola, não profiles.cargo", () => {
    expect(start).toMatch(/schoolRolesOf\(db, membership\.schoolId, data\.peerId\)/);
    expect(start).not.toMatch(/from\("profiles"\)/);
  });

  it("reaproveitar uma conversa repõe os dois participantes", () => {
    expect(start.match(/ensureDirectMembers\(db, /g)?.length).toBe(3);
    expect(chat).toMatch(/onConflict: "conversation_id,user_id", ignoreDuplicates: true/);
  });
});
