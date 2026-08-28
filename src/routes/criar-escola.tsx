import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, ExternalLink, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";

export const Route = createFileRoute("/criar-escola")({
  component: CriarEscolaLanding,
});

function CriarEscolaLanding() {
  const webUrl = getCreateSchoolUrl();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans">
      <header className="border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-white">
          <GraduationCap className="h-6 w-6 text-indigo-400" /> SIGA Plus
        </div>
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          Já tem conta? Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16 text-center space-y-6">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          <Sparkles className="h-3.5 w-3.5" /> Portal Comercial & Onboarding WEB
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Criação de Escola & Onboarding Comercial
        </h1>

        <p className="text-slate-400 text-base leading-relaxed">
          De acordo com a arquitetura do ecossistema SIGA Plus, o registo oficial de novas instituições
          é realizado exclusivamente através do portal <strong>WEB</strong> (Landing Page & Portal Comercial).
        </p>

        <Card className="bg-slate-900/80 border-slate-800 text-slate-100 text-left p-6">
          <CardContent className="p-0 space-y-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-6 w-6 text-indigo-400 shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-white">Registo Comercial Isolado</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Preencha os dados da sua instituição, escolha o plano SaaS e configure o seu subdomínio exclusivo com o design oficial do WEB.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={webUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-bold text-white hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-600/30"
              >
                Ir para o Portal WEB de Criação de Escola <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        Ecossistema SIGA Plus · WEB (Vendas) · ADMIN (SaaS) · SIGA (Operação) · DOC (Ajuda)
      </footer>
    </div>
  );
}
