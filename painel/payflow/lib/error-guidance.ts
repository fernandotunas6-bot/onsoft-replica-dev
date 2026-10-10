/**
 * Orientação para os erros do PayFlow: o que fazer a seguir, por código da API.
 *
 * A API devolve sempre `{ error: { code, message } }` com códigos estáveis
 * (`bank_transfer_not_configured`, `student_session_expired`…). A mensagem diz
 * o que correu mal; aqui fica a forma certa de o resolver e, quando existe, o
 * sítio onde se resolve. Mesma ideia do SIGA (`src/lib/error-guidance.ts`),
 * mas o PayFlow é outra aplicação e não partilha esse código.
 *
 * Dois públicos:
 *  - `admin`: tesouraria e direcção no painel de conciliação;
 *  - `student`: aluno ou encarregado no portal de pagamento (sem termos
 *    técnicos e sem destinos internos).
 */

export type GuidanceAudience = "admin" | "student";

export type PayflowGuidance = {
  /** A forma certa de fazer, numa ou duas frases. */
  fix: string;
  /** Repetir o mesmo pedido pode resolver (rede, serviço momentaneamente em baixo). */
  retryable: boolean;
};

type Rule = {
  admin?: Omit<PayflowGuidance, "retryable">;
  student?: Omit<PayflowGuidance, "retryable">;
  retryable?: boolean;
};

/** Onde se abre o painel a partir do SIGA (conciliação PayFlow). */
export const SIGA_RECONCILIATION_HINT = "SIGA → Financeiro → Conciliação PayFlow";

const RULES: Record<string, Rule> = {
  /* Sessão e acesso */
  admin_session_required: {
    admin: { fix: `Abra o painel a partir do ${SIGA_RECONCILIATION_HINT}: a sessão vem do SIGA.` },
  },
  invalid_sso_assertion: {
    admin: { fix: `Volte ao SIGA e abra outra vez a ${SIGA_RECONCILIATION_HINT}.` },
  },
  sso_assertion_replayed: {
    admin: { fix: `Cada abertura serve uma vez. Volte ao SIGA e abra a conciliação outra vez.` },
  },
  unauthorized: {
    admin: {
      fix: `Entre pelo ${SIGA_RECONCILIATION_HINT} com uma conta de Administrador ou Tesouraria.`,
    },
  },
  refund_requires_finance_admin: {
    admin: {
      fix: "Só um Administrador da escola pode estornar. Peça-lhe que abra a conciliação a partir do SIGA.",
    },
  },
  student_session_expired: {
    student: { fix: "Identifique-se outra vez com o código da escola, o seu ID e o PIN." },
  },
  student_not_verified: {
    student: {
      fix: "Confirme o código da escola, o ID de 7 dígitos e o PIN do cartão do aluno. Se os esqueceu, peça-os à secretaria.",
    },
  },
  invalid_student_access: {
    student: { fix: "Preencha os três campos: código da escola, ID de 7 dígitos e PIN." },
  },
  student_access_limited: {
    student: { fix: "Por segurança, aguarde 5 minutos antes de tentar outra vez." },
    retryable: false,
  },

  /* Configuração da escola / plataforma */
  bank_transfer_not_configured: {
    admin: {
      fix: "Preencha titular, banco e IBAN em SIGA → Definições → Financeiro e carregue em «Sincronizar IBAN da escola com o PayFlow».",
    },
    student: {
      fix: "A escola ainda não activou a transferência bancária. Escolha outro método ou pague na tesouraria.",
    },
  },
  payment_provider_not_configured: {
    admin: {
      fix: "O método de pagamento não está activo neste ambiente. Confirme as integrações no SIGA.",
    },
    student: { fix: "Este método não está disponível agora. Escolha outro método de pagamento." },
  },
  emis_adapter_not_ready: {
    admin: {
      fix: "O Multicaixa (EMIS) ainda não está homologado. Use a transferência bancária até à activação.",
    },
    student: {
      fix: "O Multicaixa Express ainda não está disponível. Use a transferência bancária.",
    },
  },
  school_not_found: {
    admin: {
      fix: "No SIGA, em Definições → Financeiro, carregue em «Sincronizar IBAN da escola com o PayFlow» e abra a conciliação outra vez.",
    },
    student: {
      fix: "A escola ainda não está ligada aos pagamentos online. Contacte a secretaria.",
    },
  },
  school_required: {
    admin: {
      fix: "Abra a conciliação a partir do SIGA: o painel precisa de saber qual é a escola.",
    },
  },
  database_unavailable: {
    admin: { fix: "O PayFlow está a arrancar ou em manutenção. Tente dentro de alguns minutos." },
    student: { fix: "O serviço de pagamentos está em manutenção. Tente dentro de alguns minutos." },
    retryable: true,
  },

  /* Conciliação bancária */
  bank_connector_unavailable: {
    admin: {
      fix: "O banco não respondeu. Importe o extrato (CSV) do banco em vez de puxar os movimentos.",
    },
    retryable: true,
  },
  bank_connector_not_configured: {
    admin: {
      fix: "O conector bancário não está configurado. Importe o extrato (CSV) descarregado do banco.",
    },
  },
  transfer_not_found: {
    admin: {
      fix: "Confirme a referência no talão do encarregado; deve ser igual à da instrução de pagamento.",
    },
  },
  transfer_mismatch: {
    admin: {
      fix: "O valor ou a moeda no banco não batem com a fatura. Confirme o extrato; se o encarregado pagou outro valor, registe o pagamento manualmente no SIGA (Financeiro).",
    },
  },
  transfer_already_processed: {
    admin: {
      fix: "Este movimento já foi usado noutro pagamento. Procure-o na lista com o filtro «Todos».",
    },
  },
  invalid_bank_movement: {
    admin: {
      fix: "Confira o número do movimento, a data e o valor no extrato e volte a confirmar.",
    },
  },
  payment_not_pending: {
    admin: { fix: "Este pagamento já foi tratado. Actualize a lista para ver o estado actual." },
  },
  proof_required_for_manual_review: {
    admin: {
      fix: "Peça ao encarregado que envie o comprovativo no portal e confira o movimento no extrato antes de confirmar.",
    },
  },

  /* Estornos */
  refund_reason_required: {
    admin: {
      fix: "Escreva o motivo do estorno com pelo menos 8 caracteres; fica no histórico para auditoria.",
    },
  },
  payment_not_paid: {
    admin: {
      fix: "Só se estorna um pagamento liquidado; um pagamento ainda pendente não precisa de estorno.",
    },
  },

  /* Portal do aluno */
  invoice_unavailable: {
    student: { fix: "A fatura já foi paga ou anulada. Actualize a lista de cobranças." },
  },
  invalid_payment: {
    student: { fix: "Escolha uma cobrança da lista e depois o método de pagamento." },
  },
  invalid_method: {
    student: { fix: "Escolha um dos métodos mostrados para esta cobrança." },
  },
  proof_required: {
    student: { fix: "Anexe a fotografia ou o PDF do talão da transferência e envie outra vez." },
  },
  not_found: {
    student: {
      fix: "O link expirou. Peça um link novo à escola ou entre com o código da escola, o ID e o PIN.",
    },
  },
};

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

/** Orientação para um erro da API (ou de rede). `null` quando não há nada a acrescentar. */
export function payflowGuidance(
  error: { code?: unknown; message?: unknown } | null | undefined,
  audience: GuidanceAudience,
): PayflowGuidance | null {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  const rule = RULES[code];
  const forAudience = rule?.[audience];
  if (forAudience) return { ...forAudience, retryable: rule.retryable ?? false };
  if (NETWORK.test(message) || code === "network_error") {
    return {
      fix:
        audience === "student"
          ? "Confirme a ligação à internet e tente outra vez. Nada foi cobrado."
          : "Confirme a ligação à internet e tente outra vez.",
      retryable: true,
    };
  }
  if (/_failed$|^internal_error$/.test(code)) {
    return {
      fix:
        audience === "student"
          ? "Tente outra vez dentro de instantes. Se continuar, contacte a tesouraria da escola."
          : "Tente outra vez dentro de instantes. Se continuar, avise o suporte com a hora do erro.",
      retryable: true,
    };
  }
  return null;
}

/** Erro da API com o código, para o ecrã escolher a correcção. */
export class PayflowApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PayflowApiError";
    this.code = code;
  }
}

/** Lê `{ error: { code, message } }` de uma resposta falhada. */
export function apiErrorFrom(
  body: { error?: { code?: string; message?: string } } | null | undefined,
  fallback: string,
): PayflowApiError {
  return new PayflowApiError(
    body?.error?.code ?? "unknown",
    body?.error?.message?.trim() || fallback,
  );
}

/** Só para testes. */
export const PAYFLOW_GUIDANCE_CODES = Object.keys(RULES);
