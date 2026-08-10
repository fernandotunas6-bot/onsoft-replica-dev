import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarRange,
  Check,
  Mail,
  Plug,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { configuracaoEscola, parametrosFinanceiros } from "@/lib/modules-data";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do Sistema · SIGA" },
      {
        name: "description",
        content:
          "Dados da instituição, ano lectivo, parâmetros financeiros, notificações, integrações e segurança do sistema escolar.",
      },
      { property: "og:title", content: "Configurações do Sistema · SIGA" },
      {
        property: "og:description",
        content:
          "Defina identidade da escola, ano lectivo, moeda, cobrança, notificações e integrações premium.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfiguracoesPage,
});

const institutionSchema = z.object({
  nome: z.string().trim().min(3, "Nome demasiado curto").max(120, "Máximo 120 caracteres"),
  nif: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{6,20}$/, "NIF inválido (6 a 20 caracteres alfanuméricos)"),
  diretor: z.string().trim().min(3, "Indique o nome do director").max(120, "Máximo 120 caracteres"),
  telefone: z
    .string()
    .trim()
    .regex(/^[0-9+()\s-]{6,24}$/, "Telefone inválido"),
  email: z.string().trim().email("E-mail inválido").max(255, "Máximo 255 caracteres"),
  endereco: z.string().trim().min(5, "Endereço demasiado curto").max(200, "Máximo 200 caracteres"),
});

type Institution = z.infer<typeof institutionSchema>;

const institutionFields: {
  id: keyof Institution;
  label: string;
  hint?: string;
  full?: boolean;
}[] = [
  { id: "nome", label: "Nome da instituição", hint: "Aparece em facturas e certificados", full: true },
  { id: "nif", label: "NIF" },
  { id: "diretor", label: "Director geral" },
  { id: "telefone", label: "Telefone" },
  { id: "email", label: "E-mail institucional" },
  { id: "endereco", label: "Endereço", full: true },
];

const preferences = [
  {
    id: "sms",
    label: "SMS automático de mensalidade em atraso",
    description: "Envia aviso ao encarregado 3 dias após o vencimento.",
    on: true,
  },
  {
    id: "portal",
    label: "Portal do encarregado",
    description: "Acesso a notas, faltas e comprovativos de pagamento.",
    on: true,
  },
  {
    id: "notas",
    label: "Bloquear notas após fecho do trimestre",
    description: "Apenas a direcção pedagógica pode reabrir lançamentos.",
    on: true,
  },
  {
    id: "mfa",
    label: "Autenticação em dois passos para administradores",
    description: "Recomendado para contas com acesso financeiro.",
    on: false,
  },
];

const initialInstitution: Institution = {
  nome: configuracaoEscola.nome,
  nif: configuracaoEscola.nif,
  diretor: configuracaoEscola.diretor,
  telefone: configuracaoEscola.telefone,
  email: configuracaoEscola.email,
  endereco: configuracaoEscola.endereco,
};

function ConfiguracoesPage() {
  const [institution, setInstitution] = useState<Institution>(initialInstitution);
  const [errors, setErrors] = useState<Partial<Record<keyof Institution, string>>>({});
  const [anoLectivo, setAnoLectivo] = useState(configuracaoEscola.anoLectivo);
  const [moeda, setMoeda] = useState(configuracaoEscola.moeda);
  const [trimestres, setTrimestres] = useState(String(configuracaoEscola.trimestres));
  const [mediaMinima, setMediaMinima] = useState<number[]>([configuracaoEscola.mediaMinima]);
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(preferences.map((p) => [p.id, p.on])),
  );
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => {
    const base =
      JSON.stringify(institution) !== JSON.stringify(initialInstitution) ||
      anoLectivo !== configuracaoEscola.anoLectivo ||
      moeda !== configuracaoEscola.moeda ||
      trimestres !== String(configuracaoEscola.trimestres) ||
      mediaMinima[0] !== configuracaoEscola.mediaMinima;
    const prefsChanged = preferences.some((p) => toggles[p.id] !== p.on);
    return base || prefsChanged;
  }, [institution, anoLectivo, moeda, trimestres, mediaMinima, toggles]);

  const update = (id: keyof Institution, value: string) => {
    setInstitution((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: undefined }));
  };

  const reset = () => {
    setInstitution(initialInstitution);
    setErrors({});
    setAnoLectivo(configuracaoEscola.anoLectivo);
    setMoeda(configuracaoEscola.moeda);
    setTrimestres(String(configuracaoEscola.trimestres));
    setMediaMinima([configuracaoEscola.mediaMinima]);
    setToggles(Object.fromEntries(preferences.map((p) => [p.id, p.on])));
    toast.info("Alterações descartadas.");
  };

  const save = () => {
    const parsed = institutionSchema.safeParse(institution);
    if (!parsed.success) {
      const next: Partial<Record<keyof Institution, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Institution;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Corrija os campos destacados antes de guardar.");
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      toast.success("Configurações guardadas com sucesso.");
    }, 700);
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-24">
        <PageHeader
          group="Config. do Sistema"
          title="Configurações"
          description="Identidade da escola, ano lectivo, parâmetros financeiros, notificações, integrações e segurança."
          actions={
            <>
              <Button variant="outline" className="gap-2" onClick={reset} disabled={!dirty || saving}>
                <RotateCcw className="size-4" /> Descartar
              </Button>
              <Button className="gap-2" onClick={save} disabled={saving}>
                <Save className="size-4" /> {saving ? "A guardar…" : "Guardar alterações"}
              </Button>
            </>
          }
        />

        <Tabs defaultValue="instituicao" className="space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-secondary/70 p-1">
            {[
              { v: "instituicao", label: "Instituição", icon: Building2 },
              { v: "ano", label: "Ano lectivo", icon: CalendarRange },
              { v: "financeiro", label: "Financeiro", icon: Wallet },
              { v: "notificacoes", label: "Notificações", icon: Bell },
              { v: "integracoes", label: "Integrações", icon: Plug },
              { v: "seguranca", label: "Segurança", icon: ShieldCheck },
            ].map((t) => (
              <TabsTrigger key={t.v} value={t.v} className="gap-2 data-[state=active]:shadow-soft">
                <t.icon className="size-4" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="instituicao" className="mt-0 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Dados da instituição" description="Aparecem em documentos, facturas e certificados">
                <form className="grid gap-5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
                  {institutionFields.map((f) => (
                    <div key={f.id} className={`space-y-2 ${f.full ? "sm:col-span-2" : ""}`}>
                      <Label htmlFor={f.id}>{f.label}</Label>
                      <Input
                        id={f.id}
                        value={institution[f.id]}
                        onChange={(e) => update(f.id, e.target.value)}
                        aria-invalid={Boolean(errors[f.id])}
                        className={errors[f.id] ? "border-destructive" : undefined}
                      />
                      {errors[f.id] ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertCircle className="size-3.5" /> {errors[f.id]}
                        </p>
                      ) : f.hint ? (
                        <p className="text-xs text-muted-foreground">{f.hint}</p>
                      ) : null}
                    </div>
                  ))}
                </form>
              </Panel>
            </div>

            <Panel title="Pré-visualização" description="Como o cabeçalho aparece nos documentos">
              <div className="rounded-xl border border-border bg-secondary/50 p-5">
                <p className="font-display text-lg font-extrabold tracking-tight">{institution.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">NIF {institution.nif}</p>
                <Separator className="my-3" />
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Director</dt>
                    <dd className="font-medium">{institution.diretor}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Telefone</dt>
                    <dd className="font-medium">{institution.telefone}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">E-mail</dt>
                    <dd className="truncate font-medium">{institution.email}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Endereço</dt>
                    <dd className="text-right font-medium">{institution.endereco}</dd>
                  </div>
                </dl>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="ano" className="mt-0 grid gap-6 lg:grid-cols-2">
            <Panel title="Ano lectivo" description="Período activo, moeda e avaliação">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ano">Ano lectivo activo</Label>
                  <Select value={anoLectivo} onValueChange={setAnoLectivo}>
                    <SelectTrigger id="ano">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[configuracaoEscola.anoLectivo, "2025/2026", "2026/2027"]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moeda">Moeda</Label>
                  <Select value={moeda} onValueChange={setMoeda}>
                    <SelectTrigger id="moeda">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[configuracaoEscola.moeda, "AOA", "USD", "EUR"]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trimestres">Períodos de avaliação</Label>
                  <Select value={trimestres} onValueChange={setTrimestres}>
                    <SelectTrigger id="trimestres">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["2", "3", "4"].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v} períodos
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="media">Média mínima de aprovação</Label>
                    <Badge variant="secondary">{mediaMinima[0]} valores</Badge>
                  </div>
                  <Slider
                    id="media"
                    min={5}
                    max={20}
                    step={0.5}
                    value={mediaMinima}
                    onValueChange={setMediaMinima}
                  />
                  <p className="text-xs text-muted-foreground">
                    Alunos abaixo desta média entram automaticamente em lista de recuperação.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Calendário" description="Marcos do ano lectivo">
              <ul className="space-y-3">
                {[
                  { label: "Início das aulas", value: "08 Set" },
                  { label: "Fecho do 1.º trimestre", value: "12 Dez" },
                  { label: "Fecho do 2.º trimestre", value: "27 Mar" },
                  { label: "Exames finais", value: "15 Jun" },
                ].map((m) => (
                  <li
                    key={m.label}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm transition-colors hover:bg-secondary"
                  >
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-semibold">{m.value}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>

          <TabsContent value="financeiro" className="mt-0 grid gap-6 lg:grid-cols-2">
            <Panel title="Parâmetros financeiros" description="Valores base de cobrança">
              <ul className="divide-y divide-border">
                {parametrosFinanceiros.map((p) => (
                  <li key={p.label} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-muted-foreground">{p.label}</span>
                    <span className="font-semibold tabular-nums">{p.valor}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Cobrança" description="Regras de vencimento e multas">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="venc">Dia de vencimento</Label>
                  <Input id="venc" defaultValue="10" inputMode="numeric" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="multa">Multa por atraso (%)</Label>
                  <Input id="multa" defaultValue="2" inputMode="decimal" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tolerancia">Tolerância (dias)</Label>
                  <Input id="tolerancia" defaultValue="5" inputMode="numeric" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desconto">Desconto irmãos (%)</Label>
                  <Input id="desconto" defaultValue="10" inputMode="decimal" />
                </div>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="notificacoes" className="mt-0">
            <Panel title="Preferências" description="Comportamento do sistema e avisos automáticos">
              <ul className="space-y-1">
                {preferences.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/60"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                    <Switch
                      checked={toggles[p.id] ?? false}
                      onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [p.id]: v }))}
                      aria-label={p.label}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>

          <TabsContent value="integracoes" className="mt-0 grid gap-6 lg:grid-cols-2">
            <Panel
              title="Gmail (por utilizador)"
              description="Cada funcionário liga a sua própria conta Google"
              action={<Badge variant="outline">Requer login</Badge>}
            >
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
                  <Mail className="size-5" />
                </span>
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Com o Gmail ligado, cada secretária ou director envia comunicações, facturas e
                    certificados a partir do seu próprio e-mail, com histórico na caixa de saída
                    pessoal.
                  </p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {[
                      "Envio de comunicações em nome do próprio utilizador",
                      "Anexos automáticos de facturas e declarações",
                      "Registo do envio na ficha do aluno",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="size-3.5 text-success" /> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                    Para ligar contas individuais é primeiro necessário activar as contas de
                    utilizador do sistema (login próprio de cada funcionário). Enquanto isso, o botão
                    fica inactivo.
                  </div>
                  <Button disabled className="gap-2">
                    <Mail className="size-4" /> Ligar a minha conta Gmail
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel title="Outros canais" description="Estado das integrações do sistema">
              <ul className="divide-y divide-border">
                {[
                  { name: "SMS (operadora local)", state: "Activo", tone: "success" as const },
                  { name: "Portal do encarregado", state: "Activo", tone: "success" as const },
                  { name: "Pagamentos por referência", state: "Em preparação", tone: "warning" as const },
                  { name: "Exportação contabilística", state: "Inactivo", tone: "muted" as const },
                ].map((i) => (
                  <li key={i.name} className="flex items-center justify-between py-3 text-sm">
                    <span>{i.name}</span>
                    <Badge
                      variant={i.tone === "success" ? "default" : "secondary"}
                      className={i.tone === "muted" ? "text-muted-foreground" : undefined}
                    >
                      {i.state}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>

          <TabsContent value="seguranca" className="mt-0 grid gap-6 lg:grid-cols-2">
            <Panel title="Políticas de acesso" description="Regras aplicadas a todas as contas">
              <ul className="space-y-1">
                {[
                  { label: "Sessão expira após 30 minutos de inactividade", on: true },
                  { label: "Exigir senha forte (mín. 10 caracteres)", on: true },
                  { label: "Registar histórico de acessos", on: true },
                  { label: "Permitir acesso fora do horário escolar", on: false },
                ].map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/60"
                  >
                    <span className="text-sm">{s.label}</span>
                    <Switch defaultChecked={s.on} aria-label={s.label} />
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Auditoria" description="Últimos eventos sensíveis">
              <ul className="space-y-3 text-sm">
                {[
                  { who: "usuario teste", what: "Alterou parâmetros financeiros", when: "Hoje, 09:14" },
                  { who: "direcção", what: "Reabriu lançamento de notas", when: "Ontem, 16:02" },
                  { who: "secretaria", what: "Emitiu 12 declarações", when: "Ontem, 11:37" },
                ].map((e) => (
                  <li key={e.what} className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
                    <p className="font-medium">{e.what}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.who} · {e.when}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>
        </Tabs>

        {dirty ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 px-4 py-3 backdrop-blur-xl md:px-6">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3">
              <Sparkles className="size-4 text-primary" />
              <p className="text-sm text-muted-foreground">Tem alterações não guardadas.</p>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                  Descartar
                </Button>
                <Button size="sm" className="gap-2" onClick={save} disabled={saving}>
                  <Save className="size-4" /> {saving ? "A guardar…" : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
