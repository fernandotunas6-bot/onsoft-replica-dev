import os
from PIL import Image, ImageDraw

# Create directory if not exists
os.makedirs("public/brands", exist_ok=True)
os.makedirs("public/icons", exist_ok=True)

# 1. Generate standalone SVG Icon (siga-plus-icon.svg)
svg_icon = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <!-- SIGA Plus Golden Mascot Logo -->
  <g color="#C59B27">
    <!-- Graduation Cap / Capelo Top Diamond Board -->
    <path d="M 256,36 L 452,118 L 256,200 L 60,118 Z" fill="currentColor" />
    
    <!-- Crown Base Arch Band -->
    <path d="M 120,132 C 180,95 332,95 392,132 C 332,154 180,154 120,132 Z" fill="currentColor" />
    
    <!-- Tassel -->
    <path d="M 430,126 L 448,168" stroke="currentColor" stroke-width="8" stroke-linecap="round" />
    <circle cx="450" cy="180" r="14" fill="currentColor" />

    <!-- Speech Bubble Head Ring Outer & Inner (Cutout) -->
    <path fill-rule="evenodd" clip-rule="evenodd" d="
      M 256,140
      C 342,140 412,210 412,296
      C 412,382 342,452 256,452
      C 246,452 236,451 226,449
      C 210,466 182,492 216,498
      C 248,504 266,464 286,450
      C 276,451 266,452 256,452
      C 170,452 100,382 100,296
      C 100,210 170,140 256,140
      Z
      M 256,182
      C 319,182 370,233 370,296
      C 370,359 319,410 256,410
      C 193,410 142,359 142,296
      C 142,233 193,182 256,182
      Z" fill="currentColor" />

    <!-- Oval Eyes -->
    <ellipse cx="186" cy="286" rx="15" ry="25" fill="currentColor" />
    <ellipse cx="326" cy="286" rx="15" ry="25" fill="currentColor" />

    <!-- Smiling Mouth -->
    <path d="M 218,338 C 236,358 276,358 294,338" stroke="currentColor" stroke-width="12" stroke-linecap="round" fill="none" />
  </g>
</svg>
"""

with open("public/brands/siga-plus-icon.svg", "w", encoding="utf-8") as f:
    f.write(svg_icon)

with open("public/favicon.svg", "w", encoding="utf-8") as f:
    f.write(svg_icon)

# 2. Generate Full Logo SVG with "SIGA Plus" typography (siga-plus-logo.svg)
svg_full = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 240" fill="none">
  <!-- SIGA Plus Full Logo -->
  <g transform="translate(10, 10) scale(0.42)">
    <g color="#C59B27">
      <path d="M 256,36 L 452,118 L 256,200 L 60,118 Z" fill="currentColor" />
      <path d="M 120,132 C 180,95 332,95 392,132 C 332,154 180,154 120,132 Z" fill="currentColor" />
      <path d="M 430,126 L 448,168" stroke="currentColor" stroke-width="8" stroke-linecap="round" />
      <circle cx="450" cy="180" r="14" fill="currentColor" />
      <path fill-rule="evenodd" clip-rule="evenodd" d="
        M 256,140
        C 342,140 412,210 412,296
        C 412,382 342,452 256,452
        C 246,452 236,451 226,449
        C 210,466 182,492 216,498
        C 248,504 266,464 286,450
        C 276,451 266,452 256,452
        C 170,452 100,382 100,296
        C 100,210 170,140 256,140
        Z
        M 256,182
        C 319,182 370,233 370,296
        C 370,359 319,410 256,410
        C 193,410 142,359 142,296
        C 142,233 193,182 256,182
        Z" fill="currentColor" />
      <ellipse cx="186" cy="286" rx="15" ry="25" fill="currentColor" />
      <ellipse cx="326" cy="286" rx="15" ry="25" fill="currentColor" />
      <path d="M 218,338 C 236,358 276,358 294,338" stroke="currentColor" stroke-width="12" stroke-linecap="round" fill="none" />
    </g>
  </g>

  <!-- Typography -->
  <text x="240" y="142" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="94" letter-spacing="-2" fill="#1E293B" class="dark:fill-white">SIGA</text>
  <text x="500" y="142" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="94" letter-spacing="-1" fill="#C59B27">Plus</text>
  <text x="244" y="186" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="22" letter-spacing="4" fill="#64748B" text-transform="uppercase">Sistema Integrado de Gestão Académica</text>
</svg>
"""

with open("public/brands/siga-plus-logo.svg", "w", encoding="utf-8") as f:
    f.write(svg_full)

print("SVG logos generated successfully in public/brands/")
