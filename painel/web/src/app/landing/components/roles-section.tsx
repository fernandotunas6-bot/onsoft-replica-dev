import type { LucideIcon } from "lucide-react"
import {
  BookOpenCheck,
  Building2,
  ClipboardList,
  HeartHandshake,
  Landmark,
  ScanLine,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type Role = { icon: LucideIcon; title: string; description: string }

const ROLES: Role[] = [
  {
    icon: Building2,
    title: "Direcção",
    description:
      "Vê o dia da escola num só ecrã: aulas, presenças, matrículas e cobranças em atraso. Define cargos e acessos com 2FA.",
  },
  {
    icon: ClipboardList,
    title: "Secretaria",
    description:
      "Candidaturas, matrículas e ficha do aluno no mesmo sítio, com declarações e documentos oficiais da escola.",
  },
  {
    icon: Landmark,
    title: "Tesouraria",
    description:
      "Propinas, facturas e recibos com IBAN AO. A cobrança por Multicaixa Express e Unitel Money é feita pelo PayFlow.",
  },
  {
    icon: BookOpenCheck,
    title: "Professores",
    description:
      "Turmas, horários, chamada e notas (MAC, NPP e NPT) no Centro de Avaliação. Funciona no telemóvel e, na app, sem rede.",
  },
  {
    icon: HeartHandshake,
    title: "Encarregados",
    description:
      "Os encarregados recebem os comunicados da escola e acompanham notas e propinas no portal, também no telemóvel.",
  },
  {
    icon: ScanLine,
    title: "Portaria",
    description:
      "Catracas e leitores da escola ligados ao SIGA: entradas e saídas registadas, sem um sistema paralelo.",
  },
]

export function RolesSection() {
  return (
    <section id="roles" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Para cada pessoa da escola
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Cada função tem o seu espaço no SIGA
          </h2>
          <p className="text-muted-foreground text-lg">
            Os mesmos dados, vistos por quem precisa deles: sem folhas paralelas nem trabalho a dobrar.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="bg-card rounded-2xl border p-6">
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
