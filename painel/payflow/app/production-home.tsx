import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicRuntimeStatus } from "@/lib/runtime";

const capabilities = [
  {
    icon: GraduationCap,
    title: "Fonte académica única",
    description: "Escolas, alunos e cobranças chegam do SIGA Plus; não existe cadastro paralelo.",
  },
  {
    icon: ShieldCheck,
    title: "Confirmação rigorosa",
    description: "Um pagamento só muda para pago depois da confirmação do backend ou do provedor.",
  },
  {
    icon: ReceiptText,
    title: "Recibos verificáveis",
    description: "Cada pagamento confirmado pode gerar um comprovativo com referência própria.",
  },
] as const;

export function ProductionHome() {
  const runtime = getPublicRuntimeStatus();
  const ready = runtime.integrationConfigured;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <WalletCards className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-[-0.02em]">PayFlow</p>
            <p className="text-xs text-muted-foreground">Financeiro escolar · SIGA Plus</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {runtime.sandboxEnabled && (
              <Badge variant="outline" className="border-amber-300 text-amber-800">
                Ambiente local
              </Badge>
            )}
            <Button asChild size="sm" variant="outline">
              <a href="/admin">Painel Admin</a>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-center">
        <div>
          <Badge variant="secondary" className="mb-5">
            Integrado ao ecossistema SIGA Plus
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Pagamentos escolares simples. Infraestrutura financeira robusta.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Consulte cobranças reais sincronizadas pelo SIGA Plus, acompanhe o estado dos
            pagamentos e encontre os seus recibos num único portal.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12">
              <a href="/aluno/pagar">
                Entrar no portal do pagador <ArrowRight />
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-12">
              <a href="/admin">Painel Administrativo</a>
            </Button>
            {runtime.sigaUrl && (
              <Button asChild size="lg" variant="outline" className="h-12">
                <a href={runtime.sigaUrl}>Abrir SIGA Plus</a>
              </Button>
            )}
          </div>
        </div>

        <Card className="border-border py-0 shadow-[var(--shadow-soft)]">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${
                  ready
                    ? "bg-emerald-50 text-success dark:bg-emerald-950/50"
                    : "bg-amber-50 text-warning dark:bg-amber-950/50"
                }`}
              >
                {ready ? (
                  <CheckCircle2 className="size-[18px]" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="size-[18px]" aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="font-semibold">
                  {ready ? "Integração SIGA configurada" : "Ativação financeira controlada"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {ready
                    ? "O PayFlow pode receber dados reais do SIGA. Transferências ficam disponíveis para cada conta IBAN ativa."
                    : "Configure a integração de servidor e as contas bancárias reais antes de aceitar pagamentos."}
                </p>
              </div>
            </div>
            <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Dados de demonstração</dt>
                <dd className="font-medium">Desativados</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Integração SIGA</dt>
                <dd className="font-medium">
                  {runtime.integrationConfigured ? "Configurada" : "A configurar"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Transferência por IBAN</dt>
                <dd className="font-medium">
                  {runtime.bankTransferSupported ? "Por conta configurada" : "Indisponível"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-muted-foreground">EMIS</dt>
                <dd className="font-medium">
                  {runtime.providerConfigured ? "Sandbox local" : "Aguardando credenciais"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-4 py-10 sm:px-6 md:grid-cols-3">
          {capabilities.map((item) => (
            <article key={item.title} className="py-5 md:px-6 md:first:pl-0 md:last:pr-0">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <item.icon className="size-[18px]" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
