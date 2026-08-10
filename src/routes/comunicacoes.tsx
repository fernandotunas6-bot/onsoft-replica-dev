import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, Monitor, Send } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { comunicados } from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/comunicacoes")({
  head: () => ({
    meta: [
      { title: "Comunicações · SIGA" },
      {
        name: "description",
        content:
          "Envie comunicados por SMS, e-mail ou portal para encarregados, alunos e professores da escola.",
      },
      { property: "og:title", content: "Comunicações · SIGA" },
      {
        property: "og:description",
        content: "Comunicados enviados, agendados e rascunhos num único painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComunicacoesPage,
});

const canalIcon = { SMS: MessageSquare, "E-mail": Mail, Portal: Monitor } as const;
const estadoTone = {
  Enviado: toneClass.success,
  Agendado: toneClass.info,
  Rascunho: toneClass.muted,
} as const;

function ComunicacoesPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title="Comunicações"
          description="Comunicados institucionais para encarregados, alunos e corpo docente."
          actions={
            <Button className="gap-2">
              <Send className="size-4" /> Novo comunicado
            </Button>
          }
        />

        <StatGrid
          items={[
            { label: "Comunicados", value: String(comunicados.length), hint: "Últimos 30 dias" },
            {
              label: "Enviados",
              value: String(comunicados.filter((c) => c.estado === "Enviado").length),
              hint: "Entregues com sucesso",
            },
            {
              label: "Agendados",
              value: String(comunicados.filter((c) => c.estado === "Agendado").length),
              hint: "A aguardar data",
            },
            { label: "Taxa de leitura", value: "78%", hint: "Portal do encarregado" },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Histórico" description="Comunicados criados na escola">
            <ul className="space-y-4">
              {comunicados.map((c) => {
                const Icon = canalIcon[c.canal];
                return (
                  <li key={c.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
                          <Icon className="size-4" />
                        </span>
                        <div>
                          <p className="font-semibold">{c.titulo}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{c.mensagem}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {c.destino} · {c.canal} · {c.data}
                          </p>
                        </div>
                      </div>
                      <span className={cn(badgeBase, estadoTone[c.estado])}>{c.estado}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Redigir comunicado" description="Pré-visualização do formulário de envio">
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <Label htmlFor="titulo">Assunto</Label>
                <Input id="titulo" placeholder="Ex.: Reunião de encarregados" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destino">Destinatários</Label>
                <select
                  id="destino"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option>Todos os encarregados</option>
                  <option>Encarregados com pendências</option>
                  <option>Alunos 7ª – 9ª</option>
                  <option>Corpo docente</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="canal">Canal</Label>
                <select
                  id="canal"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option>SMS</option>
                  <option>E-mail</option>
                  <option>Portal</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mensagem">Mensagem</Label>
                <Textarea id="mensagem" rows={5} placeholder="Escreva a mensagem…" />
              </div>
              <Button type="submit" className="w-full gap-2">
                <Send className="size-4" /> Enviar comunicado
              </Button>
            </form>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
