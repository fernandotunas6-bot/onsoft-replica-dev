import { MarketingErrorPage } from "@/components/marketing/marketing-error-page"

export function InternalServerError() {
  return (
    <MarketingErrorPage
      code="500"
      title="Erro interno do servidor"
      description="Ocorreu um erro no servidor. Estamos a resolver. Tente mais tarde."
    />
  )
}
