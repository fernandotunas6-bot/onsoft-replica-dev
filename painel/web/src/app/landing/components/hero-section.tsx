"use client"

import { useState } from 'react'
import { ArrowRight, Play, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DotPattern } from '@/components/dot-pattern'
import { assetUrl } from "@/lib/utils"
import { getCreateSchoolUrl, getPricingUrl } from "@/lib/ecosystem-urls"

export function HeroSection() {
  const [videoOpen, setVideoOpen] = useState(false)
  return (
    <section id="hero" className="relative overflow-hidden bg-gradient-to-b from-background to-background/80 pt-16 sm:pt-20 pb-16">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" size="md" fadeStyle="ellipse" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 flex justify-center">
            <Badge variant="outline" className="px-4 py-2 border-foreground">
              <Star className="w-3 h-3 mr-2 fill-current" />
              Novo: SIGA Plus para escolas em Angola
              <ArrowRight className="w-3 h-3 ml-2" />
            </Badge>
          </div>

          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Gestão escolar
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {" "}completa{" "}
            </span>
            para a sua instituição
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Matrículas, pautas, tesouraria e cobrança PayFlow — numa plataforma
            feita para escolas angolanas.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="text-base cursor-pointer" asChild>
              <a href={getCreateSchoolUrl()}>
                Criar escola grátis
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base cursor-pointer"
              onClick={() => setVideoOpen(true)}
            >
              <Play className="mr-2 h-4 w-4" />
              Ver o vídeo
            </Button>
            <Button variant="ghost" size="lg" className="text-base cursor-pointer" asChild>
              <a href={getPricingUrl()}>Ver planos</a>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-20 max-w-6xl">
          <div className="relative group">
            <div className="hero-glow absolute top-2 lg:-top-8 left-1/2 transform -translate-x-1/2 w-[90%] mx-auto h-24 lg:h-80 bg-primary/50 rounded-full blur-3xl"></div>

            <div className="relative rounded-xl border bg-card shadow-2xl">
              <img
                src={assetUrl("dashboard-light.png")}
                alt="Painel do director no SIGA Plus: o dia na escola, o ano lectivo e os números da escola"
                className="w-full rounded-xl object-cover block dark:hidden"
                fetchPriority="high"
                decoding="async"
              />

              <img
                src={assetUrl("dashboard-dark.png")}
                alt="Painel do director no SIGA Plus, em modo escuro"
                className="w-full rounded-xl object-cover hidden dark:block"
                decoding="async"
              />

              <div className="absolute bottom-0 left-0 w-full h-32 md:h-40 lg:h-48 bg-gradient-to-b from-background/0 via-background/70 to-background rounded-b-xl"></div>

              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  size="lg"
                  className="rounded-full h-16 w-16 p-0 cursor-pointer hover:scale-105 transition-transform duration-150"
                  onClick={() => setVideoOpen(true)}
                  aria-label="Ver o vídeo do SIGA Plus"
                >
                  <Play className="h-6 w-6 fill-current" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-4xl overflow-hidden p-0 sm:max-w-4xl">
          <DialogTitle className="sr-only">SIGA Plus em vídeo</DialogTitle>
          {videoOpen ? (
            <video
              className="aspect-video w-full bg-black"
              src={assetUrl("media/siga-plus.mp4")}
              controls
              autoPlay
              playsInline
              preload="metadata"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
