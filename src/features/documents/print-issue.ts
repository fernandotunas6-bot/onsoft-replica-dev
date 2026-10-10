import { getPrintTemplate, listPrintTemplates } from "@/features/documents/server";
import { getSchoolSettings } from "@/features/school/server";
import {
  buildIssuePayload,
  isPrintTemplateKey,
  matchPrintTemplateKey,
  missingAcademicData,
  type PrintSchoolContext,
  type PrintStudentContext,
} from "@/features/documents/print-catalog";
import { renderHandlebars } from "@/features/documents/render-hbs";
import { printOfficialHtml } from "@/lib/print-html";
import { printedSubjectNames } from "@/features/documents/printed-subjects";

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
  /** Valor impresso (recibos, faturas): fica no registo e aparece na verificação. */
  amountLabel?: string;
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
    // Documento de notas sem notas reais: não se emite (cai na alternativa, se houver).
    const missing = missingAcademicData(key, input.overlay);
    if (missing) throw new Error(missing);
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
    // O documento diz que se valida pelo QR ou pelo código: passa a ser verdade.
    const verification = await registerForVerification({
      title: input.tipo,
      holderName: input.student?.fullName,
      templateKey: key,
      reference: input.student?.documentTitle,
      amountLabel: input.amountLabel,
      subjects: printedSubjectNames(payload),
    });
    const document = (payload.document ?? {}) as Record<string, unknown>;
    payload.document = {
      ...document,
      hash: verification.code,
      uuid: verification.code,
      qrCodeDataUrl: verification.qrCodeDataUrl,
      verifyUrl: verification.url,
    };
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

async function registerForVerification(details: {
  title: string;
  holderName?: string | undefined;
  templateKey: string;
  reference?: string | undefined;
  amountLabel?: string | undefined;
  subjects?: string[] | undefined;
}) {
  const [{ registerIssuedDocument }, { default: QRCode }] = await Promise.all([
    import("@/features/documents/verification"),
    import("qrcode"),
  ]);
  const { code } = await registerIssuedDocument({ data: details });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/verificar?codigo=${encodeURIComponent(code)}`;
  const qrCodeDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 160 });
  return { code, url, qrCodeDataUrl };
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
