import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckSquare,
  FileText,
  GraduationCap,
  Palette,
  QrCode,
  Receipt,
  Search,
  Settings,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useNavigationMemory } from "@/features/auth/use-navigation-memory";
import { canAccessPath } from "@/features/auth/access-policy";
import { WORKSPACE_MODULE_SPECS } from "@/features/auth/navigation-catalog";
import { useTenant } from "@/features/saas/tenant-context";
import { planIncludesPath } from "@/features/saas/plan-features";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { itemKey } from "@/lib/navigation-memory";

export const OPEN_COMMAND_PALETTE_EVENT = "siga:open-command-palette";

export function requestOpenCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: typeof Search;
  run: () => void;
};

/**
 * Paleta de comandos global (Ctrl/⌘ K): páginas, acções rápidas e definições.
 * O waffle (`AppLauncher`) continua só para apps/integrações.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const currentUser = useCurrentAccount();
  const { activePlan } = useTenant();
  const { recents, favorites, favorited, toggleFavorite, current } = useNavigationMemory();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  const goToMemory = (path: string, search?: string) => {
    const params = search ? Object.fromEntries(new URLSearchParams(search).entries()) : undefined;
    void navigate({ to: path as "/", search: params as never });
  };

  const pages = useMemo(() => {
    return WORKSPACE_MODULE_SPECS.filter((spec) => {
      if (!canAccessPath(spec.navPath, currentUser.role, currentUser.grants)) return false;
      if (activePlan && !planIncludesPath(spec.navPath, activePlan)) return false;
      return true;
    }).map((spec) => ({
      id: `page-${spec.id}`,
      label: spec.name,
      hint: spec.description,
      keywords: `${spec.name} ${spec.shortName} ${spec.description}`,
      icon: Search,
      run: () => {
        if (spec.target.type === "route") {
          void navigate({
            to: spec.target.to as "/",
            search: spec.target.search as never,
          });
        } else if (spec.target.type === "settings") {
          openSettingsPanel(spec.target.panelId);
        }
      },
    }));
  }, [currentUser.role, currentUser.grants, activePlan, navigate]);

  const actions = useMemo(() => {
    const items: PaletteAction[] = [];
    if (canAccessPath("/alunos", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-new-student",
        label: "Cadastrar novo aluno",
        hint: "Abrir matrícula interna",
        keywords: "novo aluno matricular cadastrar",
        icon: UserPlus,
        run: () => void navigate({ to: "/alunos", search: { action: "matricular" } }),
      });
      items.push({
        id: "action-confirm-enrollment",
        label: "Confirmar matrícula",
        hint: "Candidatos pendentes",
        keywords: "confirmar matrícula candidato",
        icon: GraduationCap,
        run: () => void navigate({ to: "/alunos", search: { action: "confirmar" } }),
      });
    }
    if (canAccessPath("/calendario", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-calendar",
        label: "Abrir calendário escolar",
        keywords: "calendário agenda período",
        icon: CalendarDays,
        run: () => void navigate({ to: "/calendario" }),
      });
    }
    if (canAccessPath("/pedagogica", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-attendance",
        label: "Fazer chamada",
        keywords: "presença chamada turma",
        icon: CheckSquare,
        run: () => void navigate({ to: "/pedagogica", search: { tab: "chamada" } }),
      });
    }
    if (canAccessPath("/professor/presenca", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-teacher-qr",
        label: "Assinar presença (QR)",
        keywords: "qr presença professor",
        icon: QrCode,
        run: () => void navigate({ to: "/professor/presenca" }),
      });
    }
    if (canAccessPath("/faturas", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-receipt",
        label: "Emitir / ver recibos",
        keywords: "recibo fatura pagamento",
        icon: Receipt,
        run: () => void navigate({ to: "/faturas" }),
      });
    }
    if (canAccessPath("/documentos", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-docs",
        label: "Emitir documento",
        keywords: "documento declaração certificado",
        icon: FileText,
        run: () => void navigate({ to: "/documentos" }),
      });
    }
    if (canAccessPath("/pessoas", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-people",
        label: "Abrir pessoas",
        keywords: "pessoas professores funcionários",
        icon: Users,
        run: () => void navigate({ to: "/pessoas" }),
      });
    }
    if (canAccessPath("/configuracoes", currentUser.role, currentUser.grants)) {
      items.push({
        id: "action-appearance",
        label: "Personalizar aparência",
        keywords: "tema cores aparência branding",
        icon: Palette,
        run: () => openSettingsPanel("sistema.cores"),
      });
      items.push({
        id: "action-settings",
        label: "Abrir definições",
        keywords: "definições configurações escola",
        icon: Settings,
        run: () => openSettingsPanel("escola"),
      });
    }
    items.push({
      id: "action-toggle-favorite",
      label: favorited ? "Remover dos favoritos" : "Marcar página actual como favorito",
      hint: current.label,
      keywords: "favorito estrela bookmark",
      icon: Star,
      run: () => {
        toggleFavorite();
      },
    });
    return items;
  }, [currentUser.role, currentUser.grants, navigate, favorited, current.label, toggleFavorite]);

  const runAndClose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Pesquisar páginas, acções, recentes ou favoritos…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado. Tente «aluno», «calendário» ou «recibo».</CommandEmpty>
        {favorites.length > 0 ? (
          <CommandGroup heading="Favoritos">
            {favorites.map((item) => (
              <CommandItem
                key={`fav-${itemKey(item)}`}
                value={`favorito ${item.label} ${item.path}`}
                onSelect={() => runAndClose(() => goToMemory(item.path, item.search))}
              >
                <Star className="mr-2 size-4 fill-current text-amber-500 opacity-90" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {recents.length > 0 ? (
          <CommandGroup heading="Recentes">
            {recents.slice(0, 6).map((item) => (
              <CommandItem
                key={`recent-${itemKey(item)}-${item.at}`}
                value={`recente ${item.label} ${item.path}`}
                onSelect={() => runAndClose(() => goToMemory(item.path, item.search))}
              >
                <Search className="mr-2 size-4 opacity-70" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Acções rápidas">
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={`${action.label} ${action.keywords ?? ""} ${action.hint ?? ""}`}
              onSelect={() => runAndClose(action.run)}
            >
              <action.icon className="mr-2 size-4 opacity-70" />
              <span className="flex min-w-0 flex-col">
                <span>{action.label}</span>
                {action.hint ? (
                  <span className="text-[11px] text-muted-foreground">{action.hint}</span>
                ) : null}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Páginas">
          {pages.map((page) => (
            <CommandItem
              key={page.id}
              value={`${page.label} ${page.keywords ?? ""} ${page.hint ?? ""}`}
              onSelect={() => runAndClose(page.run)}
            >
              <Search className="mr-2 size-4 opacity-70" />
              <span className="flex min-w-0 flex-col">
                <span>{page.label}</span>
                {page.hint ? (
                  <span className="text-[11px] text-muted-foreground">{page.hint}</span>
                ) : null}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
