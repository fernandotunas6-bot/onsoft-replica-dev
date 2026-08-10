#!/usr/bin/env python3
"""
Regressão visual da SIDEBAR e do DRAWER de perfil em vários tamanhos de ecrã.

Cenários capturados (por viewport):
  sidebar-expanded, sidebar-collapsed, sidebar-submenu-open, account-drawer

Uso:
  python3 scripts/visual-sidebar.py            # comparar com baseline
  python3 scripts/visual-sidebar.py --update   # (re)criar baselines
  BASE_URL=http://localhost:8080 python3 scripts/visual-sidebar.py
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "visual-sidebar"
BASELINE, CURRENT, DIFF = OUT / "baseline", OUT / "current", OUT / "diff"

VIEWPORTS = [
    ("desktop-1440", 1440, 900),
    ("laptop-1280", 1280, 800),
    ("tablet-834", 834, 1112),
    ("mobile-390", 390, 844),
]

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
    arr = np.asarray(delta)
    ratio = int((arr > 24).sum()) / arr.size
    if ratio > 0:
        diff.parent.mkdir(parents=True, exist_ok=True)
        delta.point(lambda p: 255 if p > 24 else 0).save(diff)
    return ratio


async def shot(page, name: str, update: bool, failures: list[str]) -> None:
    cur = CURRENT / f"{name}.png"
    cur.parent.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(cur))
    base = BASELINE / f"{name}.png"
    if update or not base.exists():
        base.parent.mkdir(parents=True, exist_ok=True)
        base.write_bytes(cur.read_bytes())
        print(f"  baseline gravada: {name}")
        return
    ratio = compare(base, cur, DIFF / f"{name}.png")
    status = "OK" if ratio <= THRESHOLD else "DIFERE"
    print(f"  {status} {name} ({ratio * 100:.3f}%)")
    if ratio > THRESHOLD:
        failures.append(name)


async def scenarios(page, tag: str, mobile: bool, update: bool, failures: list[str]) -> None:
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.add_style_tag(content=FREEZE_CSS)
    await page.wait_for_timeout(700)

    if mobile:
        # em mobile a sidebar vive num painel deslizante
        trigger = page.get_by_label("Abrir menu").first
        if await trigger.count():
            await trigger.click()
            await page.wait_for_timeout(400)

    side = page.locator("[data-sidebar='siga']").first
    await side.wait_for(state="visible", timeout=10_000)
    await shot(side, f"{tag}-sidebar-expanded", update, failures)

    # submenu aberto (primeiro grupo com filhos)
    group = side.locator("button[aria-expanded]").first
    if await group.count():
        if (await group.get_attribute("aria-expanded")) == "true":
            await group.click()
            await page.wait_for_timeout(250)
        await group.click()
        await page.wait_for_timeout(300)
        await shot(side, f"{tag}-sidebar-submenu-open", update, failures)

    # colapsada (só no desktop, onde existe o botão de colapsar)
    if not mobile:
        collapse = page.get_by_label("Recolher menu").first
        if await collapse.count():
            await collapse.click()
            await page.wait_for_timeout(400)
            await shot(side, f"{tag}-sidebar-collapsed", update, failures)
            await page.get_by_label("Expandir menu").first.click()
            await page.wait_for_timeout(400)

    # drawer de perfil
    avatar = page.locator("[data-account-trigger]").first
    if not await avatar.count():
        avatar = page.locator("header button:has(img), header button:has(span.rounded-full)").last
    if await avatar.count():
        await avatar.click()
        await page.wait_for_timeout(500)
        drawer = page.locator("[role='dialog']").last
        if await drawer.count():
            await shot(drawer, f"{tag}-account-drawer", update, failures)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(250)


async def main(update: bool) -> int:
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for tag, w, h in VIEWPORTS:
            print(f"\n== {tag} ({w}x{h})")
            ctx = await browser.new_context(
                viewport={"width": w, "height": h}, device_scale_factor=1
            )
            page = await ctx.new_page()
            try:
                await scenarios(page, tag, mobile=w < 1024, update=update, failures=failures)
            finally:
                await ctx.close()
        await browser.close()

    if failures:
        print(f"\nFALHOU: {len(failures)} cenário(s) diferem da baseline:")
        for f in failures:
            print(f"  - {f} (diff: tests/visual-sidebar/diff/{f}.png)")
        return 1
    print("\nSidebar e drawer estáveis em todos os tamanhos.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true", help="regravar baselines")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(args.update)))
