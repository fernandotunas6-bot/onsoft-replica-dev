import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  ADMIN_WELCOME_PATH,
  SCHOOL_ENVIRONMENTS,
  environmentForPath,
  type SchoolEnvironmentId,
} from "@/features/auth/environments";
import { getEnvironmentAccess } from "@/features/school/admin-welcome";
import { getAdminUrl } from "@/lib/ecosystem-urls";
import { cn } from "@/lib/utils";

const ICONS: Record<SchoolEnvironmentId, typeof LayoutDashboard> = {
  admin: LayoutDashboard,
  portal: GraduationCap,
  setup: Settings2,
};

/**
 * Seletor de ambientes no topo do SIGA: Painel Administrativo, Portal Escolar e
 * Assistente de configuração, com a mesma conta. Só aparece a quem administra:
 * o Administrador da escola vê os ambientes da escola; quem está em
 * `platform_admins` vê também a Administração Global. Mais ninguém o vê.
 */
export function EnvironmentSwitcher() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isSchoolAdmin = account.roles.includes("Administrador");
  const fetchAccess = useServerFn(getEnvironmentAccess);
  const access = useQuery({
    queryKey: ["auth", "environment-access", account.id],
    enabled: Boolean(account.id),
    queryFn: () => fetchAccess(),
    staleTime: 10 * 60_000,
  });
  const isPlatformAdmin = access.data?.isPlatformAdmin ?? false;

  if (!isSchoolAdmin && !isPlatformAdmin) return null;

  const current = environmentForPath(pathname);
  const currentEnv =
    SCHOOL_ENVIRONMENTS.find((env) => env.id === current) ?? SCHOOL_ENVIRONMENTS[0];
  const CurrentIcon = ICONS[currentEnv.id];

  const open = (path: string) => {
    // O papel activo pode estar noutro (ex.: Professor): os ambientes da escola
    // são do Administrador, por isso volta-se a ele antes de navegar.
    if (isSchoolAdmin && account.role !== "Administrador") account.setActiveRole("Administrador");
    void navigate({ to: path as never });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40"
          aria-label="Mudar de ambiente"
          title="Mudar de ambiente"
        >
          <CurrentIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="hidden truncate whitespace-nowrap min-[1800px]:inline">
            {isSchoolAdmin ? currentEnv.title : "Ambientes"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Ambientes · a mesma conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSchoolAdmin ? (
          <>
            {SCHOOL_ENVIRONMENTS.map((env) => {
              const Icon = ICONS[env.id];
              const active = env.id === current;
              return (
                <DropdownMenuItem
                  key={env.id}
                  onSelect={() => open(env.path)}
                  className="items-start gap-2.5"
                >
                  <Icon className={cn("mt-0.5 size-4", active ? "text-primary" : "")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{env.title}</span>
                    <span className="block text-xs text-muted-foreground">{env.hint}</span>
                  </span>
                  {active ? <Check className="mt-0.5 size-4 text-primary" aria-hidden /> : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem onSelect={() => open(ADMIN_WELCOME_PATH)} className="gap-2.5">
              <Sparkles className="size-4" aria-hidden />
              Onde deseja começar?
            </DropdownMenuItem>
          </>
        ) : null}
        {isPlatformAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="items-start gap-2.5">
              <a href={getAdminUrl()} target="_blank" rel="noreferrer">
                <ShieldCheck className="mt-0.5 size-4" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Administração Global</span>
                  <span className="block text-xs text-muted-foreground">
                    Plataforma e instituições (equipa SIGA Plus)
                  </span>
                </span>
                <ExternalLink className="mt-0.5 size-3.5 opacity-60" aria-hidden />
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
