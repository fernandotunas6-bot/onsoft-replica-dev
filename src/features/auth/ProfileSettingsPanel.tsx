import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, FolderOpen, LoaderCircle, Shield, Sliders, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CameraCaptureModal } from "@/components/modals/CameraCaptureModal";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileBlob } from "@/features/arquivos/resolve-file";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  setCurrentProfileAvatar,
  updateCurrentProfile,
  uploadCurrentProfileAvatar,
} from "./server";

/**
 * Perfil da conta (foto + câmera + nome + telemóvel) — usado no Centro de Configurações
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? "");
      const base64 = res.split(",")[1] ?? res;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function ProfileAvatarField() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

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
    try {
      const base64 = await fileToBase64(file);
      const profile = await uploadCurrentProfileAvatar({
        data: {
          fileName: file.name,
          contentType: file.type,
          base64,
        },
      });

      queryClient.setQueryData(["auth", "profile", currentUser.id], (prev: unknown) => ({
        ...(typeof prev === "object" && prev ? prev : {}),
        avatar_url: profile.avatar_url,
      }));
      toast.success("Foto de perfil actualizada com sucesso.");
    } catch (err) {
      toast.error("Não foi possível carregar a imagem.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <UserAvatar
        url={currentUser.avatarUrl}
        initials={currentUser.initials}
        className="size-20 bg-primary-soft text-2xl font-extrabold text-primary ring-2 ring-primary/20 shadow-sm"
      />
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Escolher Ficheiro */}
          <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
            <label htmlFor="set-avatar" className="cursor-pointer">
              {uploading ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4 text-primary" />
              )}
              {uploading ? "A carregar…" : "Ficheiro"}
            </label>
          </Button>

          {/* 2. Tirar Foto (Câmera) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="mr-2 size-4 text-primary" />
            Tirar Foto (Câmera)
          </Button>

          {/* 3. Escolher dos Arquivos SIGA */}
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
        </div>

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
          Envie um ficheiro PNG, JPG ou WebP (máx. 4 MB), utilize a câmera ao vivo ou escolha dos
          Arquivos.
        </p>

        {/* WebRTC Camera Capture Dialog */}
        <CameraCaptureModal
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onCapture={(file) => void uploadAvatar(file)}
        />
      </div>
    </div>
  );
}

export function ProfileSettingsPanel() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const stackNav = useOptionalStackNav();

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
      stackNav?.reportDirty(false);
      toast.success("Perfil actualizado com segurança.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={saveProfile} onChange={() => stackNav?.reportDirty(true)}>
      <ProfileAvatarField />
      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="set-nome">Nome completo</Label>
            {currentUser.role === "Administrador" && (
              <Badge variant="outline" className="gap-1 border-primary/30 text-primary text-xs">
                <Shield className="size-3" /> Administrador SIGA
              </Badge>
            )}
          </div>
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
          <Label htmlFor="set-first-name">Primeiro nome (opcional)</Label>
          <Input
            id="set-first-name"
            name="firstName"
            defaultValue={currentUser.firstName ?? ""}
            placeholder="Ex.: Manuel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-last-name">Sobrenome (opcional)</Label>
          <Input
            id="set-last-name"
            name="lastName"
            defaultValue={currentUser.lastName ?? ""}
            placeholder="Ex.: Joaquim"
          />
        </div>
        <Field
          id="set-email"
          label="E-mail (Identidade Global)"
          type="email"
          defaultValue={currentUser.email}
          readOnly
        />
        <div className="space-y-1.5">
          <Label htmlFor="set-phone">Telemóvel (Angola +244)</Label>
          <Input
            key={`${currentUser.profile.data?.updated_at ?? "loading"}-phone`}
            id="set-phone"
            name="phone"
            defaultValue={currentUser.phone ?? ""}
            placeholder="+244 9XX XXX XXX"
            autoComplete="tel"
          />
        </div>
        <Field
          id="set-cargo"
          label="Cargo / Função Actual"
          defaultValue={currentUser.role}
          readOnly
        />
        <Field
          id="set-escola"
          label="Instituição Actual"
          defaultValue={
            currentUser.activeSchool?.schoolName ??
            currentUser.schoolName ??
            "Instituição Principal"
          }
          readOnly
        />
      </div>

      <p className="text-xs text-muted-foreground">
        O seu endereço de e-mail e nível de acesso são configurados pela administração central.
      </p>

      <div className="flex items-center justify-between pt-2">
        {currentUser.role === "Administrador" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sliders className="size-3.5 text-primary" />
            <span>Centro de Definições avançadas ativo</span>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || currentUser.profile.isLoading}>
            {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
            {saving ? "A guardar…" : "Guardar perfil"}
          </Button>
        </div>
      </div>
    </form>
  );
}
