"use client"

import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { useSiteContent } from "@/lib/site-content"
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
import { ContactSection } from "./components/contact-section"

export default function LandingPage() {
  // Uma só chamada ao SIGA: perguntas, escolas, números e artigos geridos no ADMIN.
  const site = useSiteContent()
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
      <ContactSection />
    </MarketingLayout>
  )
}
