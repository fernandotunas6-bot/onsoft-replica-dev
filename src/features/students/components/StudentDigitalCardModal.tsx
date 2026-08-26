/* style-check: exempt — cartão digital físico de estudante com elementos gráficos de passe escolar */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { QrCode, ShieldCheck, GraduationCap } from "lucide-react";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { MediaAvatar } from "@/components/ui/media-frame";
import { getOrCreateVirtualCard } from "@/features/catracas/server";

interface StudentDigitalCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    full_name: string;
    process_number?: string;
    class_name?: string;
    course_name?: string;
    academic_year?: string;
    photo_url?: string | null;
    status?: string;
  };
}

export function StudentDigitalCardModal({
  open,
  onOpenChange,
  student,
}: StudentDigitalCardModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const cardQuery = useQuery({
    queryKey: ["virtual-card", student.id],
    enabled: open,
    queryFn: () => getOrCreateVirtualCard({ data: { studentId: student.id } }),
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

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="md">
      <div className="flex flex-col h-full">
        <ModalHeader
          icon={GraduationCap}
          title="Cartão Digital de Estudante"
          subtitle="Validação de acessos, biblioteca e frequência."
          onClose={() => onOpenChange(false)}
        />
        <ModalContent>
          {/* PASSE ESCOLAR DIGITAL STYLE WALLET */}
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/95 via-primary to-primary-strong p-6 text-primary-foreground shadow-xl">
            {/* Fundo Decorativo de Padrão */}
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-primary-soft/20 blur-2xl pointer-events-none" />

            {/* Cabeçalho da Escola */}
            <div className="flex items-center justify-between border-b border-primary-foreground/20 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/80">
                  República de Angola · Ministério da Educação
                </p>
                <h3 className="text-base font-extrabold tracking-tight">
                  Cartão de Estudante Digital
                </h3>
              </div>
              <span className="inline-flex items-center rounded-full bg-primary-foreground/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                {student.status || "Ativo"}
              </span>
            </div>

            {/* CORPO DO CARTÃO */}
            <div className="mt-5 grid grid-cols-3 gap-4 items-center">
              {/* Foto Avatar */}
              <div className="col-span-1 text-center space-y-1">
                <MediaAvatar
                  src={student.photo_url || undefined}
                  alt={student.full_name}
                  className="size-20 rounded-2xl border-2 border-primary-foreground/80 shadow-md mx-auto object-cover"
                />
                <p className="text-[10px] font-mono text-primary-foreground/80">
                  Proc. #{student.process_number || student.id.slice(0, 6)}
                </p>
              </div>

              {/* Dados do Estudante */}
              <div className="col-span-2 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-primary-foreground/70">
                    Nome Completo
                  </span>
                  <p className="font-extrabold text-sm leading-tight text-primary-foreground">
                    {student.full_name}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-primary-foreground/70">
                      Turma
                    </span>
                    <p className="font-bold">{student.class_name || "Geral"}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-primary-foreground/70">
                      Curso
                    </span>
                    <p className="font-bold truncate">{student.course_name || "Geral"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* QR CODE REAL — codifica o segredo do cartão (qr_secret), validado pela catraca */}
            <div className="mt-6 rounded-2xl bg-card p-4 text-card-foreground shadow-inner space-y-3 border border-border">
              <div className="flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="font-extrabold text-foreground flex items-center gap-1.5">
                  <QrCode className="size-4 text-primary" />
                  Validação de Acesso no Portão
                </span>
              </div>

              <div className="flex items-center justify-center p-3 bg-secondary/30 rounded-xl border border-border">
                <div className="text-center space-y-2">
                  <div className="size-36 mx-auto bg-white p-2 rounded-lg flex items-center justify-center">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="QR code do cartão de acesso"
                        className="size-full"
                      />
                    ) : (
                      <div className="size-full animate-pulse rounded-md bg-muted" />
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-muted-foreground break-all">
                    {card?.barcode ?? "A gerar cartão…"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                {card?.status === "active" ? (
                  <span className="flex items-center gap-1 font-semibold text-success">
                    <ShieldCheck className="size-3.5" /> Cartão activo
                  </span>
                ) : (
                  <span className="text-muted-foreground">A validar cartão…</span>
                )}
                <span>Ano Lectivo {student.academic_year || new Date().getFullYear()}</span>
              </div>
            </div>
          </div>
        </ModalContent>
        <ModalFooter onCancel={() => onOpenChange(false)} cancelLabel="Fechar" />
      </div>
    </ModalShell>
  );
}
