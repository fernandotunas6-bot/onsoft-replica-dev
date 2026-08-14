import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Folder,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { IconChip, type ChipTone } from "@/components/ui/icon-chip";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  clearStaffModuleGrant,
  listStaffModuleGrants,
  setStaffModuleGrant,
} from "@/features/access/grants";
import { listSystemAccounts } from "@/features/access/server";
import {
  accessLevelForRole,
  accessModules,
  type AccessLevel,
  type ApplicationRole,
} from "@/features/auth/access-policy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/acessos/permissoes/$userId")({
  head: () => ({
    meta: [
      { title: "Permissões da conta · SIGA" },
      {
        name: "description",
        content: "Nível de acesso por módulo para um utilizador do SIGA.",
      },
    ],
  }),
  component: PermissoesPage,
});

const moduleIcons: Record<(typeof accessModules)[number]["key"], typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  pessoas: Users,
  financeiro: Wallet,
  pedagogica: GraduationCap,
  gestao: ShieldCheck,
  arquivos: Folder,
};

const levelTone: Record<AccessLevel, ChipTone> = {
  Total: "success",
  Escrita: "info",
  Leitura: "muted",
  Nenhum: "destructive",
};

const nivelBadgeTone: Record<AccessLevel, string> = {
  Total: toneClass.success,
  Escrita: toneClass.info,
  Leitura: toneClass.muted,
  Nenhum: toneClass.danger,
};

const levelOptions: AccessLevel[] = ["Nenhum", "Leitura", "Escrita", "Total"];

function PermissoesPage() {
  const { userId } = Route.useParams();
  const queryClient = useQueryClient();
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["access", "accounts"],
    queryFn: () => listSystemAccounts(),
    retry: false,
  });
  const grantsQuery = useQuery({
    queryKey: ["access", "grants"],
    queryFn: () => listStaffModuleGrants(),
    retry: false,
  });

  const account = (accountsQuery.data ?? []).find((item) => item.id === userId);
  const grants = grantsQuery.data ?? [];
  const initials = (account?.full_name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part: string) => part[0])
    .join("");

  const applyLevel = async (
    moduleKey: (typeof accessModules)[number]["key"],
    level: AccessLevel | null,
  ) => {
    setSavingModule(moduleKey);
    try {
      if (level === null) {
        await clearStaffModuleGrant({ data: { userId, moduleKey } });
      } else {
        await setStaffModuleGrant({ data: { userId, moduleKey, level } });
      }
      await queryClient.invalidateQueries({ queryKey: ["access", "grants"] });
      toast.success(
        level === null
          ? "Permissão reposta para a predefinição do cargo"
          : `Permissão actualizada para ${level}`,
      );
    } catch (error) {
      toast.error("Não foi possível guardar a permissão", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setSavingModule(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to="/acessos">
            <ArrowLeft className="size-4" /> Gestão de Acessos
          </Link>
        </Button>

        <PageHeader
          group="Acessos"
          title="Permissões por módulo"
          description="Sobreponha o nível de acesso desta conta em cada módulo. Alterações são guardadas de imediato."
        />

        {accountsQuery.isLoading || grantsQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-sm text-muted-foreground shadow-soft">
            <LoaderCircle className="mr-2 size-4 animate-spin" /> A carregar…
          </div>
        ) : !account ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-soft">
            <p className="text-sm font-semibold">Conta não encontrada</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Esta conta pode ter sido removida ou já não pertence à escola actual.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-6 shadow-soft">
              <UserAvatar
                initials={initials}
                className="size-16 bg-primary-soft text-xl font-extrabold text-primary ring-1 ring-border"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-lg font-extrabold tracking-tight">
                  {account.full_name}
                </h2>
                <p className="truncate text-sm text-muted-foreground">
                  {account.email ?? "Sem e-mail"}
                </p>
              </div>
              <span className={cn(badgeBase, toneClass.primary)}>{account.cargo}</span>
            </div>

            <Panel
              title="Módulos"
              description="«Predefinição» segue a política do cargo. As restantes opções sobrepõem-na para esta conta."
              icon={KeyRound}
            >
              <div className="divide-y divide-border">
                {accessModules.map((module) => {
                  const Icon = moduleIcons[module.key];
                  const current = grants.find(
                    (grant) => grant.user_id === userId && grant.module_key === module.key,
                  );
                  const roleDefault = accessLevelForRole(
                    account.cargo as ApplicationRole,
                    module.key,
                  );
                  const effective = (current?.level as AccessLevel | undefined) ?? roleDefault;
                  const isSaving = savingModule === module.key;

                  return (
                    <div
                      key={module.key}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <IconChip icon={Icon} tone={levelTone[effective]} size="sm" />
                        <div>
                          <p className="text-sm font-semibold">{module.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {current
                              ? "Nível sobreposto para esta conta"
                              : `Predefinição do cargo: ${roleDefault}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSaving ? (
                          <LoaderCircle className="mr-1 size-4 animate-spin text-muted-foreground" />
                        ) : null}
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => applyLevel(module.key, null)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                            !current
                              ? "border-primary/40 bg-primary-soft text-primary-strong"
                              : "border-border bg-transparent text-muted-foreground hover:bg-secondary",
                          )}
                        >
                          {!current ? <CheckCircle2 className="size-3.5" /> : null}
                          Predefinição
                        </button>
                        {levelOptions.map((level) => {
                          const selected = current?.level === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              disabled={isSaving}
                              onClick={() => applyLevel(module.key, level)}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                                selected
                                  ? cn("border-transparent", nivelBadgeTone[level])
                                  : "border-border bg-transparent text-muted-foreground hover:bg-secondary",
                              )}
                            >
                              {selected ? <CheckCircle2 className="size-3.5" /> : null}
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
}
