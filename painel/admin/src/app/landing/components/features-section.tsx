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

const mainFeatures = [
  {
    icon: Package,
    title: 'Biblioteca Selecionada de Componentes',
    description: 'Blocos e modelos escolhidos a dedo para garantir qualidade e confiabilidade.'
  },
  {
    icon: Crown,
    title: 'Opções Gratuitas e Premium',
    description: 'Comece gratuitamente e atualize para coleções premium quando precisar de mais.'
  },
  {
    icon: Layout,
    title: 'Modelos Prontos para Uso',
    description: 'Componentes para copiar e colar que funcionam imediatamente.'
  },
  {
    icon: Zap,
    title: 'Atualizações Frequentes',
    description: 'Novos blocos e modelos adicionados semanalmente para manter seu projeto atualizado.'
  }
]

const secondaryFeatures = [
  {
    icon: BarChart3,
    title: 'Múltiplos Frameworks',
    description: 'Compatibilidade com React, Next.js e Vite para um desenvolvimento flexível.'
  },
  {
    icon: Palette,
    title: 'Stack Tecnológica Moderna',
    description: 'Construído com shadcn/ui, Tailwind CSS e TypeScript.'
  },
  {
    icon: Users,
    title: 'Design Responsivo',
    description: 'Componentes mobile-first adaptados para todos os tamanhos de tela e dispositivos.'
  },
  {
    icon: Database,
    title: 'Amigável para Desenvolvedores',
    description: 'Código limpo, bem documentado, de fácil integração e personalização.'
  }
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Recursos do Marketplace</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Tudo o que você precisa para criar aplicações web incríveis
          </h2>
          <p className="text-lg text-muted-foreground">
            Nosso marketplace fornece blocos, modelos, páginas iniciais e painéis administrativos selecionados para ajudá-lo a construir aplicações profissionais mais rápido do que nunca.
          </p>
        </div>

        {/* First Feature Section */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16 mb-24">
          {/* Left Image */}
          <Image3D
            lightSrc="/feature-1-light.png"
            darkSrc="/feature-1-dark.png"
            alt="Analytics dashboard"
            direction="left"
          />
          {/* Right Content */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Componentes que aceleram o desenvolvimento
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Nosso marketplace oferece blocos e modelos premium projetados para economizar tempo e garantir consistência em seus projetos administrativos.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {mainFeatures.map((feature, index) => (
                <li key={index} className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors">
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
              <Button size="lg" className="cursor-pointer">
                <a href="https://portal-siga.com/templates" className='flex items-center'>
                  Explorar Modelos
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer">
                <a href="https://portal-siga.com/blocks">
                  Ver Componentes
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Second Feature Section - Flipped Layout */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Content */}
          <div className="space-y-6 order-2 lg:order-1">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Construído para fluxos de trabalho modernos
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Cada componente segue as melhores práticas com TypeScript, design responsivo e arquitetura de código limpo que se integra perfeitamente aos seus projetos.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {secondaryFeatures.map((feature, index) => (
                <li key={index} className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors">
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
              <Button size="lg" className="cursor-pointer">
                <a href="#" className='flex items-center'>
                  Ver Documentação
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="cursor-pointer">
                <a href="https://github.com/silicondeck/shadcn-dashboard-landing-template" target="_blank" rel="noopener noreferrer">
                  Repositório GitHub
                </a>
              </Button>
            </div>
          </div>

          {/* Right Image */}
          <Image3D
            lightSrc="/feature-2-light.png"
            darkSrc="/feature-2-dark.png"
            alt="Performance dashboard"
            direction="right"
            className="order-1 lg:order-2"
          />
        </div>
      </div>
    </section>
  )
}
