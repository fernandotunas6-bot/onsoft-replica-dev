"use client"

import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'

type FaqItem = {
  value: string
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  {
    value: 'item-1',
    question: 'Como crio a minha escola no SIGA Plus?',
    answer:
      'Abra o portal WEB, escolha Criar escola e complete o wizard. A API SaaS provisiona o tenant, a escola e a conta. Depois entra no SIGA para operar o dia-a-dia.',
  },
  {
    value: 'item-2',
    question: 'Qual a diferença entre WEB, ADMIN, SIGA e PayFlow?',
    answer:
      'O WEB vende e cria a escola. O ADMIN (porta 3005) controla tenants, planos e facturação SaaS. O SIGA é onde a escola trabalha: alunos, pautas e tesouraria. O PayFlow (porta 3007) cobra e emite recibos. A documentação vive no DOC.',
  },
  {
    value: 'item-3',
    question: 'Posso usar o SIGA em projectos comerciais da escola?',
    answer:
      'Sim. O SIGA Plus é a plataforma da instituição. Cada escola vê só os seus dados (isolamento por tenant). O administrador escolar não entra no ADMIN da plataforma.',
  },
  {
    value: 'item-4',
    question: 'Há período de avaliação?',
    answer:
      'Sim. O trial público actual é de 14 dias. No fim, a escola escolhe um plano no portal WEB. O ADMIN gere o estado da subscrição.',
  },
  {
    value: 'item-5',
    question: 'O sistema está em português?',
    answer:
      'Sim. Português é o idioma predefinido no WEB, ADMIN e DOC. Pode alternar para inglês no selector de idioma quando existir.',
  },
  {
    value: 'item-6',
    question: 'Como obtenho ajuda?',
    answer:
      'Abra a documentação (DOC) a partir de qualquer app, ou use o formulário de contacto neste portal. Os manuais apontam para o artigo certo (pautas, tesouraria, etc.).',
  },
]

const FaqSection = () => {
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
            Tudo o que precisa de saber sobre o SIGA Plus, planos e o ecossistema. Ainda tem dúvidas? Estamos aqui para ajudar.
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
                          <CircleHelp className='size-5' />
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
