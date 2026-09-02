"use client"

import { ArrowRight, TrendingUp, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getCreateSchoolUrl, getDocsUrl } from '@/lib/ecosystem-urls'

export function CTASection() {
  return (
    <section className='py-16 lg:py-24 bg-muted/80'>
      <div className='container mx-auto px-4 lg:px-8'>
        <div className='mx-auto max-w-4xl'>
          <div className='text-center'>
            <div className='space-y-8'>
              <div className='flex flex-col items-center gap-4'>
                <Badge variant='outline' className='flex items-center gap-2'>
                  <TrendingUp className='size-3' />
                  Comece hoje
                </Badge>

                <div className='text-muted-foreground flex items-center gap-4 text-sm'>
                  <span className='flex items-center gap-1'>
                    <div className='size-2 rounded-full bg-green-500' />
                    Trial de 14 dias
                  </span>
                  <Separator orientation='vertical' className='!h-4' />
                  <span>Feito para Angola</span>
                  <Separator orientation='vertical' className='!h-4' />
                  <span>Suporte em português</span>
                </div>
              </div>

              <div className='space-y-6'>
                <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl'>
                  Ponha a sua escola
                  <span className='flex sm:inline-flex justify-center'>
                    <span className='relative mx-2'>
                      <span className='bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent'>
                        a trabalhar
                      </span>
                      <div className='absolute start-0 -bottom-2 h-1 w-full bg-gradient-to-r from-primary/30 to-secondary/30' />
                    </span>
                    no SIGA Plus
                  </span>
                </h1>

                <p className='text-muted-foreground mx-auto max-w-2xl text-balance lg:text-xl'>
                  Crie a escola no portal, o ADMIN regista o cliente e a equipa passa a operar
                  no SIGA — sem migrar dados à mão.
                </p>
              </div>

              <div className='flex flex-col justify-center gap-4 sm:flex-row sm:gap-6'>
                <Button size='lg' className='cursor-pointer px-8 py-6 text-lg font-medium' asChild>
                  <a href={getCreateSchoolUrl()}>
                    <Package className='me-2 size-5' />
                    Criar escola
                  </a>
                </Button>
                <Button variant='outline' size='lg' className='cursor-pointer px-8 py-6 text-lg font-medium group' asChild>
                  <a href={getDocsUrl()}>
                    Documentação
                    <ArrowRight className='ms-2 size-4 transition-transform duration-150 group-hover:translate-x-1' />
                  </a>
                </Button>
              </div>

              <div className='text-muted-foreground flex flex-wrap items-center justify-center gap-6 text-sm'>
                <div className='flex items-center gap-2'>
                    <div className='size-2 rounded-full bg-green-600 dark:bg-green-400 me-1' />
                  <span>Sem cartão no trial</span>
                </div>
                <div className='flex items-center gap-2'>
                    <div className='size-2 rounded-full bg-blue-600 dark:bg-blue-400 me-1' />
                  <span>Dados isolados por escola</span>
                </div>
                <div className='flex items-center gap-2'>
                    <div className='size-2 rounded-full bg-purple-600 dark:bg-purple-400 me-1' />
                  <span>Ajuda e manuais em português</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
