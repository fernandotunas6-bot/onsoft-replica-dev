"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

type Testimonial = {
  name: string
  role: string
  image: string
  quote: string
}

const testimonials: Testimonial[] = [
  {
    name: 'Alexandra Mitchell',
    role: 'Directora',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-1',
    quote:
      'O SIGA organizou matrículas, pautas e tesouraria. A secretaria deixou as folhas soltas.',
  },
  {
    name: 'James Thompson',
    role: 'Tesoureiro',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-1',
    quote: 'Os recibos saem com IBAN e o Multicaixa ficou nas definições da escola.',
  },
  {
    name: 'Priya Sharma',
    role: 'Professora',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-2',
    quote:
      'Lanço notas no Centro de Avaliação e a pauta oficial fica alinhada ao MINED.',
  },
  {
    name: 'Robert Kim',
    role: 'Secretário',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-2',
    quote:
      'A matrícula pública e a ficha do aluno estão no mesmo sítio. Passámos a digital em duas semanas.',
  },
  {
    name: 'Maria Santos',
    role: 'Administradora',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-3',
    quote:
      'Os acessos com 2FA e os cargos da escola deram-nos controlo sem misturar o ADMIN da plataforma.',
  },
  {
    name: 'Thomas Anderson',
    role: 'Coordenador pedagógico',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-3',
    quote: 'Horários, turmas e planos de aula no mesmo espaço. Os professores encontram tudo.',
  },
  {
    name: 'Lisa Chang',
    role: 'Encarregada de educação',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-4',
    quote:
      'A comunicação da escola chegou-nos em português, com comunicados e documentos oficiais.',
  },
  {
    name: 'Michael Foster',
    role: 'Informático da escola',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-4',
    quote: 'O cartão virtual e as catracas ligam-se ao SIGA sem um sistema paralelo.',
  },
  {
    name: 'Sophie Laurent',
    role: 'Directora pedagógica',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-5',
    quote:
      'Os boletins e as pautas oficiais saem dos modelos da escola, não de um PDF genérico.',
  },
  {
    name: 'Daniel Wilson',
    role: 'Tesoureiro-adjunto',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-5',
    quote: 'Faturas, recibos e planos de pagamento no mesmo fluxo. A cobrança ficou clara.',
  },
  {
    name: 'Natasha Petrov',
    role: 'Professora',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-6',
    quote:
      'O workspace do professor mostra as turmas, materiais e o diário. Funciona no telemóvel.',
  },
  {
    name: 'Carlos Rivera',
    role: 'Fundador da escola',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-6',
    quote: 'Criei a escola no portal WEB e a equipa entrou no SIGA no mesmo dia.',
  },
]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-24 sm:py-32">
      <div className="container mx-auto px-8 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Depoimentos</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Escolas que já trabalham no SIGA
          </h2>
          <p className="text-lg text-muted-foreground">
            Secretarias, tesoureiros e professores usam o SIGA Plus no dia-a-dia.
          </p>
        </div>

        {/* Testimonials Masonry Grid */}
        <div className="columns-1 gap-4 md:columns-2 md:gap-6 lg:columns-3 lg:gap-4">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="mb-6 break-inside-avoid shadow-none lg:mb-4">
              <CardContent>
                <div className="flex items-start gap-4">
                  <Avatar className="bg-muted size-12 shrink-0">
                    <AvatarImage
                      alt={testimonial.name}
                      src={testimonial.image}
                      loading="lazy"
                      width="120"
                      height="120"
                    />
                    <AvatarFallback>
                      {testimonial.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <a href="#" onClick={e => e.preventDefault()} className="cursor-pointer">
                      <h3 className="font-medium hover:text-primary transition-colors">{testimonial.name}</h3>
                    </a>
                    <span className="text-muted-foreground block text-sm tracking-wide">
                      {testimonial.role}
                    </span>
                  </div>
                </div>

                <blockquote className="mt-4">
                  <p className="text-sm leading-relaxed text-balance">{testimonial.quote}</p>
                </blockquote>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
