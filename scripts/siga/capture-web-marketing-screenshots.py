#!/usr/bin/env python3
"""Capture SIGA UI screenshots for painel/web marketing assets.

Replaces template Shadcn images with real SIGA captures at exact pixel sizes.
Uses the Escola Demo quick-login (diretor@siga-demo.ao) on local SIGA.

Usage:
  npm run siga:capture-web-screenshots
  # SIGA must be running: npm run dev:ecosystem (port 3006)
"""
from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
WEB_PUBLIC = ROOT / "painel" / "web" / "public"
RAW_DIR = WEB_PUBLIC / ".screenshots-raw"
SIGA = os.environ.get("VITE_SIGA_URL", "http://localhost:3006")


@dataclass(frozen=True)
class Target:
    filename: str
    width: int
    height: int
    path: str
    login_role: str = "Direção"
    wait_text: str | None = None


TARGETS: list[tuple[str, Target]] = [
    (
        "dashboard",
        Target("dashboard-light.png", 2808, 1932, "/", wait_text="Dom Afonso"),
    ),
    (
        "dashboard-dark",
        Target("dashboard-dark.png", 2808, 1932, "/", wait_text="Dom Afonso"),
    ),
    (
        "feature-1",
        Target(
            "feature-1-light.png",
            2180,
            1690,
            "/pedagogica?tab=pautas",
            wait_text="Pauta",
        ),
    ),
    (
        "feature-1-dark",
        Target(
            "feature-1-dark.png",
            2180,
            1690,
            "/pedagogica?tab=pautas",
            wait_text="Pauta",
        ),
    ),
    (
        "feature-2",
        Target(
            "feature-2-light.png",
            2170,
            1690,
            "/financeiro",
            login_role="Tesouraria",
            wait_text="Caixa",
        ),
    ),
    (
        "feature-2-dark",
        Target(
            "feature-2-dark.png",
            2170,
            1690,
            "/financeiro",
            login_role="Tesouraria",
            wait_text="Caixa",
        ),
    ),
]


def resize_cover(img: Image.Image, width: int, height: int) -> Image.Image:
    target_ratio = width / height
    src_ratio = img.width / img.height
    if src_ratio > target_ratio:
        new_width = int(img.height * target_ratio)
        left = (img.width - new_width) // 2
        cropped = img.crop((left, 0, left + new_width, img.height))
    else:
        new_height = int(img.width / target_ratio)
        top = (img.height - new_height) // 2
        cropped = img.crop((0, top, img.width, top + new_height))
    return cropped.resize((width, height), Image.Resampling.LANCZOS)


async def set_theme(page, dark: bool) -> None:
    await page.evaluate(
        """(dark) => {
      document.documentElement.classList.toggle('dark', dark);
      try {
        const raw = localStorage.getItem('siga:appearance');
        const state = raw ? JSON.parse(raw) : {};
        state.mode = dark ? 'dark' : 'light';
        localStorage.setItem('siga:appearance', JSON.stringify(state));
      } catch (_) {}
    }""",
        dark,
    )


async def login_demo(page, role: str) -> None:
    await page.goto(SIGA, wait_until="domcontentloaded")
    login = page.get_by_role("heading", name="Iniciar sessão")
    if await login.is_visible():
        await page.get_by_role("button", name=role, exact=False).first.click()
        await page.get_by_text("Iniciar sessão").wait_for(state="hidden", timeout=60_000)
    await page.wait_for_load_state("networkidle", timeout=60_000)


async def wait_for_content(page, text: str | None) -> None:
    if text:
        try:
            await page.get_by_text(text, exact=False).first.wait_for(timeout=45_000)
        except Exception:
            pass
    await page.wait_for_timeout(1500)


async def capture(page, target: Target, dark: bool, viewport_width: int) -> Path:
    viewport_height = int(viewport_width * (target.height / target.width))
    await page.set_viewport_size({"width": viewport_width, "height": viewport_height})
    await set_theme(page, dark)
    await page.goto(f"{SIGA}{target.path}", wait_until="domcontentloaded")
    await wait_for_content(page, target.wait_text)

    raw_path = RAW_DIR / target.filename.replace(".png", "-raw.png")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(raw_path), full_page=False)

    with Image.open(raw_path) as img:
        if dark:
            final_img = img.convert("RGBA")
        else:
            final_img = img.convert("RGB")
        final = resize_cover(final_img, target.width, target.height)
        out = WEB_PUBLIC / target.filename
        final.save(out, format="PNG", optimize=True)
    return out


async def launch_browser(playwright):
    for factory in (
        lambda: playwright.chromium.launch(headless=True),
        lambda: playwright.chromium.launch(headless=True, channel="chrome"),
        lambda: playwright.firefox.launch(headless=True),
    ):
        try:
            return await factory()
        except Exception:
            continue
    raise RuntimeError("Nenhum browser Playwright disponível (instale: python3 -m playwright install chromium).")


async def main() -> int:
    async with async_playwright() as p:
        browser = await launch_browser(p)
        ctx = await browser.new_context(device_scale_factor=2)
        page = await ctx.new_page()

        current_role = ""
        written: list[Path] = []
        for key, target in TARGETS:
            dark = "dark" in key
            if target.login_role != current_role:
                await login_demo(page, target.login_role)
                current_role = target.login_role

            out = await capture(page, target, dark=dark, viewport_width=1404)
            written.append(out)
            print(f"✓ {out.name} ({target.width}×{target.height})")

        await browser.close()

    print(f"\n{len(written)} imagens gravadas em {WEB_PUBLIC}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
