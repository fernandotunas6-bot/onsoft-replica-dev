"use client"

import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { HeroSection } from "./components/hero-section"
import { LogoCarousel } from "./components/logo-carousel"
import { StatsSection } from "./components/stats-section"
import { AboutSection } from "./components/about-section"
import { FeaturesSection } from "./components/features-section"
import { TeamSection } from "./components/team-section"
import { PricingSection } from "./components/pricing-section"
import { TestimonialsSection } from "./components/testimonials-section"
import { BlogSection } from "./components/blog-section"
import { FaqSection } from "./components/faq-section"
import { CTASection } from "./components/cta-section"
import { ContactSection } from "./components/contact-section"

export default function LandingPage() {
  return (
    <MarketingLayout variant="fullBleed">
      <HeroSection />
      <LogoCarousel />
      <StatsSection />
      <AboutSection />
      <FeaturesSection />
      <TeamSection />
      <PricingSection />
      <TestimonialsSection />
      <BlogSection />
      <FaqSection />
      <CTASection />
      <ContactSection />
    </MarketingLayout>
  )
}
