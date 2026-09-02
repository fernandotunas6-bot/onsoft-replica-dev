import { MarketingErrorPage } from "@/components/marketing/marketing-error-page"

export function UnauthorizedError() {
  return (
    <MarketingErrorPage
      code="401"
      title="Não autorizado"
      description="Não tem permissão para aceder a este recurso. Entre ou contacte o administrador."
    />
  )
}
