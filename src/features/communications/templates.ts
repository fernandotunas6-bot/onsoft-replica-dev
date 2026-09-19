export type TemplateCategory = "auth" | "academic" | "finance" | "notices";

export interface CommunicationTemplate {
  slug: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  variables: string[];
  description: string;
  defaultText: string;
  defaultHtml: string;
  render: (vars: Record<string, string>) => { subject: string; text: string; html: string };
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function interpolate(content: string, vars: Record<string, string>, escape = false): string {
  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    const val = vars[key] ?? "";
    return escape ? escapeHtml(val) : val;
  });
}

export const OFFICIAL_COMMUNICATION_TEMPLATES: Record<string, CommunicationTemplate> = {
  ACCOUNT_WELCOME: {
    slug: "ACCOUNT_WELCOME",
    name: "Boas-vindas à Conta",
    category: "auth",
    subject: "Bem-vindo ao SIGA Plus — {{SCHOOL_NAME}}",
    variables: ["FIRST_NAME", "SCHOOL_NAME", "PORTAL_URL", "LOGIN_EMAIL"],
    description: "Enviado automaticamente quando uma nova conta de utilizador é ativada.",
    defaultText:
      "Olá {{FIRST_NAME}},\n\nA sua conta no {{SCHOOL_NAME}} foi criada com sucesso.\nPode aceder ao portal com o e-mail {{LOGIN_EMAIL}} através do link: {{PORTAL_URL}}",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a;">Bem-vindo ao {{SCHOOL_NAME}}</h2>
        <p>Olá <strong>{{FIRST_NAME}}</strong>,</p>
        <p>A sua conta foi configurada com sucesso no sistema SIGA Plus.</p>
        <p style="margin: 24px 0;">
          <a href="{{PORTAL_URL}}" style="background: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Aceder ao Portal
          </a>
        </p>
        <p style="color: #64748b; font-size: 13px;">E-mail de acesso: {{LOGIN_EMAIL}}</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  EMAIL_VERIFICATION: {
    slug: "EMAIL_VERIFICATION",
    name: "Verificação de E-mail (OTP)",
    category: "auth",
    subject: "Código de Verificação: {{OTP_CODE}} — {{SCHOOL_NAME}}",
    variables: ["FIRST_NAME", "SCHOOL_NAME", "OTP_CODE", "EXPIRY_MINUTES"],
    description: "Enviado para validar e-mail durante cadastro ou alteração de endereço.",
    defaultText:
      "{{SCHOOL_NAME}}: O seu código de verificação é {{OTP_CODE}}. Válido por {{EXPIRY_MINUTES}} minutos.",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 460px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
        <h3 style="color: #0f172a; margin-bottom: 8px;">Código de Verificação</h3>
        <p style="color: #64748b; font-size: 14px;">{{SCHOOL_NAME}}</p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0f172a; margin: 20px 0;">
          {{OTP_CODE}}
        </div>
        <p style="color: #64748b; font-size: 12px;">Válido por {{EXPIRY_MINUTES}} minutos. Não partilhe com ninguém.</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  PASSWORD_RESET: {
    slug: "PASSWORD_RESET",
    name: "Recuperação de Senha",
    category: "auth",
    subject: "Redefinir Palavra-passe — {{SCHOOL_NAME}}",
    variables: ["FIRST_NAME", "SCHOOL_NAME", "RESET_LINK"],
    description: "Enviado quando o utilizador solicita redefinição de palavra-passe.",
    defaultText:
      "Olá {{FIRST_NAME}},\n\nRecebemos um pedido de redefinição de palavra-passe no {{SCHOOL_NAME}}.\nClique no link para continuar: {{RESET_LINK}}",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #0f172a;">Recuperação de Acesso</h3>
        <p>Olá <strong>{{FIRST_NAME}}</strong>,</p>
        <p>Recebemos uma solicitação para alterar a sua palavra-passe no <strong>{{SCHOOL_NAME}}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="{{RESET_LINK}}" style="background: #0f172a; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Redefinir Palavra-passe
          </a>
        </p>
        <p style="color: #64748b; font-size: 12px;">Se não solicitou esta alteração, desconsidere esta mensagem com segurança.</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  STUDENT_ENROLLED: {
    slug: "STUDENT_ENROLLED",
    name: "Confirmação de Matrícula",
    category: "academic",
    subject: "Matrícula Confirmada: {{STUDENT_NAME}} — {{SCHOOL_NAME}}",
    variables: ["GUARDIAN_NAME", "STUDENT_NAME", "GRADE_ROOM", "ACADEMIC_YEAR", "SCHOOL_NAME"],
    description: "Disparado após validação da matrícula ou renovação do aluno.",
    defaultText:
      "Exmo(a) {{GUARDIAN_NAME}},\n\nConfirmamos a matrícula do(a) aluno(a) {{STUDENT_NAME}} no ano lectivo {{ACADEMIC_YEAR}} ({{GRADE_ROOM}}).\nAtenciosamente,\n{{SCHOOL_NAME}}",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #0f172a;">Confirmação Oficial de Matrícula</h3>
        <p>Exmo(a) Encarregado(a) <strong>{{GUARDIAN_NAME}}</strong>,</p>
        <p>É com satisfação que confirmamos a matrícula do(a) aluno(a):</p>
        <div style="background: #f8fafc; border-left: 4px solid #0f172a; padding: 12px 16px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold;">{{STUDENT_NAME}}</p>
          <p style="margin: 4px 0 0; font-size: 14px; color: #475569;">Ano / Turma: {{GRADE_ROOM}} &bull; Ano Lectivo: {{ACADEMIC_YEAR}}</p>
        </div>
        <p style="font-size: 13px; color: #64748b;">Com os melhores cumprimentos,<br />{{SCHOOL_NAME}}</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  PAYMENT_RECEIPT: {
    slug: "PAYMENT_RECEIPT",
    name: "Recibo de Pagamento (Payflow)",
    category: "finance",
    subject: "Recibo {{RECEIPT_NUMBER}}: {{AMOUNT}} AOA — {{SCHOOL_NAME}}",
    variables: [
      "PAYER_NAME",
      "STUDENT_NAME",
      "AMOUNT",
      "RECEIPT_NUMBER",
      "MONTH_LABEL",
      "SCHOOL_NAME",
    ],
    description: "Enviado aos encarregados após liquidação de propinas ou emolumentos.",
    defaultText:
      "Olá {{PAYER_NAME}},\n\nConfirmamos a liquidação de {{AMOUNT}} AOA referente a {{MONTH_LABEL}} (Aluno: {{STUDENT_NAME}}). Recibo n.º {{RECEIPT_NUMBER}} emitido.\n{{SCHOOL_NAME}}",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="text-align: right; font-size: 12px; color: #64748b;">Recibo n.º {{RECEIPT_NUMBER}}</div>
        <h3 style="color: #0f172a; margin-top: 4px;">Comprovativo de Pagamento</h3>
        <p>Prezado(a) <strong>{{PAYER_NAME}}</strong>,</p>
        <p>Confirmamos o pagamento com sucesso:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b;">Aluno:</td>
            <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{STUDENT_NAME}}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b;">Referente a:</td>
            <td style="padding: 8px 0; text-align: right;">{{MONTH_LABEL}}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; font-size: 16px; font-weight: bold;">Valor Liquidado:</td>
            <td style="padding: 12px 0; font-size: 18px; font-weight: bold; text-align: right; color: #0f172a;">{{AMOUNT}} AOA</td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Processado de forma segura via SIGA Payflow</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  PAYMENT_OVERDUE: {
    slug: "PAYMENT_OVERDUE",
    name: "Aviso de Propina Vencida",
    category: "finance",
    subject: "Aviso de Pagamento: Propina de {{MONTH_LABEL}} — {{SCHOOL_NAME}}",
    variables: ["PAYER_NAME", "STUDENT_NAME", "AMOUNT", "DUE_DATE", "MONTH_LABEL", "SCHOOL_NAME"],
    description: "Lembrete amistoso para propinas com prazo de vencimento ultrapassado.",
    defaultText:
      "Exmo(a) {{PAYER_NAME}},\n\nInformamos que a propina de {{MONTH_LABEL}} do(a) aluno(a) {{STUDENT_NAME}} ({{AMOUNT}} AOA) venceu em {{DUE_DATE}}.\nSolicitamos a regularização junto da secretaria ou via portal.\n{{SCHOOL_NAME}}",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #0f172a;">Aviso de Mensalidade Escolar</h3>
        <p>Prezado(a) Encarregado(a) <strong>{{PAYER_NAME}}</strong>,</p>
        <p>Esperamos que este contacto o encontre bem. Lembramos que a propina do mês de <strong>{{MONTH_LABEL}}</strong> respeitante ao aluno <strong>{{STUDENT_NAME}}</strong> teve o seu vencimento a <strong>{{DUE_DATE}}</strong>.</p>
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0;">
          <p style="margin: 0; font-size: 14px; color: #991b1b;">Valor pendente: <strong>{{AMOUNT}} AOA</strong></p>
        </div>
        <p style="font-size: 13px; color: #64748b;">Agradecemos a atenção dispensada e permanecemos ao dispor para qualquer esclarecimento.<br />{{SCHOOL_NAME}}</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  GRADE_PUBLISHED: {
    slug: "GRADE_PUBLISHED",
    name: "Publicação de Pauta / Notas",
    category: "academic",
    subject: "Notas Publicadas: {{SUBJECT_NAME}} ({{TERM_LABEL}}) — {{SCHOOL_NAME}}",
    variables: [
      "STUDENT_NAME",
      "SUBJECT_NAME",
      "TERM_LABEL",
      "GRADE_VALUE",
      "SCHOOL_NAME",
      "PORTAL_URL",
    ],
    description: "Notificação imediata aos pais quando uma nota é lançada ou homologada.",
    defaultText:
      "{{SCHOOL_NAME}}: Foi publicada a nota de {{SUBJECT_NAME}} ({{TERM_LABEL}}) do aluno {{STUDENT_NAME}}: {{GRADE_VALUE}} valores.\nConsulte o portal: {{PORTAL_URL}}",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #0f172a;">Novas Avaliações Disponíveis</h3>
        <p>Informamos que foram disponibilizadas as notas da disciplina <strong>{{SUBJECT_NAME}}</strong> ({{TERM_LABEL}}) para o aluno <strong>{{STUDENT_NAME}}</strong>.</p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <div style="font-size: 28px; font-weight: bold; color: #0f172a;">{{GRADE_VALUE}} <span style="font-size: 14px; font-weight: normal; color: #64748b;">valores</span></div>
        </div>
        <p style="text-align: center;">
          <a href="{{PORTAL_URL}}" style="color: #0f172a; font-weight: bold; text-decoration: underline; font-size: 14px;">Consultar Pauta Completa no Portal</a>
        </p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  ABSENCE_ALERT: {
    slug: "ABSENCE_ALERT",
    name: "Alerta de Falta do Aluno",
    category: "academic",
    subject: "Registo de Falta: {{STUDENT_NAME}} — {{SCHOOL_NAME}}",
    variables: ["GUARDIAN_NAME", "STUDENT_NAME", "SUBJECT_NAME", "ABSENCE_DATE", "SCHOOL_NAME"],
    description: "Alerta de ausência para ciência imediata dos pais/encarregados.",
    defaultText:
      "{{SCHOOL_NAME}}: Foi registada falta ao aluno {{STUDENT_NAME}} na disciplina {{SUBJECT_NAME}} na data {{ABSENCE_DATE}}.",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #0f172a;">Notificação de Assiduidade</h3>
        <p>Prezado(a) Encarregado(a) <strong>{{GUARDIAN_NAME}}</strong>,</p>
        <p>Informamos que foi registada ausência do(a) aluno(a) <strong>{{STUDENT_NAME}}</strong>:</p>
        <ul style="color: #334155; font-size: 14px; line-height: 1.6;">
          <li><strong>Disciplina:</strong> {{SUBJECT_NAME}}</li>
          <li><strong>Data:</strong> {{ABSENCE_DATE}}</li>
        </ul>
        <p style="font-size: 12px; color: #64748b;">Caso a falta tenha sido justificada previamente, queira por favor desconsiderar este aviso.<br />{{SCHOOL_NAME}}</p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, true),
      };
    },
  },

  SCHOOL_ANNOUNCEMENT: {
    slug: "SCHOOL_ANNOUNCEMENT",
    name: "Comunicado Geral da Direção",
    category: "notices",
    subject: "{{ANNOUNCEMENT_TITLE}} — {{SCHOOL_NAME}}",
    variables: ["RECIPIENT_NAME", "ANNOUNCEMENT_TITLE", "ANNOUNCEMENT_BODY", "SCHOOL_NAME"],
    description: "Template institucional padrão para transmissão de circulares e avisos.",
    defaultText:
      "{{SCHOOL_NAME}} — {{ANNOUNCEMENT_TITLE}}\n\n{{ANNOUNCEMENT_BODY}}\n\nAtenciosamente,\nA Direção",
    defaultHtml: `
      <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">{{ANNOUNCEMENT_TITLE}}</h2>
        <p style="color: #64748b; font-size: 13px; margin-bottom: 20px;">Comunicado Institucional &bull; {{SCHOOL_NAME}}</p>
        <div style="font-size: 15px; line-height: 1.6; color: #1e293b;">
          {{ANNOUNCEMENT_BODY}}
        </div>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 13px; color: #64748b; margin: 0;">Com os melhores cumprimentos,<br /><strong>A Direção &bull; {{SCHOOL_NAME}}</strong></p>
      </div>
    `,
    render(vars) {
      return {
        subject: interpolate(this.subject, vars),
        text: interpolate(this.defaultText, vars),
        html: interpolate(this.defaultHtml, vars, false),
      };
    },
  },
};

export function getOfficialTemplate(slug: string): CommunicationTemplate | undefined {
  return OFFICIAL_COMMUNICATION_TEMPLATES[slug];
}

export function listOfficialTemplates(): CommunicationTemplate[] {
  return Object.values(OFFICIAL_COMMUNICATION_TEMPLATES);
}
