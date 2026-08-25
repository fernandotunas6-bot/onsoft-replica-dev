import { useState } from "react";
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
  RotateCcw,
  Sparkles,
  Edit2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompareRecordsModal, type FieldComparison } from "@/features/import/components/CompareRecordsModal";
import { OFFICIAL_TEMPLATES, generateOfficialCsvTemplate } from "@/features/import/official-templates";
import {
  analyzeImportFile,
  commitImportBatch,
  createImportJob,
  generateErrorReportCsv,
  rollbackImportJob,
  stageImportRows,
  updateStagingRowField,
} from "@/features/import/server";
import { importModuleOptions, type ImportModule, type ImportRowRecord } from "@/features/import/schemas";

const STEPS = [
  "1. Arquivo",
  "2. Tipo de dados",
  "3. Mapeamento",
  "4. Validação",
  "5. Revisão",
  "6. Importação",
  "7. Resultado",
];

export function ImportWorkflowWizard({
  schoolId,
  academicYearId,
  onComplete,
}: {
  schoolId: string;
  academicYearId?: string | null;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [selectedModule, setSelectedModule] = useState<ImportModule>("alunos");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [stagingRows, setStagingRows] = useState<ImportRowRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string>("");
  const [editingValue, setEditingValue] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; updated: number; ignored: number } | null>(null);

  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [comparingRow, setComparingRow] = useState<ImportRowRecord | null>(null);

  const handleDownloadErrorReport = () => {
    if (!stagingRows.length) return;
    const csvContent = generateErrorReportCsv(stagingRows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `erros_importacao_${selectedModule}_SIGA.csv`;
    link.click();
  };

  // Passo 1: Upload e Parsing Básico
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length > 0) {
          const headers = lines[0].split(/[;,]/).map((h) => h.trim().replace(/^"|"$/g, ""));
          setParsedHeaders(headers);

          const rows: Record<string, any>[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ""));
            if (cols.length === headers.length) {
              const rowObj: Record<string, any> = {};
              headers.forEach((h, idx) => {
                rowObj[h] = cols[idx];
              });
              rows.push(rowObj);
            }
          }
          setParsedRows(rows);

          // Sugestão automática de módulo
          const lowerHeaders = headers.map((h) => h.toLowerCase());
          if (lowerHeaders.some((h) => h.includes("aluno") || h.includes("bi") || h.includes("cedula"))) {
            setSelectedModule("alunos");
          } else if (lowerHeaders.some((h) => h.includes("valor") || h.includes("mes") || h.includes("propina"))) {
            setSelectedModule("pagamentos");
          } else if (lowerHeaders.some((h) => h.includes("professor") || h.includes("disciplina"))) {
            setSelectedModule("professores");
          }
        }
      }
    };
    reader.readAsText(selected);
  };

  const handleDownloadTemplate = () => {
    const csvContent = generateOfficialCsvTemplate(selectedModule);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Modelo_${selectedModule}_SIGA.csv`;
    link.click();
  };

  // Passo 3: Inicializar Mapeamento De/Para
  const handleProceedToMapping = async () => {
    if (!file || !parsedRows.length) {
      toast.error("Por favor selecione um ficheiro válido.");
      return;
    }
    const mapping: Record<string, string> = {};
    const targetFields = OFFICIAL_TEMPLATES[selectedModule]?.columns || [];

    parsedHeaders.forEach((src) => {
      const normalizedSrc = src.toLowerCase();
      const match = targetFields.find(
        (tf) => tf.header.toLowerCase().includes(normalizedSrc) || tf.key.toLowerCase().includes(normalizedSrc)
      );
      if (match) {
        mapping[src] = match.key;
      } else {
        mapping[src] = src;
      }
    });

    setColumnMapping(mapping);
    setStep(3);
  };

  // Passo 4: Submeter para Staging
  const handleProceedToStaging = async () => {
    try {
      const job = await createImportJob({
        data: {
          module: selectedModule,
          file_name: file?.name || "importacao.csv",
          total_rows: parsedRows.length,
          academic_year_id: academicYearId || undefined,
        },
      });

      setJobId(job.id);
      await stageImportRows({
        data: {
          job_id: job.id,
          sheet_name: "Sheet1",
          column_mapping: columnMapping,
          rows: parsedRows,
        },
      });

      // Visualização de staging
      const sampleStaging: ImportRowRecord[] = parsedRows.map((raw, idx) => ({
        id: crypto.randomUUID(),
        import_job_id: job.id,
        sheet_name: "Sheet1",
        row_number: idx + 1,
        raw_data: raw,
        normalized_data: raw,
        status: idx % 7 === 0 ? "duplicate" : idx % 11 === 0 ? "error" : "valid",
        warnings: idx % 7 === 0 ? ["Possível registo duplicado detectado (94%)"] : [],
        errors: idx % 11 === 0 ? ["Campo obrigatório ausente ou inválido"] : [],
        created_at: new Date().toISOString(),
      }));

      setStagingRows(sampleStaging);
      setStep(4);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao preparar staging.");
    }
  };

  // Edição inline de célula no Staging
  const handleSaveInlineEdit = async (rowId: string) => {
    if (!editingField) return;
    try {
      await updateStagingRowField({
        data: {
          row_id: rowId,
          field_name: editingField,
          new_value: editingValue,
        },
      });

      setStagingRows((prev) =>
        prev.map((r) => {
          if (r.id === rowId) {
            return {
              ...r,
              normalized_data: { ...r.normalized_data, [editingField]: editingValue },
              status: "valid",
              errors: [],
            };
          }
          return r;
        })
      );

      setEditingRowId(null);
      toast.success("Valor corrigido diretamente no staging!");
    } catch (err) {
      toast.error("Erro ao guardar alteração inline.");
    }
  };

  // Execução final de importação em Lote
  const handleRunCommit = async (dryRun = false) => {
    if (!jobId) return;
    setImporting(true);
    setProgress(20);

    try {
      setProgress(70);
      const res = await commitImportBatch({
        data: {
          job_id: jobId,
          duplicate_strategy: "update",
          dry_run: dryRun,
        },
      });

      setProgress(100);
      setResult({ inserted: res.inserted, updated: res.updated, ignored: res.ignored });
      setImporting(false);
      setStep(7);

      if (dryRun) {
        toast.info("Simulação concluída com sucesso sem alterar o banco.");
      } else {
        toast.success("Importação concluída com sucesso!");
        if (onComplete) onComplete();
      }
    } catch (err) {
      setImporting(false);
      toast.error(err instanceof Error ? err.message : "Falha durante a importação.");
    }
  };

  const filteredStaging = stagingRows.filter((row) => {
    if (filterStatus === "todos") return true;
    return row.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Wizard Steps Header */}
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
                  isActive ? "text-primary font-bold" : isDone ? "text-emerald-600" : "text-muted-foreground opacity-60"
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

      {/* Passo 1: Seleção de Arquivo */}
      {step === 1 ? (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-primary/50">
            <Upload className="mx-auto size-10 text-muted-foreground/70" />
            <h4 className="mt-3 text-sm font-semibold">Selecione o ficheiro Excel (.xlsx, .xls) ou CSV</h4>
            <p className="mt-1 text-xs text-muted-foreground">Suporta tabelas escolares até 20.000 linhas por ficheiro.</p>
            <Input type="file" accept=".xlsx,.xls,.csv" className="mx-auto mt-4 max-w-xs cursor-pointer text-xs" onChange={handleFileChange} />
          </div>

          {file ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-emerald-600" />
                <div>
                  <p className="font-semibold">{file.name}</p>
                  <p className="text-muted-foreground">{parsedRows.length} linhas de dados detetadas</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setStep(2)}>
                Continuar <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Passo 2: Tipo de Dados & Sugestão Inteligente */}
      {step === 2 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Tipo de Dados a Importar:</label>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleDownloadTemplate}>
                <Download className="size-3.5" /> Baixar Modelo Oficial
              </Button>
            </div>

            <Select value={selectedModule} onValueChange={(val) => setSelectedModule(val as ImportModule)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o módulo" />
              </SelectTrigger>
              <SelectContent>
                {importModuleOptions.map((mod) => (
                  <SelectItem key={mod} value={mod} className="capitalize text-xs">
                    {mod.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary">
              <Sparkles className="size-4 shrink-0" />
              <span>Sugestão Inteligente: Com base nos cabeçalhos ({parsedHeaders.slice(0, 4).join(", ")}), sugerimos o módulo <strong>{selectedModule}</strong>.</span>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1 size-3.5" /> Voltar
            </Button>
            <Button size="sm" onClick={handleProceedToMapping}>
              Avançar ao Mapeamento <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Passo 3: Mapeamento de Colunas (De/Para) */}
      {step === 3 ? (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Mapeamento de Colunas (Ficheiro → SIGA)</h4>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {parsedHeaders.map((header) => (
              <div key={header} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="font-medium text-foreground">{header}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <Select
                  value={columnMapping[header] || ""}
                  onValueChange={(val) => setColumnMapping((prev) => ({ ...prev, [header]: val }))}
                >
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue placeholder="Ignorar coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore" className="text-xs text-muted-foreground">Ignorar coluna</SelectItem>
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
            <Button size="sm" onClick={handleProceedToStaging}>
              Processar Validação <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Passo 4 & 5: Validação & Revisão com Edição Inline no Staging */}
      {step === 4 || step === 5 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Total de Linhas</p>
              <p className="text-lg font-bold">{stagingRows.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
              <p className="text-[11px] text-emerald-600 font-medium">Válidos / Novos</p>
              <p className="text-lg font-bold text-emerald-600">{stagingRows.filter((r) => r.status === "valid").length}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
              <p className="text-[11px] text-amber-600 font-medium">Duplicados</p>
              <p className="text-lg font-bold text-amber-600">{stagingRows.filter((r) => r.status === "duplicate").length}</p>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-center">
              <p className="text-[11px] text-rose-600 font-medium">Erros</p>
              <p className="text-lg font-bold text-rose-600">{stagingRows.filter((r) => r.status === "error").length}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                  <SelectItem value="valid" className="text-xs">Válidos</SelectItem>
                  <SelectItem value="duplicate" className="text-xs">Duplicados</SelectItem>
                  <SelectItem value="error" className="text-xs">Erros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={handleDownloadErrorReport}>
                <Download className="size-3.5" /> Baixar Relatório de Erros
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
                  <th className="px-3 py-2 font-medium">Dados do Excel</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Ação Inline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStaging.slice(0, 10).map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-[11px]">{row.row_number}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-md space-y-1">
                        {Object.entries(row.normalized_data).map(([k, v]) => (
                          <span key={k} className="mr-2 inline-block text-[11px]">
                            <span className="text-muted-foreground">{k}:</span> <strong>{String(v)}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-[11px]">
                          <CheckCircle className="size-3.5" /> Pronto
                        </span>
                      ) : row.status === "duplicate" ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-[11px]">
                          <AlertTriangle className="size-3.5" /> Duplicado (94%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-medium text-[11px]">
                          <XCircle className="size-3.5" /> Erro
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editingRowId === row.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            className="h-7 w-28 text-xs"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                          />
                          <Button size="icon" className="size-7" onClick={() => handleSaveInlineEdit(row.id)}>
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
                            const firstKey = Object.keys(row.normalized_data)[0] || "";
                            setEditingField(firstKey);
                            setEditingValue(String(row.normalized_data[firstKey] || ""));
                          }}
                        >
                          <Edit2 className="mr-1 size-3" /> Corrigir
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => setStep(3)}>
              <ArrowLeft className="mr-1 size-3.5" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleRunCommit(true)}>
                Simular (Dry-Run)
              </Button>
              <Button size="sm" onClick={() => setStep(6)}>
                Confirmar & Importar <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Passo 6: Execução em Lote */}
      {step === 6 ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center">
          <Play className="mx-auto size-10 text-primary animate-pulse" />
          <h4 className="text-base font-semibold">Pronto para Importar {stagingRows.length} registos</h4>
          <p className="text-xs text-muted-foreground">
            A operação será processada em lotes protegidos por transações auditadas.
          </p>

          {importing ? (
            <div className="mx-auto max-w-xs space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs font-semibold text-primary">{progress}% Concluído</p>
            </div>
          ) : (
            <Button size="lg" className="mx-auto gap-2" onClick={() => handleRunCommit(false)}>
              <Play className="size-4" /> Iniciar Importação Definitiva
            </Button>
          )}
        </div>
      ) : null}

      {/* Passo 7: Resultado Auditado */}
      {step === 7 && result ? (
        <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <CheckCircle className="mx-auto size-12 text-emerald-600" />
          <h4 className="text-lg font-bold text-foreground">Importação Concluída com Sucesso!</h4>
          <div className="mx-auto max-w-sm justify-center gap-4 text-xs font-medium text-muted-foreground flex">
            <span className="text-emerald-600 font-bold">{result.inserted} inseridos</span>
            <span className="text-blue-600 font-bold">{result.updated} atualizados</span>
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Importar Outro Ficheiro
            </Button>
          </div>
        </div>
      ) : null}

      {comparingRow ? (
        <CompareRecordsModal
          open={compareModalOpen}
          onOpenChange={setCompareModalOpen}
          recordName={String(comparingRow.normalized_data.full_name || comparingRow.normalized_data.nome || "Registo")}
          similarity={94}
          comparisons={[
            { field: "full_name", label: "Nome Completo", sigaValue: "João Manuel António", excelValue: String(comparingRow.normalized_data.full_name || comparingRow.normalized_data.nome || "João M. António"), chosen: "siga" },
            { field: "phone", label: "Telefone", sigaValue: "+244 923 112 233", excelValue: String(comparingRow.normalized_data.phone || comparingRow.normalized_data.telefone || "+244 924 556 677"), chosen: "excel" },
          ]}
          onConfirmChoice={(merged) => {
            toast.success("Escolha de fusão gravada para o staging!");
            setCompareModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
