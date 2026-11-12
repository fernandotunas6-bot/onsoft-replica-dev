#!/usr/bin/env python3
"""Testes de navegação apenas por teclado (Playwright).

Em cada rota principal valida:
  1. Skip link — primeiro Tab foca "Saltar para o conteúdo principal" e
     Enter move o foco para <main id="conteudo-principal">.
  2. Foco visível — o elemento focado tem outline/box-shadow visível.
  3. aria-current — o link de navegação da rota activa expõe
     aria-current="page" ou data-status="active" e apenas um por rota.

Uso: python scripts/keyboard-nav.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3006")

CHROME_APP = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def get_browser_kwargs():
    kwargs = {"headless": True}
    if CHROME_APP.exists():
        kwargs["executable_path"] = str(CHROME_APP)
    return kwargs

ROUTES = [
    ("Dashboard", "/"),
    ("Gestão de Estudantes", "/alunos"),
    ("Documentos", "/documentos"),
    ("Financeiro", "/financeiro"),
    ("Faturas", "/faturas"),
    ("Configurações", "/configuracoes"),
]

FOCUS_VISIBLE = """() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { ok: false, tag: 'body' };
  const s = getComputedStyle(el);
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth || '0') > 0;
  const ring = s.boxShadow && s.boxShadow !== 'none';
  return {
    ok: Boolean(outline || ring),
    tag: el.tagName.toLowerCase(),
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
  };
}"""

ACTIVE = """(path) => {
  const links = [...document.querySelectorAll('a[href]')];
  const marked = links.filter(
    (a) => a.getAttribute('aria-current') === 'page' || a.dataset.status === 'active',
  );
  return {
    count: marked.length,
    hrefs: marked.map((a) => a.getAttribute('href')),
    path,
  };
}"""


async def main() -> int:
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(**get_browser_kwargs())
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1000})
        page = await ctx.new_page()

        for name, path in ROUTES:
            await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
            await page.wait_for_timeout(1200)

            # 1. skip link é o primeiro alvo tabulável
            await page.keyboard.press("Tab")
            first = await page.evaluate(
                "() => (document.activeElement?.textContent || '').trim()"
            )
            if "Saltar para o conteúdo principal" not in first:
                failures.append(f"{name}: primeiro Tab não foca o skip link (foi '{first}')")
            else:
                focus = await page.evaluate(FOCUS_VISIBLE)
                if not focus["ok"]:
                    failures.append(f"{name}: skip link sem foco visível")
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(200)
                main_focus = await page.evaluate(
                    "() => document.activeElement?.id || ''"
                )
                if main_focus != "conteudo-principal":
                    failures.append(
                        f"{name}: Enter no skip link não moveu o foco para o conteúdo principal"
                    )

            # 2. foco visível ao longo da navegação por teclado
            invisible = 0
            for _ in range(15):
                await page.keyboard.press("Tab")
                focus = await page.evaluate(FOCUS_VISIBLE)
                if focus["tag"] == "body":
                    continue
                if not focus["ok"]:
                    invisible += 1
                    failures.append(
                        f"{name}: <{focus['tag']}> '{focus['label']}' focado sem indicador visível"
                    )
                if invisible >= 3:
                    break

            # 3. aria-current / estado activo
            active = await page.evaluate(ACTIVE, path)
            if active["count"] == 0:
                failures.append(f"{name}: nenhum link marcado como activo (aria-current)")
            elif active["count"] > 1:
                failures.append(
                    f"{name}: {active['count']} links marcados como activos ({active['hrefs']})"
                )
            else:
                print(f"OK {name}: activo = {active['hrefs'][0]}")

        await browser.close()

    if failures:
        print("\nFalhas de navegação por teclado:")
        for f in dict.fromkeys(failures):
            print(" - " + f)
        return 1

    print("\nOK — skip link, foco visível e aria-current validados em todas as rotas.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
