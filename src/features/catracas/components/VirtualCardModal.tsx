import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "@/lib/toast";
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
import { MediaFrame } from "@/components/ui/media-frame";
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
  const validityLabel = formatCardValidity(card?.expires_at);

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
            text: [
              `Número do Cartão: ${card.card_number}`,
              `Código de Barras: ${card.barcode}`,
              className ? `Turma: ${className}` : null,
              validityLabel ? `Validade: ${validityLabel}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
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
              <DialogTitle className="text-base font-extrabold text-primary-foreground">
                Cartão Virtual de Estudante
              </DialogTitle>
            </div>
            <Badge
              variant="outline"
              className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30 text-[10px]"
            >
              {selectedYearLabel}
            </Badge>
          </div>
          <DialogDescription className="text-primary-foreground/80 text-xs mt-0.5">
            Passe este QR Code na catraca de entrada ou leitor da portaria.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-5">
          {/* CARTÃO VISUAL ESTILO IDENTIFICAÇÃO FÍSICA / VIRTUAL */}
          <div className="rounded-2xl border-2 border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-4 shadow-soft relative overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Award className="size-5 text-primary" />
                <span className="font-extrabold text-xs tracking-tight text-foreground">
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
                <h3 className="text-base text-foreground leading-tight">{studentName}</h3>
                {className ? <p className="text-xs text-primary">{className}</p> : null}
                {validityLabel ? (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Validade: {validityLabel}
                  </p>
                ) : null}
              </div>
            </div>

            {/* QR CODE REAL — codifica o segredo do cartão (qr_secret), validado pela catraca */}
            <div className="rounded-xl bg-background p-4 border border-border flex flex-col items-center justify-center space-y-2 text-center">
              <div className="size-36 bg-background rounded-xl p-2 flex items-center justify-center border border-border">
                {qrDataUrl ? (
                  <MediaFrame
                    src={qrDataUrl}
                    alt="QR code do cartão de acesso"
                    ratio="1/1"
                    rounded="rounded-lg"
                    className="size-full"
                    priority
                  />
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

/** Validade registada no cartão; sem data, não se imprime nenhuma. */
function formatCardValidity(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", { timeZone: "Africa/Luanda" }).format(date);
}
