import { useMemo, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Download,
  Play,
  Sparkles,
  Edit2,
  Save,
  Loader2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OFFICIAL_TEMPLATES,
  generateOfficialCsvTemplate,
} from "@/features/import/official-templates";
import {
  analyzeImportFile,
  commitImportBatch,
  createImportJob,
  generateErrorReportCsv,
  listStagingRows,
  stageImportRows,
  updateStagingRowField,
} from "@/features/import/server";
import {
  importModuleOptions,
  type ImportModule,
  type ImportJobRecord,
  type ImportRowRecord,
} from "@/features/import/schemas";
import { suggestColumnMapping } from "@/features/import/engine/suggest";

const STEPS = [
  "1. Arquivo",
  "2. Tipo de dados",
  "3. Mapeamento",
  "4. Validação",
  "5. Revisão",
  "6. Importação",
  "7. Resultado",
];

/** Módulos com importador implementado — os restantes aparecem desactivados no Select. */
const IMPLEMENTED_MODULES = new Set<ImportModule>([
  "pessoas",
  "alunos",
  "matriculas",
  "notas",
  "pautas",
]);

type AnalyzedSheet = {
  name: string;
  headers: string[];
  row_count: number;
  rows: Record<string, string | number | boolean | null>[];
  suggested_module: ImportModule;
  suggested_module_score: number;
};

const STAGE_CHUNK = 300;
const COMMIT_BATCH = 200;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

export function ImportWorkflowWizard({
  academicYearId,
  onComplete,
}: {
  academicYearId?: string | null;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sheets, setSheets] = useState<AnalyzedSheet[]>([]);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [selectedModule, setSelectedModule] = useState<ImportModule>("alunos");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  const [job, setJob] = useState<ImportJobRecord | null>(null);
  const [staging, setStaging] = useState(false);
  const [stageProgress, setStageProgress] = useState({ done: 0, total: 0 });
  const [stageCounts, setStageCounts] = useState({ valid: 0, invalid: 0, duplicate: 0 });

  const [stagingRows, setStagingRows] = useState<ImportRowRecord[]>([]);
  const [stagingTotal, setStagingTotal] = useState(0);
  const [stagingPage, setStagingPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [loadingRows, setLoadingRows] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState("");
  const [editingValue, setEditingValue] = useState("");

  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    inserted: number;
    updated: number;
    ignored: number;
    failed: number;
    processed: number;
  } | null>(null);

  const [importing, setImporting] = useState(false);
  const [commitProgress, setCommitProgress] = useState({ processed: 0, total: 0 });
  const [result, setResult] = useState<{
    inserted: number;
    updated: number;
    ignored: number;
    failed: number;
  } | null>(null);

  const selectedSheet = sheets[selectedSheetIdx] ?? null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setAnalyzing(true);
    setSheets([]);
    try {
      const file_base64 = await readFileAsBase64(selected);
      const res = await analyzeImportFile({ data: { file_base64, file_name: selected.name } });
      const firstSheet = res.sheets[0];
      if (!firstSheet) {
        toast.error("Não foi possível encontrar folhas com dados neste ficheiro.");
        return;
      }
      setSheets(res.sheets);
      setSelectedSheetIdx(0);
      setSelectedModule(firstSheet.suggested_module);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao analisar o ficheiro.");
      setFile(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = generateOfficialCsvTemplate(selectedModule);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Modelo_${selectedModule}_SIGA.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleProceedToMapping = () => {
    if (!selectedSheet) return;
    setColumnMapping(suggestColumnMapping(selectedSheet.headers, selectedModule));
    setStep(3);
  };

  const handleProceedToStaging = async () => {
    if (!file || !selectedSheet) return;
    if (!IMPLEMENTED_MODULES.has(selectedModule)) {
      toast.error(`O módulo "${selectedModule}" ainda não está disponível para importação.`);
      return;
    }
    setStaging(true);
    setStageProgress({ done: 0, total: selectedSheet.rows.length });
    setStageCounts({ valid: 0, invalid: 0, duplicate: 0 });
    try {
      const createdJob = await createImportJob({
        data: {
          module: selectedModule,
          file_name: file.name,
          academic_year_id: academicYearId ?? null,
          total_rows: selectedSheet.rows.length,
        },
      });
      setJob(createdJob);

      const rows = selectedSheet.rows;
      for (let i = 0; i < rows.length; i += STAGE_CHUNK) {
        const chunk = rows.slice(i, i + STAGE_CHUNK);
        const res = await stageImportRows({
          data: {
            job_id: createdJob.id,
            sheet_name: selectedSheet.name,
            rows: chunk,
            column_mapping: columnMapping,
          },
        });
        setStageProgress({ done: Math.min(i + chunk.length, rows.length), total: rows.length });
        setStageCounts({
          valid: res.total_valid,
          invalid: res.total_invalid,
          duplicate: res.total_duplicate,
        });
      }

      await loadStagingPage(createdJob.id, 1, "todos");
      setStep(4);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao preparar staging.");
    } finally {
      setStaging(false);
    }
  };

  const loadStagingPage = async (jobId: string, page: number, status: string) => {
    setLoadingRows(true);
    try {
      const res = await listStagingRows({
        data: {
          job_id: jobId,
          page,
          page_size: 20,
          status_filter: status === "todos" ? undefined : status,
        },
      });
      setStagingRows(res.rows);
      setStagingTotal(res.total);
      setStagingPage(page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar linhas de staging.");
    } finally {
      setLoadingRows(false);
    }
  };

  const handleFilterChange = (value: string) => {
    setFilterStatus(value);
    if (job) void loadStagingPage(job.id, 1, value);
  };

  const handleSaveInlineEdit = async (rowId: string) => {
    if (!editingField || !job) return;
    try {
      await updateStagingRowField({
        data: { row_id: rowId, field_name: editingField, new_value: editingValue },
      });
      await loadStagingPage(job.id, stagingPage, filterStatus);
      setEditingRowId(null);
      toast.success("Linha corrigida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar alteração.");
    }
  };

  const handleDownloadErrorReport = async () => {
    if (!job) return;
    const res = await listStagingRows({
      data: { job_id: job.id, page: 1, page_size: 500, status_filter: undefined },
    });
    const csvContent = generateErrorReportCsv(res.rows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `erros_importacao_${selectedModule}_SIGA.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDryRun = async () => {
    if (!job) return;
    setDryRunning(true);
    const totals = { inserted: 0, updated: 0, ignored: 0, failed: 0, processed: 0 };
    try {
      let afterRow = 0;
      // Amostra limitada — simula até 400 linhas em dois lotes grandes, sem gravar dados.
      for (let guard = 0; guard < 2; guard++) {
        const res = await commitImportBatch({
          data: {
            job_id: job.id,
            dry_run: true,
            batch_size: COMMIT_BATCH,
            after_row_number: afterRow,
            duplicate_strategy: "update",
          },
        });
        totals.inserted += res.inserted;
        totals.updated += res.updated;
        totals.ignored += res.ignored;
        totals.failed += res.failed;
        totals.processed += res.processed;
        afterRow = res.next_after_row_number;
        if (res.processed === 0 || res.remaining === 0) break;
      }
      setDryRunResult(totals);
      toast.info(`Simulação: ${totals.processed} linha(s) analisadas, sem alterar o SIGA.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na simulação.");
    } finally {
      setDryRunning(false);
    }
  };

  const handleRunCommit = async () => {
    if (!job) return;
    setImporting(true);
    setCommitProgress({ processed: 0, total: job.total_rows });
    const totals = { inserted: 0, updated: 0, ignored: 0, failed: 0 };
    try {
      let completed = false;
      let guard = 0;
      const maxBatches = Math.ceil(Math.max(job.total_rows, 1) / COMMIT_BATCH) + 2;
      while (!completed && guard < maxBatches) {
        guard += 1;
        const res = await commitImportBatch({
          data: {
            job_id: job.id,
            dry_run: false,
            batch_size: COMMIT_BATCH,
            after_row_number: 0,
            duplicate_strategy: "update",
          },
        });
        totals.inserted += res.inserted;
        totals.updated += res.updated;
        totals.ignored += res.ignored;
        totals.failed += res.failed;
        setCommitProgress((prev) => ({
          processed: prev.processed + res.processed,
          total: prev.processed + res.processed + res.remaining,
        }));
        completed = res.completed || res.processed === 0;
      }
      if (!completed) {
        throw new Error("A importação atingiu o limite de lotes antes de concluir. Nenhum novo lote será iniciado automaticamente.");
      }
      setResult(totals);
      setStep(7);
      toast.success("Importação concluída.");
      onComplete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha durante a importação.");
    } finally {
      setImporting(false);
    }
  };

  const progressPercent = useMemo(() => {
    if (!commitProgress.total) return 0;
    return Math.round((commitProgress.processed / commitProgress.total) * 100);
  }, [commitProgress]);

  return (
    <div className="space-y-6">
      <div className="no-scrollbar overflow-x-auto border-b border-border pb-3">
        <div className="flex min-w-[640px] items-center justify-between gap-2">
          {STEPS.map((label, idx) => {
            const num = idx + 1;
            const isActive = step === num;
            const isDone = step > num;
            return (
              <div
                key={label}
                className={`flex items-center gap-1.5 text-xs font-semibold ${
                  isActive
                    ? "font-bold text-primary"
                    : isDone
                      ? "text-emerald-600"
                      : "text-muted-foreground opacity-60"
                }`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-[11px] ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-emerald-500/20 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {num}
                </span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-primary/50">
            <Upload className="mx-auto size-10 text-muted-foreground/70" />
            <h4 className="mt-3 text-sm font-semibold">
              Selecione o ficheiro Excel (.xlsx) ou CSV
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Suporta tabelas escolares até 25 000 linhas por folha. .xls (Excel 97-2003) ainda não
              é suportado — grave como .xlsx.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xlsm,.csv"
              className="mx-auto mt-4 max-w-xs cursor-pointer text-xs"
              onChange={handleFileChange}
              disabled={analyzing}
            />
          </div>

          {analyzing ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> A analisar o ficheiro…
            </div>
          ) : null}

          {file && sheets.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold">Folhas encontradas</p>
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {sheets.map((sheet, idx) => (
                  <button
                    key={sheet.name}
                    type="button"
                    onClick={() => {
                      setSelectedSheetIdx(idx);
                      setSelectedModule(sheet.suggested_module);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-xs transition-colors ${
                      idx === selectedSheetIdx ? "bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <FileSpreadsheet className="size-4 text-emerald-600" />
                      {sheet.name}
                    </span>
                    <span className="text-muted-foreground">{sheet.row_count} linhas</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setStep(2)}>
                  Continuar <ArrowRight className="ml-1 size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 && selectedSheet ? (
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Tipo de Dados a Importar:
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleDownloadTemplate}
              >
                <Download className="size-3.5" /> Baixar Modelo Oficial
              </Button>
            </div>

            <Select
              value={selectedModule}
              onValueChange={(val) => setSelectedModule(val as ImportModule)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o módulo" />
              </SelectTrigger>
              <SelectContent>
                {importModuleOptions.map((mod) => (
                  <SelectItem
                    key={mod}
                    value={mod}
                    disabled={!IMPLEMENTED_MODULES.has(mod)}
                    className="text-xs capitalize"
                  >
                    {mod.replace(/_/g, " ")}
                    {!IMPLEMENTED_MODULES.has(mod) ? " (em breve)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary">
              <Sparkles className="size-4 shrink-0" />
              <span>
                Sugestão automática, com base nos cabeçalhos (
                {selectedSheet.headers.slice(0, 4).join(", ")}
                {selectedSheet.headers.length > 4 ? "…" : ""}):{" "}
                <strong>{selectedSheet.suggested_module}</strong> (
                {Math.round(selectedSheet.suggested_module_score * 100)}% de confiança). Confirme ou
                corrija.
              </span>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1 size-3.5" /> Voltar
            </Button>
            <Button
              size="sm"
              onClick={handleProceedToMapping}
              disabled={!IMPLEMENTED_MODULES.has(selectedModule)}
            >
              Avançar ao Mapeamento <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && selectedSheet ? (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Mapeamento de Colunas (Ficheiro → SIGA)</h4>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {selectedSheet.headers.map((header) => (
              <div
                key={header}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
              >
                <span className="font-medium text-foreground">{header}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <Select
                  value={columnMapping[header] || "ignore"}
                  onValueChange={(val) => setColumnMapping((prev) => ({ ...prev, [header]: val }))}
                >
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue placeholder="Ignorar coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore" className="text-xs text-muted-foreground">
                      Ignorar coluna
                    </SelectItem>
                    {OFFICIAL_TEMPLATES[selectedModule]?.columns.map((col) => (
                      <SelectItem key={col.key} value={col.key} className="text-xs">
                        {col.header} {col.required ? "*" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-1 size-3.5" /> Voltar
            </Button>
            <Button size="sm" onClick={handleProceedToStaging} disabled={staging}>
              {staging ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" /> A preparar {stageProgress.done}
                  /{stageProgress.total}…
                </>
              ) : (
                <>
                  Processar Validação <ArrowRight className="ml-1 size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {(step === 4 || step === 5) && job ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Total de Linhas</p>
              <p className="text-lg font-bold">{stagingTotal}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
              <p className="text-[11px] font-medium text-emerald-600">Válidos</p>
              <p className="text-lg font-bold text-emerald-600">{stageCounts.valid}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
              <p className="text-[11px] font-medium text-amber-600">Duplicados</p>
              <p className="text-lg font-bold text-amber-600">{stageCounts.duplicate}</p>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-center">
              <p className="text-[11px] font-medium text-rose-600">Erros</p>
              <p className="text-lg font-bold text-rose-600">{stageCounts.invalid}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              <Select value={filterStatus} onValueChange={handleFilterChange}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                  <SelectItem value="valid" className="text-xs">Válidos</SelectItem>
                  <SelectItem value="warning" className="text-xs">Com avisos</SelectItem>
                  <SelectItem value="duplicate" className="text-xs">Duplicados</SelectItem>
                  <SelectItem value="error" className="text-xs">Erros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={handleDownloadErrorReport}
              >
                <Download className="size-3.5" /> Relatório de Erros
              </Button>
              {step === 4 ? (
                <Button size="sm" variant="secondary" onClick={() => setStep(5)}>
                  Revisão Detalhada <ArrowRight className="ml-1 size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Dados normalizados</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Acção Inline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingRows ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto size-4 animate-spin" />
                    </td>
                  </tr>
                ) : stagingRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Sem linhas para este filtro.
                    </td>
                  </tr>
                ) : (
                  stagingRows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-[11px]">{row.row_number}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-md space-y-1">
                          {Object.entries(row.normalized_data).map(([k, v]) => (
                            <span key={k} className="mr-2 inline-block text-[11px]">
                              <span className="text-muted-foreground">{k}:</span>{" "}
                              <strong>{String(v ?? "—")}</strong>
                            </span>
                          ))}
                        </div>
                        {row.warnings.length ? (
                          <p className="mt-1 text-[11px] text-amber-600">{row.warnings.join(" · ")}</p>
                        ) : null}
                        {row.errors.length ? (
                          <p className="mt-1 text-[11px] text-rose-600">{row.errors.join(" · ")}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === "valid" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                            <CheckCircle className="size-3.5" /> Pronto
                          </span>
                        ) : row.status === "warning" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                            <AlertTriangle className="size-3.5" /> Aviso
                          </span>
                        ) : row.status === "duplicate" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                            <Copy className="size-3.5" /> Duplicado
                          </span>
                        ) : row.status === "error" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                            <XCircle className="size-3.5" /> Erro
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{row.status}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editingRowId === row.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <Select value={editingField} onValueChange={setEditingField}>
                              <SelectTrigger className="h-7 w-28 text-[11px]">
                                <SelectValue placeholder="Campo" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(row.normalized_data).map((k) => (
                                  <SelectItem key={k} value={k} className="text-[11px]">{k}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              className="h-7 w-28 text-xs"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                            />
                            <Button
                              size="icon"
                              className="size-7"
                              onClick={() => handleSaveInlineEdit(row.id)}
                            >
                              <Save className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => {
                              setEditingRowId(row.id);
                              const firstKey = Object.keys(row.normalized_data)[0] ?? "";
                              setEditingField(firstKey);
                              setEditingValue(String(row.normalized_data[firstKey] ?? ""));
                            }}
                          >
                            <Edit2 className="mr-1 size-3" /> Corrigir
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Página {stagingPage} de {Math.max(1, Math.ceil(stagingTotal / 20))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={stagingPage <= 1 || loadingRows}
                onClick={() => loadStagingPage(job.id, stagingPage - 1, filterStatus)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={stagingPage * 20 >= stagingTotal || loadingRows}
                onClick={() => loadStagingPage(job.id, stagingPage + 1, filterStatus)}
              >
                Seguinte
              </Button>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => setStep(3)}>
              <ArrowLeft className="mr-1 size-3.5" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleDryRun} disabled={dryRunning}>
                {dryRunning ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Simular (Dry-Run)
              </Button>
              <Button size="sm" onClick={() => setStep(6)}>
                Confirmar &amp; Importar <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>

          {dryRunResult ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <p className="font-semibold">
                Simulação (amostra de {dryRunResult.processed} linha
                {dryRunResult.processed === 1 ? "" : "s"}) — nada foi gravado:
              </p>
              <p className="mt-1 text-muted-foreground">
                {dryRunResult.inserted} nova(s) · {dryRunResult.updated} associada(s) a existentes ·{" "}
                {dryRunResult.ignored} ignorada(s) · {dryRunResult.failed} com erro
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 6 && job ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center">
          <Play className={`mx-auto size-10 text-primary ${importing ? "animate-pulse" : ""}`} />
          <h4 className="text-base font-semibold">
            Pronto para Importar {stagingTotal} registo(s)
          </h4>
          <p className="text-xs text-muted-foreground">
            A operação é processada em lotes de {COMMIT_BATCH} linhas, com auditoria de cada registo
            criado ou alterado.
          </p>

          {importing ? (
            <div className="mx-auto max-w-xs space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs font-semibold text-primary">
                {commitProgress.processed}/{commitProgress.total} ({progressPercent}%)
              </p>
            </div>
          ) : (
            <Button size="lg" className="mx-auto gap-2" onClick={handleRunCommit}>
              <Play className="size-4" /> Iniciar Importação Definitiva
            </Button>
          )}
        </div>
      ) : null}

      {step === 7 && result ? (
        <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <CheckCircle className="mx-auto size-12 text-emerald-600" />
          <h4 className="text-lg font-bold text-foreground">Importação Concluída</h4>
          <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-4 text-xs font-medium text-muted-foreground">
            <span className="font-bold text-emerald-600">{result.inserted} inseridos</span>
            <span className="font-bold text-blue-600">{result.updated} associados</span>
            {result.ignored ? (
              <span className="font-bold text-muted-foreground">{result.ignored} ignorados</span>
            ) : null}
            {result.failed ? (
              <span className="font-bold text-rose-600">{result.failed} com erro</span>
            ) : null}
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep(1);
                setFile(null);
                setSheets([]);
                setJob(null);
                setStagingRows([]);
                setDryRunResult(null);
                setResult(null);
              }}
            >
              Importar Outro Ficheiro
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
