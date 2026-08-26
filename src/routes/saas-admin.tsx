import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Users,
  CreditCard,
  HardDrive,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  Shield,
  Zap,
  TrendingUp,
  RefreshCw,
  MoreVertical,
  XCircle,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  fetchSaaSStats,
  fetchAllTenants,
  createSchoolTenant,
  updateTenantStatus,
  type SaaSStats,
} from "@/lib/saas/provisioning-service";
import type { Tenant, CreateSchoolWizardData } from "@/features/saas/types";

export const Route = createFileRoute("/saas-admin")({
  component: SaaSControlCenter,
});

export function SaaSControlCenter() {
  const [stats, setStats] = useState<SaaSStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);

  // Wizard State
  const [wizardData, setWizardData] = useState<CreateSchoolWizardData>({
    name: "",
    commercial_name: "",
    nif: "",
    address: "",
    city: "Luanda",
    phone: "",
    email: "",
    contact_name: "",
    contact_role: "Diretor Geral",
    contact_phone: "",
    contact_email: "",
    plan_code: "professional",
    trial_days: 14,
    slug: "",
    admin_name: "",
    admin_email: "",
  });

  const loadData = async () => {
    setIsLoading(true);
    const [sData, tData] = await Promise.all([fetchSaaSStats(), fetchAllTenants()]);
    setStats(sData);
    setTenants(tData);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update slug automatically when school name changes
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    setWizardData((prev) => ({
      ...prev,
      name,
      slug: prev.slug || slug,
    }));
  };

  const handleCreateSchoolSubmit = async () => {
    if (!wizardData.name || !wizardData.slug || !wizardData.contact_email) {
      toast.error("Por favor preencha os campos obrigatórios da instituição e responsável.");
      return;
    }

    setIsProvisioning(true);
    const result = await createSchoolTenant(wizardData);
    setIsProvisioning(false);

    if (result.success) {
      toast.success(`Escola ${wizardData.name} criada e provisionada com sucesso!`);
      setIsWizardOpen(false);
      setWizardStep(1);
      setWizardData({
        name: "",
        commercial_name: "",
        nif: "",
        address: "",
        city: "Luanda",
        phone: "",
        email: "",
        contact_name: "",
        contact_role: "Diretor Geral",
        contact_phone: "",
        contact_email: "",
        plan_code: "professional",
        trial_days: 14,
        slug: "",
        admin_name: "",
        admin_email: "",
      });
      loadData();
    } else {
      toast.error(result.error || "Falha ao provisionar nova escola.");
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === "active" ? "suspended" : "active";
    const ok = await updateTenantStatus(tenant.id, newStatus);
    if (ok) {
      toast.success(
        `Status da escola ${tenant.name} atualizado para ${newStatus === "active" ? "Ativo" : "Suspenso"}.`,
      );
      loadData();
    } else {
      toast.error("Erro ao atualizar status do tenant.");
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.contact_name && t.contact_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-AO", {
      style: "currency",
      currency: "AOA",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/25">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              SIGA{" "}
              <span className="text-xs bg-indigo-500/20 text-indigo-400 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                SaaS Control Center
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Painel Administrativo da Plataforma (Somente Proprietário)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            onClick={() => setIsWizardOpen(true)}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-600/30"
          >
            <Plus className="mr-2 h-4 w-4" />+ Nova Escola
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Global SaaS Key Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/60 border-slate-800 text-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Escolas Clientes
              </CardTitle>
              <Building2 className="h-4 w-4 text-indigo-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.totalTenants || 0}</div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-emerald-400 font-semibold">
                  {stats?.activeTenants || 0} ativas
                </span>{" "}
                • {stats?.trialTenants || 0} em trial
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 text-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total de Alunos
              </CardTitle>
              <Users className="h-4 w-4 text-violet-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {(stats?.totalStudents || 0).toLocaleString()}
              </div>
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                <TrendingUp className="h-3 w-3" /> Na plataforma global
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 text-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Receita Recorrente (MRR)
              </CardTitle>
              <CreditCard className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {formatCurrency(stats?.mrrAoa || 0)}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                ARR estimado: {formatCurrency(stats?.arrAoa || 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 text-slate-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Infraestrutura / Cloud
              </CardTitle>
              <HardDrive className="h-4 w-4 text-sky-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats?.totalStorageGb || 0} GB</div>
              <p className="text-xs text-slate-400 mt-1">Cloudflare Workers & Supabase RLS</p>
            </CardContent>
          </Card>
        </div>

        {/* Tenant Management Section */}
        <Card className="bg-slate-900/80 border-slate-800 text-slate-100">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-white">
                Escolas Cadastradas na Plataforma
              </CardTitle>
              <CardDescription className="text-slate-400">
                Gerencie instituições, ative/desative acessos e altere planos de subscrição.
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Buscar escola ou responsável..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 text-sm focus-visible:ring-indigo-500"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 bg-slate-950 border-slate-800 text-slate-300 text-sm">
                  <SelectValue placeholder="Filtrar por Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="trial">Em Trial</SelectItem>
                  <SelectItem value="suspended">Suspensas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[11px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Instituição / Subdomínio</th>
                    <th className="py-3.5 px-4 font-semibold">Responsável</th>
                    <th className="py-3.5 px-4 font-semibold">Plano</th>
                    <th className="py-3.5 px-4 font-semibold">Limite Alunos</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Nenhuma escola encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 px-4">
                          <div className="font-semibold text-white">{t.name}</div>
                          <a
                            href={`http://${t.slug}.portal-siga.com`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-indigo-400 hover:underline font-mono"
                          >
                            {t.slug}.portal-siga.com
                          </a>
                        </td>

                        <td className="py-4 px-4">
                          <div className="text-slate-200">{t.contact_name || "Direção"}</div>
                          <div className="text-xs text-slate-400">{t.contact_email || "—"}</div>
                        </td>

                        <td className="py-4 px-4">
                          <Badge
                            variant="outline"
                            className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium"
                          >
                            {t.plans?.name || "Professional"}
                          </Badge>
                        </td>

                        <td className="py-4 px-4 font-mono text-slate-300">
                          {t.max_students} alunos
                        </td>

                        <td className="py-4 px-4">
                          {t.status === "active" && (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex w-fit items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Ativa
                            </Badge>
                          )}
                          {t.status === "trial" && (
                            <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/30 flex w-fit items-center gap-1">
                              <Clock className="h-3 w-3" /> Trial
                            </Badge>
                          )}
                          {(t.status === "suspended" || t.status === "past_due") && (
                            <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 flex w-fit items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Suspensa
                            </Badge>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(t)}
                            className={
                              t.status === "active"
                                ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                            }
                          >
                            {t.status === "active" ? "Suspender" : "Reativar"}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Dialog Wizard: + Nova Escola */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent className="sm:max-w-2xl bg-slate-900 border-slate-800 text-slate-100 p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-400" /> Wizard de Provisionamento de Escola
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Cadastre uma nova instituição e crie seu ambiente SIGA isolado em minutos.
            </DialogDescription>
          </DialogHeader>

          {/* Step Tracker */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 my-2">
            {[
              { num: 1, label: "Instituição" },
              { num: 2, label: "Responsável" },
              { num: 3, label: "Plano" },
              { num: 4, label: "Subdomínio" },
              { num: 5, label: "Confirmação" },
            ].map((s) => (
              <div key={s.num} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    wizardStep === s.num
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40"
                      : wizardStep > s.num
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {wizardStep > s.num ? "✓" : s.num}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${wizardStep === s.num ? "text-white" : "text-slate-500"}`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Form Content Steps */}
          <div className="py-4 space-y-4">
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Nome Oficial da Escola *</Label>
                  <Input
                    placeholder="Ex: Colégio Horizonte"
                    value={wizardData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">NIF / Identificação Fiscal</Label>
                    <Input
                      placeholder="Ex: 5000123456"
                      value={wizardData.nif}
                      onChange={(e) => setWizardData((prev) => ({ ...prev, nif: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Município / Cidade</Label>
                    <Input
                      placeholder="Ex: Luanda"
                      value={wizardData.city}
                      onChange={(e) => setWizardData((prev) => ({ ...prev, city: e.target.value }))}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Nome do Diretor / Gestor *</Label>
                  <Input
                    placeholder="Ex: Dr. Carlos Santos"
                    value={wizardData.contact_name}
                    onChange={(e) =>
                      setWizardData((prev) => ({
                        ...prev,
                        contact_name: e.target.value,
                        admin_name: e.target.value,
                      }))
                    }
                    className="bg-slate-950 border-slate-800 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">E-mail Principal *</Label>
                    <Input
                      type="email"
                      placeholder="Ex: direcao@horizonte.co.ao"
                      value={wizardData.contact_email}
                      onChange={(e) =>
                        setWizardData((prev) => ({
                          ...prev,
                          contact_email: e.target.value,
                          admin_email: e.target.value,
                        }))
                      }
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Telefone de Contacto</Label>
                    <Input
                      placeholder="Ex: +244 923 000 111"
                      value={wizardData.contact_phone}
                      onChange={(e) =>
                        setWizardData((prev) => ({ ...prev, contact_phone: e.target.value }))
                      }
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Selecione o Plano SaaS</Label>
                  <Select
                    value={wizardData.plan_code}
                    onValueChange={(val: any) =>
                      setWizardData((prev) => ({ ...prev, plan_code: val }))
                    }
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      <SelectItem value="start">
                        SIGA Start (Até 250 alunos) — 50.000 Kz/mês
                      </SelectItem>
                      <SelectItem value="professional">
                        SIGA Professional (Até 750 alunos) — 120.000 Kz/mês
                      </SelectItem>
                      <SelectItem value="business">
                        SIGA Business (Até 2.000 alunos) — 250.000 Kz/mês
                      </SelectItem>
                      <SelectItem value="enterprise">SIGA Enterprise (Redes Escolares)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Subdomínio da Escola (URL Exclusiva)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={wizardData.slug}
                      onChange={(e) =>
                        setWizardData((prev) => ({
                          ...prev,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        }))
                      }
                      className="bg-slate-950 border-slate-800 text-white font-mono"
                    />
                    <span className="text-slate-400 font-mono text-sm">.portal-siga.com</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    O cliente acederá exclusivamente por:{" "}
                    <span className="text-indigo-400 font-mono">
                      {wizardData.slug || "escola"}.portal-siga.com
                    </span>
                  </p>
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-bold text-white mb-2">Resumo da Nova Escola</h4>
                <div className="text-xs space-y-1.5 text-slate-300">
                  <p>
                    <strong>Nome:</strong> {wizardData.name}
                  </p>
                  <p>
                    <strong>Responsável:</strong> {wizardData.contact_name} (
                    {wizardData.contact_email})
                  </p>
                  <p>
                    <strong>Plano:</strong> {wizardData.plan_code.toUpperCase()}
                  </p>
                  <p>
                    <strong>URL SIGA:</strong>{" "}
                    <span className="text-indigo-400 font-mono">
                      {wizardData.slug}.portal-siga.com
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-slate-800 pt-4">
            {wizardStep > 1 ? (
              <Button
                variant="outline"
                onClick={() => setWizardStep((prev) => prev - 1)}
                className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
              >
                Voltar
              </Button>
            ) : (
              <div />
            )}

            {wizardStep < 5 ? (
              <Button
                onClick={() => setWizardStep((prev) => prev + 1)}
                className="bg-indigo-600 text-white hover:bg-indigo-500"
              >
                Próximo <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleCreateSchoolSubmit}
                disabled={isProvisioning}
                className="bg-emerald-600 text-white hover:bg-emerald-500 font-bold shadow-lg shadow-emerald-600/30"
              >
                {isProvisioning ? "Provisionando..." : "Criar e Ativar Escola"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
