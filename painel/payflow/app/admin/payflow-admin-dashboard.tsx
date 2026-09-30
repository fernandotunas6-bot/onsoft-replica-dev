"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  Filter,
  Landmark,
  Layers,
  LoaderCircle,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PayflowBrandLockup, PayflowBrandMark } from "@/components/payflow/brand-mark";
import { Money } from "@/components/payflow/money";
import { PaymentStatusBadge } from "@/components/payflow/payment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/formatters";

type AdminSession = {
  user_id: string;
  tenant_id: string;
  school_id: string;
  role: string;
  permissions: string[];
  expires_at: string;
};

type ReconciliationItem = {
  payment_id: string;
  school_id: string;
  student_id: string | null;
  invoice_id: string | null;
  invoice_code: string | null;
  description: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  method: string;
  provider: string;
  merchant_reference: string | null;
  provider_transaction_id: string | null;
  provider_status: string | null;
  receipt_code: string | null;
  receipt_issued_at: string | null;
  reconciliation_status: "reconciled" | "attention" | "awaiting" | "closed";
  created_at: string;
  verification_url: string | null;
};

type ReconciliationData = {
  summary: {
    records: number;
    paid_amount: number;
    pending_amount: number;
    reconciled: number;
    attention: number;
  };
  items: ReconciliationItem[];
};

type StatementMatch = {
  line: number;
  outcome: string;
  transferReference: string | null;
  bankTransactionId: string;
  amountMinor: number | null;
  currency: string;
};

type StatementImportData = {
  summary: {
    rows: number;
    matched: number;
    amount_mismatch: number;
    unknown_reference: number;
    invalid_row: number;
    applied: number;
    dry_run: boolean;
  };
  matches: StatementMatch[];
  apply_errors: Array<{ line: number; code: string; message: string }>;
};

type RuntimeStatus = {
  mode: string;
  sandboxEnabled?: boolean;
  integrationConfigured: boolean;
  ssoConfigured: boolean;
  bankConnectorConfigured: boolean;
  alertWebhookConfigured: boolean;
  sigaSettlementConfigured: boolean;
  emisHomologated: boolean;
  paymentInitiationEnabled: boolean;
  provider: string;
  sigaUrl?: string | null;
};

// Sem PAYFLOW_SIGA_URL no servidor: variável pública, depois o domínio da
// plataforma (como no WEB e no ADMIN). localhost só em desenvolvimento.
const SIGA_FINANCE_URL = `${
  process.env.NEXT_PUBLIC_SIGA_URL ||
  (process.env.NODE_ENV === "production"
    ? `https://${(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "portal-siga.com").trim().toLowerCase()}`
    : "http://localhost:3006")
}/financeiro`;
const STATEMENT_TEMPLATE = `data;referencia;valor;moeda;movimento;descricao
05/09/2026;PF-TF-20260905-XXXXXXXXXX;15.000,00;AOA;MOV-001;Propina Setembro
`;

export function PayflowAdminDashboard() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("reconciliation");

  // Modal para verificação manual de transferência
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReconciliationItem | null>(null);
  const [bankTxId, setBankTxId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [statementApply, setStatementApply] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);
  const [statementResult, setStatementResult] = useState<StatementImportData | null>(null);
  const [pullBusy, setPullBusy] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  async function checkSession() {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/admin/session");
      if (res.ok) {
        const json = (await res.json()) as { data: AdminSession };
        setSession(json.data);
        await loadReconciliation();
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadRuntimeStatus() {
    try {
      const res = await fetch("/api/v1/health");
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { runtime?: RuntimeStatus } };
      if (json.data?.runtime) setRuntime(json.data.runtime);
    } catch {
      /* health is best-effort */
    }
  }

  async function loadReconciliation() {
    try {
      setRefreshing(true);
      const res = await fetch("/api/v1/reconciliation?status=all&limit=100");
      if (res.ok) {
        const json = (await res.json()) as { data: ReconciliationData };
        setData(json.data);
      }
      await loadRuntimeStatus();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar dados de conciliação.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadRuntimeStatus();
      await checkSession();
    })();
  }, []);

  const sandboxLoginAllowed =
    runtime?.sandboxEnabled === true || runtime?.mode === "sandbox";
  const sigaFinanceHref = runtime?.sigaUrl
    ? `${runtime.sigaUrl.replace(/\/+$/, "")}/financeiro`
    : SIGA_FINANCE_URL;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!sandboxLoginAllowed) {
      toast.error("Em produção, abra o painel a partir do SIGA (Conciliação PayFlow).");
      return;
    }
    try {
      setLoggingIn(true);
      const res = await fetch("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: accessKey.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Credencial inválida.");
        return;
      }
      toast.success("Sessão administrativa iniciada com sucesso!");
      setSession(json.data);
      await loadReconciliation();
    } catch {
      toast.error("Não foi possível conectar ao servidor.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/v1/admin/logout", { method: "POST" });
      setSession(null);
      setData(null);
      toast.info("Sessão terminada.");
    } catch {
      setSession(null);
    }
  }

  async function confirmManualTransfer() {
    if (!selectedItem) return;
    if (!bankTxId.trim()) {
      toast.error("Informe o número do movimento bancário.");
      return;
    }

    try {
      setVerifying(true);
      const res = await fetch("/api/v1/bank-transfers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_reference: selectedItem.merchant_reference || selectedItem.payment_id,
          amount: selectedItem.amount,
          currency: selectedItem.currency,
          bank_transaction_id: bankTxId.trim(),
          booked_at: new Date().toISOString(),
          source: "manual_review",
          verified_by: session?.user_id || "gestor_financeiro",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Erro ao verificar transferência.");
        return;
      }
      toast.success(`Transferência confirmada! Recibo: ${json.data?.receipt_code || "Emitido"}`);
      setVerifyModalOpen(false);
      setSelectedItem(null);
      setBankTxId("");
      await loadReconciliation();
    } catch {
      toast.error("Falha ao comunicar com o serviço bancário.");
    } finally {
      setVerifying(false);
    }
  }

  async function confirmRefund() {
    if (!selectedItem) return;
    if (refundReason.trim().length < 8) {
      toast.error("Descreva o motivo do estorno (mínimo 8 caracteres).");
      return;
    }
    try {
      setRefunding(true);
      const res = await fetch(`/api/v1/payments/${selectedItem.payment_id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refundReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Não foi possível estornar.");
        return;
      }
      toast.success("Pagamento estornado. O recibo original mantém-se para auditoria.");
      setRefundModalOpen(false);
      setSelectedItem(null);
      setRefundReason("");
      await loadReconciliation();
    } catch {
      toast.error("Falha ao comunicar o estorno.");
    } finally {
      setRefunding(false);
    }
  }

  async function importBankStatement(file: File) {
    try {
      setStatementBusy(true);
      const body = new FormData();
      body.append("file", file);
      if (statementApply) body.append("apply", "true");
      const res = await fetch("/api/v1/bank-statements/import", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Não foi possível ler o extrato.");
        return;
      }
      setStatementResult(json.data as StatementImportData);
      const summary = json.data?.summary;
      if (summary?.dry_run) {
        toast.message(
          `${summary.matched} correspondência(s) exactas. Confirme «Conciliar correspondências» para emitir recibos.`,
        );
      } else {
        toast.success(`${summary?.applied ?? 0} movimento(s) conciliados a partir do extrato.`);
        await loadReconciliation();
      }
    } catch {
      toast.error("Falha ao enviar o extrato bancário.");
    } finally {
      setStatementBusy(false);
    }
  }

  async function pullBankConnector() {
    try {
      setPullBusy(true);
      const res = await fetch("/api/v1/bank-movements/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Conector bancário indisponível.");
        return;
      }
      const applied = Number(json.data?.applied ?? 0);
      const rejected = Number(json.data?.rejected ?? 0);
      toast.success(
        applied > 0
          ? `${applied} movimento(s) liquidados pelo conector (${rejected} rejeitado(s)).`
          : `Nenhum movimento liquidado (${rejected} rejeitado(s)).`,
      );
      if (applied > 0) await loadReconciliation();
    } catch {
      toast.error("Falha ao contactar o conector bancário.");
    } finally {
      setPullBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <PayflowBrandMark size="lg" className="mb-4 animate-pulse" />
        <p className="text-sm text-muted-foreground">A carregar Painel Administrativo PayFlow…</p>
      </div>
    );
  }

  // TELA DE AUTENTICAÇÃO ADMINISTRATIVA
  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
        <Card className="w-full max-w-md border-border bg-card shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto">
              <PayflowBrandMark size="lg" className="rounded-xl shadow-sm" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Painel PayFlow</CardTitle>
            <CardDescription>
              Aceda à gestão de cobranças, conciliação e comprovativos de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {sandboxLoginAllowed ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="key">Chave de Acesso / Integração (sandbox)</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
                    <Input
                      id="key"
                      type="password"
                      placeholder="Chave de integração ou atalho local"
                      value={accessKey}
                      onChange={(e) => setAccessKey(e.target.value)}
                      className="pl-9"
                      autoComplete="current-password"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sandbox explícito (`PAYFLOW_RUNTIME_MODE=sandbox`). Em produção o formulário
                    desaparece — use SSO a partir do SIGA.
                  </p>
                </div>

                <Button type="submit" className="w-full h-11" disabled={loggingIn}>
                  {loggingIn ? (
                    <>
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                      A autenticar…
                    </>
                  ) : (
                    <>
                      Entrar no Painel <ArrowRight className="ml-2 size-4" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <Alert>
                <ShieldCheck className="size-4" />
                <AlertTitle>Acesso só via SIGA</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Em produção não há login por chave neste ecrã. Abra{" "}
                    <strong>Conciliação PayFlow</strong> em Tesouraria ou Faturas no SIGA
                    (SSO assinado, anti-replay).
                  </p>
                  <Button asChild className="w-full">
                    <a href={sigaFinanceHref}>
                      <ExternalLink className="mr-2 size-4" /> Abrir SIGA · Financeiro
                    </a>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" className="w-full">
                <a href="/aluno/pagar">
                  <ExternalLink className="mr-2 size-4" /> Ir para o Portal do Aluno
                </a>
              </Button>
              <Button asChild variant="ghost" className="w-full text-xs text-muted-foreground">
                <Link href="/">Voltar à Página Inicial</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  // DADOS FILTRADOS
  const filteredItems = (data?.items || []).filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.description.toLowerCase().includes(term) ||
      (item.invoice_code && item.invoice_code.toLowerCase().includes(term)) ||
      (item.merchant_reference && item.merchant_reference.toLowerCase().includes(term)) ||
      (item.receipt_code && item.receipt_code.toLowerCase().includes(term))
    );
  });

  const pendingTransfers = (data?.items || []).filter(
    (item) => item.provider === "bank_transfer" && item.status === "pending",
  );

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      {/* HEADER SUPERIOR */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <PayflowBrandLockup subtitle="Conciliação & Pagamentos Escolares" size="sm" />
            <Badge variant="secondary" className="text-xs">
              Admin
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadReconciliation}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>

            <Button asChild variant="outline" size="sm">
              <a href={sigaFinanceHref} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5 mr-1" />
                <span className="hidden sm:inline">SIGA Plus</span>
              </a>
            </Button>

            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-destructive">
              <LogOut className="size-4 mr-1" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6 sm:py-8 space-y-6">
        {/* CARDS DE RESUMO FINANCEIRO */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Liquidado</CardTitle>
              <CheckCircle2 className="size-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(data?.summary.paid_amount || 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {data?.summary.reconciled || 0} pagamentos conciliados
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendente / Em Curso</CardTitle>
              <Clock className="size-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {formatCurrency(data?.summary.pending_amount || 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Aguardando liquidação ou validação
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Comprovativos para Rever</CardTitle>
              <ShieldAlert className="size-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {data?.summary.attention || 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Transferências a aguardar conferência
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Volume de Registros</CardTitle>
              <Layers className="size-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data?.summary.records || 0}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Transações monitoradas no gateway
              </p>
            </CardContent>
          </Card>
        </div>

        {/* NAVEGAÇÃO POR ABAS */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-background border border-border">
            <TabsTrigger value="reconciliation">Conciliação & Cobranças</TabsTrigger>
            <TabsTrigger value="transfers" className="relative">
              Transferências Bancárias
              {pendingTransfers.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {pendingTransfers.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="providers">Canais & Infraestrutura</TabsTrigger>
          </TabsList>

          {/* ABA 1: CONCILIAÇÃO GERAL */}
          <TabsContent value="reconciliation" className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Extrato de Pagamentos & Conciliação</CardTitle>
                    <CardDescription>
                      Consulte todas as operações sincronizadas pelo SIGA Plus e gateways
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        placeholder="Pesquisar por fatura ou recibo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={statusFilter === "all" ? "secondary" : "ghost"}
                        onClick={() => setStatusFilter("all")}
                      >
                        Todos
                      </Button>
                      <Button
                        size="sm"
                        variant={statusFilter === "paid" ? "secondary" : "ghost"}
                        onClick={() => setStatusFilter("paid")}
                      >
                        Pagos
                      </Button>
                      <Button
                        size="sm"
                        variant={statusFilter === "pending" ? "secondary" : "ghost"}
                        onClick={() => setStatusFilter("pending")}
                      >
                        Pendentes
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fatura / Referência</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Conciliação</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                            Nenhum registo de pagamento encontrado com os filtros atuais.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItems.map((item) => (
                          <TableRow key={item.payment_id}>
                            <TableCell className="font-mono text-xs">
                              <div>{item.invoice_code || item.payment_id.slice(0, 12)}</div>
                              {item.merchant_reference && (
                                <div className="text-[11px] text-muted-foreground">
                                  Ref: {item.merchant_reference}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm">
                              {item.description}
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(item.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {item.method.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <PaymentStatusBadge status={item.status} />
                            </TableCell>
                            <TableCell>
                              {item.reconciliation_status === "reconciled" ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Conciliado
                                </Badge>
                              ) : item.reconciliation_status === "attention" ? (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Requer Atenção
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Aguardando
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              {item.receipt_code && (
                                <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                                  <a href={`/comprovativo/${item.receipt_code}`} target="_blank" rel="noreferrer">
                                    <FileCheck2 className="size-3.5 mr-1" /> Recibo
                                  </a>
                                </Button>
                              )}
                              {item.provider === "bank_transfer" &&
                                item.status === "pending" &&
                                session.permissions.includes("reconciliation:write") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs border-amber-300 text-amber-800"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setBankTxId("");
                                    setVerifyModalOpen(true);
                                  }}
                                >
                                  Verificar
                                </Button>
                              )}
                              {item.status === "paid" && session.permissions.includes("payments:refund") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-destructive"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setRefundReason("");
                                    setRefundModalOpen(true);
                                  }}
                                >
                                  Estornar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 2: VALIDAÇÃO DE TRANSFERÊNCIAS */}
          <TabsContent value="transfers" className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">Importar extrato bancário</CardTitle>
                <CardDescription>
                  CSV da escola (`;` ou `,`). Só liquidamos linhas com a mesma referência PayFlow, valor e moeda.
                  O ficheiro sozinho não confirma pagamentos — é preciso conciliar as correspondências.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {session.permissions.includes("reconciliation:write") ? (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Input
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        disabled={statementBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void importBankStatement(file);
                          event.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const blob = new Blob([STATEMENT_TEMPLATE], { type: "text/csv;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "payflow-extrato-modelo.csv";
                          link.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Upload className="mr-1.5 size-3.5" />
                        Modelo CSV
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={statementApply}
                        onChange={(event) => setStatementApply(event.target.checked)}
                      />
                      Conciliar correspondências exactas e emitir recibo (fonte: extrato)
                    </label>
                    {statementResult && (
                      <p className="text-sm text-muted-foreground">
                        {statementResult.summary.rows} linhas · {statementResult.summary.matched} exactas ·{" "}
                        {statementResult.summary.amount_mismatch} valor diferente ·{" "}
                        {statementResult.summary.unknown_reference} referência desconhecida
                        {statementResult.summary.dry_run ? " · pré-visualização" : ` · ${statementResult.summary.applied} liquidado(s)`}
                      </p>
                    )}
                    <Separator />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        Conector bancário (`PAYFLOW_BANK_CONNECTOR_URL` no servidor). Sem URL
                        configurada, o pedido falha fechado. Em sandbox local pode apontar para
                        `/api/v1/bank-movements/sandbox-feed?transfer_reference=…&amount=…`.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pullBusy}
                        onClick={() => void pullBankConnector()}
                      >
                        {pullBusy ? (
                          <>
                            <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                            A puxar…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1.5 size-3.5" />
                            Puxar movimentos
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A importação de extrato exige permissão de conciliação (tesouraria ou administrador financeiro).
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg">Conferência de Transferências Bancárias</CardTitle>
                <CardDescription>
                  Comprovativos submetidos pelos alunos/encarregados aguardando conciliação com o extrato
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data / Ref</TableHead>
                        <TableHead>Aluno / Fatura</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Referência Bancária</TableHead>
                        <TableHead>Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingTransfers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                            Não existem transferências pendentes para verificação no momento.
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingTransfers.map((item) => (
                          <TableRow key={item.payment_id}>
                            <TableCell className="text-xs">
                              {new Date(item.created_at).toLocaleDateString("pt-AO")}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{item.description}</div>
                              <div className="text-xs text-muted-foreground">{item.invoice_code}</div>
                            </TableCell>
                            <TableCell className="font-bold">
                              {formatCurrency(item.amount)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.merchant_reference || "N/D"}
                            </TableCell>
                            <TableCell>
                              {session.permissions.includes("reconciliation:write") ? (
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setBankTxId("");
                                  setVerifyModalOpen(true);
                                }}
                              >
                                Validar no Extrato
                              </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Só leitura</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 3: CANAIS & PROVEDORES */}
          <TabsContent value="providers" className="space-y-4">
            {runtime && (
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-base">Estado operacional</CardTitle>
                  <CardDescription>
                    Valores públicos de `/api/v1/health` — sem segredos. Actualiza com o botão «Atualizar».
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Modo</span>
                    <Badge variant="outline">{runtime.mode}</Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">SSO / Integração</span>
                    <span>
                      {runtime.ssoConfigured ? "SSO ok" : "SSO em falta"} ·{" "}
                      {runtime.integrationConfigured ? "chave ok" : "chave em falta"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Conector bancário</span>
                    <Badge variant={runtime.bankConnectorConfigured ? "secondary" : "outline"}>
                      {runtime.bankConnectorConfigured ? "Configurado" : "Não configurado"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Acerto SIGA</span>
                    <Badge variant={runtime.sigaSettlementConfigured ? "secondary" : "outline"}>
                      {runtime.sigaSettlementConfigured ? "Pronto" : "Em falta"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Alertas externos</span>
                    <Badge variant={runtime.alertWebhookConfigured ? "secondary" : "outline"}>
                      {runtime.alertWebhookConfigured ? "Webhook activo" : "Só logs"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">EMIS</span>
                    <span>
                      {runtime.emisHomologated
                        ? "Credenciais homologadas (adaptador produção ainda fechado)"
                        : runtime.paymentInitiationEnabled
                          ? "Sandbox local"
                          : "Não homologado"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Landmark className="size-4 text-primary" /> Transferências por IBAN Angolano
                  </CardTitle>
                  <CardDescription>Validação ISO mod-97 e conciliação bancária</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Suporte IBAN (AO06)</span>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                      Ativo (21 Bancos)
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Upload de Comprovativos</span>
                    <span>PDF, JPEG, PNG, WEBP</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Prazo de Expiração</span>
                    <span>72 horas</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Importação de extrato CSV</span>
                    <span>Referência + valor + moeda</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Segurança R2</span>
                    <span>Armazenamento Criptografado</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="size-4 text-primary" /> Gateway EMIS / Multicaixa
                  </CardTitle>
                  <CardDescription>Pagamentos por Referência e Multicaixa Express</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Ambiente de Operação</span>
                    <Badge variant="outline">Sandbox Local / Produção</Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Multicaixa Express</span>
                    <span>Autorização por telemóvel</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-muted-foreground">Pagamento por Referência</span>
                    <span>Entidade + Referência</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Recibos Verificáveis</span>
                    <Badge variant="secondary">Emitidos com QR Code</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL DE CONFIRMAÇÃO MANUAL DE TRANSFERÊNCIA */}
      <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Movimento Bancário</DialogTitle>
            <DialogDescription>
              Valide o crédito no extrato bancário oficial da escola para emitir o recibo definitivo.
              A confirmação manual exige o papel finance_admin (Administrador no SIGA via SSO).
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/60 p-3 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descrição:</span>
                  <span className="font-semibold">{selectedItem.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(selectedItem.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Referência:</span>
                  <span className="font-mono text-xs">{selectedItem.merchant_reference || selectedItem.payment_id}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="txId">ID da Transação no Banco / Extrato *</Label>
                <Input
                  id="txId"
                  placeholder="Ex: TXN-2026-98124 ou Número de Lote"
                  value={bankTxId}
                  onChange={(e) => setBankTxId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Identificador que consta no extrato bancário para auditoria e rastreabilidade fiscal.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVerifyModalOpen(false)}
              disabled={verifying}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmManualTransfer}
              disabled={verifying}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {verifying ? (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  A validar…
                </>
              ) : (
                "Confirmar & Emitir Recibo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estornar pagamento</DialogTitle>
            <DialogDescription>
              O recibo original não é apagado. A fatura no PayFlow volta a aberta. Corrija também o caixa no SIGA.
              Só o administrador financeiro (SSO) pode estornar.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-3 py-2">
              <p className="text-sm">
                {selectedItem.description} · {formatCurrency(selectedItem.amount)}
              </p>
              <div className="space-y-2">
                <Label htmlFor="refundReason">Motivo *</Label>
                <Input
                  id="refundReason"
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                  placeholder="Conciliação incorrecta no extrato de 5 Set"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRefundModalOpen(false)} disabled={refunding}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRefund()} disabled={refunding}>
              {refunding ? (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  A estornar…
                </>
              ) : (
                "Confirmar estorno"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
