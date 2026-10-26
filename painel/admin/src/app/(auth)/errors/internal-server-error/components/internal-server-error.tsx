import { ServerCrash } from "lucide-react";
import { ErrorScreen } from "../../error-screen";

export function InternalServerError() {
  return (
    <ErrorScreen
      code="500"
      icon={ServerCrash}
      title="Erro no servidor"
      description="O pedido falhou do nosso lado. Tente outra vez dentro de instantes; se continuar, consulte o estado em Webhooks."
    />
  );
}
