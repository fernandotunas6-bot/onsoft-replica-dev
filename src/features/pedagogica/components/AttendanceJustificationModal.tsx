import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Send, CheckCircle2, XCircle, Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import {
  submitAttendanceJustification,
  reviewAttendanceJustification,
} from "@/features/pedagogica/attendance-server";

export function SubmitAttendanceJustificationModal({
  open,
  onOpenChange,
  studentId,
  sessionId,
  attendanceRecordId,
  date,
  subjectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  sessionId?: string;
  attendanceRecordId?: string;
  date?: string;
  subjectName?: string;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: submitAttendanceJustification,
    onSuccess: () => {
      toast.success("Justificativa enviada com sucesso!", {
        description: "Aguarde a validação da coordenação/secretaria.",
      });
      queryClient.invalidateQueries({ queryKey: ["student-attendance-history"] });
      onOpenChange(false);
      setReason("");
      setFileId(null);
      setFileName(null);
    },
    onError: (err) => {
      toast.error("Não foi possível enviar a justificativa", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const handleSubmit = () => {
    if (reason.trim().length < 8) {
      toast.error("Descrição muito curta", {
        description: "Descreva o motivo com pelo menos 8 caracteres.",
      });
      return;
    }
    submitMutation.mutate({
      data: {
        studentId,
        sessionId,
        attendanceRecordId,
        reason: reason.trim(),
        fileId: fileId ?? undefined,
        fileName: fileName ?? undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Justificar Falta
          </DialogTitle>
          <DialogDescription className="text-xs">
            {subjectName ? `${subjectName} · ` : ""}
            {date ? `Data: ${date}` : "Submeter justificação de ausência ao diário escolar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Motivo da ausência</Label>
            <Textarea
              placeholder="Descreva o motivo da falta (ex: consulta médica, motivo de saúde com atestado...)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px] text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Anexar Atestado ou Documento (Opcional)</Label>
            <div className="flex items-center gap-2">
              <PickFileButton
                acceptKinds={["pdf", "png", "jpeg"]}
                onPick={(file) => {
                  setFileId(file.id);
                  setFileName(file.name);
                  toast.success("Documento anexado da biblioteca");
                }}
              />
              {fileName ? (
                <span className="text-xs font-medium truncate flex items-center gap-1 text-primary">
                  <Paperclip className="size-3.5" /> {fileName}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitMutation.isPending || reason.trim().length < 8}
            className="gap-2 font-bold"
          >
            <Send className="size-4" /> Submeter Justificativa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewAttendanceJustificationModal({
  open,
  onOpenChange,
  justificationId,
  reason,
  fileName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  justificationId: string;
  reason: string;
  fileName?: string | null;
}) {
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState("");

  const reviewMutation = useMutation({
    mutationFn: reviewAttendanceJustification,
    onSuccess: (_, vars) => {
      toast.success(
        (vars as { data?: { status?: string } })?.data?.status === "approved"
          ? "Justificativa Aprovada!"
          : "Justificativa Rejeitada.",
      );
      queryClient.invalidateQueries({ queryKey: ["student-attendance-history"] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error("Não foi possível analisar a justificativa", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Analisar Justificativa de Falta
          </DialogTitle>
          <DialogDescription className="text-xs">
            Revisão formal da ausência submetida pelo aluno ou encarregado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div className="rounded-xl bg-muted/40 p-3 border border-border">
            <p className="font-semibold text-muted-foreground">Motivo apresentado:</p>
            <p className="mt-1 font-medium text-foreground">{reason}</p>
            {fileName ? (
              <p className="mt-2 text-primary font-semibold flex items-center gap-1">
                <Paperclip className="size-3.5" /> Anexo: {fileName}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observações da Coordenação (Opcional)</Label>
            <Textarea
              placeholder="Adicionar nota de aprovação ou motivo de rejeição..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="min-h-[80px] text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={() =>
              reviewMutation.mutate({
                data: {
                  justificationId,
                  status: "rejected",
                  reviewNotes,
                },
              })
            }
            disabled={reviewMutation.isPending}
            className="gap-1.5"
          >
            <XCircle className="size-4" /> Rejeitar
          </Button>

          <Button
            type="button"
            onClick={() =>
              reviewMutation.mutate({
                data: {
                  justificationId,
                  status: "approved",
                  reviewNotes,
                },
              })
            }
            disabled={reviewMutation.isPending}
            className="gap-1.5 bg-success text-success-foreground hover:bg-success/90 font-bold"
          >
            <CheckCircle2 className="size-4" /> Aprovar e Converter em Falta Justificada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
