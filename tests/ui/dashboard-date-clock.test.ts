// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startDashboardDateClock } from "@/features/dashboard/date-clock";

let stop = () => {};
function visibility(value: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 10, 15, 30));
  visibility("visible");
});
afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("alinha a próxima actualização com a hora certa, sem ticks por segundo", () => {
  const update = vi.fn();
  stop = startDashboardDateClock(update);
  expect(update).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(44 * 60_000 + 29_999);
  expect(update).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(update).toHaveBeenCalledTimes(2);
  expect((update.mock.calls.at(-1)![0] as Date).getHours()).toBe(11);
  vi.advanceTimersByTime(60 * 60_000);
  expect(update).toHaveBeenCalledTimes(3);
});
it("suspende escondido e retoma com a data actual e apenas um timer", () => {
  const update = vi.fn();
  stop = startDashboardDateClock(update);
  visibility("hidden");
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(3 * 60 * 60_000);
  expect(update).toHaveBeenCalledTimes(1);
  visibility("visible");
  expect((update.mock.calls.at(-1)![0] as Date).getHours()).toBe(13);
  visibility("visible");
  expect(vi.getTimerCount()).toBe(1);
});
it("não inicia trabalho se o documento já estiver escondido", () => {
  visibility("hidden");
  const update = vi.fn();
  stop = startDashboardDateClock(update);
  expect(update).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  visibility("visible");
  expect(update).toHaveBeenCalledTimes(1);
});
it("desmontar cancela o timer e remove o observador de visibilidade", () => {
  const remove = vi.spyOn(document, "removeEventListener");
  const update = vi.fn();
  stop = startDashboardDateClock(update);
  stop();
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  visibility("visible");
  vi.advanceTimersByTime(60 * 60_000);
  expect(update).toHaveBeenCalledTimes(1);
});
it("no servidor devolve apenas a limpeza, sem actualizar estado", () => {
  vi.stubGlobal("window", undefined);
  const update = vi.fn();
  stop = startDashboardDateClock(update);
  expect(stop).toBeTypeOf("function");
  expect(update).not.toHaveBeenCalled();
});
