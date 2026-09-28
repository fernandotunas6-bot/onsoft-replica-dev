"use client"

import {
  BarChart3,
  Zap,
  Users,
  ArrowRight,
  Database,
  Package,
  Crown,
  Layout,
  Palette
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Image3D } from '@/components/image-3d'
import { getCreateSchoolUrl, getDocsUrl } from '@/lib/ecosystem-urls'

const mainFeatures = [
  {
    icon: Package,
    title: 'Alunos e matrículas',
    description: 'Fichas, candidaturas públicas e matrícula interna num só sítio.'
  },
  {
    icon: Crown,
    title: 'Pautas e avaliações',
    description: 'MAC, NPP e NPT alinhados ao MINED, com impressão oficial.'
  },
  {
    icon: Layout,
    title: 'Tesouraria escolar',
    description: 'Propinas e faturas no SIGA; cobrança e recibos no PayFlow (Multicaixa / transferência).'
  },
  {
    icon: Zap,
    title: 'Pronto para Angola',
    description: 'BI, NIF, IBAN AO e calendário no fuso de Luanda.'
  }
]

const secondaryFeatures = [
  {
    icon: BarChart3,
    title: 'Área pedagógica',
    description: 'Turmas, horários, planos de aula e workspace do professor.'
  },
  {
    icon: Palette,
    title: 'Comunicações',
    description: 'Comunicados, WhatsApp Business e mensagens internas.'
  },
  {
    icon: Users,
    title: 'Acessos e catracas',
    description: 'Contas, 2FA, cartão virtual e controlo de entrada.'
  },
  {
    icon: Database,
    title: 'Arquivos da escola',
    description: 'Biblioteca de documentos, fotos e recibos com permissões.'
  }
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Funcionalidades</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Tudo o que a escola precisa para trabalhar todos os dias
          </h2>
          <p className="text-lg text-muted-foreground">
            O SIGA gere a operação da escola. O portal WEB vende e cria a escola.
            O ADMIN controla a plataforma SaaS. O PayFlow cobra.
          </p>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16 mb-24">
          <Image3D
            lightSrc="feature-1-light.png"
            darkSrc="feature-1-dark.png"
            alt="SIGA Plus: médias por turma e disciplina, com as negativas destacadas"
            direction="left"
          />
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Operação escolar sem folhas soltas
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Da candidatura à pauta e ao recibo: um fluxo contínuo para secretaria,
                tesouraria e professores.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {mainFeatures.map((feature, index) => (
                <li key={index} className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors duration-100">
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium">{feature.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-4 pe-4 pt-2">
              <Button size="lg" className="cursor-pointer" asChild>
                <a href={getCreateSchoolUrl()} className='flex items-center'>
                  Criar escola
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer" asChild>
                <a href={getDocsUrl()}>
                  Ver documentação
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          <div className="space-y-6 order-2 lg:order-1">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Feito para o ritmo de uma escola angolana
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Identidade (BI/NIF), pagamentos locais e documentos oficiais — sem copiar
                um painel genérico de outro país.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {secondaryFeatures.map((feature, index) => (
                <li key={index} className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors duration-100">
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium">{feature.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-4 pe-4 pt-2">
              <Button size="lg" className="cursor-pointer" asChild>
                <a href={getDocsUrl()} className='flex items-center'>
                  Abrir manuais
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer" asChild>
                <a href="#pricing">
                  Comparar planos
                </a>
              </Button>
            </div>
          </div>

          <Image3D
            lightSrc="feature-2-light.png"
            darkSrc="feature-2-dark.png"
            alt="SIGA Plus: alunos por classe, matrículas por mês e propinas facturadas e recebidas"
            direction="right"
            className="order-1 lg:order-2"
          />
        </div>
      </div>
    </section>
  )
}
