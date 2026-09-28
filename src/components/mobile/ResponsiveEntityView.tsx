import * as React from "react";

import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * Troca de componente por degrau (§66, §118).
 *
 * Algumas mudanças não são de CSS: uma `<table>` a 360px não é uma lista, é uma
 * tabela cortada. Este componente troca a *árvore* — tabela no computador,
 * lista de entidades no telemóvel — sem obrigar cada ecrã a duplicar a lógica
 * de dados, que fica acima dele.
 *
 * Enquanto `ready` é falso (servidor e primeiro render) mostra-se o desktop:
 * é o que o HTML do servidor já produzia, e assim a hidratação não muda a
 * árvore por baixo do React.
 */
export function ResponsiveEntityView({
  mobile,
  tablet,
  desktop,
}: {
  mobile: React.ReactNode;
  /** Sem isto, o tablet usa a vista de computador (§63). */
  tablet?: React.ReactNode;
  desktop: React.ReactNode;
}) {
  const { breakpoint, ready } = useBreakpoint();
  if (!ready) return <>{desktop}</>;
  if (breakpoint === "mobile") return <>{mobile}</>;
  if (breakpoint === "tablet") return <>{tablet ?? desktop}</>;
  return <>{desktop}</>;
}

/** Renderiza só no telemóvel — para blocos que não têm par no computador. */
export function MobileOnly({ children }: { children: React.ReactNode }) {
  const { breakpoint, ready } = useBreakpoint();
  if (!ready || breakpoint !== "mobile") return null;
  return <>{children}</>;
}

/** Renderiza a partir do tablet. */
export function DesktopOnly({ children }: { children: React.ReactNode }) {
  const { breakpoint, ready } = useBreakpoint();
  if (ready && breakpoint === "mobile") return null;
  return <>{children}</>;
}
