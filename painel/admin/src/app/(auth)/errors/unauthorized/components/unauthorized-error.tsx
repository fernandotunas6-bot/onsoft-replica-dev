import { LogIn } from "lucide-react"
import { ErrorScreen } from "../../error-screen"

export function UnauthorizedError() {
  return (
    <ErrorScreen
      code="401"
      icon={LogIn}
      title="Sessão em falta"
      description="Inicie sessão como administrador da plataforma para continuar."
      primary={{ href: "/sign-in", label: "Entrar" }}
    />
  )
}
