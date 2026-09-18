import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  ShieldAlert,
  Sparkles,
  CheckSquare,
  Square,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportSchoolDataFn } from "../server";
import type { ImportModule } from "../schemas";

interface SchoolDataExportPanelProps {
  academicYearId?: string | null;
  academicYearLabel?: string;
}

const AVAILABLE_EXPORT_MODULES: Array<{
  id: ImportModule;
  label: string;
  desc: string;
  badge: string;
}> = [
  {
    id: "alunos",
    label: "Alunos & Encarregados",
    desc: "Processos, documentos nacionais (BI), contactos e turmas atribuídas",
    badge: "Essencial",
  },
  {
    id: "professores",
    label: "Professores & Corpo Docente",
    desc: "Números de agente, especialidades, emails e telefones",
    badge: "Docência",
  },
  {
    id: "turmas",
    label: "Turmas, Classes & Salas",
    desc: "Lotação, turnos (Manhã/Tarde), salas físicas e graus",
    badge: "Estrutura",
  },
  {
    id: "matriculas",
    label: "Matrículas & Confirmações",
    desc: "Vínculos anuais activos de estudantes às turmas",
    badge: "Académico",
  },
  {
    id: "pessoas",
    label: "Pessoas & Comunidade Escolar",
    desc: "Cadastros gerais com BI, gênero, data de nascimento e contactos",
    badge: "Identidade",
  },
  {
    id: "disciplinas",
    label: "Disciplinas & Plano Curricular",
    desc: "Catálogo oficial de disciplinas, siglas e carga horária semanal",
    badge: "Curricular",
  },
  {
    id: "pagamentos",
    label: "Faturas, Propinas & Pagamentos",
    desc: "Mensalidades emitidas, pagas, canais de cobrança e datas de vencimento",
    badge: "Financeiro",
  },
];

export function SchoolDataExportPanel({
  academicYearId,
  academicYearLabel,
}: SchoolDataExportPanelProps) {
  const [selectedModules, setSelectedModules] = useState<ImportModule[]>([
    "alunos",
    "professores",
    "turmas",
    "matriculas",
  ]);
  const [mode, setMode] = useState<"human" | "siga_exchange">("siga_exchange");
  const [isExporting, setIsExporting] = useState(false);

  const toggleModule = (id: ImportModule) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedModules(AVAILABLE_EXPORT_MODULES.map((m) => m.id));
  };

  const handleExport = async () => {
    if (selectedModules.length === 0) {
      toast.error("Selecione pelo menos um módulo para exportar.");
      return;
    }

    setIsExporting(true);
    try {
      const result = await exportSchoolDataFn({
        data: {
          academic_year_id: academicYearId || null,
          modules: selectedModules,
          mode,
        },
      });

      // Converter base64 para Blob e disparar download no browser
      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.mimeType });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Exportação concluída com sucesso!", {
        description: `${result.recordCount} registos exportados em ${result.fileName}`,
      });
    } catch (err) {
      toast.error("Falha ao exportar dados", {
        description: (err as Error)?.message || "Ocorreu um erro ao processar os dados escolares.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-emerald-600" /> Exportação de Dados Escolares
          </h3>
          <p className="text-xs text-muted-foreground">
            Exporte os dados da instituição em folhas de cálculo Excel (.xlsx) profissionais e
            reimportáveis.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={selectAll}
          className="text-xs gap-1.5 self-start sm:self-auto"
        >
          <CheckSquare className="size-3.5" /> Seleccionar Todos
        </Button>
      </div>

      {/* Selector de Modo */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("siga_exchange")}
          className={`text-left p-4 rounded-xl border transition-all ${
            mode === "siga_exchange"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> SIGA Exchange (Reimportável)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Recomendado
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Gera livro Excel com aba{" "}
            <code className="text-primary font-mono text-[10px]">00_MANIFESTO</code>, checksum
            SHA-256 e identificadores estáveis que permitem alterar valores e reimportar no SIGA com
            idempotência total.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("human")}
          className={`text-left p-4 rounded-xl border transition-all ${
            mode === "human"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:border-border/80"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="size-3.5 text-muted-foreground" /> Relatório Humano
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground">
              Direção / Secretaria
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Layout limpo, estilização executiva e formatação pronta para leitura humana, análise em
            conselhos pedagógicos e arquivo físico.
          </p>
        </button>
      </div>

      {/* Módulos Disponíveis */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-foreground">
          Escolha os domínios a incluir no ficheiro:
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          {AVAILABLE_EXPORT_MODULES.map((item) => {
            const isChecked = selectedModules.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => toggleModule(item.id)}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all ${
                  isChecked
                    ? "border-emerald-600/40 bg-emerald-500/5"
                    : "border-border bg-card hover:bg-muted/30 opacity-70"
                }`}
              >
                <div className="mt-0.5 text-emerald-600">
                  {isChecked ? (
                    <CheckSquare className="size-4" />
                  ) : (
                    <Square className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Segurança & Botão de Acção */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
        <ShieldAlert className="size-4 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-foreground">Garantia de Segurança e RLS</p>
          <p className="text-[11px] mt-0.5">
            Senhas, chaves de API e credenciais de utilizador são estritamente excluídas da
            exportação. Apenas operadores com cargo de Administração ou Secretaria têm autorização
            para descarregar estes dados.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          size="default"
          onClick={handleExport}
          disabled={isExporting || selectedModules.length === 0}
          className="gap-2 text-xs font-semibold shadow-sm"
        >
          {isExporting ? (
            <>
              <RefreshCw className="size-3.5 animate-spin" /> A Gerar Livro Excel...
            </>
          ) : (
            <>
              <Download className="size-3.5" /> Descarregar Dados em Excel (.xlsx)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
