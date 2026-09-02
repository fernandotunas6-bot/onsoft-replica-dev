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
    role: 'Desenvolvedora Frontend Senior',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-1',
    quote:
      'Esta plataforma transformou completamente o nosso fluxo de desenvolvimento. O sistema de componentes é tão bem arquitetado que até aplicações complexas se tornam simples de construir.',
  },
  {
    name: 'James Thompson',
    role: 'Líder Técnico',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-1',
    quote: 'Depois de tentar inúmeros frameworks, este foi o que finalmente se destacou. A documentação é excepcional.',
  },
  {
    name: 'Priya Sharma',
    role: 'Designer de Produto',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-2',
    quote:
      'O sistema de design é lindo e consistente. Consigo prototipar ideias rapidamente e repassá-las aos desenvolvedores com a certeza de que a implementação será perfeita.',
  },
  {
    name: 'Robert Kim',
    role: 'Gerente de Engenharia',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-2',
    quote:
      'Migramos toda a nossa aplicação para esta plataforma em apenas duas semanas. As melhorias de desempenho foram imediatas.',
  },
  {
    name: 'Maria Santos',
    role: 'Engenheira Full Stack',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-3',
    quote:
      'Os recursos de acessibilidade são de altíssimo nível. Construir aplicações inclusivas nunca foi tão fácil. Cada componente segue as melhores práticas nativamente.',
  },
  {
    name: 'Thomas Anderson',
    role: 'Arquiteto de Soluções',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-3',
    quote: 'Escalabilidade era nossa maior preocupação, mas esta plataforma lida com a complexidade enterprise com extrema facilidade.',
  },
  {
    name: 'Lisa Chang',
    role: 'Pesquisadora de UX',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-4',
    quote:
      'Os resultados dos testes com usuários têm sido incrivelmente positivos desde que adotamos esta plataforma. A experiência é intuitiva e o desempenho é fantástico.',
  },
  {
    name: 'Michael Foster',
    role: 'Engenheiro DevOps',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-4',
    quote: 'Implantação e manutenção são extremamente simples. A plataforma se integra perfeitamente ao nosso pipeline de CI/CD.',
  },
  {
    name: 'Sophie Laurent',
    role: 'Diretora Criativa',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-5',
    quote:
      'As possibilidades criativas são infinitas. Podemos dar vida a qualquer conceito de design sem comprometer a qualidade técnica ou a experiência do usuário.',
  },
  {
    name: 'Daniel Wilson',
    role: 'Desenvolvedor Backend',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-5',
    quote: 'O design da API é excepcional. Limpo, intuitivo e muito bem documentado.',
  },
  {
    name: 'Natasha Petrov',
    role: 'Desenvolvedora Mobile',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=female-6',
    quote:
      'O desenvolvimento multiplataforma nunca foi tão eficiente. Uma única base de código, múltiplos dispositivos e uma experiência do usuário totalmente consistente.',
  },
  {
    name: 'Carlos Rivera',
    role: 'Fundador de Startup',
    image: 'https://notion-avatars.netlify.app/api/avatar?preset=male-6',
    quote: 'Como fundador sem perfil técnico, esta plataforma me deu a confiança necessária para construir nosso MVP rapidamente.',
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
            Impulsionando a inovação no mundo todo
          </h2>
          <p className="text-lg text-muted-foreground">
            Junte-se a milhares de desenvolvedores e equipes que confiam na nossa plataforma para construir experiências digitais excepcionais.
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
