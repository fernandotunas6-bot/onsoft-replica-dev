#!/usr/bin/env python3
"""
Testes de regressão visual (IconChip / MediaFrame / estilo Minimals).

Para cada rota:
  - tira screenshot determinístico (animações desligadas, viewport fixa);
  - compara com a baseline em tests/visual/baseline/<rota>.png;
  - grava diferenças em tests/visual/diff/ e falha com exit 1 acima do limiar;
  - valida também, em runtime, que a rota tem chips de ícone (IconChip) e que
    todas as imagens/avatares usam MediaFrame/MediaAvatar.

Uso:
  python3 scripts/visual-regression.py                # comparar
  python3 scripts/visual-regression.py --update       # (re)criar baselines
  BASE_URL=http://localhost:8080 python3 scripts/visual-regression.py
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / "tests" / "visual" / "baseline"
CURRENT = ROOT / "tests" / "visual" / "current"
DIFF = ROOT / "tests" / "visual" / "diff"

ROUTES = [
    ("dashboard", "/"),
    ("alunos", "/alunos"),
    ("aluno-ficha", "/alunos/2024-0001"),
    ("pedagogica", "/pedagogica"),
    ("documentos", "/documentos"),
    ("financeiro", "/financeiro"),
    ("faturas", "/faturas"),
    ("relatorios-academicos", "/relatorios/academicos"),
    ("relatorios-financeiros", "/relatorios/financeiros"),
    ("acessos", "/acessos"),
    ("comunicacoes", "/comunicacoes"),
    ("configuracoes", "/configuracoes"),
    ("alterar-senha", "/alterar-senha"),
]

# tolerância: 0.6% dos pixéis podem diferir (antialiasing/fontes)
THRESHOLD = 0.006

FREEZE_CSS = """
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
"""


def compare(baseline: Path, current: Path, diff: Path) -> float:
    a = Image.open(baseline).convert("RGB")
    b = Image.open(current).convert("RGB")
    if a.size != b.size:
        return 1.0
    delta = ImageChops.difference(a, b).convert("L")
    changed = sum(1 for px in delta.getdata() if px > 24)
    ratio = changed / (a.size[0] * a.size[1])
    if ratio > 0:
        diff.parent.mkdir(parents=True, exist_ok=True)
        delta.point(lambda p: 255 if p > 24 else 0).save(diff)
    return ratio


async def main(update: bool) -> int:
    for d in (BASELINE, CURRENT, DIFF):
        d.mkdir(parents=True, exist_ok=True)

    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 1000}, device_scale_factor=1
        )
        page = await ctx.new_page()
        await page.add_style_tag(content=FREEZE_CSS) if False else None

        for name, path in ROUTES:
            await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
            await page.wait_for_timeout(700)
            await page.add_style_tag(content=FREEZE_CSS)
            await page.evaluate("window.scrollTo(0, 0)")

            # --- estilo Minimals em runtime ---
            audit = await page.evaluate(
                """() => {
                  const chips = document.querySelectorAll('[data-icon-chip]').length;
                  const imgs = [...document.querySelectorAll('img')];
                  const unframed = imgs.filter((el) => !el.closest('[data-media-frame]')).length;
                  const noAlt = imgs.filter((el) => !el.hasAttribute('alt')).length;
                  return { chips, unframed, noAlt };
                }"""
            )
            if audit["chips"] == 0:
                failures.append(f"{name}: rota sem IconChip renderizado")
            if audit["unframed"]:
                failures.append(f"{name}: {audit['unframed']} <img> fora de MediaFrame/MediaAvatar")
            if audit["noAlt"]:
                failures.append(f"{name}: {audit['noAlt']} <img> sem alt")

            shot = (BASELINE if update else CURRENT) / f"{name}.png"
            await page.screenshot(path=str(shot))

            if update:
                print(f"baseline actualizada: {name}")
                continue

            base = BASELINE / f"{name}.png"
            if not base.exists():
                failures.append(f"{name}: baseline inexistente (correr com --update)")
                continue
            ratio = compare(base, shot, DIFF / f"{name}.png")
            status = "OK" if ratio <= THRESHOLD else "FALHA"
            print(f"{status} {name}: {ratio * 100:.3f}% de pixéis diferentes")
            if ratio > THRESHOLD:
                failures.append(f"{name}: regressão visual de {ratio * 100:.3f}%")

        await browser.close()

    if failures:
        print("\nFalhas:")
        for f in failures:
            print(" - " + f)
        return 1
    print("\nOK — estilo Minimals (IconChip/MediaFrame) estável em todas as rotas.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true", help="regravar baselines")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(args.update)))
