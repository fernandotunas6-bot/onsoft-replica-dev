"use client"

import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { ContactSection } from "@/app/landing/components/contact-section"

/**
 * Contacto comercial. Usa o mesmo formulário da landing: a mensagem fica guardada
 * para a equipa (ADMIN → Mensagens de contacto) e, sem ligação ao SIGA, abre o
 * e-mail pronto para o suporte. O formulário anterior desta página dizia
 * «Pedido registado» sem enviar nada.
 */
export default function MailPage() {
  return (
    <MarketingLayout variant="fullBleed">
      <ContactSection />
    </MarketingLayout>
  )
}
