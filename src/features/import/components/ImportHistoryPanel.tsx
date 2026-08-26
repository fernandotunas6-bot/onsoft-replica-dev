import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { listImportJobs, rollbackImportJob } from "@/features/import/server";
import type { ImportJobRecord } from "@/features/import/schemas";

const statusBadge: Record<string, { label: string; class: string }> = {
  completed: {
    label: "Concluído",
    class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  rolled_back: { label: "Revertido", class: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  failed: { label: "Falhou", class: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  ready: { label: "Pronto", class: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  importing: {
    label: "Em Processamento",
    class: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  uploaded: { label: "Carregado", class: "bg-muted text-muted-foreground" },
};

export function ImportHistoryPanel() {
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => listImportJobs(),
  });

  const handleRollback = async (job: ImportJobRecord) => {
    try {
      const res = await rollbackImportJob({ data: { job_id: job.id } });
      toast.success("Importação revertida", {
        description: `${res.revertedCount} registo(s) foram revertidos.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reverter importação.");
    }
  };

  const jobs = jobsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Histórico de Importações</h3>
        <p className="text-xs text-muted-foreground">
          Auditoria completa das importações realizadas na escola.
        </p>
      </div>

      {jobsQuery.isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          A carregar…
        </div>
      ) : !jobs.length ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <History className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-2 text-xs text-muted-foreground">
            Ainda não foram realizadas importações nesta escola.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Ficheiro</th>
                <th className="px-3 py-2.5 font-medium">Módulo</th>
                <th className="px-3 py-2.5 font-medium">Linhas</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => {
                const badge = statusBadge[job.status] ?? {
                  label: job.status,
                  class: "bg-muted text-muted-foreground",
                };
                return (
                  <tr key={job.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {new Date(job.created_at).toLocaleDateString("pt-AO")}{" "}
                      {new Date(job.created_at).toLocaleTimeString("pt-AO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{job.file_name}</td>
                    <td className="px-3 py-2.5 capitalize">{job.module}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-emerald-600">
                        {job.inserted_rows} inseridos
                      </span>
                      {job.updated_rows ? (
                        <span className="ml-1 text-blue-600">/ {job.updated_rows} atualizados</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.class}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {job.status === "completed" ? (
                        <ConfirmActionModal
                          trigger={(open) => (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-xs text-amber-600 hover:text-amber-700"
                              onClick={open}
                            >
                              <RotateCcw className="size-3.5" /> Reverter
                            </Button>
                          )}
                          eyebrow="Reversão de importação"
                          title="Reverter esta importação?"
                          description={`Esta acção anula o lote "${job.file_name}" e reverte/remove os registos que criou ou alterou no SIGA. Não pode ser desfeita.`}
                          confirmLabel="Reverter importação"
                          onConfirm={() => handleRollback(job)}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
