import { useMemo, useState } from "react";
import { safeCell } from "@/lib/export-csv";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  MapPinned,
  Megaphone,
  Network,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildAlumniCommunicationAudience,
  getAlumniExportDataset,
  getAlumniGeoAnalytics,
} from "@/features/alumni/admin-tools";

export const Route = createFileRoute("/alumni/insights")({
  head: () => ({ meta: [{ title: "Insights Alumni · SIGA" }] }),
  component: AlumniInsightsPage,
});

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  // Dados escritos pelos antigos alunos: protegidos contra fórmulas no Excel.
  return safeCell(Array.isArray(value) ? value.join(" | ") : String(value));
}

function AlumniInsightsPage() {
  const [purpose, setPurpose] = useState<
    "general" | "opportunities" | "events" | "mentoring" | "surveys" | "fundraising"
  >("general");
  const geoQuery = useQuery({
    queryKey: ["alumni", "geo"],
    queryFn: () => getAlumniGeoAnalytics(),
  });
  const exportQuery = useQuery({
    queryKey: ["alumni", "export"],
    queryFn: () => getAlumniExportDataset(),
    enabled: false,
  });
  const audienceQuery = useQuery({
    queryKey: ["alumni", "audience", purpose],
    queryFn: () => buildAlumniCommunicationAudience({ data: { purpose } }),
  });

  const totalGeo = useMemo(
    () => (geoQuery.data ?? []).reduce((sum, row) => sum + row.total, 0),
    [geoQuery.data],
  );
  const totalEmployed = useMemo(
    () => (geoQuery.data ?? []).reduce((sum, row) => sum + row.employed, 0),
    [geoQuery.data],
  );

  async function downloadCsv() {
    const result = await exportQuery.refetch();
    const rows = result.data ?? [];
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) =>
        headers.map((header) => csvEscape(row[header as keyof typeof row])).join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `siga-alumni-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          group="Comunidade & Alumni"
          title="Insights & Operações Alumni"
          description="Distribuição geográfica, empregabilidade, públicos segmentados e exportação institucional com regras de privacidade."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link
                to="/alumni"
                className="inline-flex h-9 items-center rounded-xl border border-input bg-background px-3.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Network className="mr-2 size-3.5" />
                Rede
              </Link>
              <Link
                to="/alumni/operations"
                className="inline-flex h-9 items-center rounded-xl border border-input bg-background px-3.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Settings2 className="mr-2 size-3.5" />
                Operações
              </Link>
              <Link
                to="/alumni/communications"
                className="inline-flex h-9 items-center rounded-xl border border-input bg-background px-3.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Megaphone className="mr-2 size-3.5" />
                Comunicação
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCsv}
                disabled={exportQuery.isFetching}
                className="rounded-xl text-xs h-9"
              >
                <Download className="mr-2 size-3.5" />
                {exportQuery.isFetching ? "A exportar…" : "Exportar CSV"}
              </Button>
            </div>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <MapPinned className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">{geoQuery.data?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Províncias representadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <UsersRound className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">{totalGeo}</p>
              <p className="text-xs text-muted-foreground">Alumni com localização conhecida</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <ShieldCheck className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">
                {totalGeo ? Math.round((totalEmployed / totalGeo) * 100) : 0}%
              </p>
              <p className="text-xs text-muted-foreground">
                Empregabilidade nos perfis geolocalizados
              </p>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="geo" className="space-y-4">
          <TabsList className="h-auto flex-wrap rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="geo" className="rounded-xl">
              Mapa & Território
            </TabsTrigger>
            <TabsTrigger value="audience" className="rounded-xl">
              Comunicação segmentada
            </TabsTrigger>
            <TabsTrigger value="privacy" className="rounded-xl">
              Privacidade & Exportação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="geo">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Distribuição por província</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(geoQuery.data ?? []).map((row) => (
                  <div
                    key={row.province}
                    className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-[minmax(0,1fr)_100px_120px_100px] md:items-center"
                  >
                    <div>
                      <p className="font-bold">{row.province}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.cities.length
                          ? row.cities.join(" · ")
                          : "Município/cidade por actualizar"}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-black">{row.total}</p>
                      <p className="text-[11px] text-muted-foreground">Alumni</p>
                    </div>
                    <div>
                      <p className="text-lg font-black">{row.employed}</p>
                      <p className="text-[11px] text-muted-foreground">Empregados</p>
                    </div>
                    <div>
                      <p className="text-lg font-black">{row.mentors}</p>
                      <p className="text-[11px] text-muted-foreground">Mentores</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audience">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="size-5 text-primary" /> Público consentido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "general",
                      "opportunities",
                      "events",
                      "mentoring",
                      "surveys",
                      "fundraising",
                    ] as const
                  ).map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant={purpose === item ? "default" : "outline"}
                      onClick={() => setPurpose(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(audienceQuery.data ?? []).map((person) => (
                    <div key={person.alumniId} className="rounded-2xl border border-border/60 p-4">
                      <p className="font-semibold">{person.fullName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {person.email || "E-mail desactivado"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {person.phone || "Telefone não autorizado"}
                      </p>
                      <p className="mt-2 text-[11px] font-bold text-primary">
                        {[person.graduationYear, person.province].filter(Boolean).join(" · ") ||
                          "Perfil Alumni"}
                      </p>
                    </div>
                  ))}
                </div>
                <Link
                  to="/alumni/communications"
                  className="mt-5 inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
                >
                  <Megaphone className="mr-2 size-3.5" />
                  Criar comunicado para este público
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="privacy">
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-6">
                <h3 className="font-bold">Princípios de exportação</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  O CSV institucional inclui dados profissionais e académicos de referência, mas
                  e-mail e telefone só são preenchidos quando o Alumni autorizou contacto.
                  Preferências de canal e finalidade são avaliadas separadamente na segmentação.
                </p>
                <Button className="mt-4 rounded-xl" onClick={downloadCsv}>
                  <Download className="mr-2 size-4" />
                  Gerar exportação protegida
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
