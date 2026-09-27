import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Camera,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  Phone,
  PlusCircle,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconChip } from "@/components/ui/icon-chip";
import { CameraCaptureModal } from "@/components/modals/CameraCaptureModal";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileBlob } from "@/features/arquivos/resolve-file";
import { PasswordChangeForm } from "@/features/auth/PasswordChangeForm";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSignOut } from "@/features/auth/use-sign-out";
import { updateCurrentProfile, uploadCurrentProfileAvatar } from "@/features/auth/server";
import { normalizeAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";
import type { UserSchoolMembershipItem } from "@/integrations/supabase/sga";

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

export function UserProfileModal({
  open,
  onOpenChange,
  defaultTab = "perfil",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "perfil" | "foto" | "seguranca" | "instituicoes";
}) {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const { signOut, signingOut } = useSignOut();
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [fullName, setFullName] = useState(currentUser.name);
  const [firstName, setFirstName] = useState(currentUser.firstName ?? "");
  const [lastName, setLastName] = useState(currentUser.lastName ?? "");
  const [phone, setPhone] = useState(currentUser.phone ?? "");

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("O nome completo é obrigatório.");
      return;
    }

    if (phone.trim()) {
      const val = validateAngolaPhone(phone);
      if (!val.ok) {
        toast.error("Telefone inválido. Utilize o formato +244 9XX XXX XXX.");
        return;
      }
    }

    setSavingProfile(true);
    try {
      const normalizedPhone = phone.trim() ? normalizeAngolaPhone(phone) : "";
      const expectedUpdated = currentUser.profile.data?.updated_at || new Date().toISOString();

      await updateCurrentProfile({
        data: {
          fullName: fullName.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: normalizedPhone || undefined,
          expectedUpdatedAt: expectedUpdated,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["auth", "account-context"] });
      toast.success("Perfil actualizado com sucesso!");
    } catch (err) {
      toast.error("Não foi possível actualizar o perfil.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("Use uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("A imagem deve ter no máximo 4 MB.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const base64 = await fileToBase64(file);
      await uploadCurrentProfileAvatar({
        data: {
          fileName: file.name,
          contentType: file.type,
          base64,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["auth", "account-context"] });
      toast.success("Fotografia de perfil actualizada com sucesso!");
    } catch (err) {
      toast.error("Não foi possível carregar a imagem.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSwitchSchool = (school: UserSchoolMembershipItem) => {
    if (school.schoolId === currentUser.schoolId) {
      toast.info("Já se encontra nesta instituição.");
      return;
    }
    currentUser.setActiveSchoolId(school.schoolId);
    toast.success(`Contexto alterado para ${school.schoolName}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl overflow-hidden p-0 gap-0 border-border bg-card">
          {/* Header estilizado estilo Clerk */}
          <div className="relative border-b border-border/60 bg-muted/40 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <UserAvatar
                    url={currentUser.avatarUrl}
                    initials={currentUser.initials}
                    className="size-16 bg-primary-soft text-2xl font-bold text-primary ring-2 ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setActiveTab("foto")}
                    className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110"
                    title="Alterar fotografia"
                  >
                    <Camera className="size-3.5" />
                  </button>
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                    {currentUser.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{currentUser.email}</span>
                    <span>•</span>
                    <Badge variant="secondary" className="text-[11px] font-semibold">
                      {currentUser.role}
                    </Badge>
                    {currentUser.activeSchool?.schoolName ? (
                      <>
                        <span>•</span>
                        <span className="font-medium text-foreground/80">
                          {currentUser.activeSchool.schoolName}
                        </span>
                      </>
                    ) : null}
                  </DialogDescription>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs"
                onClick={() => {
                  onOpenChange(false);
                  void signOut();
                }}
                disabled={signingOut}
              >
                <LogOut className="size-3.5" />
                {signingOut ? "A sair…" : "Terminar sessão"}
              </Button>
            </div>
          </div>

          {/* Navegação por Abas */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="border-b border-border/60 px-6 bg-background/50">
              <TabsList className="no-scrollbar bg-transparent h-12 p-0 gap-6 max-w-full justify-start overflow-x-auto">
                <TabsTrigger
                  value="perfil"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-3 text-xs font-semibold gap-2"
                >
                  <User className="size-4" />
                  Perfil
                </TabsTrigger>
                <TabsTrigger
                  value="foto"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-3 text-xs font-semibold gap-2"
                >
                  <Camera className="size-4" />
                  Fotografia
                </TabsTrigger>
                <TabsTrigger
                  value="seguranca"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-3 text-xs font-semibold gap-2"
                >
                  <ShieldCheck className="size-4" />
                  Segurança
                </TabsTrigger>
                <TabsTrigger
                  value="instituicoes"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 pb-3 text-xs font-semibold gap-2"
                >
                  <Building2 className="size-4" />
                  Instituições
                  {currentUser.schools.length > 0 ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-1">
                      {currentUser.schools.length}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* TAB 1: PERFIL */}
              <TabsContent value="perfil" className="m-0 space-y-5">
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="prof-first-name">Primeiro Nome</Label>
                      <Input
                        id="prof-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Ex.: Manuel"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="prof-last-name">Sobrenome / Apelido</Label>
                      <Input
                        id="prof-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Ex.: Joaquim"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="prof-full-name">Nome Completo</Label>
                    <Input
                      id="prof-full-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="prof-email">Endereço de E-mail</Label>
                      <div className="relative">
                        <Input
                          id="prof-email"
                          value={currentUser.email}
                          readOnly
                          className="bg-muted/50 pr-8 text-muted-foreground"
                        />
                        <Mail className="absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Identificador global da conta Supabase Auth.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="prof-phone">Telefone (Angola)</Label>
                      <div className="relative">
                        <Input
                          id="prof-phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+244 9XX XXX XXX"
                        />
                        <Phone className="absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Para alertas e comunicações da instituição.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingProfile} className="gap-2">
                      {savingProfile ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      {savingProfile ? "A guardar…" : "Guardar Alterações"}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB 2: FOTOGRAFIA */}
              <TabsContent value="foto" className="m-0 space-y-6">
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl border border-border bg-muted/20">
                  <UserAvatar
                    url={currentUser.avatarUrl}
                    initials={currentUser.initials}
                    className="size-24 bg-primary-soft text-3xl font-extrabold text-primary ring-4 ring-primary/20 shadow-sm"
                  />
                  <div className="space-y-2 text-center sm:text-left">
                    <h4 className="text-sm font-semibold text-foreground">Fotografia de Perfil</h4>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      A sua fotografia é visível nos comunicados, mensagens internas e fichas de
                      turma. Formatos suportados: PNG, JPG ou WebP até 4 MB.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id="profile-avatar-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadAvatar(file);
                    }}
                  />
                  <Button variant="outline" size="sm" asChild disabled={uploadingAvatar}>
                    <label htmlFor="profile-avatar-file" className="cursor-pointer gap-2">
                      {uploadingAvatar ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4 text-primary" />
                      )}
                      Carregar do Dispositivo
                    </label>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraOpen(true)}
                    disabled={uploadingAvatar}
                    className="gap-2"
                  >
                    <Camera className="size-4 text-primary" />
                    Tirar Foto (Câmera)
                  </Button>

                  <PickFileButton
                    label="Escolher da Biblioteca SIGA"
                    area="pessoal"
                    acceptKinds={["png", "jpeg"]}
                    variant="outline"
                    size="sm"
                    onPick={(file) => {
                      void (async () => {
                        try {
                          const blob = await resolveFileBlob(file);
                          const chosen = new File([blob], file.name, { type: blob.type });
                          await uploadAvatar(chosen);
                        } catch {
                          toast.error("Não foi possível carregar a imagem da biblioteca.");
                        }
                      })();
                    }}
                  />
                </div>
              </TabsContent>

              {/* TAB 3: SEGURANÇA */}
              <TabsContent value="seguranca" className="m-0 space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <KeyRound className="size-4 text-primary" />
                    Alterar Senha
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                    Recomendamos o uso de senhas fortes com letras, números e símbolos especiais.
                  </p>
                  <PasswordChangeForm compact />
                </div>

                <Separator />

                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Shield className="size-4 text-success" />
                      Autenticação de Dois Fatores (2FA / MFA)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Proteja a sua conta com um código temporário de verificação TOTP.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-success border-success/30">
                    Disponível no Portal
                  </Badge>
                </div>
              </TabsContent>

              {/* TAB 4: INSTITUIÇÕES (MULTI-TENANCY) */}
              <TabsContent value="instituicoes" className="m-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Instituições Associadas
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      A sua conta global permite aceder a múltiplas instituições com diferentes
                      funções.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
                      <PlusCircle className="size-3.5 text-primary" />
                      Nova Escola (WEB)
                    </a>
                  </Button>
                </div>

                <div className="space-y-2.5 pt-1">
                  {currentUser.schools.length > 0 ? (
                    currentUser.schools.map((school) => {
                      const isCurrent = school.schoolId === currentUser.schoolId;
                      return (
                        <div
                          key={school.membershipId}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                            isCurrent
                              ? "border-primary/40 bg-primary/5 shadow-xs"
                              : "border-border hover:border-border/80 bg-card"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <IconChip
                              icon={Building2}
                              tone={isCurrent ? "primary" : "muted"}
                              size="md"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  {school.schoolName}
                                </span>
                                {isCurrent ? (
                                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] py-0">
                                    Actual
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span>Função:</span>
                                <span className="font-semibold text-foreground/80">
                                  {school.roleName || school.appRole}
                                </span>
                                <span>•</span>
                                <span className="text-success">
                                  {school.isActive ? "Ativo" : "Pendente"}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div>
                            {isCurrent ? (
                              <Badge
                                variant="outline"
                                className="gap-1 text-primary border-primary/30"
                              >
                                <CheckCircle2 className="size-3" />
                                Em utilização
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSwitchSchool(school)}
                                className="text-xs"
                              >
                                Alternar Instituição
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center border rounded-xl border-dashed border-border text-muted-foreground text-xs">
                      Nenhuma instituição adicional associada a esta conta.
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Modal de captura de câmara para avatar */}
      <CameraCaptureModal
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        title="Fotografia de Perfil"
        onCapture={(file) => void uploadAvatar(file)}
      />
    </>
  );
}
