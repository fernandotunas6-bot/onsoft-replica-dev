"use client"

import { ArrowRight, Laptop } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { DesktopDownloadCards } from "@/components/landing/desktop-download-cards"

/** Bloco da página inicial com a transferência da app para computador. */
export function DesktopSection() {
  return (
    <section id="desktop" className="bg-muted/30 py-16 lg:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4 inline-flex items-center gap-2">
            <Laptop className="size-3" aria-hidden="true" />
            App para computador
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            O SIGA Plus também no seu computador
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Para a secretaria e a portaria: impressão directa, catracas e sessão protegida por
            PIN. Disponível para Windows, macOS e Linux.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-5xl">
          <DesktopDownloadCards compact />
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/download"
            className="text-primary group inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Requisitos, outros formatos e como instalar
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
