"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CardDecorator } from '@/components/ui/card-decorator'
import { Code, Palette, Layout, Crown } from 'lucide-react'

const values = [
  {
    icon: Code,
    title: 'Feito para escolas',
    description: 'Cada ecrã serve secretaria, tesouraria e professores — não um marketplace de componentes.'
  },
  {
    icon: Palette,
    title: 'Identidade angolana',
    description: 'BI, NIF, IBAN AO, fuso de Luanda e documentos alinhados ao MINED e à AGT.'
  },
  {
    icon: Layout,
    title: 'Pronto a operar',
    description: 'Cria a escola no WEB, o ADMIN regista o cliente e o SIGA fica imediatamente disponível.'
  },
  {
    icon: Crown,
    title: 'Cinco apps, um produto',
    description: 'WEB vende, ADMIN controla, SIGA trabalha, PayFlow cobra, DOC explica — sem misturar papéis.'
  }
]

export function AboutSection() {
  return (
    <section id="about" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            Sobre o SIGA Plus
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
            Feito para a escola angolana
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            O SIGA Plus é a plataforma de gestão escolar do ecossistema: venda no WEB,
            controlo SaaS no ADMIN, operação no SIGA, cobrança no PayFlow e ajuda no DOC.
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
            <span className="text-muted-foreground">Feito com cuidado para escolas em Angola</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="cursor-pointer" asChild>
              <a href="/start">
                Criar escola
              </a>
            </Button>
            <Button size="lg" variant="outline" className="cursor-pointer" asChild>
              <a href="#contact">
                Falar connosco
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
