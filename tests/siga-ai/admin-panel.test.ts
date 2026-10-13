/**
 * A área administrativa do SIGA AI (§10) só é alcançável por quem abre
 * Definições, e Definições é só do Administrador. Sem isto, activar a IA —
 * que inclui autorizar o envio de dados para um serviço remoto — ficava a
 * um clique de qualquer conta.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessPath } from "@/features/auth/access-policy";

const settingsCenter = readFileSync(
  resolve(process.cwd(), "src/components/modals/SettingsCenter.tsx"),
  "utf8",
);

describe("SIGA AI · área administrativa", () => {
  it("está registada no centro de definições", () => {
    expect(settingsCenter).toContain('id: "siga-ai"');
    expect(settingsCenter).toContain("<AiSettingsPanel />");
    expect(settingsCenter).toContain('to: "siga-ai"');
  });

  it("vive atrás de /configuracoes, que só o Administrador abre", () => {
    expect(canAccessPath("/configuracoes", "Administrador")).toBe(true);
    for (const role of ["Secretaria", "Tesouraria", "Professor", "Encarregado", "Aluno"]) {
      expect(canAccessPath("/configuracoes", role), role).toBe(false);
    }
  });

  it("o assistente em si continua aberto aos perfis da escola", () => {
    // A página de conversa não é a área administrativa: quem usa a IA não
    // configura a IA. O servidor confirma o perfil em cada pergunta.
    for (const role of ["Administrador", "Secretaria", "Professor", "Aluno", "Encarregado"]) {
      expect(canAccessPath("/siga-ai", role), role).toBe(true);
    }
  });
});
