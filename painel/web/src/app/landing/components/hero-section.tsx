"use client"

import { useState } from 'react'
import { ArrowRight, CalendarCheck, GraduationCap, Play, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Aurora, GlassTile, SigaMascot, usePointerParallax } from '@/components/brand/aurora'
import { SigaPhoneDemo } from '@/components/brand/siga-phone-demo'
import { assetUrl } from "@/lib/utils"
import { getCreateSchoolUrl, getPricingUrl } from "@/lib/ecosystem-urls"

export function HeroSection() {
  const [videoOpen, setVideoOpen] = useState(false)
  // Paralaxe das peças de vidro e olhar da mascote (CSS vars no section).
  const heroRef = usePointerParallax<HTMLElement>()
  return (
    <section
      id="hero"
      ref={heroRef}
      className="relative overflow-hidden pt-16 sm:pt-20 pb-16"
    >
      <Aurora />

      {/* Peças de vidro: o que o SIGA arruma — pautas, calendário, a pasta da escola. */}
      <GlassTile tone="violet" size={92} tilt={-10} depth={18} className="hidden md:grid left-[6%] top-24 lg:left-[9%]">
        <GraduationCap className="size-10 drop-shadow" strokeWidth={2.2} />
      </GlassTile>
      <GlassTile tone="sky" size={64} tilt={12} depth={10} delay={3} className="hidden lg:grid right-[10%] top-32">
        <CalendarCheck className="size-7 drop-shadow" strokeWidth={2.2} />
      </GlassTile>

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
            <span className="text-aurora">
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

        {/* Telemóvel: no ecrã pequeno ocupa o lugar da captura do painel. */}
        <div className="relative mx-auto mt-14 flex justify-center sm:hidden">
          <SigaPhoneDemo />
          <SigaMascot size={72} className="-bottom-6 right-2" />
        </div>

        <div className="relative mx-auto mt-20 hidden max-w-6xl sm:block">
          <div className="pointer-events-none absolute -right-4 -bottom-12 z-10 hidden lg:block xl:-right-10">
            <SigaPhoneDemo className="rotate-[3deg]" />
            <SigaMascot size={96} className="-left-14 bottom-10" />
          </div>
          <div className="relative group">

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
