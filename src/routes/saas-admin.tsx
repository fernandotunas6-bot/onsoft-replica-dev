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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans">
      <header className="border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-white">
          <Shield className="h-6 w-6 text-indigo-400" /> SIGA Plus
        </div>
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          Voltar à escola
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" /> Administração SaaS · ADMIN
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Gestão de escolas clientes
          </h1>

          <p className="text-slate-400 text-base leading-relaxed max-w-xl mx-auto">
            Tenants, assinaturas, billing da plataforma e domínios pertencem ao{" "}
            <strong>ADMIN</strong> (SaaS Control Center), não ao produto escolar.
          </p>
        </div>

        <Card className="bg-slate-900/80 border-slate-800 text-slate-100 text-left p-6">
          <CardContent className="p-0 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={adminUrl}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-bold text-white hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-600/30"
              >
                Abrir ADMIN <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={createUrl}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
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
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-200 hover:border-indigo-500/40 hover:bg-slate-900 transition-colors"
            >
              <Icon className="h-4 w-4 text-indigo-400 shrink-0" />
              {label}
              <ExternalLink className="h-3.5 w-3.5 ml-auto text-slate-500" />
            </a>
          ))}
        </div>

        <p className="text-center text-xs text-slate-500">
          <a
            href={adminDocUrl}
            className="inline-flex items-center gap-1.5 hover:text-slate-300"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Manual do Control Center (DOC)
          </a>
        </p>
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        Ecossistema SIGA Plus · WEB (Vendas) · ADMIN (SaaS) · SIGA (Operação) · DOC (Ajuda)
      </footer>
    </div>
  );
}
