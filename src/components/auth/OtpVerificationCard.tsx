import * as React from "react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  RotateCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { requestOtpVerificationFn, verifyOtpCodeFn } from "@/features/otp/server";

export interface OtpVerificationCardProps {
  targetIdentifier: string;
  purpose:
    | "signup_verification"
    | "login_2fa"
    | "password_reset"
    | "phone_change"
    | "email_change"
    | "payflow_sensitive_op"
    | "grade_approval"
    | "admin_step_up";
  schoolName?: string;
  initialChannel?: "email" | "sms" | "whatsapp";
  onSuccess: () => void;
  onCancel?: () => void;
}

export function OtpVerificationCard({
  targetIdentifier,
  purpose,
  schoolName = "SIGA Plus",
  initialChannel = "whatsapp",
  onSuccess,
  onCancel,
}: OtpVerificationCardProps) {
  const [code, setCode] = React.useState("");
  const [activeChannel, setActiveChannel] = React.useState<"email" | "sms" | "whatsapp">(
    initialChannel,
  );
  const [cooldown, setCooldown] = React.useState(60);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

  // Contagem regressiva de cooldown para reenvio
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendCode = async (channel: "email" | "sms" | "whatsapp") => {
    if (cooldown > 0 && channel === activeChannel) return;
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await requestOtpVerificationFn({
        data: {
          targetIdentifier,
          purpose,
          preferredChannel: channel,
          hostname: typeof window !== "undefined" ? window.location.hostname : undefined,
        },
      });

      if (res.success) {
        setActiveChannel(channel);
        setCooldown(res.cooldownSeconds || 60);
        setInfoMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao solicitar código de verificação.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (codeToVerify = code) => {
    if (codeToVerify.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await verifyOtpCodeFn({
        data: {
          targetIdentifier,
          purpose,
          code: codeToVerify,
        },
      });

      if (res.success) {
        onSuccess();
      } else {
        setErrorMessage(res.message);
        setCode("");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao validar o código.");
      setCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOtpChange = (value: string) => {
    setCode(value);
    if (value.length === 6) {
      handleVerify(value);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-border/80 bg-card p-6 shadow-lg">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold tracking-tight text-foreground">Código de Verificação</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enviámos um código de 6 dígitos para{" "}
          <strong className="text-foreground">{targetIdentifier}</strong> através de{" "}
          <span className="font-semibold capitalize text-primary">{activeChannel}</span>.
        </p>
      </div>

      {infoMessage && (
        <Alert className="mb-4 border-primary/20 bg-primary/10 text-primary">
          <AlertDescription className="text-xs">{infoMessage}</AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="my-6 flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={handleOtpChange}
          disabled={isVerifying}
          autoFocus
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="h-12 w-11 text-lg font-bold" />
            <InputOTPSlot index={1} className="h-12 w-11 text-lg font-bold" />
            <InputOTPSlot index={2} className="h-12 w-11 text-lg font-bold" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className="h-12 w-11 text-lg font-bold" />
            <InputOTPSlot index={4} className="h-12 w-11 text-lg font-bold" />
            <InputOTPSlot index={5} className="h-12 w-11 text-lg font-bold" />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="mb-6 flex flex-col gap-2">
        <Button
          onClick={() => handleVerify()}
          disabled={code.length !== 6 || isVerifying}
          className="w-full"
        >
          {isVerifying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A verificar código...
            </>
          ) : (
            "Confirmar Código"
          )}
        </Button>

        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isVerifying}>
            Cancelar
          </Button>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Não recebeu o código?</span>
          {cooldown > 0 ? (
            <span className="font-mono text-primary">Aguarde {cooldown}s</span>
          ) : (
            <span className="text-foreground font-medium">Pronto para reenviar</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendCode("whatsapp")}
            disabled={isLoading || (cooldown > 0 && activeChannel === "whatsapp")}
            className="flex items-center justify-center gap-1.5 text-xs"
          >
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            WhatsApp
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendCode("sms")}
            disabled={isLoading || (cooldown > 0 && activeChannel === "sms")}
            className="flex items-center justify-center gap-1.5 text-xs"
          >
            <Smartphone className="h-3.5 w-3.5 text-primary" />
            SMS
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendCode("email")}
            disabled={isLoading || (cooldown > 0 && activeChannel === "email")}
            className="flex items-center justify-center gap-1.5 text-xs"
          >
            <Mail className="h-3.5 w-3.5 text-primary" />
            E-mail
          </Button>
        </div>
      </div>
    </div>
  );
}
