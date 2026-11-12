"use client"

import { lazy, Suspense, useEffect } from "react"
import { useLocation } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { useSiteContent } from "@/lib/site-content"
import { scrollToSection } from "@/lib/scroll-to-section"
import { HeroSection } from "./components/hero-section"
import { IntegrationsStrip } from "./components/integrations-strip"
import { StatsSection } from "./components/stats-section"
import { AboutSection } from "./components/about-section"
import { FeaturesSection } from "./components/features-section"
import { SchoolsSection } from "./components/schools-section"
import { PricingSection } from "./components/pricing-section"
import { RolesSection } from "./components/roles-section"
import { BlogSection } from "./components/blog-section"
import { GuidesSection } from "./components/guides-section"
import { FaqSection } from "./components/faq-section"
import { CTASection } from "./components/cta-section"
import { DesktopSection } from "./components/desktop-section"

// O formulário de contacto fica no fim da página e é a única secção com
// react-hook-form e zod: carrega à parte para não atrasar o primeiro desenho. O
// espaço reservado é uma <section id="contact"> como a real, por isso a âncora
// /#contact funciona e, fora do ecrã, ocupa o mesmo (content-visibility, index.css).
const ContactSection = lazy(() =>
  import("./components/contact-section").then((m) => ({ default: m.ContactSection })),
)

export default function LandingPage() {
  // Uma só chamada ao SIGA: perguntas, escolas, números e artigos geridos no ADMIN.
  const site = useSiteContent()
  // /#contact, /#pricing…: ao abrir o endereço ou ao vir de outra página pela barra
  // («Contacto», «Funcionalidades»), o React Router não desce até à secção.
  const { hash, key } = useLocation()
  useEffect(() => {
    if (hash) scrollToSection(hash)
  }, [hash, key])
  return (
    <MarketingLayout variant="fullBleed">
      <HeroSection />
      <IntegrationsStrip />
      <StatsSection live={site?.stats} />
      <AboutSection />
      <FeaturesSection />
      <RolesSection />
      <SchoolsSection schools={site?.showcase} />
      <PricingSection />
      <BlogSection posts={site?.posts} />
      <GuidesSection />
      <FaqSection faqs={site?.faqs} />
      <DesktopSection />
      <CTASection />
      <Suspense fallback={<section id="contact" aria-busy="true" className="py-24 sm:py-32" />}>
        <ContactSection />
      </Suspense>
    </MarketingLayout>
  )
}
