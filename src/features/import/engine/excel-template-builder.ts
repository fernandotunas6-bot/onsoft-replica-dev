import ExcelJS from "exceljs";
import { FIELD_CATALOG, type ModuleFieldCatalog, type FieldDefinition } from "./field-catalog";
import { OFFICIAL_TEMPLATES } from "../official-templates";
import type { ImportModule } from "../schemas";

/**
 * Constrói uma pasta de trabalho Excel (.xlsx) profissional de 6 abas
 * para o módulo especificado em conformidade com os padrões do SIGA.
 */
export async function buildOfficialExcelTemplate(moduleKey: ImportModule): Promise<Buffer> {
  let catalog: ModuleFieldCatalog | undefined = FIELD_CATALOG[moduleKey];
  if (!catalog) {
    const fallbackTemplate = OFFICIAL_TEMPLATES[moduleKey];
    if (fallbackTemplate) {
      catalog = {
        module: moduleKey,
        label: fallbackTemplate.label,
        description: `Modelo oficial de dados para ${fallbackTemplate.label}`,
        naturalKey: [fallbackTemplate.columns[0]?.key || "id"],
        fields: fallbackTemplate.columns.map((c) => ({
          key: c.key,
          label: c.header,
          description: c.description,
          type: c.type,
          required: c.required,
          example: c.example,
          aliases: [c.key, c.header.toLowerCase()],
        })),
      };
    } else {
      throw new Error(`Módulo "${moduleKey}" não encontrado no catálogo de importação.`);
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIGA — Sistema Integrado de Gestão Académica";
  workbook.lastModifiedBy = "SIGA Data Import Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  // ---------------------------------------------------------------------------
  // 1. ABA: LEIA-ME
  // ---------------------------------------------------------------------------
  const sheetReadme = workbook.addWorksheet("LEIA-ME", {
    properties: { tabColor: { argb: "FF2563EB" } },
  });
  sheetReadme.views = [{ showGridLines: true }];

  sheetReadme.getColumn(1).width = 5;
  sheetReadme.getColumn(2).width = 30;
  sheetReadme.getColumn(3).width = 70;

  sheetReadme.addRow([]);
  const titleRow = sheetReadme.addRow([
    "",
    "SIGA — MODELO OFICIAL DE IMPORTAÇÃO",
    catalog.label.toUpperCase(),
  ]);
  titleRow.font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };

  sheetReadme.addRow([]);
  const descRow = sheetReadme.addRow([
    "",
    "Descrição do Módulo:",
    catalog.description,
  ]);
  descRow.font = { italic: true, size: 11 };

  sheetReadme.addRow([]);
  sheetReadme.addRow(["", "INSTRUÇÕES IMPORTANTES DE PREENCHIMENTO:", ""]);
  sheetReadme.lastRow!.font = { bold: true, size: 12, color: { argb: "FFB91C1C" } };

  const instructions = [
    ["1. Inserção de Dados", "Insira os seus dados exclusivamente na aba \"DADOS\". Não altere os nomes dos cabeçalhos na primeira linha."],
    ["2. Campos Obrigatórios", "As colunas com o símbolo (*) no cabeçalho e destacadas a azul escuro são obrigatórias."],
    ["3. Formato de Datas", "Insira datas no formato AAAA-MM-DD (exemplo: 2010-04-15) para evitar erros de leitura."],
    ["4. Identificadores Humanos", "Não é necessário preencher UUIDs ou códigos técnicos. Use Nº de Processo, BI, ou Nome da Turma."],
    ["5. Validações Automáticas", "Alguns campos possuem listas suspensas (ex: Sexo, Turno). Selecione a opção directamente na célula."],
    ["6. Exemplos de Referência", "Consulte a aba \"EXEMPLOS\" para visualizar linhas modelo com preenchimento correto."],
    ["7. Aba METADADOS", "A aba \"METADADOS\" contém assinaturas técnicas do SIGA. Não a remova nem a modifique."],
  ];

  for (const [topic, desc] of instructions) {
    const row = sheetReadme.addRow(["", topic, desc]);
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { wrapText: true };
  }

  // ---------------------------------------------------------------------------
  // 2. ABA: DADOS
  // ---------------------------------------------------------------------------
  const sheetData = workbook.addWorksheet("DADOS", {
    properties: { tabColor: { argb: "FF059669" } },
  });
  sheetData.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

  // Cabeçalhos
  const headerLabels = catalog.fields.map(
    (f) => `${f.label}${f.required ? " *" : ""}`,
  );
  const headerRow = sheetData.addRow(headerLabels);
  headerRow.height = 30;

  headerRow.eachCell((cell, colNumber) => {
    const field = catalog.fields[colNumber - 1];
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.required ? "FF1E3A8A" : "FF374151" },
    };
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  // Larguras das colunas
  catalog.fields.forEach((field, index) => {
    const col = sheetData.getColumn(index + 1);
    const minWidth = Math.max(field.label.length + 6, 18);
    col.width = Math.min(minWidth, 35);
  });

  // Validações por coluna para células de dados
  catalog.fields.forEach((field, colIdx) => {
    if (field.options && field.options.length > 0) {
      const colLetter = sheetData.getColumn(colIdx + 1).letter;
      sheetData.dataValidations.add(`${colLetter}2:${colLetter}100`, {
        type: "list",
        allowBlank: !field.required,
        formulae: [`"${field.options.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Valor Inválido",
        error: `Selecione uma das opções: ${field.options.join(", ")}`,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. ABA: EXEMPLOS
  // ---------------------------------------------------------------------------
  const sheetExamples = workbook.addWorksheet("EXEMPLOS", {
    properties: { tabColor: { argb: "FFD97706" } },
  });
  sheetExamples.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

  const exHeaderRow = sheetExamples.addRow(headerLabels);
  exHeaderRow.height = 25;
  exHeaderRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };
    cell.font = { bold: true, color: { argb: "FF1F2937" } };
  });

  // Linha de exemplo 1 baseada no catálogo
  const exampleRowValues1 = catalog.fields.map((f) => f.example || "—");
  sheetExamples.addRow(exampleRowValues1);

  // Linha de exemplo 2 (variando dados para teste)
  const exampleRowValues2 = catalog.fields.map((f) => {
    if (f.key === "full_name") return "Teresa Domingos de Oliveira";
    if (f.key === "gender") return "F";
    if (f.key === "student_number") return "2026-0043";
    if (f.key === "national_id") return "009876543LA099";
    if (f.key === "phone") return "931223344";
    if (f.key === "email") return "teresa.oliveira@escola.ao";
    return f.example || "—";
  });
  sheetExamples.addRow(exampleRowValues2);

  catalog.fields.forEach((_, idx) => {
    sheetExamples.getColumn(idx + 1).width = sheetData.getColumn(idx + 1).width;
  });

  // ---------------------------------------------------------------------------
  // 4. ABA: LISTAS
  // ---------------------------------------------------------------------------
  const sheetLists = workbook.addWorksheet("LISTAS", {
    properties: { tabColor: { argb: "FF6B7280" } },
  });
  sheetLists.addRow(["CAMPO", "VALORES PERMITIDOS / ACEITES"]);
  sheetLists.getRow(1).font = { bold: true };
  sheetLists.getColumn(1).width = 25;
  sheetLists.getColumn(2).width = 50;

  catalog.fields
    .filter((f) => f.options && f.options.length > 0)
    .forEach((f) => {
      sheetLists.addRow([f.label, f.options!.join(" | ")]);
    });

  // ---------------------------------------------------------------------------
  // 5. ABA: REFERÊNCIAS
  // ---------------------------------------------------------------------------
  const sheetRefs = workbook.addWorksheet("REFERENCIAS", {
    properties: { tabColor: { argb: "FF6B7280" } },
  });
  sheetRefs.addRow(["CAMPO", "OBRIGATÓRIO", "TIPO DE DADO", "DESCRIÇÃO DETALHADA"]);
  sheetRefs.getRow(1).font = { bold: true };
  sheetRefs.getColumn(1).width = 30;
  sheetRefs.getColumn(2).width = 15;
  sheetRefs.getColumn(3).width = 15;
  sheetRefs.getColumn(4).width = 60;

  catalog.fields.forEach((f) => {
    sheetRefs.addRow([
      f.label,
      f.required ? "Sim (Obrigatório)" : "Não (Opcional)",
      f.type.toUpperCase(),
      f.description,
    ]);
  });

  // ---------------------------------------------------------------------------
  // 6. ABA: METADADOS (Técnica do SIGA)
  // ---------------------------------------------------------------------------
  const sheetMeta = workbook.addWorksheet("METADADOS", {
    properties: { tabColor: { argb: "FF111827" } },
  });
  sheetMeta.addRow(["CHAVE", "VALOR"]);
  sheetMeta.addRow(["SISTEMA", "SIGA"]);
  sheetMeta.addRow(["FORMATO", "SIGA-EXCHANGE-TEMPLATE"]);
  sheetMeta.addRow(["VERSAO", "1.0"]);
  sheetMeta.addRow(["MODULO", catalog.module]);
  sheetMeta.addRow(["DATA_GERACAO", new Date().toISOString()]);
  sheetMeta.addRow(["TOTAL_COLUNAS", catalog.fields.length.toString()]);
  sheetMeta.getColumn(1).width = 20;
  sheetMeta.getColumn(2).width = 40;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
