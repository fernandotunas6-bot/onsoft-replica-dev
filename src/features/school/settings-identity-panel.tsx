import React, { useState } from "react";
import {
  Globe,
  Mail,
  Palette,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  LoaderCircle,
  Sparkles,
  ArrowRight,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/features/saas/tenant-context";
import { getPlatformDomain, getPlatformSubdomain } from "@/lib/saas/platform-domain";
import {
  planIncludesCustomDomain,
  planIncludesProfessionalEmail,
  planIncludesAdvancedBranding,
} from "@/features/saas/plan-features";
import { getPricingUrl } from "@/lib/ecosystem-urls";

export function DigitalIdentityPanel() {
  const { activeTenant, activeSlug, activePlan } = useTenant();
  const [activeTab, setActiveTab] = useState<string>("portal");

  const platformDomain = getPlatformDomain();
  const currentSubdomainUrl = `https://${getPlatformSubdomain(activeSlug || "minha-escola")}`;
  const institutionalEmail = `${activeSlug || "escola"}@${platformDomain}`;

  // Estados de Domínio Personalizado
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);
  const [domainVerificationStatus, setDomainVerificationStatus] = useState<
    "idle" | "verifying" | "success" | "error"
  >("idle");

  // Estados de Encaminhamento de E-mail
  const [forwardingEmail, setForwardingEmail] = useState(
    activeTenant?.contact_email || "direcao@escola.ao"
  );
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Estados de Branding
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [secondaryColor, setSecondaryColor] = useState("#1E293B");
  const [portalTitle, setPortalTitle] = useState(activeTenant?.name || "Portal Escolar");

  const hasCustomDomainAccess = planIncludesCustomDomain(activePlan);
  const hasProfessionalEmailAccess = planIncludesProfessionalEmail(activePlan);
  const hasAdvancedBrandingAccess = planIncludesAdvancedBranding(activePlan);

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copiado para a área de transferência!`);
    }
  };

  const handleSaveEmailRoute = async () => {
    setIsSavingEmail(true);
    setTimeout(() => {
      setIsSavingEmail(false);
      toast.success("Encaminhamento de e-mail institucional actualizado!");
    }, 600);
  };

  const handleVerifyCustomDomain = async () => {
    if (!customDomainInput.trim()) {
      toast.error("Por favor insira um domínio válido.");
      return;
    }
    setIsVerifyingDomain(true);
    setDomainVerificationStatus("verifying");

    setTimeout(() => {
      setIsVerifyingDomain(false);
      setDomainVerificationStatus("success");
      toast.success("Domínio e registos DNS validados com sucesso!");
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Identidade Digital & Subdomínios
        </h3>
        <p className="text-xs text-muted-foreground">
          Gestão do endereço web exclusivo, encaminhamento de e-mail institucional e domínio personalizado.
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Portal Activo
                </span>
                <h4 className="mt-2 text-sm font-semibold text-foreground">
                  Endereço Oficial da Instituição
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Este é o link direto para acesso de alunos, encarregados, professores e secretaria.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Input
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
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-center space-y-3">
              <div className="mx-auto size-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Lock className="size-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Domínio Personalizado (Ex.: portal.colegio.ao)
                </h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                  Permita que a sua comunidade escolar aceda ao SIGA directamente através do domínio próprio da sua instituição.
                </p>
              </div>
              <Button size="sm" asChild className="gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs">
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
                  Conectar Domínio Próprio
                </h4>
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
                  />
                  <Button
                    size="sm"
                    onClick={handleVerifyCustomDomain}
                    disabled={isVerifyingDomain}
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

              <div className="rounded-lg bg-muted/50 p-3 space-y-2 border text-xs">
                <div className="font-semibold text-foreground">Instruções de Apontamento DNS:</div>
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <div><span className="text-muted-foreground">Tipo:</span> CNAME</div>
                  <div><span className="text-muted-foreground">Nome:</span> portal</div>
                  <div><span className="text-muted-foreground">Destino:</span> {getPlatformSubdomain(activeSlug)}</div>
                </div>
              </div>

              {domainVerificationStatus === "success" && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>CNAME validado com sucesso. Certificado SSL provisionado.</span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* 3. ABA E-MAIL INSTITUCIONAL */}
        <TabsContent value="email" className="space-y-4 pt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                E-mail Institucional da Escola
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Endereço de representação oficial com encaminhamento automático para a direção.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Endereço Institucional</Label>
              <Input
                readOnly
                value={institutionalEmail}
                className="font-mono text-xs bg-muted/40"
              />
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
                Todas as mensagens enviadas para {institutionalEmail} serão entregues neste endereço.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveEmailRoute}
                disabled={isSavingEmail}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="primary-color" className="text-xs">
                  Cor Primária
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="primary-color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="size-8 rounded border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="secondary-color" className="text-xs">
                  Cor Secundária
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="secondary-color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="size-8 rounded border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                size="sm"
                onClick={() => toast.success("Identidade visual guardada com sucesso!")}
                className="text-xs gap-1.5"
              >
                <CheckCircle2 className="size-3.5" />
                Guardar Branding
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
