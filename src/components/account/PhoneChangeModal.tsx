import { useState, useEffect } from "react";
import { usePhoneChange } from "@/features/auth/use-phone-change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface PhoneChangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string | null;
}

/**
 * PhoneChangeModal — Modal para mudança de número de telefone com OTP
 *
 * Fluxo:
 * 1. Utilizador insere novo número e escolhe canal (WhatsApp/SMS)
 * 2. Sistema envia código OTP
 * 3. Utilizador insere código de 6 dígitos
 * 4. Sucesso ou erro é apresentado
 */
export function PhoneChangeModal({ open, onOpenChange, currentPhone }: PhoneChangeModalProps) {
  const { state, requestCode, confirmCode, reset, isLoading } = usePhoneChange();
  const [newPhone, setNewPhone] = useState("");
  const [preferredChannel, setPreferredChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Gerenciar timer de cooldown
  useEffect(() => {
    if (!state.cooldownSeconds || cooldown <= 0) return;

    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state.cooldownSeconds, cooldown]);

  // Actualizar cooldown quando state mudar
  useEffect(() => {
    if (state.cooldownSeconds) {
      setCooldown(state.cooldownSeconds);
    }
  }, [state.cooldownSeconds]);

  const handleRequestCode = async () => {
    if (!newPhone.trim()) return;
    await requestCode(newPhone, preferredChannel);
  };

  const handleConfirmCode = async () => {
    if (!otpCode.trim() || !newPhone.trim()) return;
    await confirmCode(newPhone, otpCode);
  };

  const handleClose = () => {
    if (state.step === "success") {
      reset();
      setNewPhone("");
      setOtpCode("");
      setCooldown(0);
      onOpenChange(false);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Número de Telefone</DialogTitle>
          <DialogDescription>
            {currentPhone ? `Número actual: ${currentPhone}` : "Adicione um novo número de telefone à sua conta"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Etapa 1: Solicitar Código */}
          {state.step === "idle" || state.step === "requesting" || (state.step === "error" && !state.channelUsed) ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Novo Número de Telefone</label>
                <Input
                  placeholder="923 456 789"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  disabled={isLoading}
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Canal Preferido</label>
                <Select value={preferredChannel} onValueChange={(value: any) => setPreferredChannel(value)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">💚 WhatsApp</SelectItem>
                    <SelectItem value="sms">📱 SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {state.message && state.step === "error" && (
                <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded">
                  <AlertCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{state.message}</p>
                </div>
              )}
            </div>
          ) : null}

          {/* Etapa 2: Confirmar Código */}
          {state.step === "confirming" || (state.step === "error" && Boolean(state.channelUsed)) ? (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  ✓ Código enviado via <strong>{state.channelUsed?.toUpperCase() || "mensagem"}</strong>
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Código de Verificação (6 dígitos)</label>
                <Input
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  disabled={isLoading}
                  className="mt-1.5 font-mono text-center text-lg tracking-widest"
                />
              </div>

              {state.message && state.step === "error" && (
                <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded">
                  <AlertCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">{state.message}</p>
                    {state.attemptsLeft !== undefined && (
                      <p className="text-xs text-red-700 mt-1">Tentativas restantes: {state.attemptsLeft}</p>
                    )}
                  </div>
                </div>
              )}

              <button
                className="text-xs text-blue-600 hover:underline"
                disabled={cooldown > 0 || isLoading}
                onClick={handleRequestCode}
              >
                {cooldown > 0 ? `Enviar novamente em ${cooldown}s` : "Reenviar código"}
              </button>
            </div>
          ) : null}

          {/* Etapa 3: Sucesso */}
          {state.step === "success" ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <CheckCircle2 className="size-12 text-green-600" />
              <div className="text-center">
                <p className="font-medium text-foreground">{state.message}</p>
                <p className="text-sm text-muted-foreground mt-1">Número actualizado com sucesso</p>
              </div>
            </div>
          ) : null}

          {/* Carregando */}
          {isLoading && state.step === "requesting" && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">A enviar código...</span>
            </div>
          )}

          {isLoading && state.step === "confirming" && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">A confirmar código...</span>
            </div>
          )}
        </div>

        <DialogFooter>
          {state.step === "idle" || state.step === "requesting" || state.step === "error" ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button
                onClick={handleRequestCode}
                disabled={!newPhone.trim() || isLoading || (state.step === "error" && cooldown > 0)}
              >
                {isLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                Enviar Código
              </Button>
            </>
          ) : state.step === "confirming" ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmCode} disabled={otpCode.length !== 6 || isLoading}>
                {isLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                Confirmar
              </Button>
            </>
          ) : state.step === "success" ? (
            <Button onClick={handleClose} className="w-full">
              Fechar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
