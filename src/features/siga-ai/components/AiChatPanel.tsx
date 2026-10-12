import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { AiStatus, Citation } from "../gateway.server";
import { aiAsk, aiDeleteConversation, aiGetConversation, aiListConversations } from "../server";

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  model: string | null;
};

export function AiChatPanel({ status }: { status: AiStatus }) {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [useKb, setUseKb] = useState(true);
  const [model, setModel] = useState<string>("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const chatModels = useMemo(
    () => status.models.filter((name) => !name.includes("embed")),
    [status.models],
  );

  useEffect(() => {
    if (!model && status.chatModel) setModel(status.chatModel);
  }, [model, status.chatModel]);

  const conversations = useQuery({
    queryKey: ["siga-ai", "conversations", search],
    queryFn: () => aiListConversations({ data: { query: search || undefined, limit: 30 } }),
  });

  const openConversation = useQuery({
    queryKey: ["siga-ai", "conversation", conversationId],
    queryFn: () => aiGetConversation({ data: { conversationId: conversationId! } }),
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (!conversationId) return;
    const loaded = openConversation.data;
    if (!loaded) return;
    setTurns(
      loaded.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: message.citations,
        model: message.model,
      })),
    );
  }, [conversationId, openConversation.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        return await aiAsk({
          data: {
            question,
            useKnowledgeBase: useKb,
            ...(conversationId ? { conversationId } : {}),
            ...(model ? { model } : {}),
          },
          signal: controller.signal,
        });
      } finally {
        abortRef.current = null;
      }
    },
    onSuccess: (result) => {
      setConversationId(result.conversationId);
      setTurns((previous) => [
        ...previous.filter((turn) => turn.id !== "pending"),
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          model: result.model,
        },
      ]);
      void queryClient.invalidateQueries({ queryKey: ["siga-ai", "conversations"] });
    },
    onError: (error: Error) => {
      setTurns((previous) => previous.filter((turn) => turn.id !== "pending"));
      if (error.name === "AbortError") return;
      toast.error(error.message || "A IA não conseguiu responder.");
    },
  });

  const removeConversation = useMutation({
    mutationFn: (id: string) => aiDeleteConversation({ data: { conversationId: id } }),
    onSuccess: () => {
      setConversationId(null);
      setTurns([]);
      void queryClient.invalidateQueries({ queryKey: ["siga-ai", "conversations"] });
    },
  });

  const blocked = status.state !== "available" || !status.profileAllowed;

  function submit(question: string) {
    const clean = question.trim();
    if (clean.length < 2 || ask.isPending || blocked) return;
    setTurns((previous) => [
      ...previous,
      { id: `u-${Date.now()}`, role: "user", content: clean, citations: [], model: null },
      { id: "pending", role: "assistant", content: "", citations: [], model: null },
    ]);
    setDraft("");
    ask.mutate(clean);
  }

  function regenerate() {
    const lastQuestion = [...turns].reverse().find((turn) => turn.role === "user");
    if (!lastQuestion) return;
    setTurns((previous) => {
      const lastAssistant = previous.map((turn) => turn.role).lastIndexOf("assistant");
      return lastAssistant >= 0 ? previous.slice(0, lastAssistant) : previous;
    });
    submit(lastQuestion.content);
  }

  function exportConversation() {
    const text = turns
      .map((turn) => `${turn.role === "user" ? "Pergunta" : "SIGA AI"}:\n${turn.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "conversa-siga-ai.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      {/* Histórico — em ecrãs pequenos fica acima da conversa, com altura limitada. */}
      <Card className="flex h-fit max-h-[18rem] flex-col gap-2 p-3 lg:max-h-[calc(100vh-18rem)]">
        <div className="flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar conversas…"
            aria-label="Pesquisar conversas"
            className="h-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          onClick={() => {
            setConversationId(null);
            setTurns([]);
          }}
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          Nova conversa
        </Button>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-1 pr-2">
            {(conversations.data ?? []).map((conversation) => (
              <li key={conversation.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConversationId(conversation.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted",
                    conversationId === conversation.id && "bg-muted font-medium",
                  )}
                >
                  {conversation.title}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Apagar conversa ${conversation.title}`}
                  onClick={() => removeConversation.mutate(conversation.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </Card>

      <Card className="flex min-h-[26rem] flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {chatModels.length > 1 ? (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-8 w-[13rem]" aria-label="Modelo de IA">
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  {chatModels.map((name) => (
                    <SelectItem key={name} value={name} className="font-mono text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={useKb}
                onCheckedChange={setUseKb}
                disabled={status.knowledgeBase !== "ready"}
                aria-label="Consultar documentos autorizados"
              />
              Consultar documentos
            </label>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={regenerate}
              disabled={ask.isPending || !turns.some((turn) => turn.role === "user")}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Regenerar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={exportConversation}
              disabled={!turns.length}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Exportar
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 pr-2">
            {!turns.length ? (
              <EmptyState
                title="Comece uma conversa"
                description="Peça um plano de aula, a explicação de uma matéria, um resumo ou a redacção de um documento."
              />
            ) : null}
            {turns.map((turn) =>
              turn.id === "pending" ? (
                <div
                  key="pending"
                  className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />A pensar…
                </div>
              ) : (
                <div
                  key={turn.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    turn.role === "user"
                      ? "ml-auto max-w-[85%] bg-primary/10"
                      : "max-w-[95%] bg-muted/60",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{turn.content}</p>
                  {turn.citations.length ? (
                    <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      {turn.citations.map((citation) => (
                        <li key={`${citation.documentId}-${citation.chunkIndex}`}>
                          <span className="font-medium">{citation.documentTitle}</span> · fragmento{" "}
                          {citation.chunkIndex + 1} · relevância {citation.score}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {turn.role === "assistant" ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => {
                          void navigator.clipboard.writeText(turn.content);
                          toast.success("Resposta copiada.");
                        }}
                      >
                        <Copy className="size-3" aria-hidden="true" />
                        Copiar
                      </Button>
                      {turn.model ? (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {turn.model}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
            placeholder={blocked ? "Assistente indisponível." : "Escreva a sua pergunta…"}
            aria-label="Pergunta"
            disabled={blocked}
            rows={2}
            className="min-h-[3rem] resize-none"
          />
          {ask.isPending ? (
            <Button
              type="button"
              variant="secondary"
              className="gap-1"
              onClick={() => abortRef.current?.abort()}
            >
              <Square className="size-4" aria-hidden="true" />
              Parar
            </Button>
          ) : (
            <Button type="submit" disabled={blocked || draft.trim().length < 2} className="gap-1">
              <Send className="size-4" aria-hidden="true" />
              Enviar
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
