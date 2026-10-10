import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useEntityFocus } from "@/features/intelligence/entity-focus-context";
import { useRelations } from "@/features/intelligence/use-relations";
import { useSuggestions } from "@/features/intelligence/use-suggestions";
import { ContextualActionsPanel } from "@/features/intelligence/components/ContextualActionsPanel";
import { startDirectConversation } from "@/features/messages/chat-server";
import { OPEN_DM_EVENT, type OpenConversationRequest } from "@/features/messages/unread";
import { useInboxUnread } from "@/features/messages/use-inbox-unread";
import { useBreakpoint } from "@/hooks/use-breakpoint";

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
  // O contador vem do servidor (o mesmo do sino): com o chat fechado não há
  // ChatDock montado para o dar.
  const { unread: unreadRows } = useInboxUnread();
  const unread = unreadRows.reduce((total, row) => total + row.unread, 0);
  // Um só chat montado: a coluna no computador (lg), a folha abaixo disso.
  // Antes os dois ficavam montados (um escondido), com dois canais de tempo
  // real, e abrir pelo sino no computador abria também a folha do telemóvel.
  const { breakpoint, ready } = useBreakpoint();
  const isDesktop = breakpoint === "desktop";
  const [openRequest, setOpenRequest] = useState<{
    conversationId: string;
    nonce: number;
  } | null>(null);
  const nonceRef = useRef(0);

  // Sem entidade em foco não há "Relacionado" para mostrar — o chat passa a ser
  // o único separador e fica seleccionado.
  const hasRelated = Boolean(focusedEntity);
  const activeTab: RailTab = hasRelated ? tab : "mensagens";

  /* O sino de notificações e a fila de avatares do drawer pedem a conversa por
     OPEN_DM_EVENT: o sino já sabe a conversa; a fila de avatares só sabe a
     pessoa, e aqui resolve-se (ou cria-se) a conversa directa. */
  useEffect(() => {
    const open = (conversationId: string) => {
      nonceRef.current += 1;
      setOpenRequest({ conversationId, nonce: nonceRef.current });
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenConversationRequest>).detail ?? {};
      if (!detail.peerId && !detail.conversationId) return;
      setTab("mensagens");
      if (isDesktop) setPanelCollapsed(false);
      else setMobileOpen(true);
      if (detail.conversationId) {
        open(detail.conversationId);
        return;
      }
      void startDirectConversation({ data: { peerId: detail.peerId! } })
        .then(({ conversationId }) => open(conversationId))
        .catch(() => {
          /* A ChatDock mostra a lista; iniciar a conversa pode estar barrado
             pela regra de quem fala com quem. */
        });
    };
    window.addEventListener(OPEN_DM_EVENT, handler);
    return () => window.removeEventListener(OPEN_DM_EVENT, handler);
  }, [isDesktop, setPanelCollapsed]);

  const chat = (
    <Suspense
      fallback={<div className="p-6 text-center text-sm text-muted-foreground">A abrir…</div>}
    >
      <ChatDock openRequest={openRequest} />
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
        {unread > 0 ? (
          <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
            {unread}
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
              {unread > 0 ? (
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
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          ) : null}
        </button>
      </div>

      <Sheet open={mobileOpen && !isDesktop} onOpenChange={setMobileOpen}>
        {/* Quase ecrã inteiro: uma conversa num Sheet de 75vh deixa duas
            mensagens visíveis acima do teclado num telemóvel. */}
        <SheetContent side="bottom" className="flex h-[92vh] flex-col gap-0 p-0">
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
