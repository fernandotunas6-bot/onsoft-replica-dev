"use client"

import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { HeroSection } from "./components/hero-section"
import { LevelsStrip } from "./components/levels-strip"
import { StatsSection } from "./components/stats-section"
import { AboutSection } from "./components/about-section"
import { FeaturesSection } from "./components/features-section"
import { PricingSection } from "./components/pricing-section"
import { RolesSection } from "./components/roles-section"
import { GuidesSection } from "./components/guides-section"
import { FaqSection } from "./components/faq-section"
import { CTASection } from "./components/cta-section"
import { DesktopSection } from "./components/desktop-section"
import { ContactSection } from "./components/contact-section"

export default function LandingPage() {
  return (
    <MarketingLayout variant="fullBleed">
      <HeroSection />
      <LevelsStrip />
      <StatsSection />
      <AboutSection />
      <FeaturesSection />
      <RolesSection />
      <PricingSection />
      <GuidesSection />
      <FaqSection />
      <DesktopSection />
      <CTASection />
      <ContactSection />
    </MarketingLayout>
  )
}
