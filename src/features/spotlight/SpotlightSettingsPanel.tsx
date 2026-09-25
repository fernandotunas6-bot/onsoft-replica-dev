import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconChip } from "@/components/ui/icon-chip";
import { LogoChip } from "@/components/ui/logo-chip";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import type { ApplicationRole } from "@/features/auth/access-policy";
import { spotlightCatalog } from "./catalog";
import { listSpotlightConfig, saveSpotlightOverrides } from "./server";
import { SpotlightCard } from "./SpotlightCard";
import {
  createCustomSpotlight,
  isCustomSpotlightId,
  MAX_CUSTOM_SPOTLIGHTS,
  spotlightAudienceRoles,
  spotlightInternalTargets,
  spotlightOverrideDiff,
  spotlightScheduleLabel,
  spotlightSettingsTargets,
  spotlightSurfacesFor,
  defaultSpotlightSurfaces,
  accessPathForLink,
  normalizeSpotlightHref,
  normalizeSpotlightInternalPath,
  type SpotlightItem,
  type SpotlightKind,
  type SpotlightLink,
  type SpotlightSurface,
  type SpotlightTone,
} from "./schemas";

const kindLabel: Record<SpotlightKind, string> = {
  feature: "Novidade",
  note: "Nota",
  function: "Função",
  promo: "Destaque",
};

const toneLabel: Record<SpotlightTone, string> = {
  primary: "Primário",
  info: "Informação",
  success: "Sucesso",
  warning: "Aviso",
};

const CUSTOM_INTERNAL_PATH = "__custom__";

export function SpotlightSettingsPanel() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador";
  const configQuery = useQuery({
    queryKey: ["spotlight", "config"],
    queryFn: () => listSpotlightConfig(),
    retry: false,
  });
  const remote = configQuery.data ?? spotlightCatalog;
  const [draft, setDraft] = useState<SpotlightItem[] | null>(null);
  const items = draft ?? remote;
  const [saving, setSaving] = useState(false);
  const customCount = items.filter((item) => isCustomSpotlightId(item.id)).length;

  const dirty = useMemo(() => {
    if (!draft) return false;
    return (
      JSON.stringify(spotlightOverrideDiff(spotlightCatalog, draft)) !==
      JSON.stringify(spotlightOverrideDiff(spotlightCatalog, remote))
    );
  }, [draft, remote]);

  const move = (id: string, direction: -1 | 1) => {
    const next = [...items];
    const index = next.findIndex((row) => row.id === id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= next.length) return;
    const [a, b] = [next[index], next[swap]];
    if (!a || !b) return;
    next[index] = { ...b, order: a.order };
    next[swap] = { ...a, order: b.order };
    setDraft(next);
  };

  const patch = (id: string, change: Partial<SpotlightItem>) => {
    setDraft(items.map((row) => (row.id === id ? { ...row, ...change } : row)));
  };

  const addCustom = () => {
    if (customCount >= MAX_CUSTOM_SPOTLIGHTS) {
      toast.error(`Pode criar até ${MAX_CUSTOM_SPOTLIGHTS} destaques próprios.`);
      return;
    }
    const order = Math.max(0, ...items.map((item) => item.order)) + 10;
    setDraft([...items, createCustomSpotlight(order)]);
  };

  const removeCustom = (id: string) => {
    if (!isCustomSpotlightId(id)) return;
    setDraft(items.filter((row) => row.id !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSpotlightOverrides({ data: spotlightOverrideDiff(spotlightCatalog, items) });
      await queryClient.invalidateQueries({ queryKey: ["spotlight"] });
      setDraft(null);
      toast.success("Destaques actualizados", {
        description: "O painel da conta passa a mostrar esta ordem e estes textos.",
      });
    } catch (error) {
      toast.error("Não foi possível guardar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cartões do painel da conta e do início. O botão pode abrir uma página do SIGA, um sítio
        externo ou um painel de Definições.
      </p>
      {configQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar destaques…</p>
      ) : null}
      {canEdit ? (
        <Button type="button" variant="outline" className="gap-2" onClick={addCustom}>
          <Plus className="size-4" />
          Novo destaque
        </Button>
      ) : null}
      <ul className="space-y-3">
        {items.map((item, index) => {
          const custom = isCustomSpotlightId(item.id);
          return (
            <li key={item.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                {item.logoUrl?.trim() ? (
                  <LogoChip
                    src={item.logoUrl.trim()}
                    tone={item.tone}
                    size="sm"
                    label={item.title}
                  />
                ) : (
                  <IconChip icon={Sparkles} tone={item.tone} size="sm" label={item.title} />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {custom ? "Da escola" : "Catálogo"} · {kindLabel[item.kind]}
                    </p>
                    <Switch
                      checked={item.enabled}
                      disabled={!canEdit}
                      onCheckedChange={(enabled) => patch(item.id, { enabled })}
                      aria-label={`Mostrar ${item.title}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`spot-title-${item.id}`} className="text-xs">
                      Título
                    </Label>
                    <Input
                      id={`spot-title-${item.id}`}
                      value={item.title}
                      disabled={!canEdit}
                      maxLength={80}
                      onChange={(event) => patch(item.id, { title: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`spot-body-${item.id}`} className="text-xs">
                      Texto
                    </Label>
                    <Textarea
                      id={`spot-body-${item.id}`}
                      value={item.body}
                      disabled={!canEdit}
                      maxLength={180}
                      className="min-h-16"
                      onChange={(event) => patch(item.id, { body: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`spot-cta-${item.id}`} className="text-xs">
                      Botão
                    </Label>
                    <Input
                      id={`spot-cta-${item.id}`}
                      value={item.cta}
                      disabled={!canEdit}
                      maxLength={40}
                      onChange={(event) => patch(item.id, { cta: event.target.value })}
                    />
                  </div>
                  <SpotlightLookFields
                    item={item}
                    disabled={!canEdit}
                    onPatch={(change) => patch(item.id, change)}
                  />
                  <SpotlightLinkFields
                    item={item}
                    disabled={!canEdit}
                    onPatch={(change) => patch(item.id, change)}
                  />
                  <SpotlightSurfaceFields
                    item={item}
                    disabled={!canEdit}
                    onPatch={(change) => patch(item.id, change)}
                  />
                  <SpotlightAudienceFields
                    item={item}
                    disabled={!canEdit}
                    onPatch={(change) => patch(item.id, change)}
                  />
                  <div className="pt-1">
                    <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                      Pré-visualização
                    </p>
                    <SpotlightCard
                      item={item}
                      {...(item.link.type === "internal" ? { href: item.link.to } : {})}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!canEdit || index === 0}
                    onClick={() => move(item.id, -1)}
                    aria-label="Subir"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={!canEdit || index === items.length - 1}
                    onClick={() => move(item.id, 1)}
                    aria-label="Descer"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  {custom ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      disabled={!canEdit}
                      onClick={() => removeCustom(item.id)}
                      aria-label="Apagar destaque"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(null)}>
            Descartar
          </Button>
          <Button className="gap-2" disabled={!dirty || saving} onClick={() => void save()}>
            <Sparkles className="size-4" />
            {saving ? "A guardar…" : "Guardar destaques"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Apenas Administrador pode editar os destaques.
        </p>
      )}
    </div>
  );
}

function SpotlightLinkFields({
  item,
  disabled,
  onPatch,
}: {
  item: SpotlightItem;
  disabled: boolean;
  onPatch: (change: Partial<SpotlightItem>) => void;
}) {
  const setLink = (link: SpotlightLink) => {
    onPatch({ link, accessPath: accessPathForLink(link) });
  };
  const knownInternal = spotlightInternalTargets.some(
    (target) => item.link.type === "internal" && target.to === item.link.to,
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">Ligação do botão</Label>
        <Select
          value={item.link.type}
          disabled={disabled}
          onValueChange={(type) => {
            if (type === "internal") {
              setLink({ type: "internal", to: "/pedagogica" });
            } else if (type === "external") {
              setLink({ type: "external", href: "https://www.mined.gov.ao/" });
            } else {
              setLink({ type: "settings", panel: "destaques" });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Página do SIGA</SelectItem>
            <SelectItem value="external">Sítio externo</SelectItem>
            <SelectItem value="settings">Definições</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.link.type === "internal" ? (
        <div className="space-y-1">
          <Label className="text-xs">Página</Label>
          <Select
            value={knownInternal ? item.link.to : CUSTOM_INTERNAL_PATH}
            disabled={disabled}
            onValueChange={(to) => {
              if (to === CUSTOM_INTERNAL_PATH) {
                setLink({ type: "internal", to: "/" });
                return;
              }
              setLink({ type: "internal", to });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spotlightInternalTargets.map((target) => (
                <SelectItem key={target.to} value={target.to}>
                  {target.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_INTERNAL_PATH}>Outra página…</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {item.link.type === "internal" ? (
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`spot-path-${item.id}`} className="text-xs">
            Caminho interno
          </Label>
          <Input
            id={`spot-path-${item.id}`}
            value={item.link.to}
            disabled={disabled}
            placeholder="/alunos"
            onChange={(event) => setLink({ type: "internal", to: event.target.value || "/" })}
            onBlur={(event) =>
              setLink({
                type: "internal",
                to: normalizeSpotlightInternalPath(event.target.value) || "/",
              })
            }
          />
        </div>
      ) : null}
      {item.link.type === "settings" ? (
        <div className="space-y-1">
          <Label className="text-xs">Painel</Label>
          <Select
            value={item.link.panel}
            disabled={disabled}
            onValueChange={(panel) => setLink({ type: "settings", panel })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spotlightSettingsTargets.map((target) => (
                <SelectItem key={target.panel} value={target.panel}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {item.link.type === "external" ? (
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`spot-href-${item.id}`} className="text-xs">
            URL externo
          </Label>
          <Input
            id={`spot-href-${item.id}`}
            type="url"
            value={item.link.href}
            disabled={disabled}
            placeholder="https://exemplo.ao"
            onChange={(event) => setLink({ type: "external", href: event.target.value })}
            onBlur={(event) => {
              const href = normalizeSpotlightHref(event.target.value);
              if (href) setLink({ type: "external", href });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SpotlightSurfaceFields({
  item,
  disabled,
  onPatch,
}: {
  item: SpotlightItem;
  disabled: boolean;
  onPatch: (change: Partial<SpotlightItem>) => void;
}) {
  const current = spotlightSurfacesFor(item);
  const toggle = (surface: SpotlightSurface) => {
    const next = current.includes(surface)
      ? current.filter((entry) => entry !== surface)
      : [...current, surface];
    if (!next.length) {
      toast.error("Escolha pelo menos o início ou o painel da conta.");
      return;
    }
    const fallback = defaultSpotlightSurfaces(item.kind);
    const same = [...next].sort().join("|") === [...fallback].sort().join("|");
    onPatch({ surfaces: same ? undefined : next });
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">Onde aparece</Label>
      <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2">
        <label className="flex items-center justify-between gap-3 text-sm">
          Painel da conta
          <Switch
            checked={current.includes("drawer")}
            disabled={disabled}
            onCheckedChange={() => toggle("drawer")}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          Início
          <Switch
            checked={current.includes("home")}
            disabled={disabled}
            onCheckedChange={() => toggle("home")}
          />
        </label>
      </div>
    </div>
  );
}

function SpotlightAudienceFields({
  item,
  disabled,
  onPatch,
}: {
  item: SpotlightItem;
  disabled: boolean;
  onPatch: (change: Partial<SpotlightItem>) => void;
}) {
  const selected = new Set(item.roles ?? []);
  const toggleRole = (role: ApplicationRole) => {
    const next = selected.has(role)
      ? [...selected].filter((entry) => entry !== role)
      : [...selected, role];
    onPatch({ roles: next.length ? (next as SpotlightItem["roles"]) : undefined });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Quem vê</Label>
        <p className="text-[11px] text-muted-foreground">
          Sem selecção, todos os cargos da escola.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {spotlightAudienceRoles.map((role) => (
            <Button
              key={role}
              type="button"
              size="sm"
              variant={selected.has(role) ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              disabled={disabled}
              onClick={() => toggleRole(role)}
            >
              {role}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`spot-start-${item.id}`} className="text-xs">
            Início
          </Label>
          <Input
            id={`spot-start-${item.id}`}
            type="date"
            value={item.startsOn ?? ""}
            disabled={disabled}
            onChange={(event) => onPatch({ startsOn: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`spot-end-${item.id}`} className="text-xs">
            Fim
          </Label>
          <Input
            id={`spot-end-${item.id}`}
            type="date"
            value={item.endsOn ?? ""}
            disabled={disabled}
            onChange={(event) => onPatch({ endsOn: event.target.value || undefined })}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{spotlightScheduleLabel(item)}</p>
    </div>
  );
}

function SpotlightLookFields({
  item,
  disabled,
  onPatch,
}: {
  item: SpotlightItem;
  disabled: boolean;
  onPatch: (change: Partial<SpotlightItem>) => void;
}) {
  const { school } = useSchoolSettings();
  const schoolLogo = school?.branding?.logo_url ?? "";

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={item.kind}
            disabled={disabled}
            onValueChange={(kind) => {
              const next = kind as SpotlightKind;
              const wasDefault =
                [...spotlightSurfacesFor(item)].sort().join("|") ===
                [...defaultSpotlightSurfaces(item.kind)].sort().join("|");
              onPatch(wasDefault ? { kind: next, surfaces: undefined } : { kind: next });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(kindLabel) as SpotlightKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {kindLabel[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cor</Label>
          <Select
            value={item.tone}
            disabled={disabled}
            onValueChange={(tone) => onPatch({ tone: tone as SpotlightTone })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(toneLabel) as SpotlightTone[]).map((tone) => (
                <SelectItem key={tone} value={tone}>
                  {toneLabel[tone]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`spot-logo-${item.id}`} className="text-xs">
          Logótipo (URL)
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`spot-logo-${item.id}`}
            value={item.logoUrl ?? ""}
            disabled={disabled}
            placeholder="https://…/logo.png (opcional)"
            className="font-mono text-xs"
            onChange={(event) => onPatch({ logoUrl: event.target.value.trim() || undefined })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !schoolLogo}
            onClick={() => onPatch({ logoUrl: schoolLogo })}
          >
            Usar logótipo da escola
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || !item.logoUrl}
            onClick={() => onPatch({ logoUrl: undefined })}
          >
            Limpar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sem URL personalizada, o cartão usa um ícone genérico. O logótipo institucional fica na
          barra lateral.
        </p>
        <div className="pt-1">
          {item.logoUrl?.trim() ? (
            <LogoChip src={item.logoUrl.trim()} tone={item.tone} size="md" label={item.title} />
          ) : (
            <IconChip icon={Sparkles} tone={item.tone} size="md" label={item.title} />
          )}
        </div>
      </div>
    </div>
  );
}
