import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { PricingPlans } from "@/components/pricing-plans"
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls"
import { FeaturesGrid } from "./components/features-grid"
import { FAQSection } from "./components/faq-section"

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
        <section id="pricing">
          <PricingPlans
            mode="pricing"
            onPlanSelect={(planCode) => {
              window.location.href = getCreateSchoolUrl(planCode)
            }}
          />
        </section>
        <FeaturesGrid features={featuresData} />
        <FAQSection faqs={faqsData} />
      </div>
    </MarketingLayout>
  )
}
