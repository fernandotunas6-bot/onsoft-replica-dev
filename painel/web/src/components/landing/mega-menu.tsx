"use client"

import {
  Shield,
  BarChart3,
  Database,
  Building2,
  Rocket,
  Settings,
  Zap,
  Package,
  Layout,
  Crown,
  Palette
} from 'lucide-react'
import { getDocsUrl, getPayflowUrl } from '@/lib/ecosystem-urls'

const menuSections = [
  {
    title: 'Produto',
    items: [
      {
        title: 'Criar escola',
        description: 'Wizard de provisionamento no portal WEB',
        icon: Package,
        href: '/start'
      },
      {
        title: 'Planos e preços',
        description: 'Compare o que cada escola pode usar',
        icon: Crown,
        href: '/pricing'
      },
      {
        title: 'Gestão escolar',
        description: 'Alunos, pautas, tesouraria e documentos',
        icon: BarChart3,
        href: '/#features'
      },
      {
        title: 'Portal comercial',
        description: 'Landing, FAQ e contacto',
        icon: Layout,
        href: '/'
      }
    ]
  },
  {
    title: 'Módulos',
    items: [
      {
        title: 'Secretaria',
        description: 'Matrículas, pessoas e acessos',
        icon: Building2,
        href: '/#features'
      },
      {
        title: 'Pedagógica',
        description: 'Turmas, horários e avaliações',
        icon: Rocket,
        href: '/#features'
      },
      {
        title: 'Tesouraria',
        description: 'Propinas no SIGA, cobrança no PayFlow',
        icon: BarChart3,
        href: '/pricing'
      },
      {
        title: 'PayFlow',
        description: 'Pagamentos, recibos e conciliação',
        icon: Zap,
        href: getPayflowUrl('/'),
        target: '_blank'
      },
      {
        title: 'Segurança',
        description: '2FA, catracas e cartão virtual',
        icon: Shield,
        href: '/#features'
      }
    ]
  },
  {
    title: 'Recursos',
    items: [
      {
        title: 'Documentação',
        description: 'Manuais, API e arquitectura',
        icon: Database,
        href: getDocsUrl()
      },
      {
        title: 'Perguntas frequentes',
        description: 'Planos, trial e suporte',
        icon: Palette,
        href: '/faqs'
      },
      {
        title: 'Contacto',
        description: 'Fale com a equipa SIGA Plus',
        icon: Settings,
        href: '/#contact'
      },
      {
        title: 'Começar',
        description: 'Crie a escola em poucos minutos',
        icon: Zap,
        href: '/start'
      }
    ]
  }
]

export function MegaMenu() {
  return (
    <div className="w-[700px] max-w-[95vw] p-4 sm:p-6 lg:p-8 bg-background">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-12">
        {menuSections.map((section) => (
          <div key={section.title} className="space-y-4 lg:space-y-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              {section.title}
            </h3>

            <div className="space-y-3 lg:space-y-4">
              {section.items.map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  target={'target' in item ? item.target : undefined}
                  rel={'target' in item && item.target === '_blank' ? 'noreferrer' : undefined}
                  className="group block space-y-1 lg:space-y-2 hover:bg-accent rounded-md p-2 lg:p-3 -mx-2 lg:-mx-3 transition-colors duration-100 my-0"
                >
                  <div className="flex items-center gap-2 lg:gap-3">
                    <item.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-100" />
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-100">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed ml-6 lg:ml-7">
                    {item.description}
                  </p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
