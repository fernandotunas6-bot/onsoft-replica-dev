import { SearchX } from "lucide-react"
import { ErrorScreen } from "../../error-screen"

export function NotFoundError() {
  return (
    <ErrorScreen
      code="404"
      icon={SearchX}
      title="Página não encontrada"
      description="O endereço não existe ou mudou. Volte à lista de escolas ou use o menu."
    />
  )
}
