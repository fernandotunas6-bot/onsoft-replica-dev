"use client"

import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const blogs = [
    {
      id: 1,
      image: 'https://ui.shadcn.com/placeholder.svg',
      category: 'Produto',
      title: 'Como criar a escola no WEB',
      description:
        'O wizard do portal provisiona tenant, domínio e conta. Depois a equipa entra no SIGA.',
    },
    {
      id: 2,
      image: 'https://ui.shadcn.com/placeholder.svg',
      category: 'Tesouraria',
      title: 'Multicaixa e propinas',
      description:
        'Configure Multicaixa Express e Unitel Money nas definições e emita recibos com IBAN AO.',
    },
    {
      id: 3,
      image: 'https://ui.shadcn.com/placeholder.svg',
      category: 'Pedagógica',
      title: 'Pautas oficiais MINED',
      description:
        'MAC, NPP e NPT no Centro de Avaliação, com impressão oficial a partir dos modelos da escola.',
    },
  ]

export function BlogSection() {
  return (
    <section id="blog" className="py-24 sm:py-32 bg-muted/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Novidades</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Do blog SIGA Plus
          </h2>
          <p className="text-lg text-muted-foreground">
            Actualizações do produto, manuais e boas práticas para secretaria e tesouraria.
          </p>
        </div>

        {/* Blog Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {blogs.map(blog => (
            <Card key={blog.id} className="overflow-hidden py-0">
              <CardContent className="px-0">
                <div className="aspect-video">
                  <img
                    src={blog.image}
                    alt={blog.title}
                    className="size-full object-cover dark:invert dark:brightness-[0.95]"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="space-y-3 p-6">
                  <p className="text-muted-foreground text-xs">
                    {blog.category}
                  </p>
                  <a
                    href="#"
                    onClick={e => e.preventDefault()}
                    className="cursor-pointer"
                  >
                    <h3 className="text-xl font-bold hover:text-primary transition-colors">{blog.title}</h3>
                  </a>
                  <p className="text-muted-foreground">{blog.description}</p>
                  <a
                    href="#"
                    onClick={e => e.preventDefault()}
                    className="inline-flex items-center gap-2 text-primary hover:underline cursor-pointer"
                  >
                    Ler mais
                    <ArrowRight className="size-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
