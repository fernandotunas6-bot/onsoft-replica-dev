import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPrintSamplePayload,
  matchPrintTemplateKey,
  PRINT_TEMPLATE_KEYS,
} from "@/features/documents/print-catalog";
import { renderHandlebars } from "@/features/documents/render-hbs";
import { mergePrintPayload } from "@/features/documents/print-issue";
import {
  overlayActa,
  overlayBoletim,
  overlayCredenciais,
  overlayDiario,
  overlayMapa,
  overlayPauta,
  overlayServico,
} from "@/features/documents/print-overlays";

describe("renderHandlebars", () => {
  it("interpola, escapa e injeta CSS cru", () => {
    const html = renderHandlebars("<p>{{name}}</p><style>{{{css}}}</style><span>{{raw}}</span>", {
      name: "Ana <b>X</b>",
      css: "body{color:red}",
      raw: "ok",
    });
    expect(html).toContain("Ana &lt;b&gt;X&lt;/b&gt;");
    expect(html).toContain("body{color:red}");
    expect(html).toContain("ok");
  });

  it("respeita if/else e each com @index", () => {
    const html = renderHandlebars(
      "{{#if show}}SIM{{else}}NAO{{/if}} {{#each items}}{{inc @index}}-{{this}};{{/each}}",
      { show: false, items: ["a", "b"] },
    );
    expect(html).toContain("NAO");
    expect(html).toContain("1-a;");
    expect(html).toContain("2-b;");
  });

  it("avalia if aninhado dentro de each", () => {
    const html = renderHandlebars("{{#each rows}}{{#if ok}}OK{{else}}NO{{/if}} {{/each}}", {
      rows: [{ ok: true }, { ok: false }],
    });
    expect(html).toContain("OK");
    expect(html).toContain("NO");
  });
});

describe("matchPrintTemplateKey", () => {
  it("escolhe o boletim pelo nome do pedido", () => {
    expect(matchPrintTemplateKey("Boletim escolar")).toBe("boletim-escolar");
    expect(matchPrintTemplateKey("Diário pedagógico")).toBe("diario-pedagogico-professor");
    expect(matchPrintTemplateKey("Talão de candidatura")).toBe("talao-candidatura");
    expect(matchPrintTemplateKey("Relatório financeiro")).toBe("service-document");
  });

  it("escolhe o documento de serviço para recibos e faturas", () => {
    expect(matchPrintTemplateKey("Recibo de pagamento")).toBe("service-document");
    expect(matchPrintTemplateKey("Fatura escolar")).toBe("service-document");
    expect(matchPrintTemplateKey("Comunicado escolar")).toBe("service-document");
    expect(matchPrintTemplateKey("Calendário lectivo")).toBe("service-document");
    expect(matchPrintTemplateKey("Lista de alunos")).toBe("service-document");
    expect(matchPrintTemplateKey("Relação de alunos")).toBe("service-document");
    expect(matchPrintTemplateKey("Pauta trimestral (lista)")).toBe("service-document");
    expect(matchPrintTemplateKey("Pedidos de documento")).toBe("service-document");
    expect(matchPrintTemplateKey("Movimentos de caixa")).toBe("service-document");
    expect(matchPrintTemplateKey("Lista de faturas")).toBe("service-document");
    expect(matchPrintTemplateKey("Cobrança mensal")).toBe("service-document");
    expect(matchPrintTemplateKey("Receitas e despesas por categoria")).toBe("service-document");
    expect(matchPrintTemplateKey("Registo de pessoas")).toBe("service-document");
    expect(matchPrintTemplateKey("Relatório académico")).toBe("service-document");
    expect(matchPrintTemplateKey("Equipa escolar")).toBe("service-document");
    expect(matchPrintTemplateKey("Lista de turmas")).toBe("service-document");
    expect(matchPrintTemplateKey("Contas de login")).toBe("service-document");
  });

  it("usa o modelo activo quando o tipo não é reconhecido", () => {
    expect(matchPrintTemplateKey("Documento avulso", { issue: "service-document" })).toBe(
      "service-document",
    );
  });

  it("permite substituir o tipo por um modelo escolhido", () => {
    expect(
      matchPrintTemplateKey("Declaração de notas", {
        byType: { simple_grade_statement: "certificado-habilitacoes" },
      }),
    ).toBe("certificado-habilitacoes");
  });
});

describe("overlays de emissão", () => {
  it("fund os dados reais por cima da amostra", () => {
    const merged = mergePrintPayload(
      { school: { name: "A", nif: "1" }, subjects: [{ name: "X" }] },
      { school: { name: "B" }, subjects: [{ name: "Y" }] },
    );
    expect(merged.school).toEqual({ name: "B", nif: "1" });
    expect(merged.subjects).toEqual([{ name: "Y" }]);
  });

  it("monta boletim, pauta e mapa com totais", () => {
    const boletim = overlayBoletim({
      subjects: [{ name: "LP", t1: 14, t2: 13, t3: 15, mfa: 14, status: "Transita" }],
      average: 14,
      status: "Transita",
    });
    expect(boletim.subjects[0]?.finalGrade).toBe(14);
    const pauta = overlayPauta({
      subjectName: "LP",
      students: [
        { fullName: "Ana", academicNumber: "1", average: 14, status: "Transita" },
        { fullName: "Noé", academicNumber: "2", average: 8, status: "Não transita" },
      ],
    });
    expect(pauta.summary.total).toBe(2);
    expect(pauta.summary.approved).toBe(1);
    const pautaGeral = overlayPauta({
      periodName: "1.º Trimestre",
      className: "7ª A",
      courseName: "I Ciclo",
      subjects: [{ name: "Língua Portuguesa", shortName: "LP" }],
      students: [
        {
          fullName: "Ana",
          academicNumber: "1",
          subjectGrades: [14, 12],
          average: 13,
          status: "Transita",
        },
      ],
    });
    expect(pautaGeral.subjects?.[0]?.shortName).toBe("LP");
    expect(pautaGeral.students[0]?.subjectGrades).toEqual([14, 12]);
    const mapa = overlayMapa([
      { classGroup: "7ª A", course: "I Ciclo", total: 30, approved: 27, pending: 1 },
    ]);
    expect(mapa.summary.approved).toBe(27);
    expect(mapa.rows[0]?.failed).toBe(2);
  });

  it("monta diário, acta e credenciais", () => {
    const diario = overlayDiario({
      teacherName: "Prof. Costa",
      lessons: [{ date: "Segunda", time: "07:30–08:20", topic: "LP" }],
    });
    expect(diario.summary.totalLessons).toBe(1);
    expect(diario.lessons[0]?.topic).toBe("LP");
    const acta = overlayActa({
      decisions: [
        { student: "Ana", average: 14, decision: "Transita" },
        { student: "Noé", average: 8, decision: "Não transita" },
      ],
    });
    expect(acta.summary.approved).toBe(1);
    const credenciais = overlayCredenciais({
      fullName: "Ana Domingos",
      process: "EST-2026-0142",
      schoolEmailDomain: "escola.ao",
    });
    expect(String(credenciais.credentials.institutionalEmail)).toContain("@escola.ao");
    expect(credenciais.credentials.acceptedLoginIdentifiers).toContain("EST-2026-0142");
    const servico = overlayServico({
      name: "Recibo de pagamento",
      reference: "RC-1",
      status: "Pago",
      parties: [{ label: "Aluno", value: "Ana" }],
      sections: [{ title: "Quitação", rows: [{ label: "Valor", value: "45 000 Kz" }] }],
    });
    expect(servico.service.name).toBe("Recibo de pagamento");
    expect(servico.sections[0]?.rows?.[0]?.value).toBe("45 000 Kz");
    const financeiro = overlayServico({
      name: "Recibo de caixa",
      areaLabel: "Tesouraria",
      reference: "CX-1",
      status: "Pago",
      parties: [],
      sections: [],
    });
    expect(financeiro.service.validityLabel).toBe("Documento de tesouraria");
    expect(financeiro.rules).toEqual(
      expect.arrayContaining(["A tesouraria pode exigir o original para efeitos de quitação."]),
    );
    const institucional = overlayServico({
      name: "Lista de alunos",
      areaLabel: "Secretaria",
      reference: "LST-1",
      status: "Oficial",
      parties: [],
      sections: [],
    });
    expect(institucional.service.validityLabel).toBe("Documento institucional");
    expect(institucional.permissions).toEqual(expect.arrayContaining(["Secretaria"]));
  });
});

describe("modelos em public/templates", () => {
  it("alinha PRINT_TEMPLATE_KEYS com template-registry.json", async () => {
    const root = join(process.cwd(), "public/templates");
    const registry = JSON.parse(await readFile(join(root, "template-registry.json"), "utf8")) as {
      templates: Array<{ key: string }>;
    };
    const registryKeys = registry.templates.map((item) => item.key).sort();
    expect([...PRINT_TEMPLATE_KEYS].sort()).toEqual(registryKeys);
  });

  it("renderiza a declaração simples com o CSS base", async () => {
    const root = join(process.cwd(), "public/templates");
    const [source, css] = await Promise.all([
      readFile(join(root, "declaracao-notas-simples.hbs"), "utf8"),
      readFile(join(root, "base.css"), "utf8"),
    ]);
    const html = renderHandlebars(
      source,
      buildPrintSamplePayload(
        { name: "Escola SIGA", academicYear: "2026/2027" },
        { css, student: { fullName: "Ana Domingos", academicNumber: "EST-1" } },
      ),
    );
    expect(html).toContain("Ana Domingos");
    expect(html).toContain("EST-1");
    expect(html).toContain("Escola SIGA");
    expect(html).toContain("MINISTÉRIO DA EDUCAÇÃO");
  });

  it("abre todos os .hbs do catálogo sem erro de bloco", async () => {
    const root = join(process.cwd(), "public/templates");
    const css = await readFile(join(root, "base.css"), "utf8");
    const payload = buildPrintSamplePayload({ name: "Escola SIGA" }, { css });
    for (const key of PRINT_TEMPLATE_KEYS) {
      const source = await readFile(join(root, `${key}.hbs`), "utf8");
      const html = renderHandlebars(source, payload);
      expect(html, key).toContain("Escola SIGA");
      expect(html, key).not.toContain("{{#");
    }
  });
});
