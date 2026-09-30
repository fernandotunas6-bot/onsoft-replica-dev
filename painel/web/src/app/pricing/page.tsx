import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { PricingPlans } from "@/components/pricing-plans"
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls"
import { FeaturesGrid } from "./components/features-grid"
import { FAQSection } from "./components/faq-section"
import { Aurora } from "@/components/brand/aurora"

import featuresData from "./data/features.json"
import faqsData from "./data/faqs.json"

export default function PricingPage() {
  return (
    <MarketingLayout
      title="Planos e preços"
      description="Escolha o plano certo para a sua escola. Trial de 14 dias incluído."
      eyebrow="Comercial"
    >
      <div className="container mx-auto space-y-16 px-4 py-12 sm:px-6 lg:px-8">
        {/* Tom «financeiro» (verde): a página de preços fala de dinheiro; o
            resto do site fica no tom da marca. */}
        <section
          id="pricing"
          data-tone="financeiro"
          className="relative overflow-hidden rounded-3xl px-4 py-10 sm:px-8"
        >
          <Aurora variant="soft" fade={false} />
          <div className="relative">
          <PricingPlans
            mode="pricing"
            onPlanSelect={(planCode) => {
              window.location.href = getCreateSchoolUrl(planCode)
            }}
          />
          </div>
        </section>
        <FeaturesGrid features={featuresData} />
        <FAQSection faqs={faqsData} />
      </div>
    </MarketingLayout>
  )
}
