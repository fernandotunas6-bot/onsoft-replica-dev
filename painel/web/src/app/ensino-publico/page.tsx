import { ArrowUpRight, BookOpen, FileDown, FileText, GraduationCap, ShieldCheck, Users } from "lucide-react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { getDocsUrl } from "@/lib/ecosystem-urls"

const PDF = "/documentos/SIGA_Plus_Ensino_Publico_Angola_2026.pdf"
const WORD = "/documentos/SIGA_Plus_Ensino_Publico_Angola_2026.docx"

const SERVICES = [
  { title: "Secretaria e expediente", body: "Matrículas, transferências, declarações, certificados, arquivo e histórico do aluno.", icon: FileText },
  { title: "Gestão académica", body: "Turmas, horários, assiduidade, avaliações, pautas e coordenação pedagógica.", icon: GraduationCap },
  { title: "Acompanhamento", body: "Informação organizada para professores, alunos, famílias e direcções autorizadas.", icon: Users },
  { title: "Protecção de dados", body: "Perfis de acesso, isolamento entre escolas e rastreabilidade de operações sensíveis.", icon: ShieldCheck },
] as const

export default function EnsinoPublicoPage() {
  return (
    <MarketingLayout
      eyebrow="Proposta institucional"
      title="SIGA Plus para o ensino público angolano"
      description="Menos burocracia nas secretarias, melhor gestão académica e mais atenção ao percurso dos alunos."
    >
      <div className="container mx-auto max-w-6xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <section aria-labelledby="public-proposal-title" className="max-w-3xl space-y-5">
          <p className="text-primary text-xs font-semibold uppercase tracking-widest">Ensino público · Angola · 2026</p>
          <h2 id="public-proposal-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Modernizar processos escolares para libertar tempo de ensino
          </h2>
          <p className="text-muted-foreground text-base leading-8">
            O SIGA Plus propõe reunir os processos administrativos e pedagógicos de uma escola num ambiente
            organizado: ficha do aluno, matrícula, turma, pauta, assiduidade, documentos, comunicação e relatórios.
            A tecnologia deve simplificar o serviço público, e não acrescentar novos obstáculos.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href={PDF} download className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none">
              <FileDown className="size-4" aria-hidden="true" /> Descarregar PDF
            </a>
            <a href={WORD} download className="border-input bg-background hover:bg-accent focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none">
              <FileText className="size-4" aria-hidden="true" /> Descarregar Word
            </a>
          </div>
          <p className="text-muted-foreground text-xs">Proposta institucional, versão 1.0, Outubro de 2026. Documentos de acesso público, sem dados pessoais de escolas.</p>
        </section>

        <section aria-label="Soluções para a escola pública" className="grid gap-4 sm:grid-cols-2">
          {SERVICES.map(({ title, body, icon: Icon }) => (
            <article key={title} className="bg-card rounded-2xl border p-6">
              <div className="bg-primary/10 text-primary mb-4 grid size-10 place-items-center rounded-lg">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{body}</p>
            </article>
          ))}
        </section>

        <section className="bg-muted/40 rounded-2xl border p-6 sm:p-8" aria-labelledby="public-pilot-title">
          <h2 id="public-pilot-title" className="text-xl font-semibold">Implementação responsável e por etapas</h2>
          <p className="text-muted-foreground mt-3 max-w-4xl text-sm leading-7">
            A proposta prevê diagnóstico dos processos da escola, configuração e formação, projecto-piloto
            acompanhado e avaliação com indicadores de tempo, qualidade, adopção e segurança. Em instituições
            públicas não se pressupõe cobrança de propinas. Não se afirma homologação, parceria ministerial
            ou integração concluída com sistemas oficiais.
          </p>
          <a href={getDocsUrl("/institucional/ensino-publico.html")}
             className="text-primary mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
            <BookOpen className="size-4" aria-hidden="true" /> Ler proposta na documentação
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </section>
      </div>
    </MarketingLayout>
  )
}
