#!/usr/bin/env python3
"""Cobertura de estilo Minimals em runtime.

Percorre o mapeamento de rotas do app e valida que cada rota renderiza
IconChip (data-icon-chip) e que todas as imagens ficam dentro de
MediaFrame/MediaAvatar (data-media-frame). Produz um resumo em Markdown
(GITHUB_STEP_SUMMARY no CI) e sai com 1 quando alguma rota falha.

Uso: python scripts/style-coverage.py
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
    ("Ficha do Aluno", "/alunos/1"),
    ("Área Pedagógica", "/pedagogica"),
    ("Documentos", "/documentos"),
    ("Financeiro", "/financeiro"),
    ("Faturas", "/faturas"),
    ("Relatórios Académicos", "/relatorios/academicos"),
    ("Relatórios Financeiros", "/relatorios/financeiros"),
    ("Gestão de Acessos", "/acessos"),
    ("Comunicações", "/comunicacoes"),
    ("Configurações", "/configuracoes"),
    ("Alterar Senha", "/alterar-senha"),
]

AUDIT = """() => {
  const chips = document.querySelectorAll('[data-icon-chip]').length;
  const frames = document.querySelectorAll('[data-media-frame]').length;
  const imgs = [...document.querySelectorAll('img')];
  return {
    chips,
    frames,
    imgs: imgs.length,
    unframed: imgs.filter((el) => !el.closest('[data-media-frame]')).length,
    noAlt: imgs.filter((el) => !el.hasAttribute('alt')).length,
  };
}"""


async def main() -> int:
    rows: list[tuple[str, str, dict, list[str]]] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(**get_browser_kwargs())
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1000})
        page = await ctx.new_page()
        for name, path in ROUTES:
            await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
            await page.wait_for_timeout(600)
            a = await page.evaluate(AUDIT)
            problems: list[str] = []
            if a["chips"] == 0:
                problems.append("sem IconChip")
            if a["unframed"]:
                problems.append(f"{a['unframed']} <img> fora de MediaFrame")
            if a["noAlt"]:
                problems.append(f"{a['noAlt']} <img> sem alt")
            rows.append((name, path, a, problems))
        await browser.close()

    ok = sum(1 for *_, problems in rows if not problems)
    lines = [
        "## Cobertura de estilo Minimals (IconChip / MediaFrame)",
        "",
        f"**{ok}/{len(rows)} rotas em conformidade**",
        "",
        "| Rota | Caminho | IconChip | MediaFrame | Imagens | Estado |",
        "| --- | --- | --: | --: | --: | --- |",
    ]
    for name, path, a, problems in rows:
        estado = "OK" if not problems else "FALHA — " + ", ".join(problems)
        lines.append(
            f"| {name} | `{path}` | {a['chips']} | {a['frames']} | {a['imgs']} | {estado} |"
        )
    summary = "\n".join(lines)
    print(summary)

    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        Path(target).open("a", encoding="utf-8").write(summary + "\n")

    return 0 if ok == len(rows) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
