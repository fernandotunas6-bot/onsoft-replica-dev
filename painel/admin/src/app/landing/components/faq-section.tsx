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
    question: 'Como faço para integrar os componentes da SIGA Plus no meu projeto?',
    answer:
      'A integração é simples! Todos os nossos componentes são construídos com shadcn/ui e funcionam nativamente com React, Next.js e Vite. Basta copiar o código do componente, instalar eventuais dependências necessárias e colar no seu projeto.',
  },
  {
    value: 'item-2',
    question: 'Qual a diferença entre componentes gratuitos e premium?',
    answer:
      'Componentes gratuitos incluem elementos essenciais de UI como botões, formulários e layouts básicos. Componentes premium oferecem recursos avançados como tabelas de dados complexas, painéis analíticos, fluxos de autenticação completos, arquivos do Figma e licenças comerciais.',
  },
  {
    value: 'item-3',
    question: 'Posso usar esses componentes em projetos comerciais?',
    answer:
      'Sim! Componentes gratuitos possuem licença MIT para uso ilimitado. Componentes premium incluem licença comercial completa para projetos de clientes, aplicações SaaS e produtos comerciais sem necessidade de atribuição.',
  },
  {
    value: 'item-4',
    question: 'Vocês oferecem suporte e atualizações?',
    answer:
      'Com certeza! Oferecemos suporte à comunidade para componentes gratuitos através do Discord e GitHub. Assinantes premium contam com suporte prioritário por e-mail, atualizações regulares e acesso antecipado a novos lançamentos.',
  },
  {
    value: 'item-5',
    question: 'Quais frameworks e ferramentas são suportados?',
    answer:
      'Nossos componentes funcionam perfeitamente com React 18+, Next.js 13+ e Vite. Utilizamos TypeScript, Tailwind CSS e seguimos todas as convenções do shadcn/ui.',
  },
  {
    value: 'item-6',
    question: 'Com que frequência novos componentes são lançados?',
    answer:
      'Lançamos novos componentes e modelos semanalmente. Assinantes premium garantem acesso antecipado aos novos recursos.',
  },
]

const FaqSection = () => {
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Perguntas Frequentes</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Perguntas Frequentes (FAQ)
          </h2>
          <p className="text-lg text-muted-foreground">
            Tudo o que você precisa saber sobre os componentes da SIGA Plus, licenças e integração. Ainda tem dúvidas? Estamos aqui para ajudar!
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
              Ainda tem dúvidas? Nossa equipe está pronta para ajudar.
            </p>
            <Button className='cursor-pointer' asChild>
              <a href="#contact">
                Falar com o Suporte
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export { FaqSection }
