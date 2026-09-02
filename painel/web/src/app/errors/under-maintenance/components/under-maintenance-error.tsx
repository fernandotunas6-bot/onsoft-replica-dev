import { MarketingErrorPage } from "@/components/marketing/marketing-error-page"

export function UnderMaintenanceError() {
  return (
    <MarketingErrorPage
      code="503"
      title="Em manutenção"
      description="O serviço está temporariamente indisponível. Tente mais tarde."
    />
  )
}
