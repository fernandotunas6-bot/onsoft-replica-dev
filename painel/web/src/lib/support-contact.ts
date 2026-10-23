/** Caixa de suporte do SIGA Plus (encaminhada; ver docs/email/OVERVIEW.md). */
export const SUPPORT_EMAIL = "suporte@portal-siga.com"

export type SupportMessage = {
  name: string
  school?: string
  subject: string
  message: string
}

/**
 * O site não guarda mensagens: o formulário de contacto prepara o e-mail no programa de
 * e-mail do visitante, para o suporte, e é o visitante que o envia (fica com cópia e
 * recebe a resposta no seu endereço).
 */
export function supportMailto({ name, school, subject, message }: SupportMessage): string {
  const signature = `— ${name}${school ? `, ${school}` : ""}`
  const body = `${message}\n\n${signature}`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
