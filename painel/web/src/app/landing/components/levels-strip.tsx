import { GraduationCap } from "lucide-react"

/** Níveis de ensino que o SIGA Plus organiza (os mesmos do SIGA: angola-academic). */
const LEVELS = [
  "Iniciação e pré-escolar",
  "Ensino Primário",
  "I Ciclo do Ensino Secundário",
  "II Ciclo e Ensino Médio",
  "Técnico-Profissional",
  "Ensino Superior",
] as const

export function LevelsStrip() {
  return (
    <section aria-labelledby="levels-title" className="pt-12 pb-12 sm:pb-16 lg:pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="levels-title" className="text-muted-foreground mb-6 text-center text-sm font-medium">
          Feito para escolas em Angola, do pré-escolar ao ensino superior
        </h2>
        <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {LEVELS.map((level) => (
            <li
              key={level}
              className="bg-card text-foreground inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
            >
              <GraduationCap className="text-primary size-4" aria-hidden="true" />
              {level}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
