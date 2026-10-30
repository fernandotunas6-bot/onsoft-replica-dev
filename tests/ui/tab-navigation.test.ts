// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { revealVerticalTab } from "@/lib/tab-navigation";

afterEach(() => {
  document.body.innerHTML = "";
});

function fixture(top: number, bottom: number) {
  document.body.innerHTML =
    '<div role="tablist" aria-orientation="vertical"><button role="tab">Destino</button></div>';
  const list = document.querySelector<HTMLElement>('[role="tablist"]')!;
  const tab = document.querySelector<HTMLElement>('[role="tab"]')!;
  Object.defineProperty(list, "clientHeight", { value: 100 });
  list.getBoundingClientRect = () => ({ top: 100, bottom: 200 }) as DOMRect;
  tab.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
  return { list, tab };
}

describe("scroll interno do menu vertical", () => {
  it("revela um destino abaixo da área visível", () => {
    const { list, tab } = fixture(220, 260);
    revealVerticalTab(tab);
    expect(list.scrollTop).toBe(60);
  });
  it("revela um destino acima sem recentrar o menu", () => {
    const { list, tab } = fixture(80, 120);
    list.scrollTop = 50;
    revealVerticalTab(tab);
    expect(list.scrollTop).toBe(30);
  });
  it("mantém a posição quando o destino já está visível", () => {
    const { list, tab } = fixture(120, 160);
    list.scrollTop = 50;
    revealVerticalTab(tab);
    expect(list.scrollTop).toBe(50);
  });
  it("não altera separadores horizontais", () => {
    const { list, tab } = fixture(220, 260);
    list.setAttribute("aria-orientation", "horizontal");
    revealVerticalTab(tab);
    expect(list.scrollTop).toBe(0);
  });
});
