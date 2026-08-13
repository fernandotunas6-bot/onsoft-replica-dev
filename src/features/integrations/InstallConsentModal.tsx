import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PremiumModal } from "@/components/ui/premium-modal";
import { AppMark } from "./app-marks";
import { academicIntegrationCatalog } from "./catalog";
import { installPackageFor } from "./install";
import { installSchoolIntegration } from "./server";

export function InstallConsentModal({
  provider,
  open,
  onOpenChange,
  onInstalled,
}: {
  provider: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: (provider: string) => void;
}) {
  const queryClient = useQueryClient();
  const pack = provider ? installPackageFor(provider) : null;
  const meta = academicIntegrationCatalog.find((item) => item.id === provider);
  const allIds = useMemo(() => pack?.capabilities.map((item) => item.id) ?? [], [pack]);
  const [selected, setSelected] = useState<string[]>(allIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(allIds);
  }, [allIds, provider]);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const allow = async () => {
    if (!provider || !pack) return;
    setSaving(true);
    try {
      await installSchoolIntegration({ data: { provider, capabilityIds: selected } });
      await queryClient.invalidateQueries({ queryKey: ["school", "integrations"] });
      toast.success(`${meta?.name ?? pack.provider} instalado`, {
        description: `${selected.length} função${selected.length === 1 ? "" : "ões"} adicionada${selected.length === 1 ? "" : "s"} aos módulos SIGA.`,
      });
      onOpenChange(false);
      onInstalled?.(provider);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível instalar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open={open && Boolean(pack)}
      onOpenChange={onOpenChange}
      size="md"
      eyebrow="Instalar aplicativo"
      title={meta ? `Permitir ${meta.name}` : "Permitir aplicativo"}
      description={
        pack
          ? `${pack.summary} Ao permitir, este aplicativo pode adicionar funções nos módulos abaixo.`
          : undefined
      }
      icon={provider ? <AppMark id={provider} className="size-11" /> : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Agora não
          </Button>
          <Button onClick={() => void allow()} disabled={saving || selected.length === 0}>
            {saving ? "A instalar…" : "Permitir e instalar"}
          </Button>
        </>
      }
    >
      {pack ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={pack.installUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Instalação oficial
              </a>
            </Button>
            {pack.docsUrl !== pack.installUrl ? (
              <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                <a href={pack.docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Documentação
                </a>
              </Button>
            ) : null}
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Funções que este aplicativo quer adicionar
          </p>
          <ul className="space-y-2">
            {pack.capabilities.map((capability) => {
              const checked = selected.includes(capability.id);
              return (
                <li key={capability.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-primary"
                      aria-label={`Conceder ${capability.label}`}
                      checked={checked}
                      onChange={() => toggle(capability.id)}
                    />
                    <span>
                      <span className="block text-sm font-semibold">{capability.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {capability.moduleLabel} · {capability.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </PremiumModal>
  );
}
