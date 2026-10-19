"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CardDecorator } from '@/components/ui/card-decorator'
import { GraduationCap, Link2, MapPin, Rocket, School } from 'lucide-react'

const values = [
  {
    icon: School,
    title: 'Feito para escolas',
    description: 'Cada ecrã foi pensado para a direcção, a secretaria, a tesouraria e os professores.'
  },
  {
    icon: MapPin,
    title: 'Identidade angolana',
    description: 'BI, NIF, IBAN AO, fuso de Luanda e documentos alinhados ao MINED e à AGT.'
  },
  {
    icon: Rocket,
    title: 'Pronto no mesmo dia',
    description: 'Crie a escola aqui no site e a equipa começa logo a trabalhar no SIGA.'
  },
  {
    icon: Link2,
    title: 'Tudo ligado',
    description: 'Matrículas, pautas, tesouraria e cobrança partilham os mesmos dados, sem folhas paralelas.'
  }
]

/** Níveis de ensino que o SIGA Plus organiza (os mesmos do SIGA: angola-academic). */
const LEVELS = [
  'Iniciação e pré-escolar',
  'Ensino Primário',
  'I Ciclo do Ensino Secundário',
  'II Ciclo e Ensino Médio',
  'Técnico-Profissional',
  'Ensino Superior',
] as const

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
            O SIGA Plus junta a gestão académica, a secretaria e a tesouraria numa só plataforma,
            com a cobrança feita pelo PayFlow e manuais em português sempre à mão.
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
          <p className="text-muted-foreground mb-4 text-sm">Do pré-escolar ao ensino superior</p>
          <ul className="mb-8 flex flex-wrap items-center justify-center gap-2">
            {LEVELS.map((level) => (
              <li
                key={level}
                className="bg-card text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              >
                <GraduationCap className="text-primary size-4" aria-hidden="true" />
                {level}
              </li>
            ))}
          </ul>
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
