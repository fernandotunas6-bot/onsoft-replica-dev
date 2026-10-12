/**
 * Verificação de autenticidade dos documentos oficiais.
 *
 * Antes, o "código de validação" impresso era um hash calculado no browser a
 * partir de dados públicos (escola, aluno, ano): qualquer pessoa o reproduzia
 * num documento forjado, o QR Code nunca era gerado e não havia onde verificar
 * — apesar de o documento dizer que havia.
 *
 * Agora cada emissão pelo fluxo oficial regista no servidor um código aleatório
 * (`audit_logs`, acção `documents.issued`). O documento leva o código e um QR
 * para `/verificar`, que confirma quem emitiu, o quê e quando. Sem migração.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { checkRateLimit, isRateLimitBypassed, recordRateLimitAttempt } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { isPrintTemplateKey, type PrintTemplateKey } from "./print-catalog";

export const ISSUED_DOCUMENT_ACTION = "documents.issued";
const ISSUER_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"];
const OFFICE_ROLES = ["Administrador", "Secretaria"];

/**
 * Quem pode emitir cada modelo. O código de verificação diz «autêntico» sobre o
 * que o emissor escreveu (título, titular, valor): um professor emitir um
 * certificado de habilitações ou um recibo, verificável como autêntico, não
 * pode acontecer. O professor emite os documentos pedagógicos da sua turma; a
 * Secretaria e a Direcção emitem tudo.
 */
const TEMPLATE_ISSUERS: Record<PrintTemplateKey, readonly string[]> = {
  "talao-candidatura": OFFICE_ROLES,
  "talao-matricula": OFFICE_ROLES,
  "folha-credenciais": OFFICE_ROLES,
  "dossie-academico": OFFICE_ROLES,
  // Recibos, facturas e relatórios financeiros saem por este modelo.
  "service-document": [...OFFICE_ROLES, "Tesouraria"],
  "historico-academico-individual": OFFICE_ROLES,
  "certificado-habilitacoes": OFFICE_ROLES,
  "declaracao-notas-simples": OFFICE_ROLES,
  "pauta-disciplinar": [...OFFICE_ROLES, "Professor"],
  "pauta-geral-turma": [...OFFICE_ROLES, "Professor"],
  "boletim-escolar": [...OFFICE_ROLES, "Professor"],
  "diario-pedagogico-professor": [...OFFICE_ROLES, "Professor"],
  "acta-conselho-notas": [...OFFICE_ROLES, "Professor"],
  "relatorio-validacao-notas": [...OFFICE_ROLES, "Professor"],
  "mapa-estatistico-aproveitamento": [...OFFICE_ROLES, "Professor"],
};
/** Um valor impresso (recibo, factura) só da Direcção, Secretaria ou Tesouraria. */
const AMOUNT_ISSUERS = [...OFFICE_ROLES, "Tesouraria"];

/** Papel que aparece na verificação («emitido pela Secretaria»), o mais alto que permite emitir. */
export function issuerRoleFor(
  roles: readonly string[],
  templateKey: PrintTemplateKey,
  hasAmount: boolean,
): string | null {
  const allowed = hasAmount
    ? TEMPLATE_ISSUERS[templateKey].filter((role) => AMOUNT_ISSUERS.includes(role))
    : TEMPLATE_ISSUERS[templateKey];
  return (
    ["Administrador", "Secretaria", "Tesouraria", "Professor"].find(
      (role) => allowed.includes(role) && roles.includes(role),
    ) ?? null
  );
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^SIGA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const ISSUE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 300 };
const VERIFY_RATE_LIMIT = { windowMs: 60 * 1000, max: 20 };

/** 8 caracteres de um alfabeto de 32 (40 bits): não se adivinha com 20 tentativas/min. */
export function generateVerificationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `SIGA-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function normalizeVerificationCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isVerificationCode(value: string): boolean {
  return CODE_RE.test(normalizeVerificationCode(value));
}

/** "Ana Domingos Ferreira" → "A. D. F.": confirma sem expor o nome a quem só tem o código. */
export function maskHolderName(name: string | null | undefined): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length ? parts.map((part) => `${part[0]!.toUpperCase()}.`).join(" ") : "—";
}

const registerInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  holderName: z.string().trim().max(160).optional(),
  templateKey: z.string().trim().refine(isPrintTemplateKey, "Modelo de documento não reconhecido."),
  /** Número do documento (recibo, fatura…) e valor, para confirmar o que está impresso. */
  reference: z.string().trim().max(80).optional(),
  amountLabel: z.string().trim().max(60).optional(),
  /** Disciplinas tal como impressas (printed-subjects.ts): o nome à data da emissão. */
  subjects: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
});

export const registerIssuedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => registerInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    if (!ISSUER_ROLES.some((role) => roles.includes(role))) {
      throw new Error("Sem permissão para emitir documentos oficiais.");
    }
    const templateKey = data.templateKey as PrintTemplateKey;
    const issuerRole = issuerRoleFor(roles, templateKey, Boolean(data.amountLabel));
    if (!issuerRole) {
      throw new Error(
        data.amountLabel
          ? "Documentos com valor só são emitidos pela Direcção, Secretaria ou Tesouraria."
          : "Este documento é emitido pela Secretaria ou pela Direcção.",
      );
    }
    const rateLimitKey = `document_issue:${context.userId}`;
    if (!isRateLimitBypassed(rateLimitKey)) {
      if (!checkRateLimit([rateLimitKey], ISSUE_RATE_LIMIT)) {
        throw new Error("Demasiados documentos emitidos numa hora. Tente mais tarde.");
      }
      recordRateLimitAttempt([rateLimitKey], ISSUE_RATE_LIMIT);
    }

    const db = await loadSgaAdminClient();
    const code = generateVerificationCode();
    const issuedAt = new Date().toISOString();
    // Ao contrário do resto da auditoria, esta escrita não pode falhar em
    // silêncio: sem o registo, o documento diria que é verificável e não é.
    const { error } = await db.from("audit_logs").insert({
      school_id: membership.schoolId,
      actor_user_id: context.userId,
      action: ISSUED_DOCUMENT_ACTION,
      entity_type: "issued_document",
      entity_id: crypto.randomUUID(),
      metadata: {
        code,
        title: data.title,
        holder: data.holderName ?? null,
        template: templateKey,
        issuer_role: issuerRole,
        reference: data.reference ?? null,
        amount: data.amountLabel ?? null,
        subjects: data.subjects?.length ? data.subjects : null,
        school_name: membership.schoolName ?? null,
        issued_at: issuedAt,
      },
    });
    if (error) throw publicDatabaseError(error, "Não foi possível registar o documento emitido.");
    return { code, issuedAt };
  });

const verifyInputSchema = z.object({ code: z.string().trim().min(4).max(40) });

export type DocumentVerification =
  | { valid: false }
  | {
      valid: true;
      title: string;
      schoolName: string;
      holder: string;
      issuedAt: string;
      reference: string | null;
      amount: string | null;
      issuerRole: string | null;
      /** Disciplinas com o nome que tinham no dia da emissão (só documentos com disciplinas). */
      subjects: string[];
    };

/** Pública (sem sessão): quem recebe o documento verifica-o. */
export const verifyIssuedDocument = createServerFn({ method: "GET" })
  .validator((input: unknown) => verifyInputSchema.parse(input))
  .handler(async ({ data }): Promise<DocumentVerification> => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const rateLimitKey = `document_verify:${ip}`;
    // Partilhado entre instâncias: adivinhar códigos de documentos espalhando
    // pedidos pelas instâncias não foge ao limite.
    if (
      !isRateLimitBypassed(rateLimitKey) &&
      !(await consumeRateLimit([rateLimitKey], VERIFY_RATE_LIMIT))
    ) {
      throw new Error("Demasiadas verificações. Aguarde um minuto.");
    }

    const code = normalizeVerificationCode(data.code);
    if (!isVerificationCode(code)) return { valid: false };

    const db = await loadSgaAdminClient();
    const { data: row } = await db
      .from("audit_logs")
      .select("school_id, metadata, occurred_at")
      .eq("action", ISSUED_DOCUMENT_ACTION)
      .eq("metadata->>code", code)
      .limit(1)
      .maybeSingle();
    if (!row) return { valid: false };

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    let schoolName = typeof meta.school_name === "string" ? meta.school_name : "";
    if (!schoolName) {
      const { data: school } = await db
        .from("schools")
        .select("name")
        .eq("id", row.school_id)
        .maybeSingle();
      schoolName = school?.name ?? "Escola";
    }
    return {
      valid: true,
      title: typeof meta.title === "string" ? meta.title : "Documento",
      schoolName,
      holder: maskHolderName(typeof meta.holder === "string" ? meta.holder : null),
      issuedAt: typeof meta.issued_at === "string" ? meta.issued_at : String(row.occurred_at),
      reference: typeof meta.reference === "string" ? meta.reference : null,
      amount: typeof meta.amount === "string" ? meta.amount : null,
      issuerRole: typeof meta.issuer_role === "string" ? meta.issuer_role : null,
      subjects: Array.isArray(meta.subjects)
        ? meta.subjects.filter((s): s is string => typeof s === "string")
        : [],
    };
  });
