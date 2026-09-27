// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isStaleBuildError, recoverFromStaleBuild } from "@/lib/stale-build";

/**
 * O erro real que motivou isto, visto em produção a 27/09 depois de três deploys:
 * «Failed to fetch dynamically imported module:
 *  https://portal-siga.com/assets/ContextualActionsPanelHost-DGS6wxr3.js»
 */
const ERRO_REAL =
  "Failed to fetch dynamically imported module: https://portal-siga.com/assets/ContextualActionsPanelHost-DGS6wxr3.js";

describe("reconhecer uma build obsoleta", () => {
  it("apanha as variantes dos três motores", () => {
    for (const message of [
      ERRO_REAL,
      // Firefox
      "error loading dynamically imported module: https://portal-siga.com/assets/x-AbC.js",
      // Safari
      "Importing a module script failed.",
      "Unable to preload CSS for /assets/x-AbC.css",
    ]) {
      expect(isStaleBuildError(new Error(message))).toBe(true);
    }
  });

  it("não confunde com outros erros", () => {
    for (const message of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Cannot read properties of undefined (reading 'id')",
      "A sua sessão expirou.",
      "invalid login credentials",
    ]) {
      expect(isStaleBuildError(new Error(message))).toBe(false);
    }
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });
});

describe("recuperar sem entrar em ciclo", () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    sessionStorage.clear();
    vi.stubGlobal("location", { ...window.location, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("recarrega uma vez perante o erro real", () => {
    expect(recoverFromStaleBuild(new Error(ERRO_REAL))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("não recarrega segunda vez dentro do minuto — seria ciclo", () => {
    recoverFromStaleBuild(new Error(ERRO_REAL));
    expect(reload).toHaveBeenCalledTimes(1);

    expect(recoverFromStaleBuild(new Error(ERRO_REAL))).toBe(false);
    expect(recoverFromStaleBuild(new Error(ERRO_REAL))).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("passado o minuto, um deploy novo volta a poder recuperar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
    recoverFromStaleBuild(new Error(ERRO_REAL));
    expect(reload).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-09-27T10:01:01Z"));
    expect(recoverFromStaleBuild(new Error(ERRO_REAL))).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("ignora erros que não são de build obsoleta", () => {
    expect(recoverFromStaleBuild(new Error("Failed to fetch"))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
