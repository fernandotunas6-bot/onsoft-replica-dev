import type { ElementType, ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { prefetchRouteData } from "@/lib/route-data-prefetch";

/**
 * Componente de navegação unificado (regras de layout do Minimals):
 *  - altura fixa por profundidade (44px raiz / 36px sub-item);
 *  - ícone sempre 24px (raiz) ou ponto indicador (sub-item), alinhado ao centro;
 *  - estado activo: fundo suave da cor primária + texto/ícone primário, peso 600;
 *  - modo colapsado: coluna centrada com ícone + micro-legenda.
 */
export type NavDepth = "root" | "sub";

export const NAV_ROW_BASE =
  "group relative flex w-full items-center gap-3 rounded-lg font-medium outline-none transition-[color,background-color,transform] duration-75 ease-out active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:active:scale-100 motion-reduce:transition-none";

export const NAV_ROW_IDLE =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const NAV_ROW_ACTIVE =
  "bg-primary/16 font-semibold text-sidebar-active hover:bg-primary/20 hover:text-sidebar-active";

const depthClass: Record<NavDepth, string> = {
  root: "min-h-11 px-3 text-sm",
  sub: "min-h-9 px-3 text-[13px]",
};

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
        className="flex size-6 shrink-0 items-center justify-center"
      >
        <span
          className={cn(
            "block rounded-full transition-all duration-150",
            active
              ? "size-1.5 bg-sidebar-active"
              : "size-1 bg-sidebar-foreground/40 group-hover:size-1.5 group-hover:bg-sidebar-active",
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
    depthClass[p.depth ?? "root"],
    p.collapsed && "flex-col justify-center gap-1 px-1 py-2",
    p.active ? NAV_ROW_ACTIVE : NAV_ROW_IDLE,
    p.className,
  );

export function NavLinkRow(
  props: BaseProps & { to: string; search?: Record<string, string | undefined> },
) {
  const { to, search, ...rest } = props;
  const router = useRouter();
  const queryClient = useQueryClient();
  const warmRoute = () => {
    void router.preloadRoute({ to, search }).catch(() => {});
    prefetchRouteData(queryClient, to);
  };
  return (
    <Link
      to={to}
      search={search}
      activeOptions={{ exact: !search }}
      title={props.collapsed ? props.label : undefined}
      className={rowClass(rest)}
      activeProps={{ className: NAV_ROW_ACTIVE, "aria-current": "page", "data-active": "true" }}
      inactiveProps={{ "data-active": "false" }}
      data-nav-row=""
      onMouseEnter={warmRoute}
      onFocus={warmRoute}
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
      title={props.collapsed ? props.label : undefined}
      className={rowClass(rest)}
      data-nav-row=""
    >
      {content(rest)}
    </button>
  );
}

export function NavSubheader({ title, collapsed = false }: { title: string; collapsed?: boolean }) {
  if (collapsed) return <div className="mx-3 my-3 h-px bg-sidebar-border" />;
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase leading-5 tracking-[0.5px] text-sidebar-muted">
      {title}
    </p>
  );
}
