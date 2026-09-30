import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  requestPhoneChangeOtpFn,
  confirmPhoneChangeWithOtpFn,
  type RequestPhoneChangeInput,
  type ConfirmPhoneChangeInput,
} from "./phone-change-server";
import { errorMessage } from "@/lib/error-message";

export interface PhoneChangeState {
  step: "idle" | "requesting" | "confirming" | "success" | "error";
  newPhone?: string;
  preferredChannel?: "whatsapp" | "sms";
  message?: string;
  cooldownSeconds?: number;
  attemptsLeft?: number;
  channelUsed?: string;
}

/**
 * Hook para gerenciar fluxo de mudança de número de telefone com OTP.
 *
 * Exemplo de uso:
 * const { state, requestCode, confirmCode, reset } = usePhoneChange();
 *
 * // Passo 1: Solicitar código
 * await requestCode("+244923456789", "whatsapp");
 *
 * // Passo 2: Confirmar código
 * await confirmCode("+244923456789", "123456");
 */
export function usePhoneChange() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PhoneChangeState>({ step: "idle" });

  // Mutation para solicitar OTP
  const requestOtpMutation = useMutation({
    mutationFn: (input: RequestPhoneChangeInput) => requestPhoneChangeOtpFn({ data: input }),
    onSuccess: (response) => {
      if (response.success) {
        setState((prev) => ({
          ...prev,
          step: "confirming",
          newPhone: prev.newPhone,
          preferredChannel: prev.preferredChannel,
          message: response.message,
          cooldownSeconds: response.cooldownSeconds,
          channelUsed: response.channelUsed,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          step: "error",
          message: response.message,
          cooldownSeconds: response.cooldownSeconds,
        }));
      }
    },
    onError: (error: unknown) => {
      setState((prev) => ({
        ...prev,
        step: "error",
        message: errorMessage(error, "Erro ao solicitar código de verificação"),
      }));
    },
  });

  // Mutation para confirmar OTP
  const confirmOtpMutation = useMutation({
    mutationFn: (input: ConfirmPhoneChangeInput) => confirmPhoneChangeWithOtpFn({ data: input }),
    onSuccess: (response) => {
      if (response.success) {
        setState((prev) => ({
          ...prev,
          step: "success",
          message: response.message,
        }));

        // Invalidar queries relacionadas à verificação de contacto
        void queryClient.invalidateQueries({ queryKey: ["contact-verification-profile"] });
        void queryClient.invalidateQueries({ queryKey: ["communication-preferences"] });
      } else {
        setState((prev) => ({
          ...prev,
          step: "error",
          message: response.message,
          attemptsLeft: response.attemptsLeft,
        }));
      }
    },
    onError: (error: unknown) => {
      setState((prev) => ({
        ...prev,
        step: "error",
        message: errorMessage(error, "Erro ao confirmar código de verificação"),
      }));
    },
  });

  // Solicitar código OTP
  const requestCode = useCallback(
    async (
      newPhone: string,
      preferredChannel: "whatsapp" | "sms" = "whatsapp",
      currentPassword = "",
    ) => {
      setState({ step: "requesting", newPhone, preferredChannel });
      return requestOtpMutation.mutate({ newPhone, preferredChannel, currentPassword });
    },
    [requestOtpMutation],
  );

  // Confirmar com código OTP
  const confirmCode = useCallback(
    async (newPhone: string, code: string) => {
      setState((prev) => ({
        ...prev,
        step: "confirming",
      }));
      return confirmOtpMutation.mutate({ newPhone, code });
    },
    [confirmOtpMutation],
  );

  // Resetar para estado inicial
  const reset = useCallback(() => {
    setState({ step: "idle" });
    requestOtpMutation.reset();
    confirmOtpMutation.reset();
  }, [requestOtpMutation, confirmOtpMutation]);

  return {
    state,
    requestCode,
    confirmCode,
    reset,
    isLoading: requestOtpMutation.isPending || confirmOtpMutation.isPending,
  };
}
