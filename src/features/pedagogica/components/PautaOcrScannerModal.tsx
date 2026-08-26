import { AlertTriangle } from "lucide-react";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";

interface PautaOcrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Array<{ id: string; fullName: string; academicNumber: string }>;
  onApplyGrades: (
    grades: Array<{ academicNumber: string; mac?: number; npp?: number; npt?: number }>,
  ) => void;
}

/**
 * O motor de OCR ainda não lê a fotografia real da pauta — ver
 * features/pedagogica/pauta-ocr-scanner.ts. Até haver uma leitura genuína,
 * o modal fica desactivado em vez de gerar notas inventadas.
 */
export function PautaOcrScannerModal({ open, onOpenChange }: PautaOcrScannerModalProps) {
  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="md">
      <div className="flex flex-col h-full">
        <ModalHeader
          icon={AlertTriangle}
          title="OCR de Pautas em Papel"
          subtitle="Funcionalidade indisponível."
          onClose={() => onOpenChange(false)}
        />
        <ModalContent>
          <div className="p-6 rounded-2xl border-2 border-dashed border-warning/40 bg-warning/10 text-center space-y-2">
            <AlertTriangle className="size-8 mx-auto text-warning-strong" />
            <h4 className="font-extrabold text-sm text-foreground">
              A leitura automática de pautas em papel ainda não está pronta
            </h4>
            <p className="text-xs text-muted-foreground">
              Esta funcionalidade foi desactivada porque não lê a fotografia real — evita preencher
              notas erradas na pauta digital. Lance as notas manualmente na grelha de avaliação até
              haver uma versão funcional.
            </p>
          </div>
        </ModalContent>
        <ModalFooter onCancel={() => onOpenChange(false)} cancelLabel="Fechar" />
      </div>
    </ModalShell>
  );
}
