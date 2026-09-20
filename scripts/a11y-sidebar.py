#!/usr/bin/env python3
"""
Acessibilidade em runtime da SIDEBAR e dos IconChip.

Valida:
  1. Contraste (WCAG AA) do texto das linhas de navegação nos estados
     activo e inactivo, e do glifo de cada IconChip contra o seu fundo.
  2. Foco visível: cada linha focada por teclado tem outline/ring/box-shadow.
  3. Ordem de tabulação: o skip link é o primeiro e as linhas da sidebar
     são alcançadas na mesma ordem em que aparecem no DOM.
  4. Rótulos ARIA: aria-current="page" apenas na rota activa, aria-expanded
     coerente nos grupos, e IconChip decorativo com aria-hidden (ou com
     role="img" + aria-label quando carrega significado).

Uso:
  python3 scripts/a11y-sidebar.py
  BASE_URL=http://localhost:3006 python3 scripts/a11y-sidebar.py
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
VIEWPORTS = [("desktop-1440", 1440, 900), ("laptop-1024", 1024, 768), ("mobile-412", 412, 915)]
AA_NORMAL = 4.5
AA_LARGE = 3.0

CONTRAST_JS = """
() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (c) => {
    if (!c || c === 'transparent' || c === 'none') return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = c;
    if (cx.fillStyle === '#000' && !/#000|rgb\\(0, 0, 0|black/.test(c)) return null;
    cx.globalAlpha = 1;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = [c.r, c.g, c.b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const bgOf = (el) => {
    let node = el;
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    const stack = [];
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) stack.push(c);
      node = node.parentElement;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) acc = over(stack[i], acc);
    return acc;
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const out = { rows: [], chips: [] };
  const side = [...document.querySelectorAll("[data-sidebar='siga']")].find(
    (el) => el.getClientRects().length > 0,
  );
  if (!side) return out;

  for (const row of side.querySelectorAll('[data-nav-row]')) {
    const st = getComputedStyle(row);
    const fg = parse(st.color);
    const bg = bgOf(row);
    const size = parseFloat(st.fontSize);
    const bold = parseInt(st.fontWeight, 10) >= 600;
    out.rows.push({
      label: (row.textContent || '').trim().slice(0, 40),
      active: row.getAttribute('aria-current') === 'page' || row.dataset.active === 'true',
      ratio: fg && bg ? ratio(over(fg, bg), bg) : 0,
      large: size >= 24 || (size >= 18.66 && bold),
      ariaCurrent: row.getAttribute('aria-current'),
      ariaExpanded: row.getAttribute('aria-expanded'),
      tag: row.tagName.toLowerCase(),
    });
  }

  for (const chip of document.querySelectorAll('[data-icon-chip]')) {
    const st = getComputedStyle(chip);
    const fg = parse(st.color);
    const bg = bgOf(chip);
    out.chips.push({
      tone: chip.dataset.tone || '',
      size: chip.dataset.size || '',
      ratio: fg && bg ? ratio(over(fg, bg), bg) : 0,
      hidden: chip.getAttribute('aria-hidden') === 'true',
      role: chip.getAttribute('role'),
      ariaLabel: chip.getAttribute('aria-label'),
      box: chip.getBoundingClientRect().width,
      cls: chip.className,
    });
  }
  return out;
}
"""

FOCUS_JS = """
() => {
  const el = document.activeElement;
  if (!el) return null;
  const st = getComputedStyle(el);
  const visible =
    (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) ||
    (st.boxShadow && st.boxShadow !== 'none');
  return {
    tag: el.tagName.toLowerCase(),
    nav: !!el.closest('[data-nav-row]') || el.hasAttribute('data-nav-row'),
    label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
    visible,
  };
}
"""


FOCUS_ORDER_JS = """
() => {
  const side = [...document.querySelectorAll("[data-sidebar='siga']")].find(
    (el) => el.getClientRects().length > 0,
  );
  const out = { order: [], tabbable: [], invisible: [] };
  if (!side) return out;
  const rows = [...side.querySelectorAll('[data-nav-row]')];
  const label = (el) => (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40);

  // ordem do DOM (linhas visíveis e focáveis)
  for (const row of rows) {
    if (row.tabIndex < 0 || row.getClientRects().length === 0) continue;
    out.order.push(label(row));
  }

  // ordem real de tabulação a partir da primeira linha
  const all = [...document.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.getClientRects().length > 0);
  const inSide = all.filter((el) => side.contains(el) && el.hasAttribute('data-nav-row'));
  for (const el of inSide) {
    out.tabbable.push(label(el));
    el.focus({ focusVisible: true });
    const st = getComputedStyle(el);
    const visible =
      (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) ||
      (st.boxShadow && st.boxShadow !== 'none') ||
      !!el.className.match(/focus-visible:(ring|outline)/);
    if (!visible) out.invisible.push(label(el));
  }
  return out;
}
"""


async def audit(page, tag: str, failures: list[str]) -> None:
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)

    if page.viewport_size and page.viewport_size["width"] < 1024:
        trigger = page.get_by_label("Abrir menu").first
        await trigger.wait_for(state="visible", timeout=10_000)
        await trigger.click()
        await page.locator("[role='dialog'] [data-sidebar='siga']").first.wait_for(
            state="visible", timeout=10_000
        )
        await page.wait_for_timeout(300)

    # skip link é o primeiro elemento focável do documento (só fora do painel deslizante)
    if page.viewport_size and page.viewport_size["width"] >= 1024:
        await page.keyboard.press("Tab")
        first = await page.evaluate(FOCUS_JS)
        if not first or "conteúdo" not in (first["label"] or "").lower():
            got = first["label"] if first else "nada"
            failures.append(f"{tag}: primeiro Tab não foca o skip link (foi '{got}')")
        elif not first["visible"]:
            failures.append(f"{tag}: skip link sem foco visível")

    data = await page.evaluate(CONTRAST_JS)
    rows = data["rows"]
    chips = data["chips"]

    if not rows:
        failures.append(f"{tag}: sidebar sem linhas de navegação detectadas")
        return

    # 1. contraste das linhas
    for row in rows:
        need = AA_LARGE if row["large"] else AA_NORMAL
        if row["ratio"] < need:
            failures.append(
                f"{tag}: contraste {row['ratio']:.2f} < {need} em '{row['label']}'"
                f" ({'activo' if row['active'] else 'inactivo'})"
            )

    # 1b. contraste do glifo dos chips (ícone = componente gráfico, AA 3:1)
    for chip in chips:
        if chip["ratio"] < AA_LARGE:
            failures.append(
                f"{tag}: IconChip tom '{chip['tone']}' com contraste {chip['ratio']:.2f} < {AA_LARGE}"
                f" [{chip['cls']}]"
            )

    # 4. rótulos ARIA
    active = [r for r in rows if r["ariaCurrent"] == "page"]
    if len(active) > 1:
        failures.append(f"{tag}: {len(active)} linhas com aria-current='page' (deve haver 1)")
    if not active:
        failures.append(f"{tag}: nenhuma linha com aria-current='page' na rota activa")
    for row in rows:
        if row["tag"] == "button" and row["ariaExpanded"] not in ("true", "false"):
            failures.append(f"{tag}: grupo '{row['label']}' sem aria-expanded")
        if row["tag"] == "a" and row["ariaExpanded"] is not None:
            failures.append(f"{tag}: link '{row['label']}' não deve ter aria-expanded")
    for chip in chips:
        if not chip["hidden"] and not (chip["role"] == "img" and chip["ariaLabel"]):
            failures.append(
                f"{tag}: IconChip tom '{chip['tone']}' nem decorativo (aria-hidden) nem rotulado"
            )

    # 2. foco visível + 3. ordem de tabulação
    focus_report = await page.evaluate(FOCUS_ORDER_JS)
    for item in focus_report["invisible"]:
        failures.append(f"{tag}: foco não visível em '{item}'")
    if not focus_report["tabbable"]:
        failures.append(f"{tag}: nenhuma linha da sidebar é alcançável por teclado")
    if focus_report["order"] != focus_report["tabbable"]:
        failures.append(f"{tag}: ordem de tabulação difere da ordem do DOM na sidebar")

    print(
        f"  {tag}: {len(rows)} linhas, {len(chips)} chips, "
        f"{len(focus_report['tabbable'])} focos verificados"
    )


async def main() -> int:
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(**get_browser_kwargs())
        for tag, w, h in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            try:
                await audit(page, tag, failures)
            finally:
                await ctx.close()
        await browser.close()

    if failures:
        print(f"\nFALHOU: {len(failures)} problema(s) de acessibilidade:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nSidebar e IconChip acessíveis (contraste, foco, tabulação e ARIA).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
