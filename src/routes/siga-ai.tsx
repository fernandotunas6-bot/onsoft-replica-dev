import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoading } from "@/components/ui/page-loading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiChatPanel } from "@/features/siga-ai/components/AiChatPanel";
import { AiDocumentsPanel } from "@/features/siga-ai/components/AiDocumentsPanel";
import { AiStatusBanner } from "@/features/siga-ai/components/AiStatusBanner";
import { aiStatus } from "@/features/siga-ai/server";

export const Route = createFileRoute("/siga-ai")({
  head: () => ({ meta: [{ title: "SIGA AI · SIGA" }] }),
  component: SigaAiPage,
});

/** Indicador de rede do browser — a IA local responde mesmo sem internet. */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function SigaAiPage() {
  const online = useOnlineStatus();
  const status = useQuery({
    queryKey: ["siga-ai", "status"],
    queryFn: () => aiStatus(),
    // Um serviço local pode ser ligado a qualquer momento: revalidar sem
    // martelar o endpoint.
    refetchInterval: 60_000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="SIGA AI"
          title="SIGA AI"
          description="Assistente de inteligência artificial da escola. Powered by Local Intelligence — funciona com o modelo instalado no computador ou no servidor da escola, mesmo sem internet."
          icon={Sparkles}
        />

        {status.isLoading ? (
          <PageLoading />
        ) : status.data ? (
          <>
            <AiStatusBanner status={status.data} online={online} />
            <Tabs defaultValue="chat">
              <TabsList>
                <TabsTrigger value="chat">Conversa</TabsTrigger>
                <TabsTrigger value="documentos">Base documental</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-4">
                <AiChatPanel status={status.data} />
              </TabsContent>
              <TabsContent value="documentos" className="mt-4">
                <AiDocumentsPanel status={status.data} />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Não foi possível ler o estado do SIGA AI. Recarregue a página.
          </p>
        )}
      </div>
    </AppShell>
  );
}
