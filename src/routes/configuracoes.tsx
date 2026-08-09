import { createFileRoute } from "@tanstack/react-router";
import { Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { configuracaoEscola, parametrosFinanceiros } from "@/lib/modules-data";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do Sistema · ONSCHOOL" },
      {
        name: "description",
        content:
          "Dados da instituição, ano lectivo, parâmetros financeiros e preferências gerais do sistema escolar.",
      },
      { property: "og:title", content: "Configurações do Sistema · ONSCHOOL" },
      {
        property: "og:description",
        content: "Defina identidade da escola, ano lectivo, moeda e parâmetros de cobrança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfiguracoesPage,
});

const campos = [
  { id: "nome", label: "Nome da instituição", value: configuracaoEscola.nome },
  { id: "nif", label: "NIF", value: configuracaoEscola.nif },
  { id: "diretor", label: "Director geral", value: configuracaoEscola.diretor },
  { id: "telefone", label: "Telefone", value: configuracaoEscola.telefone },
  { id: "email", label: "E-mail institucional", value: configuracaoEscola.email },
  { id: "endereco", label: "Endereço", value: configuracaoEscola.endereco },
];

function ConfiguracoesPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Config. do Sistema"
          title="Configurações"
          description="Identidade da escola, ano lectivo, parâmetros financeiros e preferências do sistema."
          actions={
            <Button className="gap-2">
              <Save className="size-4" /> Guardar alterações
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Dados da instituição" description="Aparecem em documentos e facturas">
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
              {campos.map((c) => (
                <div key={c.id} className="space-y-2 sm:col-span-2">
                  <Label htmlFor={c.id}>{c.label}</Label>
                  <Input id={c.id} defaultValue={c.value} />
                </div>
              ))}
            </form>
          </Panel>

          <div className="space-y-6">
            <Panel title="Ano lectivo" description="Período e avaliação">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Ano lectivo activo</dt>
                  <dd className="font-semibold">{configuracaoEscola.anoLectivo}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Moeda</dt>
                  <dd className="font-semibold">{configuracaoEscola.moeda}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Períodos de avaliação</dt>
                  <dd className="font-semibold">{configuracaoEscola.trimestres} trimestres</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Média mínima de aprovação</dt>
                  <dd className="font-semibold">{configuracaoEscola.mediaMinima} valores</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Parâmetros financeiros" description="Valores base de cobrança">
              <ul className="divide-y divide-border">
                {parametrosFinanceiros.map((p) => (
                  <li key={p.label} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-muted-foreground">{p.label}</span>
                    <span className="font-semibold">{p.valor}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Preferências" description="Comportamento do sistema">
              <ul className="space-y-4">
                {[
                  "Enviar SMS automático de mensalidade em atraso",
                  "Permitir portal do encarregado",
                  "Bloquear notas após fecho do trimestre",
                  "Exigir autenticação em dois passos para administradores",
                ].map((label, i) => (
                  <li key={label} className="flex items-center justify-between gap-4">
                    <span className="text-sm">{label}</span>
                    <Switch defaultChecked={i !== 3} aria-label={label} />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-soft">
          <Settings2 className="size-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            Estas configurações são visuais por agora; passam a ser persistidas quando o backend for
            ligado.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
