import { ShieldX } from "lucide-react";
import { ErrorScreen } from "../../error-screen";

export function ForbiddenError() {
  return (
    <ErrorScreen
      code="403"
      icon={ShieldX}
      title="Acesso negado"
      description="Esta consola é só para administradores da plataforma. Contas de escola entram no SIGA Plus."
    />
  );
}
