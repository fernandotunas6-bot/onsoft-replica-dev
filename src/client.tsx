import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { attachStaleBuildRecovery } from "@/lib/stale-build";

/**
 * Entrada do cliente.
 *
 * Sem este ficheiro o plugin do TanStack Start usa a entrada por omissão do
 * pacote (`@tanstack/react-start/dist/plugin/default-entry/client.tsx`), um
 * subcaminho que **não está no `exports`** de `@tanstack/react-start@1.168.x`.
 * Com o Vite 8 essa resolução falha (500) e a app nunca hidrata: fica presa
 * no ecrã «A verificar sessão…». Declarar a entrada aqui evita o fallback.
 */
// Um deploy apaga os activos da build anterior; quem tem a app aberta rebenta na
// primeira importação em diferido. Ver `stale-build.ts`.
attachStaleBuildRecovery();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
