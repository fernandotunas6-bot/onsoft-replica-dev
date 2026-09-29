#!/usr/bin/env python3
"""Playwright E2E do ecossistema SIGA Plus (Fase 13).

Requer apps locais (npm run dev:ecosystem) nas portas 3006/5174/3005/5173.
Provisionamento real: SIGA_E2E_LIVE=1 (cria tenants de teste via API/UI).

Uso:
  python3 scripts/siga/e2e-ecosystem-playwright.py
"""
from __future__ import annotations

import asyncio
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

WEB = os.environ.get("VITE_WEB_URL", "http://localhost:5174")
SIGA = os.environ.get("VITE_SIGA_URL", "http://localhost:3006")
ADMIN = os.environ.get("VITE_ADMIN_URL", "http://localhost:3005")
DOC = os.environ.get("VITE_DOCS_URL", "http://localhost:5173")
LIVE = os.environ.get("SIGA_E2E_LIVE", "").lower() in ("1", "true")
ROOT = Path(__file__).resolve().parents[2]


def unique_slug(prefix: str = "e2e") -> str:
    return f"{prefix}-{int(time.time() * 1000):x}"


# Mesma regra do helper TypeScript (tests/e2e/helpers/sga-live-admin.ts): vem de
# E2E_LIVE_ADMIN_PASSWORD ou é gerada ao acaso por execução; nunca fica no código.
E2E_LIVE_ADMIN_PASSWORD = (
    os.environ.get("E2E_LIVE_ADMIN_PASSWORD", "").strip()
    or f"E2e-{secrets.token_urlsafe(12)}!9a"
)


def signup_payload(slug: str) -> dict:
    """Payload para POST /api/saas/signup.

    Tem de satisfazer `publicSchoolSignupInputSchema`. Faltavam-lhe dois campos
    obrigatórios — `admin_password` e, desde que o registo apertou, `nif` — o
    que fazia este teste receber 400 em todas as corridas live.
    `tests/saas/signup-payload-contract.test.ts` compara as chaves daqui com as
    que o schema exige, a cada corrida do vitest.
    """
    email = f"e2e+{slug}@siga-plus.test"
    return {
        "name": f"Escola E2E {slug}",
        "nif": "5417000000",
        "contact_name": "Director E2E",
        "contact_email": email,
        "plan_code": "start",
        "slug": slug,
        "admin_name": "Director E2E",
        "admin_email": email,
        "admin_password": E2E_LIVE_ADMIN_PASSWORD,
        "website": "",
    }


def cleanup_e2e_tenant(slug: str, admin_email: str | None = None) -> None:
    args = ["node", "scripts/siga/e2e-cleanup-tenant.mjs", f"--slug={slug}"]
    if admin_email:
        args.append(f"--email={admin_email}")
    subprocess.run(
        args,
        cwd=ROOT,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def test_routes(page, failures: list[str]) -> None:
    cases = [
        ("WEB landing", WEB, None),
        ("WEB /start", f"{WEB}/start", "Criar a minha escola"),
        ("DOC home", DOC, None),
        ("SIGA home", SIGA, None),
    ]
    for label, url, heading in cases:
        try:
            response = await page.goto(url, wait_until="domcontentloaded")
            status = response.status if response else 0
            if status >= 400 and status not in (302, 307):
                failures.append(f"{label}: HTTP {status}")
            if heading and not await page.get_by_role("heading", name=heading).is_visible():
                failures.append(f"{label}: heading «{heading}» não visível")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{label}: {exc}")

    try:
        await page.goto(f"{ADMIN}/tenants", wait_until="domcontentloaded")
        if "/sign-in" not in page.url:
            failures.append("ADMIN /tenants: esperava redirect para /sign-in sem sessão")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"ADMIN /tenants: {exc}")

    for path in ("/platform-admins", "/audit", "/domains", "/subscriptions"):
        try:
            await page.goto(f"{ADMIN}{path}", wait_until="domcontentloaded")
            if "/sign-in" not in page.url:
                failures.append(f"ADMIN {path}: esperava redirect para /sign-in sem sessão")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"ADMIN {path}: {exc}")


async def test_wizard_review(page, failures: list[str]) -> None:
    try:
        await page.goto(f"{WEB}/start", wait_until="domcontentloaded")
        await page.get_by_label("Nome da instituição").fill("Colégio E2E Playwright")
        await page.get_by_role("button", name="Continuar").click()

        await page.get_by_label("Nome do responsável").fill("Ana Director")
        await page.get_by_label("E-mail", exact=True).fill("ana.director@e2e.siga.test")
        await page.get_by_role("button", name="Continuar").click()

        await page.get_by_role("button", name="Start").click()
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_role("button", name="Continuar").click()

        if not await page.get_by_text("Colégio E2E Playwright").is_visible():
            failures.append("Wizard: revisão não mostra nome da escola")
        if not await page.get_by_role("button", name="Criar escola").is_visible():
            failures.append("Wizard: botão «Criar escola» não visível na revisão")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"Wizard UI: {exc}")


def test_live_signup_api(failures: list[str]) -> None:
    slug = unique_slug()
    payload = signup_payload(slug)
    data = __import__("json").dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{SIGA}/api/saas/signup",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body = __import__("json").loads(res.read().decode("utf-8"))
        if body.get("slug") != slug:
            failures.append(f"Live API: slug esperado {slug}, recebido {body.get('slug')}")
        if not body.get("tenantId"):
            failures.append("Live API: tenantId em falta na resposta")
        if not str(body.get("adminTenantsUrl", "")).endswith("/tenants"):
            failures.append("Live API: adminTenantsUrl inválido")
        seeded = body.get("bootstrapSeeded") or []
        if not isinstance(seeded, list) or len(seeded) == 0:
            failures.append("Live API: bootstrapSeeded vazio")
        lookup_req = urllib.request.Request(
            f"{SIGA}/api/saas/tenants/lookup?slug={urllib.parse.quote(slug)}",
            method="GET",
        )
        with urllib.request.urlopen(lookup_req, timeout=30) as lookup_res:
            lookup_body = __import__("json").loads(lookup_res.read().decode("utf-8"))
        if lookup_body.get("tenant", {}).get("slug") != slug:
            failures.append("Live API: lookup por slug falhou após signup")
        matricula_req = urllib.request.Request(
            f"{SIGA}/matricula/{urllib.parse.quote(slug)}",
            method="GET",
        )
        with urllib.request.urlopen(matricula_req, timeout=30) as matricula_res:
            if matricula_res.status != 200:
                failures.append(f"Live API: /matricula/{slug} → HTTP {matricula_res.status}")
    except urllib.error.HTTPError as exc:
        failures.append(f"Live API signup: HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"Live API signup: {exc}")
    finally:
        cleanup_e2e_tenant(slug, payload["admin_email"])


async def test_live_wizard(page, failures: list[str]) -> None:
    slug = unique_slug("web")
    email = f"e2e+{slug}@siga-plus.test"
    try:
        await page.goto(f"{WEB}/start", wait_until="domcontentloaded")
        await page.get_by_label("Nome da instituição").fill(f"Escola Live {slug}")
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_label("Nome do responsável").fill("Live Director")
        await page.get_by_label("E-mail", exact=True).fill(email)
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_role("button", name="Start").click()
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_label("Subdomínio SIGA").fill(slug)
        await page.get_by_role("button", name="Continuar").click()
        await page.get_by_role("button", name="Criar escola").click()

        heading = page.get_by_role("heading", name="Escola criada")
        await heading.wait_for(state="visible", timeout=60_000)
        if not await page.get_by_text(f"{slug}.portal-siga.com").is_visible():
            failures.append("Live wizard: hostname de sucesso não visível")
        admin_link = page.get_by_role("link", name="Ver no Control Center (ADMIN)")
        if not await admin_link.is_visible():
            failures.append("Live wizard: link ADMIN em falta no ecrã de sucesso")
        siga_link = page.get_by_role("link", name="Abrir o SIGA Plus")
        if await siga_link.is_visible():
            await siga_link.click()
            await page.wait_for_load_state("domcontentloaded")
            login_visible = await page.get_by_text("Entrar no Portal").is_visible()
            login_visible = login_visible or await page.get_by_text("Iniciar sessão").is_visible()
            if not login_visible:
                failures.append("Live wizard: SIGA não mostrou ecrã de login após provisionamento")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"Live wizard UI: {exc}")
    finally:
        cleanup_e2e_tenant(slug, email)


async def launch_browser(playwright):
    attempts = [
        ("chromium", lambda: playwright.chromium.launch(headless=True)),
        ("chrome", lambda: playwright.chromium.launch(headless=True, channel="chrome")),
        ("firefox", lambda: playwright.firefox.launch(headless=True)),
    ]
    errors: list[str] = []
    for name, factory in attempts:
        try:
            return await factory(), name
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {exc}")
    hint = (
        "Instale um browser Playwright: python3 -m playwright install chromium "
        "(CI Ubuntu) ou use Chrome local (channel=chrome)."
    )
    raise RuntimeError(f"Nenhum browser disponível. {' | '.join(errors)}. {hint}")


async def main() -> int:
    failures: list[str] = []
    try:
        async with async_playwright() as p:
            browser, browser_name = await launch_browser(p)
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            page = await ctx.new_page()

            await test_routes(page, failures)
            await test_wizard_review(page, failures)

            if LIVE:
                test_live_signup_api(failures)
                await test_live_wizard(page, failures)

            await browser.close()
    except RuntimeError as exc:
        if os.environ.get("SIGA_E2E_SKIP_UI") == "1":
            print(f"Playwright UI omitido ({exc})")
            return 0
        print(str(exc), file=sys.stderr)
        return 1

    if failures:
        print("Playwright E2E — falhas:\n", file=sys.stderr)
        for item in failures:
            print(f"  • {item}", file=sys.stderr)
        return 1

    suffix = " (incl. @live)" if LIVE else ""
    print(f"Playwright E2E OK{suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
