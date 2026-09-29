import { describe, expect, it } from "vitest";
import { canAccessPath, canReadModule, canWriteModule } from "@/features/auth/access-policy";

describe("access policy", () => {
  it("allows administrators into every protected area", () => {
    for (const path of [
      "/",
      "/configuracoes",
      "/acessos",
      "/financeiro",
      "/alunos",
      "/alumni",
      "/alumni/portal",
    ]) {
      expect(canAccessPath(path, "Administrador")).toBe(true);
    }
  });

  it("keeps alumni master workspace limited to administration and secretariat", () => {
    expect(canAccessPath("/alumni", "Administrador")).toBe(true);
    expect(canAccessPath("/alumni", "Secretaria")).toBe(true);
    expect(canAccessPath("/alumni/11111111-1111-4111-8111-111111111111", "Secretaria")).toBe(true);
    expect(canAccessPath("/alumni", "Aluno")).toBe(false);
    expect(canAccessPath("/alumni", "Encarregado")).toBe(false);
    expect(canAccessPath("/alumni", "Professor")).toBe(false);
    expect(canAccessPath("/alumni", "Tesouraria")).toBe(false);
  });

  it("allows students only into the protected alumni self-service surface", () => {
    expect(canAccessPath("/alumni/portal", "Aluno")).toBe(true);
    expect(canAccessPath("/alumni/portal/preferences", "Aluno")).toBe(true);
    expect(canAccessPath("/alumni/portal", "Encarregado")).toBe(false);
    expect(canAccessPath("/alumni/portal", "Professor")).toBe(false);
    expect(canAccessPath("/alumni/portal", "Tesouraria")).toBe(false);
    expect(canAccessPath("/alumni/portal", "Aluno", { pessoas: "Nenhum" })).toBe(false);
  });

  it("keeps finance routes limited to finance roles", () => {
    expect(canAccessPath("/financeiro", "Tesouraria")).toBe(true);
    expect(canAccessPath("/relatorios/financeiros/2026", "Tesouraria")).toBe(true);
    expect(canAccessPath("/financeiro", "Secretaria")).toBe(false);
    expect(canAccessPath("/faturas", "Professor")).toBe(false);
  });

  it("keeps student records limited to administration and secretariat", () => {
    expect(canAccessPath("/alunos/abc", "Secretaria")).toBe(true);
    expect(canAccessPath("/pessoas", "Tesouraria")).toBe(false);
    expect(canAccessPath("/documentos", "Professor")).toBe(false);
  });

  it("allows professors only into pedagogical and communication modules", () => {
    expect(canAccessPath("/pedagogica", "Professor")).toBe(true);
    expect(canAccessPath("/relatorios/academicos", "Professor")).toBe(true);
    expect(canAccessPath("/comunicacoes", "Professor")).toBe(true);
    expect(canAccessPath("/arquivos", "Professor")).toBe(true);
    expect(canAccessPath("/arquivos", "Tesouraria")).toBe(true);
    expect(canAccessPath("/arquivos", "Encarregado")).toBe(false);
    expect(canAccessPath("/configuracoes", "Professor")).toBe(false);
  });

  it("keeps account maintenance available without exposing operational modules", () => {
    expect(canAccessPath("/alterar-senha", "Utilizador")).toBe(true);
    expect(canAccessPath("/", "Utilizador")).toBe(false);
    expect(canAccessPath("/", "Encarregado")).toBe(true);
    expect(canAccessPath("/", "Aluno")).toBe(true);
    expect(canAccessPath("/alunos", "cargo-invalido")).toBe(false);
    expect(canAccessPath("/modulo-futuro", "Administrador")).toBe(false);
  });

  it("honours per-user module grants over the role default", () => {
    expect(canAccessPath("/financeiro", "Professor")).toBe(false);
    expect(canAccessPath("/financeiro", "Professor", { financeiro: "Leitura" })).toBe(true);
    expect(canAccessPath("/alunos", "Professor", { pessoas: "Nenhum" })).toBe(false);
    expect(canAccessPath("/matricula/escola", "Utilizador")).toBe(true);
    expect(canAccessPath("/calendario/ics", "Utilizador")).toBe(true);
    expect(canAccessPath("/professores/abc", "Professor")).toBe(true);
    expect(canAccessPath("/alunos", "Professor")).toBe(false);
  });

  it("keeps role-only areas closed to module grants, as the server does", () => {
    // RH e folha salarial: o servidor só aceita Administrador e Tesouraria.
    expect(canAccessPath("/financeiro/rh", "Professor", { financeiro: "Total" })).toBe(false);
    expect(canAccessPath("/financeiro/rh/folha", "Secretaria", { financeiro: "Escrita" })).toBe(
      false,
    );
    expect(canAccessPath("/financeiro", "Professor", { financeiro: "Leitura" })).toBe(true);
    // Configurações da escola: só Administrador, nenhuma permissão as abre.
    expect(canAccessPath("/configuracoes", "Secretaria", { gestao: "Total" })).toBe(false);
    expect(canAccessPath("/acessos", "Tesouraria", { gestao: "Leitura" })).toBe(true);
    // A permissão não retira o cargo nem dá poderes a mais ao Administrador.
    expect(canAccessPath("/financeiro/rh", "Tesouraria", { financeiro: "Leitura" })).toBe(true);
    expect(canAccessPath("/configuracoes", "Administrador", { gestao: "Leitura" })).toBe(true);
  });

  it("never lets a grant widen access for students or guardians", () => {
    expect(canAccessPath("/faturas", "Aluno", { financeiro: "Total" })).toBe(false);
    expect(canAccessPath("/importar", "Encarregado", { importacao: "Total" })).toBe(false);
    expect(canAccessPath("/professores", "Aluno", { pessoas: "Escrita" })).toBe(false);
    expect(canWriteModule("Aluno", "pessoas", { pessoas: "Total" })).toBe(false);
    // Retirar continua a valer para eles.
    expect(canAccessPath("/financeiro", "Aluno", { financeiro: "Nenhum" })).toBe(false);
  });

  it("distinguishes read vs write levels by role", () => {
    expect(canReadModule("Professor", "pedagogica")).toBe(true);
    expect(canWriteModule("Professor", "pedagogica")).toBe(false);
    expect(canWriteModule("Secretaria", "pedagogica")).toBe(true);
    expect(canWriteModule("Secretaria", "pessoas")).toBe(true);
    expect(canWriteModule("Tesouraria", "financeiro")).toBe(true);
    expect(canWriteModule("Tesouraria", "pessoas")).toBe(false);
  });
});
