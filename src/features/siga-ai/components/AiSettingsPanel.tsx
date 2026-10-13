/**
 * Área administrativa do SIGA AI (§10): activar por escola, endereço dos
 * serviços, modelo, perfis com acesso, limites, retenção, estado e métricas.
 *
 * Só Administrador — o servidor confirma (`requireSgaWriter(["Administrador"])`),
 * este ecrã não é a fronteira. Configurar a IA é decidir que dados saem da
 * escola (modo remoto) e quanto hardware se gasta.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CircleCheck, CircleX, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { AI_PROFILES, type AiProfile } from "../prompts";
import type { AiMode } from "../schemas";
import { aiGetSettings, aiStatus, aiUpdateSettings } from "../server";

const MODE_LABEL: Record<AiMode, string> = {
  local: "Local (nesta máquina)",
  school_server: "Servidor da escola (rede interna)",
  remote: "Serviço remoto institucional",
};

const PROFILE_LABEL: Record<AiProfile, string> = {
  professor: "Professores",
  aluno: "Alunos e encarregados",
  secretaria: "Secretaria e tesouraria",
  administrador: "Administração",
};

export function AiSettingsPanel() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ["siga-ai", "settings"], queryFn: () => aiGetSettings() });
  const status = useQuery({ queryKey: ["siga-ai", "status"], queryFn: () => aiStatus() });

  const [form, setForm] = useState<{
    enabled: boolean;
    mode: AiMode;
    endpointUrl: string;
    vectorUrl: string;
    chatModel: string;
    remoteAllowed: boolean;
    allowedProfiles: AiProfile[];
    hourlyLimit: number;
    retentionDays: number;
  } | null>(null);

  useEffect(() => {
    if (form || !config.data) return;
    const settings = config.data.settings;
    setForm({
      enabled: settings.enabled,
      mode: settings.mode,
      endpointUrl: settings.endpoint_url ?? "",
      vectorUrl: settings.vector_url ?? "",
      chatModel: settings.chat_model ?? "",
      remoteAllowed: settings.remote_allowed,
      allowedProfiles: settings.allowed_profiles,
      hourlyLimit: settings.hourly_limit,
      retentionDays: settings.retention_days,
    });
  }, [config.data, form]);

  const save = useMutation({
    mutationFn: () =>
      aiUpdateSettings({
        data: {
          enabled: form!.enabled,
          mode: form!.mode,
          endpointUrl: form!.endpointUrl.trim() || null,
          vectorUrl: form!.vectorUrl.trim() || null,
          chatModel: form!.chatModel.trim() || null,
          remoteAllowed: form!.remoteAllowed,
          allowedProfiles: form!.allowedProfiles,
          hourlyLimit: form!.hourlyLimit,
          retentionDays: form!.retentionDays,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração do SIGA AI guardada.");
      void queryClient.invalidateQueries({ queryKey: ["siga-ai"] });
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível guardar a configuração."),
  });

  if (config.isLoading || !form) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />A ler a configuração…
      </div>
    );
  }

  if (config.isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {(config.error as Error)?.message ?? "Não foi possível ler a configuração do SIGA AI."}
      </p>
    );
  }

  const metrics = config.data?.metrics;
  const live = status.data;
  const needsEndpoint = form.mode !== "remote";

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        A IA responde com um modelo instalado nesta máquina ou no servidor da escola — funciona sem
        internet. Nenhum documento ou mensagem sai da escola enquanto o modo remoto não for
        autorizado aqui. Instalação e manutenção: <code>docs/siga-ai/README.md</code>.
      </p>

      {/* Estado real dos serviços, antes de qualquer campo: é o que diz se isto
          está a funcionar ou só configurado. */}
      <div className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <>
              {live.state === "available" ? (
                <Badge className="gap-1">
                  <CircleCheck className="size-3" aria-hidden="true" />
                  Serviço disponível
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CircleX className="size-3" aria-hidden="true" />
                  {live.state === "model_missing" ? "Modelo não instalado" : "Indisponível"}
                </Badge>
              )}
              <Badge variant="outline">
                {live.knowledgeBase === "ready" ? "Base documental activa" : "Sem base documental"}
              </Badge>
              {live.chatModel ? (
                <Badge variant="outline" className="font-mono text-[11px]">
                  {live.chatModel}
                </Badge>
              ) : null}
            </>
          ) : (
            <Badge variant="outline">A verificar o serviço…</Badge>
          )}
        </div>
        {live ? <p className="mt-2 text-xs text-muted-foreground">{live.message}</p> : null}
        {live?.models.length ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Modelos instalados: <span className="font-mono">{live.models.join(", ")}</span>
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <Label htmlFor="ai-enabled">SIGA AI nesta escola</Label>
          <p className="text-xs text-muted-foreground">
            Desligado, a página mostra «desactivado» e nenhum pedido chega ao modelo.
          </p>
        </div>
        <Switch
          id="ai-enabled"
          checked={form.enabled}
          onCheckedChange={(enabled) => setForm({ ...form, enabled })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai-mode">Modo de funcionamento</Label>
        <Select
          value={form.mode}
          onValueChange={(mode) => setForm({ ...form, mode: mode as AiMode })}
        >
          <SelectTrigger id="ai-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABEL) as AiMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {MODE_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.mode === "remote" ? (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/50 bg-warning/10 p-3">
          <div>
            <Label htmlFor="ai-remote" className="flex items-center gap-1.5">
              <TriangleAlert className="size-3.5 text-warning-strong" aria-hidden="true" />
              Autorizar IA remota
            </Label>
            <p className="text-xs text-muted-foreground">
              As perguntas e o contexto documental passam a ser enviados para um serviço fora da
              escola. Sem esta autorização, o modo remoto não funciona.
            </p>
          </div>
          <Switch
            id="ai-remote"
            checked={form.remoteAllowed}
            onCheckedChange={(remoteAllowed) => setForm({ ...form, remoteAllowed })}
          />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ai-endpoint">
            Endereço do serviço de IA {needsEndpoint ? "" : "(opcional)"}
          </Label>
          <Input
            id="ai-endpoint"
            value={form.endpointUrl}
            onChange={(event) => setForm({ ...form, endpointUrl: event.target.value })}
            placeholder="http://127.0.0.1:11434"
            inputMode="url"
          />
          <p className="text-xs text-muted-foreground">
            Ollama ou servidor compatível. Vazio usa o da instalação.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-vector">Endereço da base vectorial (opcional)</Label>
          <Input
            id="ai-vector"
            value={form.vectorUrl}
            onChange={(event) => setForm({ ...form, vectorUrl: event.target.value })}
            placeholder="http://127.0.0.1:6333"
            inputMode="url"
          />
          <p className="text-xs text-muted-foreground">
            Qdrant. Sem ele, a IA responde mas não consulta documentos.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai-model">Modelo de conversa</Label>
        {live?.models.length ? (
          <Select
            value={form.chatModel || "__auto__"}
            onValueChange={(value) =>
              setForm({ ...form, chatModel: value === "__auto__" ? "" : value })
            }
          >
            <SelectTrigger id="ai-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Automático (o primeiro instalado)</SelectItem>
              {live.models
                .filter((name) => !name.includes("embed"))
                .map((name) => (
                  <SelectItem key={name} value={name} className="font-mono text-xs">
                    {name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="ai-model"
            value={form.chatModel}
            onChange={(event) => setForm({ ...form, chatModel: event.target.value })}
            placeholder="qwen2.5:7b"
          />
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Perfis com acesso ao assistente</legend>
        {AI_PROFILES.map((profile) => (
          <label key={profile} className="flex items-center justify-between gap-4 text-sm">
            <span>{PROFILE_LABEL[profile]}</span>
            <Switch
              checked={form.allowedProfiles.includes(profile)}
              aria-label={PROFILE_LABEL[profile]}
              onCheckedChange={(checked) =>
                setForm({
                  ...form,
                  allowedProfiles: checked
                    ? [...form.allowedProfiles, profile]
                    : form.allowedProfiles.filter((item) => item !== profile),
                })
              }
            />
          </label>
        ))}
        {!form.allowedProfiles.length ? (
          <p className="text-xs text-destructive">Pelo menos um perfil tem de ficar autorizado.</p>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ai-limit">Perguntas por hora, por conta</Label>
          <Input
            id="ai-limit"
            type="number"
            min={1}
            max={500}
            value={form.hourlyLimit}
            onChange={(event) => setForm({ ...form, hourlyLimit: Number(event.target.value) || 1 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-retention">Retenção das conversas (dias)</Label>
          <Input
            id="ai-retention"
            type="number"
            min={0}
            max={3650}
            value={form.retentionDays}
            onChange={(event) =>
              setForm({ ...form, retentionDays: Number(event.target.value) || 0 })
            }
          />
          <p className="text-xs text-muted-foreground">0 guarda sem limite.</p>
        </div>
      </div>

      {metrics ? (
        <div className="rounded-lg border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Activity className="size-4" aria-hidden="true" />
            Utilização
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">24 horas</dt>
              <dd className="font-medium">{metrics.last24h}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">7 dias</dt>
              <dd className="font-medium">{metrics.last7d}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tempo médio</dt>
              <dd className="font-medium">
                {metrics.avgElapsedMs === null
                  ? "—"
                  : `${(metrics.avgElapsedMs / 1000).toFixed(1)} s`}
              </dd>
            </div>
          </dl>
          {metrics.topModels.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {metrics.topModels.map((item) => `${item.model} (${item.count})`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.allowedProfiles.length}
        >
          {save.isPending ? "A guardar…" : "Guardar configuração"}
        </Button>
      </div>
    </div>
  );
}
