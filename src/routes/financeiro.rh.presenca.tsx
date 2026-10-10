import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LocateFixed, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  getAttendanceAssurancePolicy,
  listAttendanceAssuranceEvidence,
  saveAttendanceAssurancePolicy,
} from "@/features/hr/attendance-assurance";

export const Route = createFileRoute("/financeiro/rh/presenca")({
  head: () => ({ meta: [{ title: "Validação de Presença · RH · SIGA" }] }),
  component: AttendanceAssurancePage,
});

type PolicyForm = Awaited<ReturnType<typeof getAttendanceAssurancePolicy>>;

function AttendanceAssurancePage() {
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: ["hr", "attendance-assurance", "policy"],
    queryFn: () => getAttendanceAssurancePolicy(),
    retry: false,
  });
  const evidence = useQuery({
    queryKey: ["hr", "attendance-assurance", "evidence"],
    queryFn: () => listAttendanceAssuranceEvidence(),
    retry: false,
  });
  const [form, setForm] = useState<PolicyForm | null>(null);

  useEffect(() => {
    if (policy.data) setForm(policy.data);
  }, [policy.data]);

  const save = useMutation({
    mutationFn: (value: PolicyForm) => saveAttendanceAssurancePolicy({ data: value }),
    onSuccess: async () => {
      toast.success("Política de presença guardada");
      await queryClient.invalidateQueries({ queryKey: ["hr", "attendance-assurance"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar a política."),
  });

  const setNumber = (key: keyof PolicyForm, raw: string, nullable = false) => {
    if (!form) return;
    const value = raw.trim() === "" && nullable ? null : Number(raw);
    setForm({ ...form, [key]: value } as PolicyForm);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Validação avançada de presença"
          description="Configure o motor multifator que cruza QR, identidade, horário, geofence e sinais de integridade para decidir entre aprovação automática, revisão ou rejeição."
          actions={
            <Button asChild variant="outline">
              <Link to="/financeiro/rh">Voltar ao RH</Link>
            </Button>
          }
        />

        {policy.isError ? (
          <Panel title="Configuração indisponível">
            <p className="text-sm text-destructive">
              {policy.error instanceof Error
                ? policy.error.message
                : "Não foi possível carregar a política."}
            </p>
          </Panel>
        ) : !form ? (
          <Panel title="A carregar">
            <p className="text-sm text-muted-foreground">A carregar política de presença…</p>
          </Panel>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title="Geofence da escola"
                description="A localização melhora a confiança. Por padrão o sistema guarda apenas distância/resultado; coordenadas exactas permanecem desligadas."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span>Latitude</span>
                    <Input
                      aria-label="Latitude do centro da escola"
                      type="number"
                      step="any"
                      value={form.centerLatitude ?? ""}
                      onChange={(e) => setNumber("centerLatitude", e.target.value, true)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Longitude</span>
                    <Input
                      aria-label="Longitude do centro da escola"
                      type="number"
                      step="any"
                      value={form.centerLongitude ?? ""}
                      onChange={(e) => setNumber("centerLongitude", e.target.value, true)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Raio permitido (m)</span>
                    <Input
                      aria-label="Raio permitido da geofence em metros"
                      type="number"
                      value={form.geofenceRadiusM}
                      onChange={(e) => setNumber("geofenceRadiusM", e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Precisão máxima do GPS (m)</span>
                    <Input
                      aria-label="Precisão máxima do GPS em metros"
                      type="number"
                      value={form.maxLocationAccuracyM}
                      onChange={(e) => setNumber("maxLocationAccuracyM", e.target.value)}
                    />
                  </label>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      aria-label="Exigir localização para validação automática"
                      type="checkbox"
                      checked={form.requireLocation}
                      onChange={(e) => setForm({ ...form, requireLocation: e.target.checked })}
                    />{" "}
                    Exigir localização para validação automática
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      aria-label="Guardar coordenadas exactas para auditoria"
                      type="checkbox"
                      checked={form.storeExactLocation}
                      onChange={(e) => setForm({ ...form, storeExactLocation: e.target.checked })}
                    />{" "}
                    Guardar coordenadas exactas para auditoria
                  </label>
                </div>
              </Panel>

              <Panel
                title="Janelas temporais"
                description="Evita check-in muito cedo e check-out fora do período plausível da aula."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span>Entrada antes (min)</span>
                    <Input
                      aria-label="Minutos permitidos antes do início para check-in"
                      type="number"
                      value={form.checkinEarlyMinutes}
                      onChange={(e) => setNumber("checkinEarlyMinutes", e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Entrada depois (min)</span>
                    <Input
                      aria-label="Minutos permitidos depois do início para check-in"
                      type="number"
                      value={form.checkinLateMinutes}
                      onChange={(e) => setNumber("checkinLateMinutes", e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Saída antes (min)</span>
                    <Input
                      aria-label="Minutos permitidos antes do fim para check-out"
                      type="number"
                      value={form.checkoutEarlyMinutes}
                      onChange={(e) => setNumber("checkoutEarlyMinutes", e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Saída depois (min)</span>
                    <Input
                      aria-label="Minutos permitidos depois do fim para check-out"
                      type="number"
                      value={form.checkoutLateMinutes}
                      onChange={(e) => setNumber("checkoutLateMinutes", e.target.value)}
                    />
                  </label>
                </div>
              </Panel>
            </div>

            <Panel
              title="Score de confiança"
              description="O padrão aprova automaticamente a partir de 70/100; scores entre revisão e aprovação não entram automaticamente na folha."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <span>Aprovação automática</span>
                  <Input
                    aria-label="Score mínimo de aprovação automática"
                    type="number"
                    min={0}
                    max={100}
                    value={form.autoApproveScore}
                    onChange={(e) => setNumber("autoApproveScore", e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Limiar de revisão</span>
                  <Input
                    aria-label="Score mínimo de revisão"
                    type="number"
                    min={0}
                    max={100}
                    value={form.reviewScore}
                    onChange={(e) => setNumber("reviewScore", e.target.value)}
                  />
                </label>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="size-4" /> 70 pontos base
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    QR válido + identidade + horário dentro da janela.
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <LocateFixed className="size-4" /> +20 localização
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quando a escola configurar centro e raio e o GPS tiver precisão suficiente.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                  {save.isPending ? "A guardar…" : "Guardar política"}
                </Button>
              </div>
            </Panel>
          </>
        )}

        <Panel
          title="Evidências recentes"
          description="Auditoria das últimas 100 validações multifator. Coordenadas exactas não aparecem nesta visão."
        >
          {evidence.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar evidências…</p>
          ) : evidence.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar as evidências.</p>
          ) : (evidence.data ?? []).length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Ainda não existem evidências registadas"
              description="Cada check-in ou check-out por QR grava aqui o resultado da validação multifator (geofence, dispositivo e score de confiança)."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/professor/presenca">Abrir presença do professor</Link>
                </Button>
              }
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 pr-4">Momento</th>
                    <th className="py-3 pr-4">Tipo</th>
                    <th className="py-3 pr-4">Score</th>
                    <th className="py-3 pr-4">Decisão</th>
                    <th className="py-3 pr-4">Geofence</th>
                    <th className="py-3">Distância</th>
                  </tr>
                </thead>
                <tbody>
                  {(evidence.data ?? []).map((row) => (
                    <tr key={String(row.id)} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        {new Date(String(row.captured_at)).toLocaleString("pt-AO")}
                      </td>
                      <td className="py-3 pr-4">
                        {row.purpose === "check_in" ? "Entrada" : "Saída"}
                      </td>
                      <td className="py-3 pr-4 font-semibold">{String(row.assurance_score)}/100</td>
                      <td className="py-3 pr-4">{String(row.decision)}</td>
                      <td className="py-3 pr-4">
                        {row.inside_geofence == null
                          ? "—"
                          : row.inside_geofence
                            ? "Dentro"
                            : "Fora"}
                      </td>
                      <td className="py-3">
                        {row.distance_from_school_m == null
                          ? "—"
                          : `${Math.round(Number(row.distance_from_school_m))} m`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
