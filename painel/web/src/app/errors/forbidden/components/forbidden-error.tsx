import { MarketingErrorPage } from "@/components/marketing/marketing-error-page"

export function ForbiddenError() {
  return (
    <MarketingErrorPage
      code="403"
      title="Acesso negado"
      description="Não tem permissão para ver esta página."
    />
  )
}
