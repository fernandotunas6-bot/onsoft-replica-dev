import { createFileRoute } from "@tanstack/react-router";
import { Award, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { aproveitamentoPorClasse, disciplinas, mediaPorTrimestre, turmas } from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/relatorios/academicos")({
  head: () => ({
    meta: [
      { title: "Relatórios Académicos · ONSCHOOL" },
      {
        name: "description",
        content:
          "Aproveitamento por classe, médias trimestrais, desempenho por turma e ranking de disciplinas.",
      },
      { property: "og:title", content: "Relatórios Académicos · ONSCHOOL" },
      {
        property: "og:description",
        content: "Avalie aproveitamento, médias e desempenho pedagógico por turma e disciplina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosAcademicos,
});

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

function RelatoriosAcademicos() {
  const mediaGeral = turmas.reduce((s, t) => s + t.media, 0) / turmas.length;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Relatórios"
          title="Relatórios Académicos"
          description="Indicadores de aproveitamento, evolução das médias e desempenho comparado das turmas."
          actions={
            <Button variant="outline" className="gap-2">
              <Download className="size-4" /> Exportar pauta
            </Button>
          }
        />

        <StatGrid
          items={[
            { label: "Média geral", value: mediaGeral.toFixed(1), hint: "Escala 0 – 20" },
            { label: "Aprovados", value: "86%", hint: "Projecção do 3º trimestre" },
            { label: "Reprovados", value: "14%", hint: "Necessitam recuperação" },
            { label: "Assiduidade média", value: "94%", hint: "Todas as classes" },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Aproveitamento por classe" description="Aprovados vs. reprovados (%)">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aproveitamentoPorClasse}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="classe" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="aprovados" name="Aprovados" fill="var(--chart-1)" radius={[8, 8, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="reprovados" name="Reprovados" fill="var(--chart-4)" radius={[8, 8, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Evolução das médias" description="Média geral por trimestre">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mediaPorTrimestre}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="trimestre" {...axis} />
                  <YAxis domain={[10, 20]} {...axis} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Line type="monotone" dataKey="media" stroke="var(--chart-3)" strokeWidth={3} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <Panel title="Desempenho por turma" description="Ordenado pela média da turma">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turma</TableHead>
                  <TableHead>Curso</TableHead>
                  <TableHead>Director de turma</TableHead>
                  <TableHead className="text-right">Alunos</TableHead>
                  <TableHead className="text-right">Média</TableHead>
                  <TableHead className="text-right">Classificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...turmas]
                  .sort((a, b) => b.media - a.media)
                  .map((t, i) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-semibold">
                        <span className="flex items-center gap-2">
                          {i === 0 ? <Award className="size-4 text-warning-foreground" /> : null}
                          {t.nome}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.curso}</TableCell>
                      <TableCell>{t.director}</TableCell>
                      <TableCell className="text-right">{t.alunos}</TableCell>
                      <TableCell className="text-right font-bold">{t.media.toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            badgeBase,
                            t.media >= 15 ? toneClass.success : t.media >= 13 ? toneClass.info : toneClass.warning,
                          )}
                        >
                          {t.media >= 15 ? "Muito bom" : t.media >= 13 ? "Bom" : "Suficiente"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel title="Taxa de aprovação por disciplina" description="Disciplinas com maior risco de reprovação">
          <ul className="space-y-4">
            {[...disciplinas]
              .sort((a, b) => a.aprovacao - b.aprovacao)
              .map((d) => (
                <li key={d.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{d.nome}</span>
                    <span className="text-muted-foreground">{d.aprovacao}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        d.aprovacao >= 85 ? "bg-success" : d.aprovacao >= 75 ? "bg-primary" : "bg-destructive",
                      )}
                      style={{ width: `${d.aprovacao}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
