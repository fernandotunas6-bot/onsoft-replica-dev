import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import type { ApplicationRole } from "@/features/auth/access-policy";
import { getMobileNavigation, isMobileDestinationActive } from "@/features/auth/mobile-navigation";
import type { Plan } from "@/features/saas/types";
import { cn } from "@/lib/utils";

export function MobileNavigation({
  role,
  grants,
  plan,
  pathname,
  menuOpen,
  onOpenMenu,
}: {
  role: ApplicationRole;
  grants: Record<string, string>;
  plan?: Plan | null;
  pathname: string;
  menuOpen: boolean;
  onOpenMenu: () => void;
}) {
  const destinations = getMobileNavigation(role, grants, plan);
  const otherSection = !destinations.some((item) => isMobileDestinationActive(item.to, pathname));
  return (
    <nav className="siga-mobile-tabs lg:hidden" aria-label="Navegação principal">
      {destinations.map(({ to, search, label, icon: Icon }) => {
        const active = isMobileDestinationActive(to, pathname);
        return (
          <Link
            key={to}
            to={to}
            search={search}
            className={cn("siga-mobile-tab", active && "is-active")}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className={cn("siga-mobile-tab", (menuOpen || otherSection) && "is-active")}
        onClick={onOpenMenu}
        aria-label="Abrir todos os módulos"
        aria-haspopup="dialog"
        aria-controls={menuOpen ? "siga-mobile-menu" : undefined}
        aria-expanded={menuOpen}
      >
        <LayoutGrid aria-hidden="true" className="size-5" strokeWidth={1.8} />
        <span>Mais</span>
      </button>
    </nav>
  );
}
