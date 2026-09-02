import { MarketingErrorPage } from "@/components/marketing/marketing-error-page"

export function NotFoundError() {
  return (
    <MarketingErrorPage
      code="404"
      title="Página não encontrada"
      description="A página que procura não existe ou foi movida."
    />
  )
}
