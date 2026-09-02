import { AlertTriangle, ExternalLink } from "lucide-react";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { Button } from "@/components/ui/button";
import { getSigaNavDocUrl } from "@/lib/ecosystem-urls";

interface PautaOcrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Array<{ id: string; fullName: string; academicNumber: string }>;
  onApplyGrades: (
    grades: Array<{ academicNumber: string; mac?: number; npp?: number; npt?: number }>,
  ) => void;
  /** Abre o fluxo vivo (Centro de Avaliação) em vez de fingir OCR. */
  onOpenLiveGrading?: () => void;
}

/**
 * OCR ainda não lê fotografia real. Em vez de ficar morto, aponta para
 * a grelha digital viva e para o manual DOC.
 */
export function PautaOcrScannerModal({
  open,
  onOpenChange,
  onOpenLiveGrading,
}: PautaOcrScannerModalProps) {
  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="md">
      <div className="flex flex-col h-full">
        <ModalHeader
          icon={AlertTriangle}
          title="Notas em papel → grelha digital"
          subtitle="OCR automático ainda não está ligado."
          onClose={() => onOpenChange(false)}
        />
        <ModalContent>
          <div className="p-6 rounded-2xl border-2 border-dashed border-warning/40 bg-warning/10 text-center space-y-3">
            <AlertTriangle className="size-8 mx-auto text-warning-strong" />
            <h4 className="font-extrabold text-sm text-foreground">
              Use o Centro de Avaliação (fluxo vivo)
            </h4>
            <p className="text-xs text-muted-foreground">
              A leitura automática de pautas em papel ainda não está pronta. Enquanto isso, lance
              MAC/NPP/NPT na grelha digital — é o caminho operacional real.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {onOpenLiveGrading ? (
                <Button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenLiveGrading();
                  }}
                >
                  Abrir Centro de Avaliação
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(getSigaNavDocUrl(), "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-3.5" />
                Manual de navegação (DOC)
              </Button>
            </div>
          </div>
        </ModalContent>
        <ModalFooter onCancel={() => onOpenChange(false)} cancelLabel="Fechar" />
      </div>
    </ModalShell>
  );
}
