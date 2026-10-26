import { describe, expect, it } from "vitest";
import {
  DORMANT_MODULE_IDS,
  MODULE_CATALOG,
  hiddenNavPaths,
  resolveEnabledModules,
  statusEnablesModule,
} from "@/features/auth/module-availability";

/**
 * A regra que não pode falhar: **falta de linha nunca tira nada**. Uma escola
 * nova, ou uma consulta que não respondeu, tem de ficar com o que o produto dá
 * por omissão — não sem navegação.
 */
describe("módulos por escola", () => {
  it("sem nenhuma linha, vale a omissão do produto", () => {
    const ligados = resolveEnabledModules({});
    for (const mod of MODULE_CATALOG) {
      expect(ligados.has(mod.id), `${mod.id} (dormant=${mod.dormant})`).toBe(!mod.dormant);
    }
  });

  it("os adormecidos de hoje são o Alumni, o RH e as Catracas", () => {
    expect([...DORMANT_MODULE_IDS].sort()).toEqual(["alumni", "catracas", "rh"]);
  });

  it("uma escola pode ligar um adormecido sem afectar as outras", () => {
    const piloto = resolveEnabledModules({ rh: true });
    expect(piloto.has("rh")).toBe(true);
    // As outras continuam a ver o que viam.
    expect(resolveEnabledModules({}).has("rh")).toBe(false);
  });

  it("uma escola pode desligar um módulo que o produto dá ligado", () => {
    expect(resolveEnabledModules({ documentos: false }).has("documentos")).toBe(false);
    expect(resolveEnabledModules({}).has("documentos")).toBe(true);
  });

  it("um id desconhecido nas linhas não inventa módulos", () => {
    const ligados = resolveEnabledModules({ modulo_que_nao_existe: true });
    expect(ligados.has("modulo_que_nao_existe")).toBe(false);
    expect(ligados.size).toBe(MODULE_CATALOG.filter((m) => !m.dormant).length);
  });

  describe("estados de school_modules", () => {
    it("contam como ligado: installed, active, update_available", () => {
      for (const s of ["installed", "active", "update_available"]) {
        expect(statusEnablesModule(s), s).toBe(true);
      }
    });

    it("não contam: disabled, archived, incompatible, error, nulo e desconhecido", () => {
      for (const s of ["disabled", "archived", "incompatible", "error", "futuro_estado"]) {
        expect(statusEnablesModule(s), s).toBe(false);
      }
      expect(statusEnablesModule(null)).toBe(false);
      expect(statusEnablesModule(undefined)).toBe(false);
    });
  });

  describe("caminhos escondidos", () => {
    it("esconde o caminho do módulo desligado e os seus secundários", () => {
      const escondidos = hiddenNavPaths(resolveEnabledModules({}));
      expect(escondidos.has("/alumni")).toBe(true);
      expect(escondidos.has("/catracas")).toBe(true);
      expect(escondidos.has("/financeiro/rh")).toBe(true);
      expect(escondidos.has("/financeiro/rh/folha")).toBe(true);
    });

    it("não esconde o caminho de um módulo ligado", () => {
      const escondidos = hiddenNavPaths(resolveEnabledModules({}));
      expect(escondidos.has("/financeiro")).toBe(false);
      expect(escondidos.has("/alunos")).toBe(false);
    });

    it("ligar o RH descobre o /financeiro/rh e os seus secundários", () => {
      const escondidos = hiddenNavPaths(resolveEnabledModules({ rh: true }));
      expect(escondidos.has("/financeiro/rh")).toBe(false);
      expect(escondidos.has("/financeiro/rh/folha")).toBe(false);
      // E o Alumni, que ninguém ligou, continua escondido.
      expect(escondidos.has("/alumni")).toBe(true);
    });

    it("o /financeiro/rh é do RH e secundário do financeiro — manda o dono", () => {
      // Com o financeiro desligado e o RH ligado, o caminho do RH continua à vista:
      // quem o reclama como próprio está ligado.
      const escondidos = hiddenNavPaths(resolveEnabledModules({ financeiro: false, rh: true }));
      expect(escondidos.has("/financeiro")).toBe(true);
      expect(escondidos.has("/financeiro/rh")).toBe(false);
    });
  });
});
