import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  KeyRound,
  MailPlus,
  ShieldCheck,
  UserPlus,
  Award,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaAvatar } from "@/components/ui/media-frame";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  accessLevelForRole,
  accessModules,
  applicationRoles,
  type ApplicationRole,
} from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { overlayCredenciais, overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf } from "@/lib/export-pdf-loader";
import {
  inviteSystemUser,
  listSystemAccounts,
  resendSystemInvite,
  resetStaffPasswordDirect,
  setSystemAccountDisabled,
  updateSystemAccountCargo,
} from "@/features/access/server";
import { listStaffModuleGrants, setStaffModuleGrant } from "@/features/access/grants";
import type { AccessLevel } from "@/features/auth/access-policy";
import { createPerson, listStaffDirectory, updatePersonStatus } from "@/features/people/server";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { cn } from "@/lib/utils";

const acessosFilterDefaults = {
  q: "",
  estado: "todos",
  cargo: "todos",
};

export const Route = createFileRoute("/acessos")({
  head: () => ({
    meta: [
      { title: "Gestão de Acessos · SIGA" },
      {
        name: "description",
        content: "Contas de login, equipa escolar e matriz de permissões por módulo do SIGA.",
      },
      { property: "og:title", content: "Gestão de Acessos · SIGA" },
      {
        property: "og:description",
        content: "Controle quem acede a cada módulo do sistema e com que nível de permissão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AcessosPage,
});

const nivelTone: Record<string, string> = {
  Total: toneClass.success,
  Escrita: toneClass.info,
  Leitura: toneClass.muted,
  Nenhum: toneClass.danger,
};

const roleLabels: Record<string, string> = {
  professor: "Professor",
  funcionario: "Funcionário",
  diretor: "Director",
  coordenador: "Coordenador",
};

function AcessosPage() {
  const queryClient = useQueryClient();
  const currentUser = useCurrentAccount();
  const { school, selectedYearLabel } = useSchoolSettings();
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "acessos",
    acessosFilterDefaults,
  );
  const query = filters.q;
  const estado = filters.estado;
  const cargo = filters.cargo;
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const accountsQuery = useQuery({
    queryKey: ["access", "accounts"],
    queryFn: () => listSystemAccounts(),
    retry: false,
  });
  const staffQuery = useQuery({
    queryKey: ["people", "staff"],
    queryFn: () => listStaffDirectory(),
  });
  const grantsQuery = useQuery({
    queryKey: ["access", "grants"],
    queryFn: () => listStaffModuleGrants(),
    retry: false,
  });
  const grantLevels = ["Nenhum", "Leitura", "Escrita", "Total"] as const;
  const printStaffCredentials = async (person: { full_name: string; email?: string | null }) => {
    const domain = school?.email?.split("@")[1] || person.email?.split("@")[1] || "escola.ao";
    await issuePrintDocument({
      tipo: "Folha de credenciais",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif ?? null,
        phone: school?.phone ?? null,
        email: school?.email ?? null,
        address: school?.address ?? null,
        directorName: school?.director_name ?? null,
        academicYear:
          (selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year) ?? null,
      },
      student: {
        fullName: person.full_name,
        academicNumber: person.email || person.full_name,
      },
      overlay: overlayCredenciais({
        fullName: person.full_name,
        process: person.email || person.full_name,
        email: person.email ?? null,
        schoolEmailDomain: domain,
      }),
    });
  };

  const accounts = accountsQuery.data ?? [];
  const staff = (staffQuery.data ?? []).filter(
    (person): person is NonNullable<typeof person> => person != null,
  );
  const activos = accounts.filter((account) => !account.disabled);
  const secretMissing =
    accountsQuery.isError &&
    accountsQuery.error instanceof Error &&
    /SUPABASE_SECRET_KEY|service_role|Missing Supabase/i.test(accountsQuery.error.message);

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesEstado =
        estado === "todos" ||
        (estado === "activos" && !account.disabled) ||
        (estado === "suspensos" && account.disabled);
      const matchesCargo = cargo === "todos" || String(account.cargo ?? "") === cargo;
      return (
        matchesEstado &&
        matchesCargo &&
        (!q ||
          String(account.full_name ?? "")
            .toLowerCase()
            .includes(q) ||
          String(account.email ?? "")
            .toLowerCase()
            .includes(q) ||
          String(account.cargo ?? "")
            .toLowerCase()
            .includes(q))
      );
    });
  }, [accounts, cargo, estado, query]);

  const filteredStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter(
      (person) =>
        !q ||
        String(person.full_name ?? "")
          .toLowerCase()
          .includes(q) ||
        String(person.email ?? "")
          .toLowerCase()
          .includes(q) ||
        (person.roles ?? []).some((role) =>
          String(roleLabels[role] ?? role)
            .toLowerCase()
            .includes(q),
        ),
    );
  }, [query, staff]);

  const exportarContas = () =>
    exportCsv(
      "contas-filtradas",
      [
        { label: "Nome", value: (row) => row["nome"] },
        { label: "Email", value: (row) => row["email"] },
        { label: "Cargo", value: (row) => row["cargo"] },
        { label: "Estado", value: (row) => row["estado"] },
      ],
      filteredAccounts.map((account) => ({
        nome: account.full_name,
        email: account.email ?? "",
        cargo: account.cargo,
        estado: account.disabled ? "Suspenso" : "Activo",
      })),
    );
  const contasExportColumns = [
    { label: "Nome", value: (row: { nome: string }) => row.nome },
    { label: "Email", value: (row: { email: string }) => row.email },
    { label: "Cargo", value: (row: { cargo: string }) => row.cargo },
    { label: "Estado", value: (row: { estado: string }) => row.estado },
  ];
  const contasExportRows = filteredAccounts.map((account) => ({
    nome: account.full_name,
    email: account.email ?? "",
    cargo: account.cargo,
    estado: account.disabled ? "Suspenso" : "Activo",
  }));
  const exportarContasOficial = () => {
    void issuePrintDocument({
      tipo: "Contas de login",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif ?? null,
        phone: school?.phone ?? null,
        email: school?.email ?? null,
        address: school?.address ?? null,
        directorName: school?.director_name ?? null,
        academicYear:
          (selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year) ?? null,
      },
      overlay: overlayServico({
        name: "Contas de login",
        areaLabel: "Acessos",
        reference: `ACC-${contasExportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Utilizadores",
            rows: contasExportRows.map((row) => ({
              label: row.nome,
              value: row.email || "—",
              note: `${row.cargo} · ${row.estado}`,
            })),
          },
        ],
        permissions: ["Administrador"],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "contas-oficial",
          "Contas de login",
          {
            schoolName: school?.name ?? "Escola",
            academicYear:
              selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
            ...(school?.director_name != null ? { directorName: school.director_name } : {}),
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(contasExportRows.length),
            ]),
          },
          contasExportColumns,
          contasExportRows,
        ),
    });
  };
  const exportarEquipa = () =>
    exportCsv(
      "equipa-filtrada",
      [
        { label: "Nome", value: (row) => row["nome"] },
        { label: "Email", value: (row) => row["email"] },
        { label: "Papéis", value: (row) => row["papeis"] },
        { label: "Estado", value: (row) => row["estado"] },
      ],
      filteredStaff.map((person) => ({
        nome: person.full_name,
        email: person.email ?? "",
        papeis: (person.roles ?? []).map((role) => roleLabels[role] ?? role).join(", "),
        estado: person.status ?? "",
      })),
    );
  const equipaExportColumns = [
    { label: "Nome", value: (row: { nome: string }) => row.nome },
    { label: "Email", value: (row: { email: string }) => row.email },
    { label: "Papéis", value: (row: { papeis: string }) => row.papeis },
    { label: "Estado", value: (row: { estado: string }) => row.estado },
  ];
  const equipaExportRows = filteredStaff.map((person) => ({
    nome: person.full_name,
    email: person.email ?? "",
    papeis: (person.roles ?? []).map((role) => roleLabels[role] ?? role).join(", "),
    estado: person.status ?? "",
  }));
  const exportarEquipaOficial = () => {
    void issuePrintDocument({
      tipo: "Equipa escolar",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif ?? null,
        phone: school?.phone ?? null,
        email: school?.email ?? null,
        address: school?.address ?? null,
        directorName: school?.director_name ?? null,
        academicYear:
          (selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year) ?? null,
      },
      overlay: overlayServico({
        name: "Equipa escolar",
        areaLabel: "Acessos",
        reference: `EQP-${equipaExportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Colaboradores",
            rows: equipaExportRows.map((row) => ({
              label: row.nome,
              value: row.email || "—",
              note: `${row.papeis} · ${row.estado}`,
            })),
          },
        ],
        permissions: ["Administrador", "Secretaria"],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "equipa-oficial",
          "Equipa escolar",
          {
            schoolName: school?.name ?? "Escola",
            academicYear:
              selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
            ...(school?.director_name != null ? { directorName: school.director_name } : {}),
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(equipaExportRows.length),
            ]),
          },
          equipaExportColumns,
          equipaExportRows,
        ),
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title="Gestão de Acessos"
          description="Convide contas de login, ajuste cargos e mantenha a equipa escolar no registo de pessoas."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5 text-xs shadow-2xs">
                    <Download className="size-3.5" /> Exportar Acessos{" "}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={exportarContasOficial}
                    disabled={!filteredAccounts.length}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Award className="size-3.5 text-primary" /> Relatório Contas PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarContas}
                    disabled={!filteredAccounts.length}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Download className="size-3.5" /> Ficheiro CSV Contas
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarEquipaOficial}
                    disabled={!filteredStaff.length}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Award className="size-3.5 text-primary" /> Relatório Equipa PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarEquipa}
                    disabled={!filteredStaff.length}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Download className="size-3.5" /> Ficheiro CSV Equipa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <QuickFormModal
                title="Convidar utilizador"
                eyebrow="Contas de sistema"
                description="Envia um convite por email via Supabase Auth e atribui o cargo no SIGA."
                icon={<MailPlus className="size-5" />}
                submitLabel="Enviar convite"
                note="Requer SUPABASE_SECRET_KEY no ambiente do servidor."
                successDescription="Convite enviado. O utilizador define a senha pelo email recebido."
                onSubmit={async (values) => {
                  await inviteSystemUser({
                    data: {
                      fullName: values["nome"] ?? "",
                      email: values["email"] ?? "",
                      cargo: (values["cargo"] as ApplicationRole) ?? "Utilizador",
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["access", "accounts"] });
                }}
                fields={[
                  {
                    name: "nome",
                    label: "Nome completo",
                    placeholder: "Ex.: Paulo Neto",
                    full: true,
                  },
                  { name: "email", label: "Email", placeholder: "nome@escola.ao" },
                  {
                    name: "cargo",
                    label: "Cargo no SIGA",
                    type: "select",
                    options: [...applicationRoles],
                  },
                ]}
                trigger={(open) => (
                  <Button className="gap-2" onClick={open} disabled={secretMissing}>
                    <MailPlus className="size-4" /> Convidar utilizador
                  </Button>
                )}
              />
              <QuickFormModal
                title="Novo membro da equipa"
                eyebrow="Registo de pessoas"
                description="Cria a pessoa no registo central com um papel escolar (sem login)."
                icon={<UserPlus className="size-5" />}
                submitLabel="Criar membro"
                successDescription="Membro adicionado ao registo de pessoas."
                onSubmit={async (values) => {
                  const roleMap: Record<
                    string,
                    "professor" | "funcionario" | "diretor" | "coordenador"
                  > = {
                    Professor: "professor",
                    Funcionário: "funcionario",
                    Director: "diretor",
                    Coordenador: "coordenador",
                  };
                  await createPerson({
                    data: {
                      person: {
                        full_name: values["nome"] ?? "",
                        email: values["email"] || undefined,
                        phone_primary: values["telefone"] || undefined,
                      },
                      roles: [roleMap[values["perfil"] ?? ""] ?? "funcionario"],
                      documents: [],
                      relationships: [],
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["people", "staff"] });
                  await queryClient.invalidateQueries({ queryKey: ["people", "search"] });
                }}
                fields={[
                  {
                    name: "nome",
                    label: "Nome completo",
                    placeholder: "Ex.: Paulo Neto",
                    full: true,
                  },
                  {
                    name: "email",
                    label: "Email",
                    placeholder: "nome@escola.ao",
                    required: false,
                  },
                  {
                    name: "perfil",
                    label: "Papel escolar",
                    type: "select",
                    options: ["Professor", "Funcionário", "Director", "Coordenador"],
                  },
                  {
                    name: "telefone",
                    label: "Telefone",
                    placeholder: "+244 9xx xxx xxx",
                    required: false,
                  },
                ]}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2" onClick={open}>
                    <UserPlus className="size-4" /> Novo membro
                  </Button>
                )}
              />
            </div>
          }
        />

        <InstalledModuleTools module="comunicacoes" />

        <StatGrid collapsible storageKey="acessos"
          items={[
            {
              label: "Contas de login",
              value: accountsQuery.isError ? "—" : String(accounts.length),
              hint: secretMissing ? "Secret key em falta" : "Perfis na escola",
            },
            {
              label: "Activas",
              value: accountsQuery.isError ? "—" : String(activos.length),
              hint: "Sem suspensão Auth",
            },
            {
              label: "Equipa escolar",
              value: String(staff.length),
              hint: "Pessoas com papéis de staff",
            },
            {
              label: "Sessão actual",
              value: currentUser.role,
              hint: currentUser.email,
            },
          ]}
        />

        <ListFilterBar
          values={filters}
          activeCount={activeCount}
          onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
          onReset={resetFilters}
          fields={[
            {
              name: "q",
              placeholder: "Pesquisar nome, email ou cargo…",
              "aria-label": "Pesquisar conta",
            },
            {
              name: "estado",
              type: "select",
              label: "Estado",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Todas as contas" },
                { value: "activos", label: "Só activas" },
                { value: "suspensos", label: "Só suspensas" },
              ],
            },
            {
              name: "cargo",
              type: "select",
              label: "Cargo",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Todos os cargos" },
                ...applicationRoles.map((role) => ({ value: role, label: role })),
              ],
            },
          ]}
        />

        <Panel
          title="Contas de sistema"
          description="Utilizadores com login no SIGA (Supabase Auth + profiles)"
        >
          {secretMissing ? (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm">
              <p className="font-semibold">Gestão Auth indisponível neste ambiente</p>
              <p className="mt-1 text-muted-foreground">
                Configure <code className="font-mono">SUPABASE_SECRET_KEY</code> (ou{" "}
                <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>) apenas no servidor
                para listar, convidar e suspender contas.
              </p>
            </div>
          ) : accountsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar contas…</p>
          ) : accountsQuery.isError ? (
            <p className="text-sm text-destructive">
              {accountsQuery.error instanceof Error
                ? accountsQuery.error.message
                : "Não foi possível carregar as contas."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilizador</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Ainda não há contas nesta escola. Envie o primeiro convite.
                      </TableCell>
                    </TableRow>
                  ) : filteredAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Nenhuma conta corresponde aos filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <MediaAvatar alt={account.full_name} className="size-9 rounded-xl" />
                            <div className="leading-tight">
                              <p className="font-semibold">
                                {account.full_name}
                                {account.is_self ? (
                                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                    (eu)
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {account.email ?? "Sem email"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <select
                            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                            value={account.cargo}
                            disabled={account.is_self}
                            onChange={async (event) => {
                              try {
                                await updateSystemAccountCargo({
                                  data: {
                                    userId: account.id,
                                    cargo: event.target.value as ApplicationRole,
                                  },
                                });
                                await queryClient.invalidateQueries({
                                  queryKey: ["access", "accounts"],
                                });
                                toast.success("Cargo actualizado");
                              } catch (error) {
                                toast.error("Não foi possível actualizar o cargo", {
                                  description:
                                    error instanceof Error ? error.message : "Tente novamente.",
                                });
                              }
                            }}
                            aria-label={`Cargo de ${account.full_name}`}
                          >
                            {applicationRoles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {account.last_sign_in_at
                            ? new Date(account.last_sign_in_at).toLocaleString("pt-PT")
                            : "Nunca"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              badgeBase,
                              account.disabled ? toneClass.danger : toneClass.success,
                            )}
                          >
                            {account.disabled
                              ? "Suspenso"
                              : account.email_confirmed
                                ? "Activo"
                                : "Convite pendente"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <QuickFormModal
                              eyebrow="Acessos"
                              title={`Módulos · ${account.full_name}`}
                              description="Sobrepõe o nível do cargo. Deixe em Predefinição para usar a política do perfil."
                              icon={<KeyRound className="size-5" />}
                              submitLabel="Guardar permissões"
                              onSubmit={async (values) => {
                                for (const module of accessModules) {
                                  const selected = values[module.key];
                                  if (!selected || selected === "Predefinição do cargo") continue;
                                  await setStaffModuleGrant({
                                    data: {
                                      userId: account.id,
                                      moduleKey: module.key,
                                      level: selected as AccessLevel,
                                    },
                                  });
                                }
                                await queryClient.invalidateQueries({
                                  queryKey: ["access", "grants"],
                                });
                              }}
                              fields={accessModules.map((module) => {
                                const current = (grantsQuery.data ?? []).find(
                                  (grant) =>
                                    grant.user_id === account.id && grant.module_key === module.key,
                                );
                                return {
                                  name: module.key,
                                  label: module.label,
                                  type: "select" as const,
                                  options: ["Predefinição do cargo", ...grantLevels],
                                  defaultValue: current?.level ?? "Predefinição do cargo",
                                };
                              })}
                              trigger={(open) => (
                                <Button size="sm" variant="ghost" onClick={open}>
                                  Módulos
                                </Button>
                              )}
                            />
                            {!account.is_self && account.email ? (
                              <>
                                <QuickFormModal
                                  eyebrow="Segurança e Acessos"
                                  title={`Definir Nova Senha · ${account.full_name}`}
                                  description="Redefina diretamente a senha de acesso deste funcionário para restabelecer o seu login no sistema."
                                  icon={<KeyRound className="size-5" />}
                                  submitLabel="Guardar Nova Senha"
                                  successDescription="Senha redefinida com sucesso. O funcionário já pode entrar com a nova senha."
                                  onSubmit={async (values) => {
                                    const newPassword = String(values["novaSenha"] ?? "").trim();
                                    if (newPassword.length < 8) {
                                      throw new Error(
                                        "A senha deve conter pelo menos 8 caracteres.",
                                      );
                                    }
                                    await resetStaffPasswordDirect({
                                      data: {
                                        userId: account.id,
                                        newPassword,
                                      },
                                    });
                                    toast.success(`Senha de ${account.full_name} redefinida!`);
                                  }}
                                  fields={[
                                    {
                                      name: "novaSenha",
                                      label: "Nova senha (mínimo 8 caracteres)",
                                      type: "password",
                                      placeholder: "Ex.: Siga@Pass2026!",
                                      defaultValue: "Siga@Pass2026!",
                                    },
                                  ]}
                                  trigger={(open) => (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={open}
                                      className="h-8 gap-1 text-xs"
                                    >
                                      <KeyRound className="size-3 text-primary" /> Nova Senha
                                    </Button>
                                  )}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      const result = await resendSystemInvite({
                                        data: { userId: account.id },
                                      });
                                      await navigator.clipboard.writeText(result.actionLink);
                                      toast.success(
                                        result.kind === "invite"
                                          ? "Link de convite copiado"
                                          : "Link de recuperação copiado",
                                        { description: result.email },
                                      );
                                    } catch (error) {
                                      toast.error("Não foi possível gerar o link", {
                                        description:
                                          error instanceof Error
                                            ? error.message
                                            : "Tente novamente.",
                                      });
                                    }
                                  }}
                                >
                                  Reenviar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    void printStaffCredentials({
                                      full_name: account.full_name,
                                      email: account.email,
                                    }).catch((error) =>
                                      toast.error(
                                        error instanceof Error
                                          ? error.message
                                          : "Não foi possível imprimir as credenciais.",
                                      ),
                                    )
                                  }
                                >
                                  Credenciais
                                </Button>
                                {whatsappOn ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      try {
                                        const result = await resendSystemInvite({
                                          data: { userId: account.id },
                                        });
                                        const label =
                                          result.kind === "invite" ? "convite" : "recuperação";
                                        await navigator.clipboard.writeText(result.actionLink);
                                        window.open(
                                          whatsappHref(
                                            "",
                                            `Acesso SIGA (${label}): ${result.actionLink}`,
                                          ),
                                          "_blank",
                                          "noopener,noreferrer",
                                        );
                                        toast.success("Link copiado", {
                                          description: "WhatsApp aberto para enviar o acesso.",
                                        });
                                      } catch (error) {
                                        toast.error("Não foi possível gerar o link", {
                                          description:
                                            error instanceof Error
                                              ? error.message
                                              : "Tente novamente.",
                                        });
                                      }
                                    }}
                                  >
                                    WhatsApp
                                  </Button>
                                ) : null}
                                {resendOn ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      try {
                                        const result = await resendSystemInvite({
                                          data: { userId: account.id },
                                        });
                                        await navigator.clipboard.writeText(result.actionLink);
                                        window.open(
                                          `mailto:${encodeURIComponent(result.email)}?subject=${encodeURIComponent("Acesso SIGA")}&body=${encodeURIComponent(result.actionLink)}`,
                                        );
                                        toast.success(
                                          "Texto do convite copiado para e-mail Resend",
                                          {
                                            description: result.email,
                                          },
                                        );
                                      } catch (error) {
                                        toast.error("Não foi possível gerar o link", {
                                          description:
                                            error instanceof Error
                                              ? error.message
                                              : "Tente novamente.",
                                        });
                                      }
                                    }}
                                  >
                                    E-mail
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                            <Switch
                              checked={!account.disabled}
                              disabled={account.is_self}
                              onCheckedChange={async (checked) => {
                                try {
                                  await setSystemAccountDisabled({
                                    data: { userId: account.id, disabled: !checked },
                                  });
                                  await queryClient.invalidateQueries({
                                    queryKey: ["access", "accounts"],
                                  });
                                  toast.success(checked ? "Conta reactivada" : "Conta suspensa");
                                } catch (error) {
                                  toast.error("Não foi possível actualizar o acesso", {
                                    description:
                                      error instanceof Error ? error.message : "Tente novamente.",
                                  });
                                }
                              }}
                              aria-label={`Permitir acesso de ${account.full_name}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>

        <Panel title="Equipa escolar" description="Professores e funcionários no registo central">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Papéis</TableHead>
                  <TableHead>Actualizado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      A carregar equipa…
                    </TableCell>
                  </TableRow>
                ) : staff.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Ainda não há membros de equipa.{" "}
                      <Link to="/pessoas" className="font-semibold text-primary underline">
                        Abrir Pessoas
                      </Link>
                    </TableCell>
                  </TableRow>
                ) : filteredStaff.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum membro corresponde à pesquisa.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStaff.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <MediaAvatar alt={member.full_name} className="size-9 rounded-xl" />
                          <div className="leading-tight">
                            <p className="font-semibold">{member.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.email ?? member.phone_primary ?? "Sem contacto"}
                              {whatsappOn && member.phone_primary ? (
                                <>
                                  {" · "}
                                  <a
                                    href={whatsappHref(member.phone_primary)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold text-primary hover:underline"
                                  >
                                    WhatsApp
                                  </a>
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.roles.map((role) => (
                            <span key={role} className={cn(badgeBase, toneClass.primary)}>
                              {roleLabels[role] ?? role}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(member.updated_at).toLocaleString("pt-PT")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            badgeBase,
                            member.status === "active" ? toneClass.success : toneClass.danger,
                          )}
                        >
                          {member.status === "active" ? "Activo" : "Inactivo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={member.status === "active"}
                          onCheckedChange={async (checked) => {
                            try {
                              await updatePersonStatus({
                                data: {
                                  personId: member.id,
                                  status: checked ? "active" : "inactive",
                                },
                              });
                              await queryClient.invalidateQueries({
                                queryKey: ["people", "staff"],
                              });
                              toast.success(checked ? "Membro activado" : "Membro desactivado");
                            } catch (error) {
                              toast.error("Não foi possível actualizar", {
                                description:
                                  error instanceof Error ? error.message : "Tente novamente.",
                              });
                            }
                          }}
                          aria-label={`Alterar estado de ${member.full_name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel
          title="Matriz de permissões do sistema"
          description="Níveis por cargo. Use «Módulos» em cada conta para sobrepor grants individuais."
          action={
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> access-policy.ts
            </span>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  {accessModules.map((module) => (
                    <TableHead key={module.key}>{module.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {applicationRoles.map((perfil) => (
                  <TableRow key={perfil}>
                    <TableCell className="font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <KeyRound className="size-3.5 text-muted-foreground" />
                        {perfil}
                      </span>
                    </TableCell>
                    {accessModules.map((module) => {
                      const level = accessLevelForRole(perfil as ApplicationRole, module.key);
                      return (
                        <TableCell key={module.key}>
                          <span className={cn(badgeBase, nivelTone[level] ?? toneClass.muted)}>
                            {level}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
