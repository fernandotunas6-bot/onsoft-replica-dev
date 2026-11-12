import { Wrench } from "lucide-react"
import { ErrorScreen } from "../../error-screen"

export function UnderMaintenanceError() {
  return (
    <ErrorScreen
      code="503"
      icon={Wrench}
      title="Em manutenção"
      description="O serviço está temporariamente indisponível. Tente mais tarde."
    />
  )
}
