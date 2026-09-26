import { toast } from "sonner";
import { publicErrorMessage } from "@/lib/public-error";
import { isTwoFactorRequiredMessage, TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor-error";

/** Erro de uma acção; se a base pedir 2FA, o aviso leva à activação. */
export function toastActionError(error: unknown, fallback: string) {
  const message = publicErrorMessage(error, fallback);
  if (isTwoFactorRequiredMessage(message)) {
    toast.error("Esta acção exige verificação em duas etapas (2FA).", {
      description: "Active o 2FA no seu perfil e repita a acção.",
      duration: 12_000,
      action: {
        label: "Activar 2FA",
        onClick: () => window.location.assign(TWO_FACTOR_SETUP_PATH),
      },
    });
    return;
  }
  toast.error(message);
}
