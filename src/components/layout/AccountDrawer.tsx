import { Link } from "@tanstack/react-router";
import {
  Building2,
  Camera,
  FileText,
  FolderOpen,
  Home,
  Lock,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconChip } from "@/components/ui/icon-chip";
import type { ChipTone } from "@/components/ui/icon-chip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserProfileModal } from "@/components/auth/UserProfileModal";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSignOut } from "@/features/auth/use-sign-out";
import { canAccessPath } from "@/features/auth/access-policy";
import { useTenant } from "@/features/saas/tenant-context";
import {
  ColleagueAvatars,
  ColleagueDirectory,
  ColleagueThread,
  useFrequentColleagues,
  type MessengerView,
  type SchoolColleague,
} from "@/features/messages/StaffMessenger";
import { touchRecentContact } from "@/features/messages/recent-contacts";
import { OPEN_DM_EVENT } from "@/features/messages/unread";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";

type Row = {
  label: string;
  to: string;
  icon: React.ElementType;
  tone: ChipTone;
  badge?: string;
  action?: "profile_modal";
  tab?: "perfil" | "foto" | "seguranca" | "instituicoes";
};

// Lista vertical no estilo Minimals: ícone em chip suave + rótulo + contador.
const rows: Row[] = [
  { label: "Início", to: "/", icon: Home, tone: "primary" },
  {
    label: "Minha Conta / Perfil",
    to: "__profile__",
    icon: User,
    tone: "info",
    action: "profile_modal",
    tab: "perfil",
  },
  {
    label: "Instituições",
    to: "__instituicoes__",
    icon: Building2,
    tone: "primary",
    action: "profile_modal",
    tab: "instituicoes",
  },
  {
    label: "Estudantes",
    to: "/alunos",
    icon: Users,
    tone: "info",
  },
  { label: "Documentos", to: "/documentos", icon: FileText, tone: "muted" },
  { label: "Os meus arquivos", to: "/arquivos", icon: FolderOpen, tone: "info" },
  { label: "Comunicações", to: "/comunicacoes", icon: Megaphone, tone: "primary" },
  {
    label: "Segurança & Senha",
    to: "__security__",
    icon: ShieldCheck,
    tone: "warning",
    action: "profile_modal",
    tab: "seguranca",
  },
  { label: "Configurações de conta", to: "__settings__", icon: Settings, tone: "muted" },
];

export function AccountDrawer({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenSettings?: (panelId?: string) => void;
}) {
  const currentUser = useCurrentAccount();
  const { activePlan } = useTenant();
  const { signOut, signOutAllDevices, signingOut } = useSignOut();
  const { colleagues } = useFrequentColleagues();
  const [view, setView] = useState<MessengerView>("menu");
  const [peer, setPeer] = useState<SchoolColleague | null>(null);
  const [pendingPeerId, setPendingPeerId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [globalSignOutOpen, setGlobalSignOutOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<
    "perfil" | "foto" | "seguranca" | "instituicoes"
  >("perfil");

  // `useCallback` para os dois efeitos abaixo poderem depender desta função
  // em vez de replicarem à mão o que ela fecha por dentro (`currentUser.id`).
  const openThread = useCallback(
    (next: SchoolColleague) => {
      touchRecentContact(currentUser.id, next.id);
      setPeer(next);
      setView("thread");
      setPendingPeerId(null);
    },
    [currentUser.id],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const peerId = (event as CustomEvent<{ peerId?: string }>).detail?.peerId;
      if (!peerId) return;
      const person = colleagues.find((row) => row.id === peerId);
      if (person) openThread(person);
      else setPendingPeerId(peerId);
    };
    window.addEventListener(OPEN_DM_EVENT, handler);
    return () => window.removeEventListener(OPEN_DM_EVENT, handler);
  }, [colleagues, openThread]);

  useEffect(() => {
    if (!pendingPeerId) return;
    const person = colleagues.find((row) => row.id === pendingPeerId);
    if (!person) return;
    openThread(person);
  }, [colleagues, pendingPeerId, openThread]);

  const handleSignOut = async () => {
    await signOut();
    onOpenChange(false);
    setView("menu");
    setPeer(null);
  };

  const handleGlobalSignOut = async () => {
    await signOutAllDevices();
    setGlobalSignOutOpen(false);
    onOpenChange(false);
    setView("menu");
    setPeer(null);
  };

  const handleOpenProfileModal = (
    tab: "perfil" | "foto" | "seguranca" | "instituicoes" = "perfil",
  ) => {
    setProfileModalTab(tab);
    setProfileModalOpen(true);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setView("menu");
            setPeer(null);
          }
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-[280px] min-h-0 flex-col gap-0 border-l border-border bg-card/95 p-0 backdrop-blur-xl sm:w-[300px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Conta</SheetTitle>
          </SheetHeader>

          <div
            className="relative isolate overflow-hidden border-b border-primary/10 px-6 pt-8 pb-6 [--account-wash-a:var(--primary-soft)] [--account-wash-b:var(--info)]"
            style={{
              background:
                "linear-gradient(165deg, var(--account-wash-a) 0%, color-mix(in oklch, var(--account-wash-b) 14%, white) 52%, var(--card) 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-10 -right-8 size-36 rounded-full bg-primary/20 blur-2xl"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-14 -left-10 size-40 rounded-full bg-info/25 blur-2xl"
            />
            <div className="relative z-10 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => handleOpenProfileModal("foto")}
                className="group relative cursor-pointer"
                title="Alterar fotografia de perfil"
              >
                <UserAvatar
                  url={currentUser.avatarUrl}
                  initials={currentUser.initials}
                  className="size-16 bg-primary-soft text-2xl font-extrabold text-primary ring-1 ring-primary/20 ring-offset-4 ring-offset-transparent transition-transform group-hover:scale-105"
                />
                <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Camera className="size-3" />
                </span>
              </button>
              <div className="text-center leading-tight">
                <p className="text-base font-semibold text-foreground">{currentUser.name}</p>
                <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                {currentUser.phone ? (
                  <p className="text-xs text-muted-foreground mt-0.5">{currentUser.phone}</p>
                ) : null}
                {currentUser.activeSchool?.schoolName ? (
                  <Badge
                    variant="outline"
                    className="mt-1.5 text-[10px] py-0 px-2 bg-background/50"
                  >
                    {currentUser.activeSchool.schoolName}
                  </Badge>
                ) : null}
              </div>

              <ColleagueAvatars
                onOpenDirectory={() => setView("directory")}
                onOpenThread={openThread}
              />
            </div>
          </div>

          {view === "directory" ? (
            <ColleagueDirectory onBack={() => setView("menu")} onOpenThread={openThread} />
          ) : view === "thread" && peer ? (
            <ColleagueThread peer={peer} onBack={() => setView("menu")} />
          ) : (
            <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-2">
              <ul className="space-y-0.5">
                {rows
                  .filter(
                    (row) =>
                      row.action === "profile_modal" ||
                      row.to === "__settings__" ||
                      canAccessPath(row.to, currentUser.role, currentUser.grants, activePlan),
                  )
                  .map(({ label, to, icon, tone, badge, action, tab }) =>
                    action === "profile_modal" ? (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={() => handleOpenProfileModal(tab)}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground/85 outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <IconChip icon={icon} tone={tone} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                          {tab === "instituicoes" && currentUser.schools.length > 1 ? (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              {currentUser.schools.length}
                            </Badge>
                          ) : null}
                        </button>
                      </li>
                    ) : to === "__settings__" && onOpenSettings ? (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSettings(label === "Configurações de conta" ? "conta" : undefined)
                          }
                          aria-haspopup="dialog"
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground/85 outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <IconChip icon={icon} tone={tone} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                        </button>
                      </li>
                    ) : (
                      <li key={label}>
                        <Link
                          to={to}
                          onClick={() => onOpenChange(false)}
                          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <IconChip icon={icon} tone={tone} size="sm" />
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          {badge ? (
                            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ),
                  )}
              </ul>

              <SpotlightRail
                role={currentUser.role}
                grants={currentUser.grants}
                onNavigate={() => onOpenChange(false)}
                onOpenSettings={(panelId) => {
                  onOpenChange(false);
                  onOpenSettings?.(panelId);
                }}
              />
            </div>
          )}

          {view === "menu" ? (
            <div className="space-y-2 px-4 pb-6 pt-3">
              <Button
                variant="ghost"
                className="w-full justify-center gap-2 rounded-2xl bg-destructive/10 py-5 font-semibold text-destructive hover:bg-destructive/15 hover:text-destructive"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut className="size-4" />
                {signingOut ? "A sair…" : "Sair"}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center rounded-2xl text-xs"
                onClick={() => setGlobalSignOutOpen(true)}
                disabled={signingOut}
              >
                Terminar sessão em todos os dispositivos
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <UserProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        defaultTab={profileModalTab}
      />
      <AlertDialog open={globalSignOutOpen} onOpenChange={setGlobalSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar todas as sessões?</AlertDialogTitle>
            <AlertDialogDescription>
              A sua conta será desconectada neste e nos outros dispositivos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleGlobalSignOut()}
              disabled={signingOut}
            >
              {signingOut ? "A terminar…" : "Terminar todas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
