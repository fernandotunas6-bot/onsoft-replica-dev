import { describe, expect, it } from "vitest";
import { spotlightCatalog } from "@/features/spotlight/catalog";
import { spotlightIcon } from "@/features/spotlight/icons";
import {
  applySpotlightOverrides,
  calendarDateInLuanda,
  createCustomSpotlight,
  isCustomSpotlightId,
  normalizeSpotlightHref,
  normalizeSpotlightInternalPath,
  resolveSpotlightPath,
  spotlightItemSchema,
  spotlightOverrideDiff,
  spotlightOverridesSchema,
  visibleSpotlights,
} from "@/features/spotlight/schemas";

describe("destaques da conta", () => {
  it("valida o catálogo completo", () => {
    expect(spotlightCatalog.length).toBeGreaterThan(3);
    for (const item of spotlightCatalog) {
      expect(spotlightItemSchema.safeParse(item).success).toBe(true);
      expect(spotlightIcon(item.icon)).toBeTruthy();
    }
  });

  it("conserva o cartão de relatórios avançados", () => {
    const reports = spotlightCatalog.find((item) => item.id === "relatorios");
    expect(reports?.title).toBe("Relatórios avançados");
    expect(reports?.cta).toBe("Abrir relatórios");
    expect(reports?.enabled).toBe(true);
  });

  it("esconde destaques sem acesso ao módulo", () => {
    const visible = visibleSpotlights(spotlightCatalog, {
      role: "Professor",
      canAccess: (path) =>
        path === "/pedagogica" ||
        path === "/calendario" ||
        path === "/comunicacoes" ||
        path === "/relatorios/academicos",
    });
    expect(visible.some((item) => item.id === "tesouraria")).toBe(false);
    expect(visible.some((item) => item.id === "avaliacao")).toBe(true);
  });

  it("escolhe a rota interna com fallback", () => {
    const reports = spotlightCatalog.find((item) => item.id === "relatorios")!;
    expect(resolveSpotlightPath(reports, (path) => path === "/relatorios/academicos")).toBe(
      "/relatorios/academicos",
    );
  });

  it("aplica overrides de texto, ordem e visibilidade", () => {
    const merged = applySpotlightOverrides(spotlightCatalog, {
      items: {
        relatorios: { title: "Painéis oficiais", order: 99 },
        tesouraria: { enabled: false },
        inexistente: { title: "Ignorar" },
      },
    });
    const reports = merged.find((item) => item.id === "relatorios");
    expect(reports?.title).toBe("Painéis oficiais");
    expect(reports?.cta).toBe("Abrir relatórios");
    expect(merged.find((item) => item.id === "tesouraria")?.enabled).toBe(false);
    expect(merged.at(-1)?.id).toBe("relatorios");
    expect(merged.some((item) => item.id === "inexistente")).toBe(false);
  });

  it("gera só o diff dos campos alterados", () => {
    const edited = applySpotlightOverrides(spotlightCatalog, {
      items: { avaliacao: { cta: "Lançar notas", enabled: false } },
    });
    expect(spotlightOverrideDiff(spotlightCatalog, edited)).toEqual({
      items: { avaliacao: { enabled: false, cta: "Lançar notas" } },
      extras: [],
    });
    expect(spotlightOverrideDiff(spotlightCatalog, spotlightCatalog)).toEqual({
      items: {},
      extras: [],
    });
  });

  it("aceita overrides antigos sem extras", () => {
    const parsed = spotlightOverridesSchema.parse({
      items: { relatorios: { enabled: false } },
    });
    expect(parsed.extras).toEqual([]);
    expect(parsed.items.relatorios?.enabled).toBe(false);
  });

  it("junta notas da escola ao catálogo", () => {
    const extra = createCustomSpotlight(5);
    const merged = applySpotlightOverrides(spotlightCatalog, {
      items: {},
      extras: [extra, { ...extra, id: "relatorios", title: "Não substitui o catálogo" }],
    });
    expect(merged[0]?.id).toBe(extra.id);
    expect(isCustomSpotlightId(extra.id)).toBe(true);
    expect(merged.filter((item) => item.id === "relatorios")).toHaveLength(1);
    expect(merged.find((item) => item.id === "relatorios")?.title).toBe("Relatórios avançados");
  });

  it("formata o dia civil em Luanda", () => {
    expect(calendarDateInLuanda(new Date("2026-08-12T23:30:00Z"))).toBe("2026-08-13");
  });

  it("esconde destaques fora do calendário ou do cargo", () => {
    const extra = {
      ...createCustomSpotlight(1),
      roles: ["Professor" as const],
      startsOn: "2026-08-20",
      endsOn: "2026-08-30",
    };
    const canAccess = () => true;
    expect(
      visibleSpotlights([extra], { role: "Professor", canAccess, today: "2026-08-12" }),
    ).toHaveLength(0);
    expect(
      visibleSpotlights([extra], { role: "Administrador", canAccess, today: "2026-08-20" }),
    ).toHaveLength(0);
    expect(
      visibleSpotlights([extra], { role: "Professor", canAccess, today: "2026-08-20" })[0]?.id,
    ).toBe(extra.id);
    expect(
      visibleSpotlights([extra], { role: "Professor", canAccess, today: "2026-08-31" }),
    ).toHaveLength(0);
  });

  it("rejeita intervalo de datas invertido", () => {
    const extra = createCustomSpotlight(1);
    expect(
      spotlightItemSchema.safeParse({ ...extra, startsOn: "2026-09-01", endsOn: "2026-08-01" })
        .success,
    ).toBe(false);
  });

  it("guarda calendário e cargos no override do catálogo", () => {
    const edited = applySpotlightOverrides(spotlightCatalog, {
      items: {
        matricula: { startsOn: "2026-09-01", endsOn: "2026-09-30", roles: ["Secretaria"] },
      },
    });
    const row = edited.find((item) => item.id === "matricula")!;
    expect(row.startsOn).toBe("2026-09-01");
    expect(row.roles).toEqual(["Secretaria"]);
    expect(spotlightOverrideDiff(spotlightCatalog, edited).items.matricula).toEqual({
      roles: ["Secretaria"],
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
    });
  });

  it("mostra notas no início e atalhos só no painel da conta", () => {
    const extra = createCustomSpotlight(1);
    const canAccess = () => true;
    const home = visibleSpotlights([...spotlightCatalog, extra], {
      role: "Administrador",
      canAccess,
      surface: "home",
    });
    expect(home.some((item) => item.id === "relatorios")).toBe(false);
    expect(home.some((item) => item.id === extra.id)).toBe(true);
    expect(home.some((item) => item.id === "avaliacao")).toBe(true);
    const drawer = visibleSpotlights(spotlightCatalog, {
      role: "Administrador",
      canAccess,
      surface: "drawer",
    });
    expect(drawer.some((item) => item.id === "relatorios")).toBe(true);
  });

  it("permite pôr um atalho do catálogo no início", () => {
    const edited = applySpotlightOverrides(spotlightCatalog, {
      items: { relatorios: { surfaces: ["drawer", "home"] } },
    });
    expect(
      visibleSpotlights(edited, {
        role: "Administrador",
        canAccess: () => true,
        surface: "home",
      }).some((item) => item.id === "relatorios"),
    ).toBe(true);
  });

  it("normaliza caminhos internos e URLs do botão", () => {
    expect(normalizeSpotlightInternalPath("alunos")).toBe("/alunos");
    expect(normalizeSpotlightInternalPath("/faturas")).toBe("/faturas");
    expect(normalizeSpotlightHref("portaldocontribuinte.minfin.gov.ao")).toBe(
      "https://portaldocontribuinte.minfin.gov.ao",
    );
    expect(normalizeSpotlightHref("https://agt.gov.ao/")).toBe("https://agt.gov.ao/");
  });

  it("grava a ligação do botão no catálogo", () => {
    const edited = applySpotlightOverrides(spotlightCatalog, {
      items: {
        relatorios: { link: { type: "internal", to: "/documentos" } },
        agt: { link: { type: "external", href: "https://agt.gov.ao/" } },
      },
    });
    const reports = edited.find((item) => item.id === "relatorios")!;
    expect(reports.link).toEqual({ type: "internal", to: "/documentos" });
    expect(reports.accessPath).toBe("/documentos");
    expect(edited.find((item) => item.id === "agt")?.link).toEqual({
      type: "external",
      href: "https://agt.gov.ao/",
    });
    expect(spotlightOverrideDiff(spotlightCatalog, edited).items.relatorios?.link).toEqual({
      type: "internal",
      to: "/documentos",
    });
  });

  it("grava ícone, cor e tipo no catálogo", () => {
    const edited = applySpotlightOverrides(spotlightCatalog, {
      items: { relatorios: { icon: "star", tone: "warning", kind: "promo" } },
    });
    const reports = edited.find((item) => item.id === "relatorios")!;
    expect(reports.icon).toBe("star");
    expect(reports.tone).toBe("warning");
    expect(reports.kind).toBe("promo");
    expect(spotlightIcon(reports.icon)).toBeTruthy();
    expect(spotlightOverrideDiff(spotlightCatalog, edited).items.relatorios).toEqual({
      icon: "star",
      tone: "warning",
      kind: "promo",
      surfaces: ["drawer", "home"],
    });
  });
});
