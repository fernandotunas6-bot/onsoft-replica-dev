import { GraduationCap } from "lucide-react";

/**
 * Vive fora de `TeacherWorkspacePanel.tsx` pela mesma razão que
 * `DashboardChartsSkeleton` e `PortalDashboardSkeleton`: a rota `/` carrega o painel
 * com `lazy()`, mas o manifesto do router pré-carrega o grafo **estático** da rota, e
 * importar esta dica daquele módulo punha-o no ecrã de entrada — arrastando
 * `ClassMaterialsPanel` e com ele o `PickFileButton`. Só o ícone, que já vive no
 * pedaço `icons` da raiz. Guarda em `tests/ui/first-paint-budget.test.ts`.
 */
export function TeacherWorkspaceHint() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <GraduationCap className="size-4 text-primary" />
      Espaço do docente: só módulos permitidos, turmas atribuídas e horário.
    </p>
  );
}
