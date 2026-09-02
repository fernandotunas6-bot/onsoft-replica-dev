import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { FAQList } from "./components/faq-list"
import { FeaturesGrid } from "./components/features-grid"

import categoriesData from "./data/categories.json"
import faqsData from "./data/faqs.json"
import featuresData from "./data/features.json"

export default function FAQsPage() {
  return (
    <MarketingLayout
      title="Perguntas frequentes"
      description="Tudo o que precisa de saber sobre o SIGA Plus."
      eyebrow="Ajuda"
    >
      <div className="container mx-auto space-y-16 px-4 py-12 sm:px-6 lg:px-8">
        <FAQList faqs={faqsData} categories={categoriesData} />
        <FeaturesGrid features={featuresData} />
      </div>
    </MarketingLayout>
  )
}
