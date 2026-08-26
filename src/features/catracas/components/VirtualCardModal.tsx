import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Printer, ShieldCheck, Award } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getOrCreateVirtualCard } from "@/features/catracas/server";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";

export function VirtualCardModal({
  open,
  onOpenChange,
  studentId,
  studentName,
  className,
  photoUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId?: string;
  studentName: string;
  className?: string;
  photoUrl?: string | null;
}) {
  const { school, selectedYearLabel } = useSchoolSettings();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const cardQuery = useQuery({
    queryKey: ["virtual-card", studentId],
    enabled: open,
    queryFn: () => getOrCreateVirtualCard({ data: { studentId } }),
  });

  const card = cardQuery.data;

  useEffect(() => {
    if (!card?.qr_secret) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(card.qr_secret, { margin: 1, width: 256 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [card?.qr_secret]);

  const handlePrintPhysicalCard = () => {
    if (!card) return;
    void issuePrintDocument({
      tipo: "Cartão de estudante",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear: selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
      },
      overlay: {
        documentName: "Cartão de Identificação Escolar",
        areaLabel: "Acessos & Catracas",
        referenceCode: card.card_number,
        statusLabel: "Ativo",
        parties: [{ label: "Estudante", value: studentName }],
        sections: [
          {
            title: "Dados do Cartão",
            text: `Número do Cartão: ${card.card_number}\nCódigo de Barras: ${card.barcode}\nTurma: ${className ?? "Regular"}\nValidade: 31/12/${new Date().getFullYear()}`,
          },
        ],
        termsText:
          "Cartão pessoal e intransmissível para controlo de acesso às instalações escolares.",
      },
    }).catch((err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível imprimir o cartão."),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-2 border-primary/30">
        <DialogHeader className="p-4 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              <DialogTitle className="text-base font-extrabold text-white">
                Cartão Virtual de Estudante
              </DialogTitle>
            </div>
            <Badge variant="outline" className="bg-white/20 text-white border-white/30 text-[10px]">
              {selectedYearLabel}
            </Badge>
          </div>
          <DialogDescription className="text-white/80 text-xs mt-0.5">
            Passe este QR Code na catraca de entrada ou leitor da portaria.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-5">
          {/* CARTÃO VISUAL ESTILO IDENTIFICAÇÃO FÍSICA / VIRTUAL */}
          <div className="rounded-2xl border-2 border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-4 shadow-soft relative overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Award className="size-5 text-primary" />
                <span className="font-extrabold text-xs tracking-tight text-foreground uppercase">
                  {school?.name ?? "Instituto de Educação"}
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground font-bold">
                {card?.card_number || "CARD-2026-000000"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <UserAvatar
                {...(photoUrl !== undefined ? { url: photoUrl } : {})}
                initials={studentName.slice(0, 2).toUpperCase()}
                className="size-16 border-2 border-primary shadow-sm"
              />
              <div className="space-y-0.5">
                <h3 className="font-extrabold text-base text-foreground leading-tight">
                  {studentName}
                </h3>
                <p className="text-xs text-primary font-bold">
                  {className || "10ª Classe · Turma A"}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Validade: 31/12/{new Date().getFullYear()}
                </p>
              </div>
            </div>

            {/* QR CODE REAL — codifica o segredo do cartão (qr_secret), validado pela catraca */}
            <div className="rounded-xl bg-background p-4 border border-border flex flex-col items-center justify-center space-y-2 text-center">
              <div className="size-36 bg-white rounded-xl p-2 flex items-center justify-center border border-border">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code do cartão de acesso" className="size-full" />
                ) : (
                  <div className="size-full animate-pulse rounded-lg bg-muted" />
                )}
              </div>

              <p className="text-[10px] text-muted-foreground font-mono">
                Código de barras: {card?.barcode || "—"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-muted/20 border-t border-border flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrintPhysicalCard}
            disabled={!card}
            className="gap-2 text-xs"
          >
            <Printer className="size-4" /> Imprimir Cartão Físico (PVC)
          </Button>

          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
