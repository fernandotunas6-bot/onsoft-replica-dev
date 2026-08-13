import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CreditCard,
  GraduationCap,
  FolderOpen,
  Gauge,
  KeyRound,
  LoaderCircle,
  Palette,
  Link2,
  Plug,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
  UserCog,
} from "lucide-react";
import { StackedModal, type StackPanel } from "@/components/ui/stacked-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileBlob } from "@/features/arquivos/resolve-file";
import { AppearanceColors } from "@/components/settings/AppearanceColors";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getCurrentAccountContext,
  setCurrentProfileAvatar,
  updateCurrentProfile,
} from "@/features/auth/server";
import { normalizeAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { PasswordChangeForm } from "@/features/auth/PasswordChangeForm";
import {
  FinancePanel,
  IntegrationsPanel,
  PedagogicalSettingsPanel,
  SchoolSettingsPanel,
  SecurityPanel,
} from "@/features/school/settings-panels";
import { EnrollmentCampaignPanel } from "@/features/enrollment/EnrollmentCampaignPanel";
import { SpotlightSettingsPanel } from "@/features/spotlight/SpotlightSettingsPanel";
import { FilesSettingsPanel } from "@/features/arquivos/FilesSettingsPanel";
import { PerformancePanel } from "@/features/school/PerformancePanel";
import { supabase } from "@/integrations/supabase/client";

/**
 * Centro único de configurações do SIGA: tudo o que antes vivia espalhado
 * (página /configuracoes, atalhos no cabeçalho) fica aqui, num só modal.
 */

function Field({
  label,
  defaultValue,
  id,
  type = "text",
  readOnly = false,
}: {
  label: string;
  defaultValue?: string;
  id: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} defaultValue={defaultValue} readOnly={readOnly} />
    </div>
  );
}

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

function ProfileAvatarField() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadAvatar = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("Use uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("A imagem deve ter no máximo 4 MB.");
      return;
    }

    setUploading(true);
    let uploadedPath: string | null = null;
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${currentUser.id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const profile = await setCurrentProfileAvatar({ data: { storagePath: path } });

      queryClient.setQueryData(["auth", "profile", currentUser.id], (prev: unknown) => ({
        ...(typeof prev === "object" && prev ? prev : {}),
        avatar_url: profile.avatar_url,
      }));
      toast.success("Foto de perfil actualizada.");
    } catch {
      if (uploadedPath) {
        await supabase.storage.from("avatars").remove([uploadedPath]);
      }
      toast.error("Não foi possível carregar a imagem.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <UserAvatar
        url={currentUser.avatarUrl}
        initials={currentUser.initials}
        className="size-16 bg-primary-soft text-xl font-extrabold text-primary ring-1 ring-border"
      />
      <div className="space-y-1.5">
        <Label htmlFor="set-avatar" className="sr-only">
          Foto de perfil
        </Label>
        <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
          <label htmlFor="set-avatar" className="cursor-pointer">
            {uploading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
            {uploading ? "A carregar…" : "Alterar foto"}
          </label>
        </Button>
        <PickFileButton
          label="Da biblioteca"
          area="pessoal"
          acceptKinds={["png", "jpeg"]}
          variant="outline"
          size="sm"
          onPick={(file) => {
            void (async () => {
              try {
                const blob = await resolveFileBlob(file);
                const asFile = new File([blob], file.name, { type: file.mime || blob.type });
                await uploadAvatar(asFile);
              } catch (error) {
                toast.error("Não foi possível usar o ficheiro da biblioteca", {
                  description: error instanceof Error ? error.message : "Tente novamente.",
                });
              }
            })();
          }}
        />
        <input
          id="set-avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadAvatar(file);
          }}
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPG ou WebP. Máx. 4 MB. Também pode escolher uma imagem dos Arquivos.
        </p>
      </div>
    </div>
  );
}

function ProfileSettings() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const fullName = String(new FormData(form).get("fullName") ?? "").trim();
    const phoneRaw = String(new FormData(form).get("phone") ?? "").trim();
    if (fullName.length < 2 || fullName.length > 160) {
      toast.error("O nome deve ter entre 2 e 160 caracteres.");
      return;
    }
    if (phoneRaw) {
      const phoneCheck = validateAngolaPhone(phoneRaw);
      if (!phoneCheck.ok) {
        toast.error(phoneCheck.error ?? "Telefone inválido. Use +244 9XX XXX XXX.");
        return;
      }
    }
    const phone = phoneRaw ? normalizeAngolaPhone(phoneRaw) : undefined;
    const expectedUpdatedAt = currentUser.profile.data?.updated_at;
    if (!expectedUpdatedAt) {
      toast.error("O perfil ainda não está disponível. Actualize a página e tente novamente.");
      return;
    }

    setSaving(true);
    try {
      const data = await updateCurrentProfile({
        data: {
          fullName,
          phone,
          expectedUpdatedAt,
        },
      });

      queryClient.setQueryData(["auth", "account-context", currentUser.id], (prev: unknown) => ({
        ...(typeof prev === "object" && prev ? prev : {}),
        full_name: data.full_name,
        phone: data.phone,
        updated_at: data.updated_at,
      }));
      await currentUser.profile.refetch();
      toast.success("Perfil actualizado com segurança.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={saveProfile}>
      <ProfileAvatarField />
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="set-nome">Nome completo</Label>
          <Input
            key={currentUser.profile.data?.updated_at ?? "loading"}
            id="set-nome"
            name="fullName"
            defaultValue={currentUser.name}
            minLength={2}
            maxLength={160}
            autoComplete="name"
            required
          />
        </div>
        <Field
          id="set-email"
          label="E-mail"
          type="email"
          defaultValue={currentUser.email}
          readOnly
        />
        <div className="space-y-1.5">
          <Label htmlFor="set-phone">Telemóvel</Label>
          <Input
            key={`${currentUser.profile.data?.updated_at ?? "loading"}-phone`}
            id="set-phone"
            name="phone"
            defaultValue={currentUser.phone ?? ""}
            placeholder="+244 9XX XXX XXX"
            autoComplete="tel"
          />
        </div>
        <Field id="set-cargo" label="Cargo" defaultValue={currentUser.role} readOnly />
      </div>
      <p className="text-xs text-muted-foreground">
        E-mail e cargo são geridos pela administração e não podem ser alterados aqui.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || currentUser.profile.isLoading}>
          {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
          {saving ? "A guardar…" : "Guardar perfil"}
        </Button>
      </div>
    </form>
  );
}

function useSettingsPanels(): StackPanel[] {
  return useMemo<StackPanel[]>(
    () => [
      {
        id: "root",
        title: "Definições",
        description: "Só o que o SGA guarda de facto.",
        icon: Sliders,
        tone: "primary",
        rows: [
          {
            label: "Conta",
            description: "Perfil e palavra-passe",
            icon: User,
            tone: "primary",
            to: "conta",
          },
          {
            label: "Escola",
            description: "Identidade, ano lectivo e notificações",
            icon: Building2,
            tone: "info",
            to: "escola",
          },
          {
            label: "Financeiro",
            description: "Cobrança e multas",
            icon: CreditCard,
            tone: "warning",
            to: "financeiro",
          },
          {
            label: "Matrícula pública",
            description: "Link e página de apresentação",
            icon: Link2,
            tone: "info",
            to: "matricula",
          },
          {
            label: "Destaques",
            description: "Notas e novidades no painel da conta",
            icon: Sparkles,
            tone: "primary",
            to: "destaques",
          },
          {
            label: "Arquivos",
            description: "Áreas e visibilidade dos ficheiros",
            icon: FolderOpen,
            tone: "info",
            to: "arquivos",
          },
          {
            label: "Integrações",
            description: "Gmail e outros canais",
            icon: Plug,
            tone: "primary",
            to: "integracoes",
          },
          {
            label: "Segurança",
            description: "Políticas e auditoria",
            icon: ShieldCheck,
            tone: "destructive",
            to: "seguranca",
          },
          {
            label: "Aparência",
            description: "Cores e tema",
            icon: Palette,
            tone: "muted",
            to: "sistema.cores",
          },
          {
            label: "Desempenho",
            description: "Vitals e consultas lentas",
            icon: Gauge,
            tone: "info",
            to: "sistema.desempenho",
          },
        ],
      },
      {
        id: "conta",
        title: "Conta",
        icon: User,
        tone: "primary",
        rows: [
          {
            label: "Perfil",
            description: "Nome e foto",
            icon: UserCog,
            tone: "primary",
            to: "conta.perfil",
          },
          {
            label: "Palavra-passe",
            description: "Alterar credenciais",
            icon: KeyRound,
            tone: "warning",
            to: "conta.senha",
          },
        ],
      },
      {
        id: "conta.perfil",
        title: "Perfil",
        icon: UserCog,
        tone: "primary",
        render: () => <ProfileSettings />,
      },
      {
        id: "conta.senha",
        title: "Palavra-passe",
        description: "Mínimo de 10 caracteres, com letra, número e símbolo.",
        icon: KeyRound,
        tone: "warning",
        render: () => <PasswordChangeForm compact />,
      },
      {
        id: "escola",
        title: "Escola",
        description: "Identidade da instituição, ano lectivo e notificações.",
        icon: Building2,
        tone: "info",
        render: () => <SchoolSettingsPanel />,
      },
      {
        id: "pedagogico",
        title: "Pedagógico",
        description: "Níveis de ensino, cursos do II ciclo e disciplinas do currículo.",
        icon: GraduationCap,
        tone: "primary",
        render: () => <PedagogicalSettingsPanel />,
      },
      {
        id: "financeiro",
        title: "Financeiro",
        description: "Parâmetros de cobrança activos nesta instalação.",
        icon: CreditCard,
        tone: "warning",
        render: () => <FinancePanel />,
      },
      {
        id: "matricula",
        title: "Matrícula pública",
        description: "Página de apresentação e link partilhável para candidaturas.",
        icon: Link2,
        tone: "info",
        render: () => <EnrollmentCampaignPanel />,
      },
      {
        id: "destaques",
        title: "Destaques",
        description: "Cartões do painel da conta: notas, novidades e atalhos.",
        icon: Sparkles,
        tone: "primary",
        render: () => <SpotlightSettingsPanel />,
      },
      {
        id: "arquivos",
        title: "Arquivos",
        description:
          "Onde a escola guarda PDF, Word, Excel e imagens — e a área por defeito de cada colaborador.",
        icon: FolderOpen,
        tone: "info",
        render: () => <FilesSettingsPanel />,
      },
      {
        id: "integracoes",
        title: "Integrações",
        description: "Estado real de cada canal ligado ao SIGA.",
        icon: Plug,
        tone: "primary",
        render: () => <IntegrationsPanel />,
      },
      {
        id: "seguranca",
        title: "Segurança",
        description: "O que esta instalação aplica de facto.",
        icon: ShieldCheck,
        tone: "destructive",
        render: () => <SecurityPanel />,
      },
      {
        id: "sistema.cores",
        title: "Aparência",
        description: "Personalização visual guardada neste browser.",
        icon: Palette,
        tone: "primary",
        render: () => <AppearanceColors />,
      },
      {
        id: "sistema.desempenho",
        title: "Desempenho",
        description: "Web Vitals, consultas e resposta ao toque.",
        icon: Gauge,
        tone: "info",
        render: () => <PerformancePanel />,
      },
    ],
    [],
  );
}

export function SettingsCenter({
  open,
  onOpenChange,
  initialPanelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPanelId?: string | undefined;
}) {
  const panels = useSettingsPanels();
  return (
    <StackedModal
      open={open}
      onOpenChange={onOpenChange}
      panels={panels}
      rootId="root"
      eyebrow="SIGA"
      size="xl"
      initialPanelId={initialPanelId}
    />
  );
}
