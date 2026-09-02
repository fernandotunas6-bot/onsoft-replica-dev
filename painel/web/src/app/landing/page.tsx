"use client"

import { lazy, Suspense } from "react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { HeroSection } from "./components/hero-section"

const LogoCarousel = lazy(() =>
  import("./components/logo-carousel").then((m) => ({ default: m.LogoCarousel })),
)
const StatsSection = lazy(() =>
  import("./components/stats-section").then((m) => ({ default: m.StatsSection })),
)
const AboutSection = lazy(() =>
  import("./components/about-section").then((m) => ({ default: m.AboutSection })),
)
const FeaturesSection = lazy(() =>
  import("./components/features-section").then((m) => ({ default: m.FeaturesSection })),
)
const TeamSection = lazy(() =>
  import("./components/team-section").then((m) => ({ default: m.TeamSection })),
)
const PricingSection = lazy(() =>
  import("./components/pricing-section").then((m) => ({ default: m.PricingSection })),
)
const TestimonialsSection = lazy(() =>
  import("./components/testimonials-section").then((m) => ({ default: m.TestimonialsSection })),
)
const BlogSection = lazy(() =>
  import("./components/blog-section").then((m) => ({ default: m.BlogSection })),
)
const FaqSection = lazy(() =>
  import("./components/faq-section").then((m) => ({ default: m.FaqSection })),
)
const CTASection = lazy(() =>
  import("./components/cta-section").then((m) => ({ default: m.CTASection })),
)
const ContactSection = lazy(() =>
  import("./components/contact-section").then((m) => ({ default: m.ContactSection })),
)

function SectionFallback() {
  return <div className="min-h-[12rem]" aria-hidden />
}

export default function LandingPage() {
  return (
    <MarketingLayout variant="fullBleed">
      <HeroSection />
      <Suspense fallback={<SectionFallback />}>
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
      </Suspense>
    </MarketingLayout>
  )
}
