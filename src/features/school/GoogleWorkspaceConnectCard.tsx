import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { ALL_WORKSPACE_SERVICES, type WorkspaceService } from "@/integrations/google/workspace-services";
import {
  disconnectGoogleWorkspace, getGoogleWorkspaceConnection, startGoogleWorkspaceOAuth,
} from "@/integrations/google/workspace-auth";
import { executeGoogleWorkspaceOperation } from "@/integrations/google/workspace-operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const labels: Record<WorkspaceService, string> = {
  drive: "Drive — arquivos e pastas do SIGA",
  docs: "Docs — documentos da escola",
  sheets: "Sheets — pautas e relatórios",
  classroom: "Classroom — aulas, turmas e convites",
  calendar: "Calendar — aulas e exames",
  gmail: "Gmail — enviar correio autorizado",
  tasks: "Tasks — tarefas e lembretes",
};

export function GoogleWorkspaceConnectCard() {
  const account = useCurrentAccount();
  const schoolId = account.schoolId;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<WorkspaceService[]>(["drive", "calendar"]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const status = useQuery({
    queryKey: ["google-workspace", account.id, schoolId],
    enabled: Boolean(account.id && schoolId),
    queryFn: () => getGoogleWorkspaceConnection({ data: { schoolId: schoolId! } }),
    retry: false, staleTime: 15_000,
  });

  function toggle(service: WorkspaceService) {
    setSelected((current) => current.includes(service)
      ? current.filter((value) => value !== service)
      : [...current, service]);
  }

  const connect = async () => {
    if (!schoolId || !selected.length) return;
    setBusy(true);
    try {
      const result = await startGoogleWorkspaceOAuth({ data: { schoolId, services: selected } });
      if (!result.authorizeUrl.startsWith("https://accounts.google.com/")) {
        throw new Error("O endereço de autorização devolvido é inválido.");
      }
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na ligação Google.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!schoolId || !window.confirm("Desligar esta conta Google desta escola?")) return;
    setBusy(true);
    try {
      await disconnectGoogleWorkspace({ data: { schoolId } });
      await queryClient.invalidateQueries({ queryKey: ["google-workspace", account.id, schoolId] });
      toast.success("A autorização Google foi desligada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao desligar.");
    } finally { setBusy(false); }
  };

  const testReadOnly = async () => {
    if (!schoolId || !status.data) return;
    setTesting(true);
    let ok = 0;
    const probes = [
      status.data.services.includes("drive") ? { action: "drive.list" as const, schoolId, pageSize: 1 } : null,
      status.data.services.includes("classroom") ? { action: "classroom.list" as const, schoolId } : null,
      status.data.services.includes("calendar") ? { action: "calendar.list" as const, schoolId, timeMin: new Date().toISOString() } : null,
      status.data.services.includes("tasks") ? { action: "tasks.list" as const, schoolId } : null,
    ].filter((value) => value !== null);
    try {
      for (const probe of probes) {
        try {
          await executeGoogleWorkspaceOperation({ data: probe });
          ok++;
        } catch (error) {
          toast.error(`${probe.action}: ${error instanceof Error ? error.message : "Falha"}`);
        }
      }
      if (!probes.length) {
        toast.info("Os serviços autorizados requerem uma operação manual para teste.");
      } else {
        toast.info(`Serviços com acesso de leitura confirmado: ${ok}/${probes.length}.`);
      }
    } finally { setTesting(false); }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold">A minha conta Google Workspace</h5>
          <p className="text-xs text-muted-foreground">
            Permissões separadas do login SIGA; cada utilizador autoriza apenas os serviços que pretende.
          </p>
        </div>
        <Badge variant={status.data?.connected ? "default" : "secondary"}>
          {status.data?.connected ? "Ligado" : "Não ligado"}
        </Badge>
      </div>
      {status.data?.googleEmail ? (
        <p className="text-xs text-muted-foreground">
          Conta autorizada: <strong>{status.data.googleEmail}</strong>
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {ALL_WORKSPACE_SERVICES.map((service) => (
          <label key={service}
            className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-xs">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(service)}
                onChange={() => toggle(service)} disabled={busy} />
              {labels[service]}
            </span>
            {status.data?.services.includes(service) ? <Badge>Autorizado</Badge> : null}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Drive apenas pode gerir ficheiros criados ou autorizados para o SIGA. Classroom depende das
        permissões da conta Google, e as quotas dos serviços podem mudar. Uma escola não tem acesso
        à conta de outra escola sem autorização própria.
      </p>
      {status.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível consultar a ligação. Verifique as credenciais Google no servidor.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !schoolId || !selected.length} onClick={() => void connect()}>
          {busy ? "A processar..." : status.data?.connected ? "Adicionar permissões" : "Ligar Google"}
        </Button>
        <Button variant="outline" disabled={busy || testing || !status.data?.connected}
          onClick={() => void testReadOnly()}>
          {testing ? "A verificar..." : "Testar serviços de leitura"}
        </Button>
        <Button variant="outline" disabled={busy || !status.data?.connected}
          onClick={() => void disconnect()}>
          Desligar
        </Button>
      </div>
    </section>
  );
}
