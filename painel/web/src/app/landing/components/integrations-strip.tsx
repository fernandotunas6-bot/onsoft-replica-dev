import { Landmark } from "lucide-react"
import { assetUrl } from "@/lib/utils"

type Integration = { name: string; role: string; logo?: string }

/**
 * Integrações que o SIGA suporta hoje (catálogo do SIGA: src/features/integrations/catalog.ts),
 * com os mesmos logótipos de public/brands. São serviços com que o SIGA se liga, não clientes.
 */
const INTEGRATIONS: Integration[] = [
  { name: "Multicaixa Express", role: "Pagamentos", logo: "brands/multicaixa.svg" },
  { name: "Unitel Money", role: "Pagamentos", logo: "brands/unitel.svg" },
  { name: "PayFlow", role: "Cobrança e recibos", logo: "brands/payflow-icon.png" },
  { name: "AGT", role: "Facturação", logo: "brands/agt.svg" },
  { name: "SIGE", role: "Gestão educativa nacional" },
  { name: "WhatsApp Business", role: "Comunicação", logo: "brands/whatsapp.png" },
  { name: "E-mail (Resend)", role: "Comunicação", logo: "brands/resend-mark.svg" },
  { name: "Google Calendar", role: "Calendário", logo: "brands/gcal.png" },
  { name: "Apple Calendar", role: "Calendário", logo: "brands/apple-calendar.svg" },
  { name: "Zoom", role: "Aulas à distância", logo: "brands/zoom.png" },
]

export function IntegrationsStrip() {
  return (
    <section aria-labelledby="integrations-title" className="pt-12 pb-12 sm:pb-16 lg:pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="integrations-title" className="text-muted-foreground mb-8 text-center text-sm font-medium">
          Ligado aos serviços que a escola já usa
        </h2>
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {INTEGRATIONS.map(({ name, role, logo }) => (
            <li key={name} className="bg-card flex items-center gap-3 rounded-xl border px-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-black/5">
                {logo ? (
                  <img
                    src={assetUrl(logo)}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-contain p-1"
                  />
                ) : (
                  <Landmark className="text-muted-foreground size-5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-tight font-medium">{name}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-tight">{role}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-6 text-center text-xs">
          As marcas pertencem aos respectivos donos. Cada integração liga-se nas Definições da escola,
          conforme o plano.
        </p>
      </div>
    </section>
  )
}
