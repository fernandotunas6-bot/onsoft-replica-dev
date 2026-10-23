import { useMemo } from "react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { useSiteContent } from "@/lib/site-content"
import { FAQList } from "./components/faq-list"
import { FeaturesGrid } from "./components/features-grid"

import faqsData from "./data/faqs.json"
import featuresData from "./data/features.json"

type Faq = { id: number | string; question: string; answer: string; category: string }

/** «Todas» primeiro e depois cada categoria pela ordem em que aparece, com a contagem. */
function categoriesOf(faqs: Faq[]) {
  const counts = new Map<string, number>()
  for (const faq of faqs) counts.set(faq.category, (counts.get(faq.category) ?? 0) + 1)
  return [{ name: "Todas", count: faqs.length }, ...[...counts].map(([name, count]) => ({ name, count }))]
}

export default function FAQsPage() {
  // Perguntas publicadas no ADMIN (Site → Perguntas do site); sem resposta do SIGA, as fixas.
  const site = useSiteContent()
  const faqs: Faq[] = site?.faqs?.length ? site.faqs : faqsData
  const categories = useMemo(() => categoriesOf(faqs), [faqs])

  return (
    <MarketingLayout
      title="Perguntas frequentes"
      description="Tudo o que precisa de saber sobre o SIGA Plus."
      eyebrow="Ajuda"
    >
      <div className="container mx-auto space-y-16 px-4 py-12 sm:px-6 lg:px-8">
        <FAQList faqs={faqs} categories={categories} />
        <FeaturesGrid features={featuresData} />
      </div>
    </MarketingLayout>
  )
}
