import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useEntityFocus } from "@/features/intelligence/entity-focus-context";
import { useRelations } from "@/features/intelligence/use-relations";
import { useSuggestions } from "@/features/intelligence/use-suggestions";
import { ContextualActionsPanel } from "@/features/intelligence/components/ContextualActionsPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listChatConversations, startDirectConversation } from "@/features/messages/chat-server";
import { OPEN_DM_EVENT } from "@/features/messages/unread";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { toastActionError } from "@/lib/action-error-toast";

/* O chat é pesado (painel inteiro + realtime) e a maioria das sessões nunca
   abre o separador: só carrega quando alguém lá vai. */
const ChatDock = lazy(() =>
  import("@/features/messages/ChatDock").then(({ ChatDock }) => ({ default: ChatDock })),
);

type RailTab = "relacionado" | "mensagens";

/* Coluna da direita: "Relacionado" (ações contextuais) e "Mensagens" (chat) no
   mesmo espaço de 320px, em separadores. Duas colunas lado a lado custariam
   ~700px de largura e apertavam o conteúdo em ecrãs de 1440px.

   Em `lg:` é uma aside fixa; abaixo disso é um Sheet de fundo — o mesmo padrão
   que o painel contextual já usava. */
export function RightRail() {
  const { focusedEntity, panelCollapsed, setPanelCollapsed } = useEntityFocus();
  const relations = useRelations();
  const suggestions = useSuggestions();
  const [showMore, setShowMore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tab, setTab] = useState<RailTab>("relacionado");
  const [unread, setUnread] = useState(0);
  const [openRequest, setOpenRequest] = useState<{
    conversationId: string;
    nonce: number;
  } | null>(null);
  const nonceRef = useRef(0);
  // Um só chat de cada vez: a coluna em `lg` (computador), a folha abaixo
  // disso (telemóvel e tablet). Montar os dois abria duas ligações de tempo
  // real no mesmo canal e, ao fechar a folha, cortava a da coluna.
  const { breakpoint, ready } = useBreakpoint();
  const isDesktop = breakpoint === "desktop";

  // Sem entidade em foco não há "Relacionado" para mostrar — o chat passa a ser
  // o único separador e fica seleccionado.
  const hasRelated = Boolean(focusedEntity);
  const activeTab: RailTab = hasRelated ? tab : "mensagens";

  /* Reaproveita o evento que o sino de notificações e a fila de avatares do
     drawer já disparam (requestOpenDirectMessage): aqui resolve-se o peerId
     para a conversa directa e abre-se o separador. */
  useEffect(() => {
    const handler = (event: Event) => {
      const peerId = (event as CustomEvent<{ peerId?: string }>).detail?.peerId;
      if (!peerId) return;
      setTab("mensagens");
      // No computador abre a coluna; a folha de baixo é só para o telemóvel.
      if (isDesktop) setPanelCollapsed(false);
      else setMobileOpen(true);
      void startDirectConversation({ data: { peerId } })
        .then(({ conversationId }) => {
          nonceRef.current += 1;
          setOpenRequest({ conversationId, nonce: nonceRef.current });
        })
        .catch((error) => {
          // A lista fica aberta; o aviso diz porquê (ex.: um encarregado só
          // escreve ao pessoal da escola) e como seguir.
          toastActionError(error, "Não foi possível abrir a conversa com esta pessoa.");
        });
    };
    window.addEventListener(OPEN_DM_EVENT, handler);
    return () => window.removeEventListener(OPEN_DM_EVENT, handler);
  }, [isDesktop, setPanelCollapsed]);

  const handleUnread = useCallback((total: number) => setUnread(total), []);

  // Com o chat fechado (folha do telemóvel fechada, coluna recolhida) não há
  // tempo real: o contador vem de uma leitura leve, de minuto a minuto.
  const chatMounted =
    ready && activeTab === "mensagens" && (isDesktop ? !panelCollapsed : mobileOpen);
  const closedUnread = useQuery({
    queryKey: ["chat", "unread"],
    queryFn: async () =>
      (await listChatConversations()).conversations.reduce((n, c) => n + (c.unread || 0), 0),
    enabled: ready && !chatMounted,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: false,
    // O contador é um extra: falhar não interrompe ninguém com um aviso.
    meta: { errorToast: false },
  });
  const unreadCount = chatMounted ? unread : (closedUnread.data ?? unread);

  // Ao fechar o chat, o contador continua no número que o chat mostrava (já
  // com o que a pessoa acabou de ler), e não no da leitura anterior.
  const queryClient = useQueryClient();
  const wasMounted = useRef(false);
  useEffect(() => {
    if (wasMounted.current && !chatMounted) queryClient.setQueryData(["chat", "unread"], unread);
    wasMounted.current = chatMounted;
  }, [chatMounted, queryClient, unread]);

  const chat = (
    <Suspense
      fallback={<div className="p-6 text-center text-sm text-muted-foreground">A abrir…</div>}
    >
      <ChatDock openRequest={openRequest} onUnreadChange={handleUnread} />
    </Suspense>
  );

  const tabs = (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1.5">
      {hasRelated ? (
        <button
          type="button"
          onClick={() => setTab("relacionado")}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
            activeTab === "relacionado"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60",
          )}
        >
          Relacionado
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setTab("mensagens")}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
          activeTab === "mensagens"
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/60",
        )}
      >
        Mensagens
        {unreadCount > 0 ? (
          <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
            {unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  );

  return (
    <>
      <aside
        aria-label="Painel lateral"
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-l border-border/50 bg-card/40 backdrop-blur-xs lg:flex lg:flex-col"
        style={{ width: panelCollapsed ? "3.25rem" : "320px" }}
      >
        {panelCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 py-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="header-icon-btn"
              aria-label="Expandir painel lateral"
              onClick={() => setPanelCollapsed(false)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <button
              type="button"
              aria-label="Abrir mensagens"
              onClick={() => {
                setTab("mensagens");
                setPanelCollapsed(false);
              }}
              className="relative rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageCircle className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-destructive" />
              ) : null}
            </button>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-end border-b border-border/50 px-2 py-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="header-icon-btn"
                aria-label="Recolher painel lateral"
                onClick={() => setPanelCollapsed(true)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {tabs}
            <div className="min-h-0 flex-1">
              {activeTab === "mensagens" ? (
                ready && isDesktop ? (
                  chat
                ) : null
              ) : (
                <ContextualActionsPanel
                  title={focusedEntity?.label ?? ""}
                  relations={relations}
                  suggestions={suggestions}
                  isCollapsed={false}
                  onToggleCollapse={() => setPanelCollapsed(true)}
                  showMore={showMore}
                  onToggleShowMore={() => setShowMore((value) => !value)}
                />
              )}
            </div>
          </>
        )}
      </aside>

      {/* Abaixo de lg o painel não cabe: dois botões flutuantes abrem o Sheet. */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:hidden">
        {suggestions.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setTab("relacionado");
              setMobileOpen(true);
            }}
            aria-label="Abrir ações relacionadas"
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg"
          >
            <Sparkles className="size-4" />
            Ações · {suggestions.length}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setTab("mensagens");
            setMobileOpen(true);
          }}
          aria-label="Abrir mensagens"
          className="relative flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <MessageCircle className="size-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          ) : null}
        </button>
      </div>

      <Sheet open={mobileOpen && !isDesktop} onOpenChange={setMobileOpen}>
        {/* Quase ecrã inteiro: uma conversa num Sheet de 75vh deixa duas
            mensagens visíveis acima do teclado num telemóvel. `dvh` encolhe
            com o teclado e com a barra do navegador (`vh` não), e a margem de
            baixo deixa a caixa de escrever acima da barra do iPhone. */}
        <SheetContent
          side="bottom"
          className="flex h-[92vh] h-[92dvh] flex-col gap-0 p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{activeTab === "mensagens" ? "Mensagens" : "Relacionado"}</SheetTitle>
          </SheetHeader>
          {tabs}
          <div className="min-h-0 flex-1">
            {activeTab === "mensagens" ? (
              isDesktop ? null : (
                chat
              )
            ) : (
              <ContextualActionsPanel
                title={focusedEntity?.label ?? ""}
                relations={relations}
                suggestions={suggestions}
                isCollapsed={false}
                onToggleCollapse={() => setMobileOpen(false)}
                showMore={showMore}
                onToggleShowMore={() => setShowMore((value) => !value)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
