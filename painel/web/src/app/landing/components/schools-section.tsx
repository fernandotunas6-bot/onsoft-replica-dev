import { School } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ShowcaseSchool } from "@/lib/site-content"

/**
 * «Escolas que usam o SIGA Plus»: só as escolas activas que aceitaram aparecer, no SIGA
 * (Definições → Escola), e que o ADMIN não escondeu. Sem nenhuma, a secção não aparece.
 */
export function SchoolsSection({ schools }: { schools: ShowcaseSchool[] | null | undefined }) {
  if (!schools?.length) return null
  return (
    <section id="schools" aria-labelledby="schools-title" className="py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Escolas
          </Badge>
          <h2 id="schools-title" className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Escolas que usam o SIGA Plus
          </h2>
          <p className="text-muted-foreground text-lg">
            Escolas que trabalham no SIGA todos os dias e aceitaram aparecer aqui.
          </p>
        </div>
        <ul className="mx-auto flex max-w-5xl flex-wrap justify-center gap-4">
          {schools.map((school) => (
            <li
              key={school.id}
              className="bg-card flex w-[calc(50%-0.5rem)] flex-col items-center gap-3 rounded-2xl border p-5 text-center sm:w-52"
            >
              <span className="grid size-16 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                {school.logoUrl ? (
                  <img
                    src={school.logoUrl}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="size-full object-contain p-1.5"
                  />
                ) : (
                  <School className="text-primary size-7" aria-hidden="true" />
                )}
              </span>
              <span>
                <span className="block font-medium leading-tight">{school.name}</span>
                {school.city ? (
                  <span className="text-muted-foreground mt-0.5 block text-xs">{school.city}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
