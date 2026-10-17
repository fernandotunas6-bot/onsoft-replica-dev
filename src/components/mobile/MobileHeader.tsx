import * as React from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Bell, ChevronDown, Search } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { cn } from "@/lib/utils";

/**
 * Header mobile (§10). Dois padrões, não um:
 *
 * - **Raiz** (`/`): identidade e contexto — saudação, escola, ano. É onde o
 *   utilizador precisa de saber "de que escola são estes números".
 * - **Página interna**: voltar + título + uma acção. Nada mais; os dez botões
 *   do header desktop não cabem a 360px e nenhum deles é o que se vem fazer.
 *
 * O botão de voltar usa o histórico do router quando há para onde voltar, e cai
 * na rota-mãe quando a página foi aberta por link directo (§59) — voltar para
 * fora da aplicação a partir de uma ficha de aluno é sempre erro.
 */
export function MobileHeader({
  title,
  onOpenContext,
  onOpenSearch,
  onOpenNotifications,
  onOpenAccount,
  noticeCount = 0,
  action,
  /** Caminho de recurso quando não há histórico dentro da aplicação. */
  fallbackTo = "/",
}: {
  title?: string;
  onOpenContext: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenAccount: () => void;
  noticeCount?: number;
  action?: React.ReactNode;
  fallbackTo?: string;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentUser = useCurrentAccount();
  const { school, selectedYearLabel } = useSchoolSettings();
  const isRoot = pathname === "/";

  const goBack = () => {
    if (window.history.length > 1) {
      router.history.back();
      return;
    }
    void router.navigate({ to: fallbackTo });
  };

  return (
    <header className="sticky top-0 z-[30] border-b border-border bg-background/95 backdrop-blur-sm lg:hidden">
      <div className="flex h-14 items-center gap-2 px-3">
        {isRoot ? (
          <>
            <button
              type="button"
              onClick={onOpenContext}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-left active:bg-secondary"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {greeting()}, {currentUser.name.split(" ")[0]}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="truncate">{school?.name ?? "SIGA"}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{selectedYearLabel}</span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
                </span>
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={goBack}
              aria-label="Voltar"
              className="touch-target -ml-1 inline-flex items-center justify-center rounded-full text-foreground active:bg-secondary"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
              {title ?? "SIGA"}
            </h1>
          </>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {action}
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Pesquisar no SIGA"
            className="touch-target inline-flex items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <Search className="size-5" />
          </button>
          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label={noticeCount ? `Notificações (${noticeCount} não lidas)` : "Notificações"}
            className="touch-target relative inline-flex items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <Bell className="size-5" />
            {noticeCount ? (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-background" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            aria-label="Abrir painel da conta"
            className="touch-target inline-flex items-center justify-center rounded-full"
          >
            <UserAvatar
              url={currentUser.avatarUrl}
              initials={currentUser.initials}
              className="size-8 bg-primary text-[11px] font-medium text-primary-foreground"
            />
          </button>
        </div>
      </div>
    </header>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 19) return "Boa tarde";
  return "Boa noite";
}

/**
 * Barra de contexto (§12): a linha fina sob o header que diz em que turma,
 * período ou filtro o ecrã está. Mostra-se só quando há contexto a mostrar —
 * uma barra vazia rouba 36px de conteúdo em todos os ecrãs.
 */
export function ContextBar({
  items,
  onPress,
}: {
  items: { label: string; value: string }[];
  onPress?: () => void;
}) {
  if (!items.length) return null;
  const content = (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
        >
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-medium">{item.value}</span>
        </span>
      ))}
    </div>
  );

  if (!onPress)
    return <div className="border-b border-border bg-background lg:hidden">{content}</div>;
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn("block w-full border-b border-border bg-background text-left lg:hidden")}
    >
      {content}
    </button>
  );
}
