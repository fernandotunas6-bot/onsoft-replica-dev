import { getPrintTemplate, listPrintTemplates } from "@/features/documents/server";
import { getSchoolSettings } from "@/features/school/server";
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

/** Preenche a identidade da escola a partir das definições reais.
 *
 * Vários chamadores só passam `{ name, academicYear }`, e o resto caía nos valores
 * de demonstração do payload — documentos oficiais saíam com "NIF 5000000000" e
 * "Luanda, Angola" impressos. O que o chamador indica continua a mandar; as
 * definições só tapam o que ficou por preencher.
 */
async function resolveIssuingSchool(school: PrintSchoolContext): Promise<PrintSchoolContext> {
  try {
    const settings = await getSchoolSettings();
    const pick = (given: string | null | undefined, stored: string | null | undefined) =>
      given?.toString().trim() || stored || undefined;
    return {
      ...school,
      name: pick(school.name, settings.name) ?? school.name,
      nif: pick(school.nif, settings.nif),
      phone: pick(school.phone, settings.phone),
      email: pick(school.email, settings.email),
      address: pick(school.address, settings.address),
      directorName: pick(school.directorName, settings.director_name),
      academicYear: pick(school.academicYear, settings.academic_year),
      logoUrl: pick(school.logoUrl, settings.branding?.logo_url),
      schoolType: settings.institution?.school_type ?? null,
    };
  } catch {
    // Sem definições acessíveis, imprime-se com o que o chamador deu.
    return school;
  }
}

export async function issuePrintDocument(input: {
  tipo: string;
  school: PrintSchoolContext;
  student?: PrintStudentContext;
  overlay?: Record<string, unknown>;
  fallback?: () => void;
}) {
  try {
    const [catalog, school] = await Promise.all([
      listPrintTemplates(),
      resolveIssuingSchool(input.school),
    ]);
    const key = matchPrintTemplateKey(input.tipo, {
      ...(catalog.issue ? { issue: catalog.issue } : {}),
      byType: catalog.byType,
    });
    const template = await getPrintTemplate({ data: { key } });
    const student = input.student ?? {
      fullName: school.name || "Escola SIGA",
      academicNumber: "—",
      documentTitle: input.tipo,
    };
    const payload = mergePrintPayload(
      buildIssuePayload(school, student, template.css),
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
