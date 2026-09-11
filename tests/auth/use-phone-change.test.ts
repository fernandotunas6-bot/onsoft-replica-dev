// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePhoneChange } from "@/features/auth/use-phone-change";
import * as phoneChangeServer from "@/features/auth/phone-change-server";

describe("usePhoneChange hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  describe("requestCode", () => {
    it("actualiza estado para requesting quando iniciado", async () => {
      vi.spyOn(phoneChangeServer, "requestPhoneChangeOtpFn").mockImplementation(
        async () => ({
          success: true,
          message: "Código enviado via WhatsApp",
          channelUsed: "whatsapp",
          cooldownSeconds: 60,
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("923456789", "whatsapp");
      });

      expect(result.current.state.step).toBe("requesting");
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.state.step).toBe("confirming");
      });

      expect(result.current.state.message).toBe("Código enviado via WhatsApp");
      expect(result.current.state.channelUsed).toBe("whatsapp");
      expect(result.current.state.cooldownSeconds).toBe(60);
    });

    it("actualiza estado para error se falha", async () => {
      const errorMessage = "Número de telefone inválido";
      vi.spyOn(phoneChangeServer, "requestPhoneChangeOtpFn").mockImplementation(
        async () => ({
          success: false,
          message: errorMessage,
          cooldownSeconds: 0,
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("invalid", "whatsapp");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("error");
      });

      expect(result.current.state.message).toBe(errorMessage);
    });

    it("trata erros de rede adequadamente", async () => {
      vi.spyOn(phoneChangeServer, "requestPhoneChangeOtpFn").mockRejectedValue(
        new Error("Erro de conectividade"),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("923456789", "sms");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("error");
      });

      expect(result.current.state.message).toContain("Erro de conectividade");
    });
  });

  describe("confirmCode", () => {
    beforeEach(() => {
      vi.spyOn(phoneChangeServer, "requestPhoneChangeOtpFn").mockImplementation(
        async () => ({
          success: true,
          message: "Código enviado",
          channelUsed: "whatsapp",
          cooldownSeconds: 60,
        }),
      );
    });

    it("actualiza estado para success após confirmação bem-sucedida", async () => {
      vi.spyOn(phoneChangeServer, "confirmPhoneChangeWithOtpFn").mockImplementation(
        async () => ({
          success: true,
          message: "Número de telemóvel atualizado e confirmado com sucesso!",
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      // Primeiro, solicitar código
      act(() => {
        result.current.requestCode("923456789", "whatsapp");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("confirming");
      });

      // Depois, confirmar código
      act(() => {
        result.current.confirmCode("923456789", "123456");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("success");
      });

      expect(result.current.state.message).toContain("atualizado e confirmado com sucesso");
    });

    it("trata erro de código expirado", async () => {
      vi.spyOn(phoneChangeServer, "confirmPhoneChangeWithOtpFn").mockImplementation(
        async () => ({
          success: false,
          message: "O código de verificação expirou. Solicite um novo código.",
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("923456789", "whatsapp");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("confirming");
      });

      act(() => {
        result.current.confirmCode("923456789", "123456");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("error");
      });

      expect(result.current.state.message).toContain("expirou");
    });

    it("trata erro de tentativas excedidas", async () => {
      vi.spyOn(phoneChangeServer, "confirmPhoneChangeWithOtpFn").mockImplementation(
        async () => ({
          success: false,
          message: "Limite de tentativas excedido. O código foi cancelado por segurança.",
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("923456789", "whatsapp");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("confirming");
      });

      act(() => {
        result.current.confirmCode("923456789", "000000");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("error");
      });

      expect(result.current.state.message).toContain("Limite de tentativas");
    });

    it("mostra tentativas restantes em caso de código incorreto", async () => {
      vi.spyOn(phoneChangeServer, "confirmPhoneChangeWithOtpFn").mockImplementation(
        async () => ({
          success: false,
          message: "Código incorreto. Tentativas restantes: 2.",
          attemptsLeft: 2,
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("923456789", "whatsapp");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("confirming");
      });

      act(() => {
        result.current.confirmCode("923456789", "000000");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("error");
      });

      expect(result.current.state.attemptsLeft).toBe(2);
      expect(result.current.state.message).toContain("Tentativas restantes: 2");
    });
  });

  describe("reset", () => {
    it("redefine o estado para idle", async () => {
      vi.spyOn(phoneChangeServer, "requestPhoneChangeOtpFn").mockImplementation(
        async () => ({
          success: true,
          message: "Código enviado",
          channelUsed: "whatsapp",
          cooldownSeconds: 60,
        }),
      );

      const { result } = renderHook(() => usePhoneChange(), { wrapper });

      act(() => {
        result.current.requestCode("923456789", "whatsapp");
      });

      await waitFor(() => {
        expect(result.current.state.step).toBe("confirming");
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.state.step).toBe("idle");
      expect(result.current.state.message).toBeUndefined();
      expect(result.current.state.cooldownSeconds).toBeUndefined();
    });
  });
});
