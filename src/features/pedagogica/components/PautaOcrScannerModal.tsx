import { useState } from "react";
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileSpreadsheet,
  LoaderCircle,
} from "lucide-react";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { MediaFrame } from "@/components/ui/media-frame";
import { scanPaperPautaImage, type OcrScanResult } from "../pauta-ocr-scanner";
import { toast } from "sonner";

interface PautaOcrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Array<{ id: string; fullName: string; academicNumber: string }>;
  onApplyGrades: (
    grades: Array<{ academicNumber: string; mac?: number; npp?: number; npt?: number }>,
  ) => void;
}

export function PautaOcrScannerModal({
  open,
  onOpenChange,
  students,
  onApplyGrades,
}: PautaOcrScannerModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<OcrScanResult | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setIsScanning(true);
    try {
      const res = await scanPaperPautaImage(file, students);
      setScanResult(res);
      toast.success("OCR Concluído!", {
        description: `Extraídas notas de ${res.totalStudentsFound} alunos da fotografia da pauta.`,
      });
    } catch {
      toast.error("Erro na leitura da imagem", {
        description: "Certifique-se de que a fotografia da pauta física está bem iluminada.",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleUpdateItemGrade = (
    academicNumber: string,
    field: "mac" | "npp" | "npt",
    val: number | undefined,
  ) => {
    if (!scanResult) return;
    setScanResult({
      ...scanResult,
      items: scanResult.items.map((item) =>
        item.academicNumber === academicNumber ? { ...item, [field]: val } : item,
      ),
    });
  };

  const handleConfirmAndApply = () => {
    if (!scanResult) return;
    onApplyGrades(
      scanResult.items.map((item) => ({
        academicNumber: item.academicNumber,
        ...(item.mac !== undefined ? { mac: item.mac } : {}),
        ...(item.npp !== undefined ? { npp: item.npp } : {}),
        ...(item.npt !== undefined ? { npt: item.npt } : {}),
      })),
    );
    toast.success("Pauta Digital Atualizada!", {
      description: "Notas importadas com sucesso para a grelha de avaliação.",
    });
    onOpenChange(false);
  };

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="xl">
      <div className="flex flex-col h-full">
        <ModalHeader
          icon={Sparkles}
          title="OCR de Pautas em Papel (AI Co-Pilot)"
          subtitle="Tire foto da pauta em papel para preencher notas automaticamente."
          onClose={() => onOpenChange(false)}
        />
        <ModalContent>
          {/* ÁREA DE UPLOAD DA FOTO DA PAUTA */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 text-center space-y-3">
            <IconChip icon={Camera} tone="primary" size="lg" className="mx-auto" />
            <div>
              <h4 className="font-extrabold text-sm text-foreground">
                Fotografia ou Foto da Pauta Física
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suporta PNG, JPG ou captura direta pela câmera do telemóvel.
              </p>
            </div>

          <label className="inline-flex items-center gap-2 cursor-pointer bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-primary-strong transition-colors">
            <Upload className="size-4" />
            {selectedFile ? selectedFile.name : "Carregar Foto da Pauta"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* LOADING OCR SCANNER */}
        {isScanning ? (
          <div className="p-8 text-center space-y-3 surface-card rounded-2xl border border-border">
            <LoaderCircle className="size-8 text-primary animate-spin mx-auto" />
            <p className="text-xs font-bold text-foreground">
              A processar imagem e a extrair notas com Visão Computacional AI...
            </p>
          </div>
        ) : null}

        {/* REVISÃO E PRE-VISUALIZAÇÃO COMPACTA */}
        {scanResult && !isScanning ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* PRÉ-VISUALIZAÇÃO DA FOTOGRAFIA DA PAUTA */}
            {previewUrl ? (
              <div className="col-span-1 surface-card p-3 rounded-2xl border border-border space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Imagem Original
                </p>
                <div className="overflow-hidden rounded-xl border border-border bg-secondary max-h-72">
                  <MediaFrame
                    src={previewUrl}
                    alt="Foto da pauta"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            ) : null}

            {/* TABELA DE EDICÃO DE NOTAS EXTRAÍDAS */}
            <div
              className={`space-y-4 surface-card p-5 rounded-2xl border border-border ${
                previewUrl ? "col-span-1 md:col-span-2" : "col-span-1 md:col-span-3"
              }`}
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileSpreadsheet className="size-4 text-primary" />
                  Notas Extraídas ({scanResult.totalStudentsFound} Alunos)
                </h4>
                <span className="text-[11px] font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Edição Direta Disponível
                </span>
              </div>

              <div className="overflow-x-auto no-scrollbar max-h-64 border border-border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-secondary/40 text-muted-foreground font-bold uppercase sticky top-0 border-b border-border">
                    <tr>
                      <th className="p-2.5">Aluno</th>
                      <th className="p-2.5 text-center w-20">MAC</th>
                      <th className="p-2.5 text-center w-20">NPP</th>
                      <th className="p-2.5 text-center w-20">NPT</th>
                      <th className="p-2.5 text-center">Confiança</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {scanResult.items.map((item) => (
                      <tr
                        key={item.academicNumber}
                        className="hover:bg-secondary/20 transition-colors"
                      >
                        <td className="p-2.5 font-semibold text-foreground">{item.studentName}</td>
                        <td className="p-1 text-center">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={item.mac ?? ""}
                            onChange={(e) =>
                              handleUpdateItemGrade(
                                item.academicNumber,
                                "mac",
                                e.target.value ? Number(e.target.value) : undefined,
                              )
                            }
                            className="w-14 text-center font-mono font-bold rounded-lg border border-border bg-background p-1 text-xs focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={item.npp ?? ""}
                            onChange={(e) =>
                              handleUpdateItemGrade(
                                item.academicNumber,
                                "npp",
                                e.target.value ? Number(e.target.value) : undefined,
                              )
                            }
                            className="w-14 text-center font-mono font-bold rounded-lg border border-border bg-background p-1 text-xs focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={item.npt ?? ""}
                            onChange={(e) =>
                              handleUpdateItemGrade(
                                item.academicNumber,
                                "npt",
                                e.target.value ? Number(e.target.value) : undefined,
                              )
                            }
                            className="w-14 text-center font-mono font-bold rounded-lg border border-border bg-background p-1 text-xs focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === "warning"
                                ? "bg-warning/20 text-warning-strong"
                                : "bg-success/15 text-success-strong"
                            }`}
                          >
                            {item.status === "warning" ? (
                              <AlertTriangle className="size-3" />
                            ) : null}
                            {item.confidence}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
        </ModalContent>
        <ModalFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleConfirmAndApply}
          submitLabel="Importar para Pauta Digital"
          disabled={!scanResult}
        />
      </div>
    </ModalShell>
  );
}
