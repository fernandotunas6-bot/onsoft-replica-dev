import React, { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  LoaderCircle,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MediaFrame } from "@/components/ui/media-frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/features/saas/tenant-context";
import { useAppearance } from "@/lib/appearance";
import { isReadableBrandColor, isValidBrandHex, normalizeBrandHex } from "@/lib/brand-tokens";
import { getPlatformDomain, getPlatformSubdomain } from "@/lib/saas/platform-domain";
import {
  planIncludesCustomDomain,
  planIncludesProfessionalEmail,
  planIncludesAdvancedBranding,
} from "@/features/saas/plan-features";
import { getPricingUrl } from "@/lib/ecosystem-urls";
import {
  getSchoolDomain,
  requestDomainVerification,
  updateEmailForwarding,
  provisionMailbox,
  updateSchoolBranding,
} from "@/features/saas/server";

export function DigitalIdentityPanel() {
  const { activeTenant, activeSlug, activePlan } = useTenant();
  const queryClient = useQueryClient();
  const { set: setAppearance } = useAppearance();
  const [activeTab, setActiveTab] = useState<string>("portal");

  const platformDomain = getPlatformDomain();
  const currentSubdomainUrl = `https://${getPlatformSubdomain(activeSlug || "minha-escola")}`;

  const fetchDomainStatus = useServerFn(getSchoolDomain);
  const verifyDomainFn = useServerFn(requestDomainVerification);
  const saveEmailFn = useServerFn(updateEmailForwarding);

  const [isLoading, setIsLoading] = useState(true);

  // Estados de Domínio Personalizado
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);
  const [domainVerificationStatus, setDomainVerificationStatus] = useState<
    "idle" | "verifying" | "success" | "error" | "pending"
  >("idle");
  const [dnsInstructions, setDnsInstructions] = useState<{
    cnameHost?: string;
    cnameTarget?: string;
    txtHost?: string;
    txtValue?: string;
  } | null>(null);

  // Estados de Caixa Profissional
  const [mailboxState, setMailboxState] = useState<{
    email: string;
    status: string;
    provider: string;
  } | null>(null);
  const [isProvisioningMailbox, setIsProvisioningMailbox] = useState(false);
  const provisionMailboxFn = useServerFn(provisionMailbox);
  const saveBrandingFn = useServerFn(updateSchoolBranding);
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Estados de Encaminhamento de E-mail
  const [institutionalEmail, setInstitutionalEmail] = useState(
    `${activeSlug || "escola"}@${platformDomain}`,
  );
  // Vazio de propósito: o contacto da instituição deixou de vir na resolução
  // pública do tenant (é dado pessoal). Se já existir encaminhamento, o valor
  // real é carregado mais abaixo; caso contrário o administrador escreve-o, em
  // vez de lhe sugerirmos um destino que não escolheu.
  const [forwardingEmail, setForwardingEmail] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailRouteActive, setEmailRouteActive] = useState(false);

  // Estados de Branding
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [secondaryColor, setSecondaryColor] = useState("#1E293B");
  const [portalTitle, setPortalTitle] = useState(activeTenant?.name || "Portal Escolar");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const hasCustomDomainAccess = planIncludesCustomDomain(activePlan);
  const hasProfessionalEmailAccess = planIncludesProfessionalEmail(activePlan);
  const hasAdvancedBrandingAccess = planIncludesAdvancedBranding(activePlan);

  const loadDomainData = useCallback(async () => {
    if (!activeTenant || !activeSlug) return;
    try {
      setIsLoading(true);
      const data = await fetchDomainStatus({
        data: { tenantId: activeTenant.id, tenantSlug: activeSlug },
      });

      if (data.branding) {
        if (data.branding.primaryColor) setPrimaryColor(data.branding.primaryColor);
        if (data.branding.secondaryColor) setSecondaryColor(data.branding.secondaryColor);
        if (data.branding.portalTitle) setPortalTitle(data.branding.portalTitle);
        if (data.branding.logoUrl) setLogoUrl(data.branding.logoUrl);
      }

      if (data.mailbox) {
        setMailboxState(data.mailbox);
      }

      if (data.emailRoute) {
        setInstitutionalEmail(data.emailRoute.institutionalEmail);
        if (data.emailRoute.forwardTo) setForwardingEmail(data.emailRoute.forwardTo);
        setEmailRouteActive(data.emailRoute.active);
      }

      if (data.customDomain) {
        setCustomDomainInput(data.customDomain.hostname);
        if (data.customDomain.status === "active") setDomainVerificationStatus("success");
        else if (data.customDomain.status === "failed") setDomainVerificationStatus("error");
        else setDomainVerificationStatus("pending");
        setDnsInstructions(data.customDomain.instructions);
      }
    } catch (err) {
      console.error("Failed to load digital identity status:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant, activeSlug, fetchDomainStatus]);

  useEffect(() => {
    void loadDomainData();
  }, [loadDomainData]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTenant) return;

    setIsSavingBranding(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${activeTenant.id}/logo-${Date.now()}.${ext}`;

      const { error, data } = await supabase.storage
        .from("school-logos")
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data: publicData } = supabase.storage.from("school-logos").getPublicUrl(path);

      setLogoUrl(publicData.publicUrl);
      toast.success("Logótipo enviado. Clique em Guardar Branding para aplicar.");
    } catch (err) {
      toast.error("Falha ao enviar logótipo.");
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!activeTenant || !activeSlug) return;
    const primary = normalizeBrandHex(primaryColor);
    const secondary = normalizeBrandHex(secondaryColor);
    if (!primary || !isValidBrandHex(primary)) {
      toast.error("A cor primária deve ser um hex válido (#RRGGBB).");
      return;
    }
    if (!isReadableBrandColor(primary)) {
      toast.error(
        "A cor primária tem contraste insuficiente para texto. Escolha um tom mais escuro ou mais claro.",
      );
      return;
    }
    if (secondaryColor.trim() && !secondary) {
      toast.error("A cor secundária deve ser um hex válido (#RRGGBB).");
      return;
    }
    setIsSavingBranding(true);
    try {
      const res = await saveBrandingFn({
        data: {
          tenantId: activeTenant.id,
          primaryColor: primary,
          secondaryColor: secondary ?? undefined,
          portalTitle,
          logoUrl,
        },
      });
      if (res.ok) {
        setAppearance({
          schoolBrand: { primary, secondary },
          preferPersonalAccent: false,
          shadcnTheme: "",
          tweakcnTheme: "",
          importedTheme: null,
          customVars: {},
        });
        await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
        toast.success("Identidade visual guardada e aplicada.");
      } else {
        toast.error(res.reason || "Não foi possível guardar as cores.");
      }
    } catch (err) {
      toast.error("Ocorreu um erro ao guardar o branding.");
    } finally {
      setIsSavingBranding(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copiado para a área de transferência!`);
    }
  };

  const handleProvisionMailbox = async () => {
    if (!activeTenant || !activeSlug) return;
    setIsProvisioningMailbox(true);
    try {
      const res = await provisionMailboxFn({
        data: {
          tenantId: activeTenant.id,
          tenantSlug: activeSlug,
          email: `${activeSlug}@${platformDomain}`,
          displayName: activeTenant.name || "Escola",
        },
      });
      if (res.ok) {
        toast.success("Caixa profissional solicitada com sucesso!");
        setMailboxState({
          email: `${activeSlug}@${platformDomain}`,
          status: "active",
          provider: res.provider,
        });
      }
    } catch (err) {
      toast.error("Ocorreu um erro ao solicitar a caixa profissional.");
    } finally {
      setIsProvisioningMailbox(false);
    }
  };

  const handleSaveEmailRoute = async () => {
    if (!activeTenant || !activeSlug) return;
    setIsSavingEmail(true);
    try {
      const res = await saveEmailFn({
        data: {
          tenantId: activeTenant.id,
          tenantSlug: activeSlug,
          forwardTo: forwardingEmail,
        },
      });
      if (res.ok) {
        toast.success("Pedido de encaminhamento registado", {
          description: "Fica activo quando a regra for configurada no e-mail da plataforma.",
        });
        setInstitutionalEmail(res.institutionalEmail);
        setEmailRouteActive(false);
      } else {
        toast.error(res.reason || "Não foi possível guardar o e-mail.");
      }
    } catch (err) {
      toast.error("Ocorreu um erro ao guardar o e-mail.");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleVerifyCustomDomain = async () => {
    if (!activeTenant || !activeSlug) return;
    if (!customDomainInput.trim()) {
      toast.error("Por favor insira um domínio válido.");
      return;
    }
    setIsVerifyingDomain(true);
    setDomainVerificationStatus("verifying");

    try {
      const res = await verifyDomainFn({
        data: {
          tenantId: activeTenant.id,
          tenantSlug: activeSlug,
          hostname: customDomainInput.trim(),
        },
      });
      setDnsInstructions(res.instructions);
      setDomainVerificationStatus("pending");
      toast.success("Domínio registado! Verifique as instruções de DNS abaixo.");

      // Inicia o polling via endpoint. O token da sessão é obrigatório: o
      // endpoint confirma que esta conta manda no tenant do domínio.
      const { data: sessionData } = await supabase.auth.getSession();
      const pollRes = await fetch("/api/saas/domains/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ domainId: res.domainId }),
      });

      if (pollRes.ok) {
        const pollData = await pollRes.json();
        if (pollData.status === "active") {
          setDomainVerificationStatus("success");
          toast.success("Domínio e registos DNS validados com sucesso!");
        } else if (pollData.status === "failed") {
          setDomainVerificationStatus("error");
          toast.error(pollData.reason || "Validação DNS falhou.");
        } else {
          toast.info("A verificação está pendente. Propagação de DNS pode levar algum tempo.");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao verificar domínio.";
      toast.error(msg);
      setDomainVerificationStatus("error");
    } finally {
      setIsVerifyingDomain(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Identidade Digital & Subdomínios
        </h3>
        <p className="text-xs text-muted-foreground">
          Gestão do endereço web exclusivo, encaminhamento de e-mail institucional e domínio
          personalizado.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-muted/60 p-1">
          <TabsTrigger value="portal" className="text-xs gap-1.5">
            <Globe className="size-3.5" />
            Portal
          </TabsTrigger>
          <TabsTrigger value="dominio" className="text-xs gap-1.5">
            <ShieldCheck className="size-3.5" />
            Domínio Próprio
          </TabsTrigger>
          <TabsTrigger value="email" className="text-xs gap-1.5">
            <Mail className="size-3.5" />
            E-mail
          </TabsTrigger>
          <TabsTrigger value="branding" className="text-xs gap-1.5">
            <Palette className="size-3.5" />
            Branding
          </TabsTrigger>
        </TabsList>

        {/* 1. ABA PORTAL */}
        <TabsContent value="portal" className="space-y-4 pt-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success animate-pulse" />
                  Portal Activo
                </span>
                <h4 className="mt-2 text-sm font-semibold text-foreground">
                  Endereço Oficial da Instituição
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Este é o link direto para acesso de alunos, encarregados, professores e
                  secretaria.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Input
                  aria-label="Endereço do subdomínio"
                  readOnly
                  value={currentSubdomainUrl}
                  className="font-mono text-xs bg-muted/50 pr-20 select-all"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(currentSubdomainUrl, "Endereço")}
                  className="text-xs flex-1 sm:flex-none gap-1.5"
                >
                  <Copy className="size-3.5" />
                  Copiar
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="text-xs flex-1 sm:flex-none gap-1.5 bg-primary text-primary-foreground"
                >
                  <a href={currentSubdomainUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                    Abrir Portal
                  </a>
                </Button>
              </div>
            </div>

            <div className="pt-2 border-t text-xs text-muted-foreground flex items-center justify-between">
              <span>Subdomínio configurado via DNS Wildcard Cloudflare</span>
              <span className="font-mono text-[11px]">SSL/TLS Activo</span>
            </div>
          </div>
        </TabsContent>

        {/* 2. ABA DOMÍNIO PERSONALIZADO */}
        <TabsContent value="dominio" className="space-y-4 pt-4">
          {!hasCustomDomainAccess ? (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-center space-y-3">
              <div className="mx-auto size-10 rounded-full bg-warning/10 flex items-center justify-center text-warning">
                <Lock className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Domínio Personalizado (Ex.: portal.colegio.ao)
                </h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                  Permita que a sua comunidade escolar aceda ao SIGA directamente através do domínio
                  próprio da sua instituição.
                </p>
              </div>
              <Button
                size="sm"
                asChild
                className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                <a href={getPricingUrl()} target="_blank" rel="noreferrer">
                  <Sparkles className="size-3.5" />
                  Actualizar para Plano Premium
                  <ArrowRight className="size-3.5" />
                </a>
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Conectar Domínio Próprio</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Introduza o domínio ou subdomínio que pretende apontar para o SIGA.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-domain" className="text-xs">
                  Nome de Domínio
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="custom-domain"
                    placeholder="portal.colegioesperanca.ao"
                    value={customDomainInput}
                    onChange={(e) => setCustomDomainInput(e.target.value)}
                    className="font-mono text-xs"
                    disabled={isVerifyingDomain}
                  />
                  <Button
                    size="sm"
                    onClick={handleVerifyCustomDomain}
                    disabled={isVerifyingDomain || !customDomainInput.trim()}
                    className="text-xs shrink-0 gap-1.5"
                  >
                    {isVerifyingDomain ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    Verificar DNS
                  </Button>
                </div>
              </div>

              {dnsInstructions && domainVerificationStatus !== "success" && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-3 border text-xs">
                  <div className="font-semibold text-foreground">
                    Instruções de Apontamento DNS:
                  </div>
                  <div className="grid grid-cols-1 gap-2 font-mono text-[11px]">
                    <div className="grid grid-cols-[80px_1fr] items-center">
                      <span className="text-muted-foreground">CNAME (nome):</span>
                      <div className="flex items-center justify-between bg-background p-1.5 rounded border">
                        <span>{dnsInstructions.cnameHost}</span>
                        <Copy
                          className="size-3 cursor-pointer text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(dnsInstructions.cnameHost || "", "Nome")}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-center">
                      <span className="text-muted-foreground">Destino:</span>
                      <div className="flex items-center justify-between bg-background p-1.5 rounded border">
                        <span>{dnsInstructions.cnameTarget}</span>
                        <Copy
                          className="size-3 cursor-pointer text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            copyToClipboard(dnsInstructions.cnameTarget || "", "Destino")
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Opcionalmente, pode configurar um TXT no host{" "}
                    <strong>{dnsInstructions.txtHost}</strong> com o valor{" "}
                    <strong>{dnsInstructions.txtValue}</strong>.
                  </p>
                </div>
              )}

              {domainVerificationStatus === "success" && (
                <div className="flex items-center gap-2 text-xs text-success bg-success/10 p-2.5 rounded-lg border border-success/20">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Domínio validado com sucesso. Certificado SSL provisionado e activo.</span>
                </div>
              )}

              {domainVerificationStatus === "pending" && (
                <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 p-2.5 rounded-lg border border-warning/20">
                  <LoaderCircle className="size-4 shrink-0 animate-spin" />
                  <span>A aguardar propagação DNS. Pode levar até 24 horas.</span>
                </div>
              )}

              {domainVerificationStatus === "error" && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    Erro ao verificar os registos DNS. Verifique a configuração e tente novamente.
                  </span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* 3. ABA E-MAIL INSTITUCIONAL */}
        <TabsContent value="email" className="space-y-4 pt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                E-mail Institucional da Escola
                {emailRouteActive && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
                    Activo
                  </span>
                )}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Endereço de representação oficial com encaminhamento automático para a direção.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Endereço Institucional</Label>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="E-mail institucional"
                  readOnly
                  value={institutionalEmail}
                  className="font-mono text-xs bg-muted/40"
                />
                <Button
                  aria-label="Copiar e-mail institucional"
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => copyToClipboard(institutionalEmail, "E-mail")}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="forwarding-email" className="text-xs font-medium">
                Encaminhar Mensagens Para
              </Label>
              <Input
                id="forwarding-email"
                type="email"
                value={forwardingEmail}
                onChange={(e) => setForwardingEmail(e.target.value)}
                placeholder="colegio@gmail.com"
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Todas as mensagens enviadas para {institutionalEmail} serão entregues neste
                endereço.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveEmailRoute}
                disabled={isSavingEmail || !forwardingEmail.trim()}
                className="text-xs gap-1.5"
              >
                {isSavingEmail ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Salvar Configurações de E-mail
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* 4. ABA BRANDING */}
        <TabsContent value="branding" className="space-y-4 pt-4">
          {!hasAdvancedBrandingAccess ? (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-center space-y-3">
              <div className="mx-auto size-10 rounded-full bg-warning/10 flex items-center justify-center text-warning">
                <Lock className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Branding Institucional</h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                  Personalize o portal com as cores e o logótipo da sua escola para oferecer uma
                  experiência imersiva à comunidade escolar.
                </p>
              </div>
              <Button
                size="sm"
                asChild
                className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                <a href={getPricingUrl()} target="_blank" rel="noreferrer">
                  <Sparkles className="size-3.5" />
                  Actualizar para Plano Premium
                  <ArrowRight className="size-3.5" />
                </a>
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Personalização Visual do Portal
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cores institucionais e identidade visual exibida aos alunos e famílias.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="portal-title" className="text-xs">
                  Título do Portal
                </Label>
                <Input
                  id="portal-title"
                  value={portalTitle}
                  onChange={(e) => setPortalTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Logótipo da Escola</Label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="size-12 rounded border flex items-center justify-center overflow-hidden bg-background">
                      <MediaFrame
                        src={logoUrl}
                        alt="Logo"
                        ratio="1/1"
                        rounded="rounded"
                        className="size-full"
                        imgClassName="object-contain"
                      />
                    </div>
                  ) : (
                    <div className="size-12 rounded border border-dashed flex items-center justify-center bg-muted/30">
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">
                        Sem Logo
                      </span>
                    </div>
                  )}
                  <div>
                    <Label
                      htmlFor="logo-upload"
                      className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    >
                      <Upload className="size-3.5" />
                      Enviar Logótipo
                    </Label>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={isSavingBranding}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      PNG, JPG ou SVG. Altura recomendada: 64px.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="primary-color" className="text-xs">
                    Cor Primária
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Cor primária, em hexadecimal"
                      type="color"
                      id="primary-color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="size-8 rounded border cursor-pointer bg-transparent"
                    />
                    <Input
                      aria-label="Cor primária, em hexadecimal"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  {isValidBrandHex(primaryColor) && !isReadableBrandColor(primaryColor) ? (
                    <p className="text-[10px] text-warning">
                      Contraste baixo para botões — o SIGA bloqueará o guardar.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="secondary-color" className="text-xs">
                    Cor Secundária (sidebar)
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Cor secundária, em hexadecimal"
                      type="color"
                      id="secondary-color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="size-8 rounded border cursor-pointer bg-transparent"
                    />
                    <Input
                      aria-label="Cor secundária, em hexadecimal"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">Pré-visualização</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
                    style={{
                      backgroundColor: isValidBrandHex(primaryColor) ? primaryColor : "#2563EB",
                      color: "#fff",
                    }}
                  >
                    Botão primário
                  </span>
                  <span
                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                    style={{
                      borderColor: isValidBrandHex(primaryColor) ? primaryColor : "#2563EB",
                      color: isValidBrandHex(primaryColor) ? primaryColor : "#2563EB",
                    }}
                  >
                    Link
                  </span>
                  <span
                    className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-primary-foreground"
                    style={{
                      backgroundColor: isValidBrandHex(secondaryColor) ? secondaryColor : "#1E293B",
                    }}
                  >
                    Sidebar
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveBranding}
                  disabled={isSavingBranding}
                  className="text-xs gap-1.5"
                >
                  {isSavingBranding ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  Guardar Branding
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
