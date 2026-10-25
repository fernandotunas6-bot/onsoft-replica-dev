// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SigaOpening } from "@/components/brand/SigaOpening";

const play = vi.fn(() => Promise.resolve());
let reduceMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  reduceMotion = false;
  play.mockClear();
  vi.stubGlobal(
    "Audio",
    vi.fn(function (this: { play: typeof play; pause: () => void; volume: number }) {
      this.play = play;
      this.pause = () => undefined;
      this.volume = 1;
    }),
  );
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") && reduceMotion,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("abertura SIGA Plus", () => {
  it("aparece na primeira abertura, toca o som da marca e sai sozinha", () => {
    render(<SigaOpening />);
    expect(screen.getByRole("img", { name: "SIGA Plus" })).toBeTruthy();
    expect(play).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole("img", { name: "SIGA Plus" })).toBeNull();
  });

  it("só uma vez por sessão", () => {
    const first = render(<SigaOpening />);
    first.unmount();
    render(<SigaOpening />);
    expect(screen.queryByRole("img", { name: "SIGA Plus" })).toBeNull();
  });

  it("«Saltar» e uma tecla fecham já", () => {
    render(<SigaOpening />);
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(screen.queryByRole("img", { name: "SIGA Plus" })).toBeNull();
    window.sessionStorage.clear();
    cleanup();
    render(<SigaOpening />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("img", { name: "SIGA Plus" })).toBeNull();
  });

  it("com «reduzir movimento» não aparece nem toca", () => {
    reduceMotion = true;
    render(<SigaOpening />);
    expect(screen.queryByRole("img", { name: "SIGA Plus" })).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it("som bloqueado pelo navegador não impede a imagem", () => {
    play.mockImplementationOnce(() => Promise.reject(new Error("NotAllowedError")));
    render(<SigaOpening />);
    expect(screen.getByRole("img", { name: "SIGA Plus" })).toBeTruthy();
  });
});
