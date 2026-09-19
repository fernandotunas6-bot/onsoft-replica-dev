import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Shield,
  ExternalLink,
  Building2,
  Sparkles,
  Receipt,
  Globe,
  ScrollText,
  CreditCard,
  BookOpen,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAdminUrl,
  getCreateSchoolUrl,
  getDocUrl,
  DOC_PATHS,
  getSaasAdminUrl,
} from "@/lib/ecosystem-urls";

// style-check: route-exempt - ponte de redirecionamento para o portal ADMIN.
export const Route = createFileRoute("/saas-admin")({
  component: SaasAdminBridge,
});

const ADMIN_SECTIONS = [
  { label: "Escolas clientes", path: "/tenants", icon: Building2 },
  { label: "Subscrições", path: "/subscriptions", icon: Receipt },
  { label: "Domínios", path: "/domains", icon: Globe },
  { label: "Auditoria", path: "/audit", icon: ScrollText },
  { label: "Webhooks gateway", path: "/gateway-webhooks", icon: Sparkles },
  { label: "Admins plataforma", path: "/platform-admins", icon: Shield },
  { label: "Catálogo SaaS", path: "/settings/billing", icon: CreditCard },
] as const;

function SaasAdminBridge() {
  const adminUrl = getSaasAdminUrl();
  const createUrl = getCreateSchoolUrl();
  const adminDocUrl = getDocUrl(DOC_PATHS.adminControlCenter);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between font-sans">
      <header className="border-b border-border/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <Shield className="h-6 w-6 text-primary" /> SIGA Plus
        </div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Voltar à escola
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Administração SaaS · ADMIN
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Gestão de escolas clientes
          </h1>

          <p className="text-muted-foreground text-base leading-relaxed max-w-xl mx-auto">
            Tenants, assinaturas, billing da plataforma e domínios pertencem ao{" "}
            <strong>ADMIN</strong> (SaaS Control Center), não ao produto escolar.
          </p>
        </div>

        <Card className="bg-card border-border shadow-card text-card-foreground text-left p-6">
          <CardContent className="p-0 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={adminUrl}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-card"
              >
                Abrir ADMIN <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={createUrl}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Criar escola no WEB <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-2 sm:grid-cols-2">
          {ADMIN_SECTIONS.map(({ label, path, icon: Icon }) => (
            <a
              key={path}
              href={getAdminUrl(path)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground hover:border-primary/40 hover:bg-muted transition-colors shadow-xs"
            >
              <Icon className="h-4 w-4 text-primary shrink-0" />
              {label}
              <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </a>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <a
            href={adminDocUrl}
            className="inline-flex items-center gap-1.5 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Manual do Control Center (DOC)
          </a>
        </p>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Ecossistema SIGA Plus · WEB (Vendas) · ADMIN (SaaS) · SIGA (Operação) · DOC (Ajuda)
      </footer>
    </div>
  );
}
