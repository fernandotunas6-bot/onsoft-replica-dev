import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { perfisPermissoes, utilizadores } from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/acessos")({
  head: () => ({
    meta: [
      { title: "Gestão de Acessos · SIGA" },
      {
        name: "description",
        content:
          "Utilizadores, perfis e permissões do sistema escolar: administradores, secretaria, tesouraria, professores e encarregados.",
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
  Próprios: toneClass.primary,
  Nenhum: toneClass.danger,
};

function AcessosPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title="Gestão de Acessos"
          description="Utilizadores do sistema, perfis atribuídos e matriz de permissões por módulo."
          actions={
            <Button className="gap-2">
              <UserPlus className="size-4" /> Novo utilizador
            </Button>
          }
        />

        <StatGrid
          items={[
            { label: "Utilizadores", value: String(utilizadores.length), hint: "Contas registadas" },
            {
              label: "Activos",
              value: String(utilizadores.filter((u) => u.estado === "Activo").length),
              hint: "Com acesso permitido",
            },
            { label: "Perfis", value: String(perfisPermissoes.length), hint: "Níveis de permissão" },
            { label: "Sessões hoje", value: "12", hint: "Últimas 24 horas" },
          ]}
        />

        <Panel title="Utilizadores" description="Contas com acesso ao sistema">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilizador</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utilizadores.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                          {u.nome
                            .split(" ")
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join("")}
                        </span>
                        <div className="leading-tight">
                          <p className="font-semibold">{u.nome}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(badgeBase, toneClass.primary)}>{u.perfil}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.ultimoAcesso}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          badgeBase,
                          u.estado === "Activo" ? toneClass.success : toneClass.danger,
                        )}
                      >
                        {u.estado}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        defaultChecked={u.estado === "Activo"}
                        aria-label={`Permitir acesso de ${u.nome}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel
          title="Matriz de permissões"
          description="Nível de acesso de cada perfil por módulo"
          action={
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" /> Definições recomendadas
            </span>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Alunos</TableHead>
                  <TableHead>Financeiro</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Configurações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perfisPermissoes.map((p) => (
                  <TableRow key={p.perfil}>
                    <TableCell className="font-semibold">{p.perfil}</TableCell>
                    {[p.alunos, p.financeiro, p.notas, p.config].map((nivel, i) => (
                      <TableCell key={i}>
                        <span className={cn(badgeBase, nivelTone[nivel])}>{nivel}</span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-soft">
          <KeyRound className="size-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            As permissões são apenas demonstrativas até ligar o backend — depois passam a ser validadas
            no servidor.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
