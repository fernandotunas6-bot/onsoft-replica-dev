import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { canPrefetchResources } from "@/lib/preload";
import { useSchoolSettings } from "@/features/auth/use-school-settings";

/**
 * Componente de navegação unificado (regras de layout do Minimals):
 *  - altura fixa por profundidade (44px raiz / 32px sub-item);
 *  - ícone sempre 24px (raiz) ou ponto indicador (sub-item), alinhado ao centro;
 *  - estado activo: fundo suave da cor primária + texto/ícone primário, peso 600;
 *  - modo colapsado: coluna centrada com ícone + micro-legenda.
 *
 * Sub-itens usam rem (não px absoluto) para acompanhar o html 75% —
 * `text-[12px]` ficava maior que o `text-xs` da raiz.
 */
export type NavDepth = "root" | "sub";

export const NAV_ROW_BASE =
  "group relative flex w-full items-center gap-3 rounded-lg font-medium outline-none transition-[color,background-color,transform,box-shadow] duration-(--siga-motion-fast) ease-(--siga-ease) active:duration-75 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:active:scale-100 motion-reduce:transition-none";

export const NAV_ROW_IDLE =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const NAV_ROW_ACTIVE =
  "bg-primary/10 font-semibold text-sidebar-active shadow-nav-active hover:bg-primary/15 hover:text-sidebar-active";

export const NAV_DEPTH_CLASS: Record<NavDepth, string> = {
  root: "min-h-9 px-2.5 py-1.5 text-sm font-medium",
  sub: "h-8 min-h-8 gap-2 px-2 py-0.5 text-sm leading-5 font-medium",
};

/** Lista aninhada: rail esquerdo (spec SidebarMenuSub) sem alterar os itens-pai. */
export const NAV_SUB_LIST = "nav-sub-list mt-0.5 space-y-px";

export function NavIcon({
  icon: Icon,
  depth = "root",
  active = false,
}: {
  icon?: ElementType | undefined;
  depth?: NavDepth | undefined;
  active?: boolean | undefined;
}) {
  if (depth === "sub" || !Icon) {
    return (
      <span
        aria-hidden
        data-nav-icon=""
        className={cn(
          "flex shrink-0 items-center justify-center",
          depth === "sub" ? "size-4" : "size-6",
        )}
      >
        <span
          className={cn(
            "block size-1 rounded-full transition-[transform,background-color] duration-(--siga-motion-fast) ease-(--siga-ease) motion-reduce:transition-none",
            active
              ? "scale-150 bg-sidebar-active"
              : "bg-sidebar-foreground/40 group-hover:scale-150 group-hover:bg-sidebar-active",
          )}
        />
      </span>
    );
  }

  return (
    <span aria-hidden data-nav-icon="" className="flex size-6 shrink-0 items-center justify-center">
      <Icon
        className={cn(
          "size-5 transition-colors duration-150",
          active
            ? "text-sidebar-active"
            : "text-sidebar-foreground/70 group-hover:text-sidebar-active",
        )}
        strokeWidth={active ? 2.1 : 1.8}
      />
    </span>
  );
}

type BaseProps = {
  label: string;
  icon?: ElementType;
  depth?: NavDepth;
  collapsed?: boolean;
  active?: boolean;
  trailing?: ReactNode;
  className?: string;
};

function content({ label, icon, depth, collapsed, active, trailing }: BaseProps) {
  if (collapsed) {
    return (
      <>
        <NavIcon icon={icon} depth={depth} active={active} />
        <span className="sr-only">{label}</span>
      </>
    );
  }
  return (
    <>
      <NavIcon icon={icon} depth={depth} active={active} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {trailing}
    </>
  );
}

const rowClass = (p: BaseProps) =>
  cn(
    NAV_ROW_BASE,
    NAV_DEPTH_CLASS[p.depth ?? "root"],
    p.collapsed && "flex-col justify-center gap-1 px-1 py-2",
    p.active ? NAV_ROW_ACTIVE : NAV_ROW_IDLE,
    p.className,
  );

export function NavLinkRow(
  props: BaseProps & { to: string; search?: Record<string, string | undefined> },
) {
  const { to, search, ...rest } = props;
  const queryClient = useQueryClient();
  const { school, selectedYearId } = useSchoolSettings();
  const targetKey = JSON.stringify([to, search]);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const cancelWarmup = () => {
    clearTimeout(pending.current);
    generation.current += 1;
  };
  useEffect(
    () => () => {
      clearTimeout(pending.current);
      generation.current += 1;
    },
    [school?.id, selectedYearId, targetKey],
  );
  const warmRoute = () => {
    cancelWarmup();
    if (!canPrefetchResources()) return;
    const current = generation.current;
    pending.current = setTimeout(() => {
      void import("@/lib/route-data-prefetch")
        .then(({ prefetchRouteData }) => {
          if (current !== generation.current) return;
          prefetchRouteData(queryClient, to, {
            schoolId: school?.id ?? null,
            academicYearId: selectedYearId ?? null,
            search,
          });
        })
        .catch(() => {
          /* A navegação normal conserva a recuperação de erros. */
        });
    }, 80);
  };
  return (
    <Link
      to={to}
      preload={canPrefetchResources() ? "intent" : false}
      preloadDelay={80}
      {...(search ? { search } : {})}
      activeOptions={{ exact: !search }}
      title={props.label}
      className={rowClass(rest)}
      activeProps={
        props.active === undefined
          ? { className: NAV_ROW_ACTIVE, "aria-current": "page", "data-active": "true" }
          : {}
      }
      inactiveProps={props.active === undefined ? { "data-active": "false" } : {}}
      aria-current={props.active ? "page" : undefined}
      data-active={props.active ? "true" : "false"}
      data-nav-row=""
      data-nav-depth={props.depth ?? "root"}
      onMouseEnter={warmRoute}
      onFocus={warmRoute}
      onMouseLeave={cancelWarmup}
      onBlur={cancelWarmup}
    >
      {content(rest)}
    </Link>
  );
}

export function NavButtonRow(props: BaseProps & { onClick?: () => void; expanded?: boolean }) {
  const { onClick, expanded, ...rest } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      title={props.label}
      className={rowClass(rest)}
      data-nav-row=""
      data-nav-depth={props.depth ?? "root"}
      data-active={props.active ? "true" : "false"}
    >
      {content(rest)}
    </button>
  );
}

export function NavSubheader({ title, collapsed = false }: { title: string; collapsed?: boolean }) {
  if (collapsed) return <div className="mx-3 my-3 h-px bg-sidebar-border" />;
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-medium leading-5 text-sidebar-muted">{title}</p>
  );
}
