"use client"

import { CalendarCheck, GraduationCap, Languages, Layers, MonitorDown, School } from 'lucide-react'
import { formatCount, type SiteStats } from '@/lib/site-content'
import { Card, CardContent } from '@/components/ui/card'
import { DotPattern } from '@/components/dot-pattern'


const STATIC_STATS = [
  {
    icon: Layers,
    value: '13+',
    label: 'Módulos',
    description: 'Da secretaria à tesouraria'
  },
  {
    icon: CalendarCheck,
    value: '14 dias',
    label: 'Para experimentar',
    description: 'Sem compromisso'
  },
  {
    icon: MonitorDown,
    value: '3',
    label: 'Sistemas',
    description: 'App para Windows, macOS e Linux'
  },
  {
    icon: Languages,
    value: 'PT-AO',
    label: 'Português de Angola',
    description: 'BI, NIF, IBAN AO e Multicaixa'
  }
]

type Stat = (typeof STATIC_STATS)[number]

/**
 * Totais reais do SIGA (escolas activas, alunos activos) à frente, quando o sistema os
 * devolve; sem eles, os quatro números fixos do produto.
 */
function statsFor(live: SiteStats | null | undefined): Stat[] {
  if (!live || live.schools <= 0) return STATIC_STATS
  const real: Stat[] = [
    {
      icon: School,
      value: formatCount(live.schools),
      label: live.schools === 1 ? 'Escola activa' : 'Escolas activas',
      description: 'A trabalhar no SIGA hoje'
    },
  ]
  if (live.students > 0) {
    real.push({
      icon: GraduationCap,
      value: formatCount(live.students),
      label: 'Alunos',
      description: 'Com matrícula activa no SIGA'
    })
  }
  return [...real, ...STATIC_STATS].slice(0, 4)
}

export function StatsSection({ live }: { live?: SiteStats | null }) {
  const stats = statsFor(live)
  return (
    <section className="py-12 sm:py-16 relative">
      {/* Background with transparency */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-transparent to-secondary/20" />
      <DotPattern className="opacity-75" size="md" fadeStyle="circle" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {stats.map((stat, index) => (
            <Card
              key={index}
              className="text-center bg-background/60 backdrop-blur-sm border-border/50 py-0"
            >
              <CardContent className="p-6">
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <stat.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl sm:text-3xl font-bold text-foreground">
                    {stat.value}
                  </h3>
                  <p className="font-semibold text-foreground">{stat.label}</p>
                  <p className="text-sm text-muted-foreground">{stat.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
