import { getPrintTemplate, listPrintTemplates } from "@/features/documents/server";
import {
  buildIssuePayload,
  isPrintTemplateKey,
  matchPrintTemplateKey,
  type PrintSchoolContext,
  type PrintStudentContext,
} from "@/features/documents/print-catalog";
import { renderHandlebars } from "@/features/documents/render-hbs";
import { printOfficialHtml } from "@/lib/print-html";

export function mergePrintPayload(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = next[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      next[key] = {
        ...(current as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else {
      next[key] = value;
    }
  }
  return next;
}

export async function issuePrintDocument(input: {
  tipo: string;
  school: PrintSchoolContext;
  student?: PrintStudentContext;
  overlay?: Record<string, unknown>;
  fallback?: () => void;
}) {
  try {
    const catalog = await listPrintTemplates();
    const key = matchPrintTemplateKey(input.tipo, {
      ...(catalog.issue ? { issue: catalog.issue } : {}),
      byType: catalog.byType,
    });
    const template = await getPrintTemplate({ data: { key } });
    const student = input.student ?? {
      fullName: input.school.name || "Escola SIGA",
      academicNumber: "—",
      documentTitle: input.tipo,
    };
    const payload = mergePrintPayload(
      buildIssuePayload(input.school, student, template.css),
      input.overlay ?? {},
    );
    printOfficialHtml(renderHandlebars(template.source, payload));
    return key;
  } catch (error) {
    if (input.fallback) {
      input.fallback();
      return null;
    }
    throw error;
  }
}

export async function loadPublicPrintAssets(key: string) {
  if (!isPrintTemplateKey(key)) throw new Error("Modelo de impressão não reconhecido.");
  const [sourceRes, cssRes] = await Promise.all([
    fetch(`/templates/${key}.hbs`),
    fetch("/templates/base.css"),
  ]);
  if (!sourceRes.ok || !cssRes.ok) {
    throw new Error("Não foi possível carregar o modelo público.");
  }
  return {
    source: await sourceRes.text(),
    css: await cssRes.text(),
  };
}

export async function printBundledTemplate(input: {
  key: string;
  school: PrintSchoolContext;
  student?: PrintStudentContext;
  overlay?: Record<string, unknown>;
}) {
  const assets = await loadPublicPrintAssets(input.key);
  const student = input.student ?? {
    fullName: "Candidato",
    academicNumber: "CAND",
  };
  const payload = mergePrintPayload(
    buildIssuePayload(input.school, student, assets.css),
    input.overlay ?? {},
  );
  printOfficialHtml(renderHandlebars(assets.source, payload));
}
