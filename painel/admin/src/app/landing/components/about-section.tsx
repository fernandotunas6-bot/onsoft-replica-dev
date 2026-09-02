"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CardDecorator } from '@/components/ui/card-decorator'
import { Github, Code, Palette, Layout, Crown } from 'lucide-react'

const values = [
  {
    icon: Code,
    title: 'Foco no Desenvolvedor',
    description: 'Cada componente é desenvolvido pensando na experiência do programador, garantindo código limpo e fácil integração.'
  },
  {
    icon: Palette,
    title: 'Excelência em Design',
    description: 'Mantemos os mais altos padrões visuais, seguindo os princípios da shadcn/ui e padrões modernos de UI.'
  },
  {
    icon: Layout,
    title: 'Pronto para Produção',
    description: 'Componentes testados em aplicações reais, com desempenho e confiabilidade comprovados em diversos ambientes.'
  },
  {
    icon: Crown,
    title: 'Qualidade Premium',
    description: 'Desenvolvido com atenção aos detalhes e otimização de performance, garantindo excelente experiência do usuário e acessibilidade.'
  }
]

export function AboutSection() {
  return (
    <section id="about" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            Sobre a SIGA Plus
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
            Construído por desenvolvedores, para desenvolvedores
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Somos apaixonados por criar o melhor ecossistema de componentes e modelos para shadcn/ui.
            Nossa missão é acelerar o desenvolvimento e ajudar programadores a construírem interfaces incríveis em tempo recorde.
          </p>
        </div>

        {/* Modern Values Grid with Enhanced Design */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4 mb-12">
          {values.map((value, index) => (
            <Card key={index} className='group shadow-xs py-2'>
              <CardContent className='p-8'>
                <div className='flex flex-col items-center text-center'>
                  <CardDecorator>
                    <value.icon className='h-6 w-6' aria-hidden />
                  </CardDecorator>
                  <h3 className='mt-6 font-medium text-balance'>{value.title}</h3>
                  <p className='text-muted-foreground mt-3 text-sm'>{value.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-muted-foreground">❤️ Feito com amor para a comunidade de desenvolvedores</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="cursor-pointer" asChild>
              <a href="https://github.com/silicondeck/shadcn-dashboard-landing-template" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-4 w-4" />
                Dar Star no GitHub
              </a>
            </Button>
            <Button size="lg" variant="outline" className="cursor-pointer" asChild>
              <a href="https://discord.com/invite/XEQhPc9a6p" target="_blank" rel="noopener noreferrer">
                Entrar na Comunidade Discord
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
