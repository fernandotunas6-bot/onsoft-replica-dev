import { useEffect, useState, type FormEvent } from "react";
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

function MfaSecurityPanel() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState<{ id: string; qrCode: string } | null>(null);
  const [incompleteFactorId, setIncompleteFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    let active = true;

    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        toast.error("Não foi possível verificar o estado do 2FA.");
      } else {
        setEnabled(Boolean(data?.totp.some((factor) => factor.status === "verified")));
        // `data.totp` só traz factores verificados (auth-js: `Factor<K,'verified'>[]`),
        // logo procurar ali por "unverified" nunca encontrava nada e a recuperação
        // de um enrolamento a meio não chegava a acontecer. `data.all` traz os dois.
        setIncompleteFactorId(
          data?.all.find(
            (factor) => factor.factor_type === "totp" && factor.status === "unverified",
          )?.id ?? null,
        );
      }
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const discardIncompleteEnrollment = async (factorId: string) => {
    setEnrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setPending(null);
      setIncompleteFactorId(null);
      setCode("");
      toast.success("Configuração 2FA incompleta removida.");
    } catch {
      toast.error("Não foi possível remover a configuração 2FA incompleta.");
    } finally {
      setEnrolling(false);
    }
  };

  const enroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "SIGA Authenticator",
      });
      if (error || !data?.totp?.qr_code) throw error ?? new Error("QR code indisponível.");
      setPending({ id: data.id, qrCode: data.totp.qr_code });
      setCode("");
    } catch {
      toast.error("Não foi possível iniciar o 2FA. Tente novamente.");
    } finally {
      setEnrolling(false);
    }
  };

  const confirm = async () => {
    if (!pending || code.trim().length < 6) return;
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: pending.id });
      if (challenge.error) throw challenge.error;
      const verified = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) throw verified.error;
      setEnabled(true);
      setPending(null);
      setCode("");
      toast.success("Autenticação de dois fatores ativada.");
    } catch {
      toast.error("Código 2FA inválido ou expirado. Tente novamente.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="size-4 text-primary" /> Autenticação de dois fatores
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Proteja a conta com uma aplicação autenticadora.
          </p>
        </div>
        <Badge variant={enabled ? "default" : "outline"}>
          {checking ? "A verificar…" : enabled ? "Ativo" : "Não configurado"}
        </Badge>
      </div>

      {!checking && !enabled && !pending && !incompleteFactorId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void enroll()}
          disabled={enrolling}
        >
          {enrolling ? "A preparar…" : "Configurar 2FA"}
        </Button>
      ) : null}

      {!checking && !enabled && !pending && incompleteFactorId ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
          <span>Existe uma configuração 2FA incompleta.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void discardIncompleteEnrollment(incompleteFactorId)}
            disabled={enrolling}
          >
            Remover e configurar novamente
          </Button>
        </div>
      ) : null}

      {pending ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <img
            src={pending.qrCode}
            alt="QR code para configurar autenticação de dois fatores"
            className="size-40 rounded-md border bg-white p-2"
          />
          <Label htmlFor="mfa-setup-code">Código da aplicação autenticadora</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="mfa-setup-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              placeholder="000000"
              maxLength={6}
            />
            <Button
              type="button"
              onClick={() => void confirm()}
              disabled={verifying || code.length !== 6}
            >
              {verifying ? "A confirmar…" : "Ativar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void discardIncompleteEnrollment(pending.id)}
              disabled={verifying || enrolling}
            >
              Cancelar configuração
            </Button>
          </div>
        </div>
      ) : null}
    </section>
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
      <MfaSecurityPanel />
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
