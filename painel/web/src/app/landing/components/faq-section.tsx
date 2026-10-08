"use client"

import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import type { SiteFaq } from '@/lib/site-content'

type FaqItem = {
  value: string
  question: string
  answer: string
}

/** Texto fixo, usado enquanto o SIGA não responde ou se o ADMIN não tiver perguntas em destaque. */
const FALLBACK_ITEMS: FaqItem[] = [
  {
    value: 'item-1',
    question: 'Como crio a minha escola no SIGA Plus?',
    answer:
      'Clique em «Criar escola grátis» e siga seis passos curtos: dados da escola, responsável, plano, conta do administrador e endereço da escola (por exemplo, a-minha-escola.portal-siga.com). No fim, entra no SIGA, onde a equipa trabalha no dia-a-dia.',
  },
  {
    value: 'item-2',
    question: 'Há período de avaliação?',
    answer:
      'Sim: 14 dias para experimentar, sem compromisso. No fim escolhe o plano que serve a escola e continua com os mesmos dados.',
  },
  {
    value: 'item-3',
    question: 'Os dados da minha escola ficam separados das outras?',
    answer:
      'Sim. Cada escola vê só os seus dados, com acessos por cargo e verificação em dois passos (2FA) para quem trata de dinheiro e de notas.',
  },
  {
    value: 'item-4',
    question: 'Como recebemos as propinas?',
    answer:
      'A tesouraria emite facturas e recibos com o IBAN da escola. A cobrança por Multicaixa Express e Unitel Money é feita pelo PayFlow, ligado ao SIGA.',
  },
  {
    value: 'item-5',
    question: 'Funciona sem Internet?',
    answer:
      'No navegador precisa de rede. Na app para computador (Windows, macOS e Linux), chamadas e notas lançadas sem rede ficam guardadas e seguem sozinhas quando a Internet volta.',
  },
  {
    value: 'item-6',
    question: 'Como obtenho ajuda?',
    answer:
      'Os manuais em português estão sempre à mão, a partir do site e do SIGA. Para outras dúvidas, use o formulário de contacto nesta página.',
  },
]

/** Perguntas em destaque geridas no ADMIN (Site → Perguntas do site); sem elas, as fixas. */
const FaqSection = ({ faqs }: { faqs?: SiteFaq[] | null }) => {
  const featured = (faqs ?? []).filter((faq) => faq.featured)
  const faqItems: FaqItem[] = featured.length
    ? featured.map((faq) => ({ value: faq.id, question: faq.question, answer: faq.answer }))
    : FALLBACK_ITEMS
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">FAQ</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Perguntas frequentes
          </h2>
          <p className="text-lg text-muted-foreground">
            O essencial sobre o SIGA Plus, os planos e o arranque da escola.
          </p>
        </div>

        {/* FAQ Content */}
        <div className="max-w-4xl mx-auto">
          <div className='bg-transparent'>
            <div className='p-0'>
              <Accordion type='single' collapsible className='space-y-5'>
                {faqItems.map(item => (
                  <AccordionItem key={item.value} value={item.value} className='rounded-md !border bg-transparent'>
                    <AccordionTrigger className='cursor-pointer items-center gap-4 rounded-none bg-transparent py-2 ps-3 pe-4 hover:no-underline data-[state=open]:border-b'>
                      <div className='flex items-center gap-4'>
                        <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full'>
                          <CircleHelp className='size-5' aria-hidden='true' />
                        </div>
                        <span className='text-start font-semibold'>{item.question}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className='p-4 bg-transparent'>{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>

          {/* Contact Support CTA */}
          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">
              Ainda tem perguntas? Estamos aqui para ajudar.
            </p>
            <Button className='cursor-pointer' asChild>
              <a href="#contact">
                Contactar suporte
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export { FaqSection }
