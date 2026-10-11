import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { getMobileReadiness } from "@/features/school/mobile-readiness-server";
import type { MobileReadiness } from "@/features/school/mobile-readiness";
import { ReadinessContent } from "@/features/school/MobileReadinessContent";
import { moduleIcons } from "@/lib/app-icons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes_/mobile")({
  head: () => ({
    meta: [
      { title: "Prontidão do Mobile · SIGA" },
      {
        name: "description",
        content:
          "Quem já consegue usar o SIGA Plus Mobile e o que falta para os outros alunos e professores.",
      },
    ],
  }),
  component: MobileReadinessPage,
});

function MobileReadinessPage() {
  const account = useCurrentAccount();
  const isAdmin = account.role === "Administrador";
  const fetchReadiness = useServerFn(getMobileReadiness);
  const query = useQuery({
    queryKey: ["school", "mobile-readiness"],
    enabled: isAdmin,
    queryFn: () => fetchReadiness() as Promise<MobileReadiness>,
    // Volta a verificar quando a pessoa regressa de uma ficha noutro separador.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Sistema"
          title="Prontidão do Mobile"
          description="Quem já consegue usar o SIGA Plus Mobile e, caso a caso, o que falta para os outros."
          icon={moduleIcons.mobileReadiness}
          actions={
            isAdmin ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} />
                Verificar de novo
              </Button>
            ) : undefined
          }
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Só o Administrador da escola vê a prontidão do Mobile.
            </p>
          </Panel>
        ) : query.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" aria-label="A verificar a prontidão" />
          </div>
        ) : query.isError || !query.data ? (
          <Panel title="Não foi possível verificar">
            <p className="text-sm text-muted-foreground">Tente de novo dentro de instantes.</p>
          </Panel>
        ) : (
          <ReadinessContent readiness={query.data} />
        )}
      </div>
    </AppShell>
  );
}
