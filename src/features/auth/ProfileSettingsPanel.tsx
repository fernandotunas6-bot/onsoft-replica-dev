import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileBlob } from "@/features/arquivos/resolve-file";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { setCurrentProfileAvatar, updateCurrentProfile } from "./server";

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Perfil da conta (foto + nome + telemóvel) — usado no Centro de Configurações
 * (modal) e na página dedicada /perfil. Uma só fonte, dois pontos de entrada.
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

      // useCurrentAccount() lê ["auth", "account-context", id] — não "profile".
      // Escrever na chave errada deixava o upload a ter sucesso sem o avatar
      // se actualizar em lado nenhum da app (cabeçalho, menu, /perfil).
      queryClient.setQueryData(["auth", "account-context", currentUser.id], (prev: unknown) => ({
        ...(typeof prev === "object" && prev ? prev : {}),
        avatar_url: profile.avatar_url,
        updated_at: profile.updated_at,
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

export function ProfileSettingsPanel() {
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
    <form className="space-y-6" onSubmit={saveProfile}>
      <FormSection title="Fotografia" description="Visível para os colegas nas mensagens.">
        <ProfileAvatarField />
      </FormSection>

      <Separator />

      <FormSection title="Dados pessoais" description="Pode editar e guardar livremente.">
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
        </div>
      </FormSection>

      <Separator />

      <FormSection
        title="Geridos pela administração"
        description="Só a equipa de gestão de acessos pode alterar estes campos."
      >
        <div className="grid gap-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 sm:grid-cols-2">
          <Field
            id="set-email"
            label="E-mail"
            type="email"
            defaultValue={currentUser.email}
            readOnly
          />
          <Field id="set-cargo" label="Cargo" defaultValue={currentUser.role} readOnly />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />
          Peça a um administrador em Acessos para alterar e-mail ou cargo.
        </p>
      </FormSection>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || currentUser.profile.isLoading}>
          {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
          {saving ? "A guardar…" : "Guardar perfil"}
        </Button>
      </div>
    </form>
  );
}
