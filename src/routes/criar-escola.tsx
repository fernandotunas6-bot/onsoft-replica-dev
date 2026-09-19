import React, { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, ExternalLink, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";

// style-check: route-exempt - redirecionamento para o portal WEB (criação de escola).
export const Route = createFileRoute("/criar-escola")({
  component: CriarEscolaLanding,
});

function CriarEscolaLanding() {
  const webUrl = getCreateSchoolUrl();

  useEffect(() => {
    window.location.replace(webUrl);
  }, [webUrl]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between font-sans">
      <header className="border-b border-border/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <GraduationCap className="h-6 w-6 text-primary" /> SIGA Plus
        </div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Já tem conta? Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16 text-center space-y-6">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Portal Comercial &amp; Onboarding WEB
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Criação de Escola &amp; Onboarding Comercial
        </h1>

        <p className="text-muted-foreground text-base leading-relaxed">
          De acordo com a arquitetura do ecossistema SIGA Plus, o registo oficial de novas
          instituições é realizado exclusivamente através do portal <strong>WEB</strong> (Landing
          Page &amp; Portal Comercial).
        </p>

        <Card className="bg-card border-border shadow-card text-card-foreground text-left p-6">
          <CardContent className="p-0 space-y-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-foreground">Registo Comercial Isolado</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Preencha os dados da sua instituição, escolha o plano SaaS e configure o seu
                  subdomínio exclusivo com o design oficial do WEB.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={webUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-card"
              >
                Ir para o Portal WEB de Criação de Escola <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Ecossistema SIGA Plus · WEB (Vendas) · ADMIN (SaaS) · SIGA (Operação) · DOC (Ajuda)
      </footer>
    </div>
  );
}
