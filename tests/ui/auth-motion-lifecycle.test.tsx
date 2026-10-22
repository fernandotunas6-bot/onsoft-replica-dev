// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthBackgroundVideo } from "@/components/auth/AuthBackgroundVideo";
import { AuthHeroSlides } from "@/components/auth/AuthHeroSlides";

let wide: EventTarget & { matches: boolean };
let reduced: EventTarget & { matches: boolean };
let connection: EventTarget & { saveData: boolean };
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();
function mediaChange(target: EventTarget & { matches: boolean }, matches: boolean) {
  act(() => {
    target.matches = matches;
    target.dispatchEvent(new Event("change"));
  });
}
function visibility(hidden: boolean) {
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  wide = Object.assign(new EventTarget(), { matches: true });
  reduced = Object.assign(new EventTarget(), { matches: false });
  connection = Object.assign(new EventTarget(), { saveData: false });
  vi.stubGlobal("matchMedia", (query: string) => (query.includes("min-width") ? wide : reduced));
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
  vi.useRealTimers();
});
function selected() {
  return screen
    .getAllByRole("button")
    .findIndex((button) => button.getAttribute("aria-pressed") === "true");
}
it("mantém os seis segundos e a escolha manual; suspende a rotação em segundo plano", () => {
  render(<AuthHeroSlides />);
  act(() => vi.advanceTimersByTime(5999));
  expect(selected()).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(selected()).toBe(1);
  visibility(true);
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(60000));
  expect(selected()).toBe(1);
  visibility(false);
  fireEvent.click(screen.getAllByRole("button")[2]);
  expect(selected()).toBe(2);
  act(() => vi.advanceTimersByTime(6000));
  expect(selected()).toBe(3);
});
it("não agenda animação nem vídeo em mobile, movimento reduzido ou poupança de dados", () => {
  wide.matches = false;
  const { container } = render(
    <>
      <AuthHeroSlides />
      <AuthBackgroundVideo />
    </>,
  );
  expect(vi.getTimerCount()).toBe(0);
  mediaChange(wide, true);
  expect(vi.getTimerCount()).toBe(2);
  mediaChange(reduced, true);
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector("video")).toBeNull();
  mediaChange(reduced, false);
  act(() => {
    connection.saveData = true;
    connection.dispatchEvent(new Event("change"));
  });
  expect(vi.getTimerCount()).toBe(0);
  expect(container.querySelector("video")).toBeNull();
});
it("adia o vídeo 600 ms e pausa sem o recriar quando fica escondido", async () => {
  const { container } = render(<AuthBackgroundVideo />);
  act(() => vi.advanceTimersByTime(599));
  expect(container.querySelector("video")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1));
  const video = container.querySelector("video");
  expect(video).not.toBeNull();
  expect(play).toHaveBeenCalledTimes(1);
  visibility(true);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(container.querySelector("video")).toBe(video);
  visibility(false);
  expect(play).toHaveBeenCalledTimes(2);
  mediaChange(wide, false);
  expect(pause).toHaveBeenCalledTimes(2);
});
it("cancela o arranque e remove listeners e temporizadores ao desmontar", () => {
  const removeWide = vi.spyOn(wide, "removeEventListener");
  const removeReduced = vi.spyOn(reduced, "removeEventListener");
  const removeConnection = vi.spyOn(connection, "removeEventListener");
  const removeDocument = vi.spyOn(document, "removeEventListener");
  const { unmount } = render(
    <>
      <AuthHeroSlides />
      <AuthBackgroundVideo />
    </>,
  );
  visibility(true);
  act(() => vi.advanceTimersByTime(1000));
  expect(play).not.toHaveBeenCalled();
  visibility(false);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  for (const remove of [removeWide, removeReduced, removeConnection]) {
    expect(remove).toHaveBeenCalledTimes(2);
  }
  expect(removeDocument.mock.calls.filter(([event]) => event === "visibilitychange")).toHaveLength(
    2,
  );
});
it("mantém o poster se autoplay for recusado e não repete pedidos após falha do vídeo", async () => {
  play.mockRejectedValueOnce(new Error("Autoplay bloqueado"));
  const { container } = render(<AuthBackgroundVideo />);
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(container.querySelector(".auth-hero-poster")).not.toBeNull();
  fireEvent.error(container.querySelector("video")!);
  expect(container.querySelector("video")).toBeNull();
  visibility(true);
  visibility(false);
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector("video")).toBeNull();
});
