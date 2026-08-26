import os

os.makedirs("public/brands", exist_ok=True)

# 1. Base Mascot Icon (Floating Cap + Speech Bubble Face Ring)
def get_mascot_svg(fill_color="currentColor", id_prefix="siga"):
    return f"""<g id="{id_prefix}-mascot">
  <!-- Floating Graduation Cap (Separated with gap, not touching circle) -->
  <path d="M 256,28 L 442,108 L 256,172 L 70,108 Z" fill="{fill_color}" />
  <path d="M 126,120 C 180,90 332,90 386,120 C 332,138 180,138 126,120 Z" fill="{fill_color}" />
  <path d="M 416,114 L 434,152" stroke="{fill_color}" stroke-width="8" stroke-linecap="round" />
  <circle cx="436" cy="164" r="13" fill="{fill_color}" />

  <!-- Speech Bubble Ring Face (Positioned below the gap at y=184) -->
  <path fill-rule="evenodd" clip-rule="evenodd" d="
    M 256,184
    C 334,184 398,248 398,326
    C 398,404 334,468 256,468
    C 246,468 238,467 228,465
    C 212,482 186,504 218,510
    C 248,516 266,478 284,466
    C 275,467 266,468 256,468
    C 178,468 114,404 114,326
    C 114,248 178,184 256,184
    Z
    M 256,222
    C 313,222 360,269 360,326
    C 360,383 313,430 256,430
    C 199,430 152,383 152,326
    C 152,269 199,222 256,222
    Z" fill="{fill_color}" />

  <!-- Eyes -->
  <ellipse cx="192" cy="316" rx="14" ry="23" fill="{fill_color}" />
  <ellipse cx="320" cy="316" rx="14" ry="23" fill="{fill_color}" />

  <!-- Smile -->
  <path d="M 222,360 C 238,378 274,378 290,360" stroke="{fill_color}" stroke-width="11" stroke-linecap="round" fill="none" />
</g>"""

# SVG 1: PWA 3D Golden App Icon
svg_3d_app_icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE259" />
      <stop offset="50%" stop-color="#FFA751" />
      <stop offset="100%" stop-color="#C59B27" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F8FAFC" />
    </linearGradient>
    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#D97706" flood-opacity="0.35" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#bgGrad)" stroke="#E2E8F0" stroke-width="4" />
  <g filter="url(#goldGlow)">
    {get_mascot_svg("url(#goldGrad)", "app")}
  </g>
</svg>"""

with open("public/brands/siga-plus-3d-app-icon.svg", "w", encoding="utf-8") as f:
    f.write(svg_3d_app_icon)

with open("public/favicon.svg", "w", encoding="utf-8") as f:
    f.write(svg_3d_app_icon)

# SVG 2: Flat Monochrome (Image Variation 2)
svg_monochrome = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 220" fill="none">
  <g transform="translate(10, 10) scale(0.38)">
    {get_mascot_svg("#0F172A", "mono")}
  </g>
  <text x="230" y="136" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="96" letter-spacing="-2" fill="#0F172A">SIGA Plus</text>
</svg>"""

with open("public/brands/siga-plus-monochrome.svg", "w", encoding="utf-8") as f:
    f.write(svg_monochrome)

# SVG 3: Dark Theme Hero Vertical Stack with Star Divider (Image Variation 3)
svg_dark_hero = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 520" fill="none">
  <defs>
    <linearGradient id="heroGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE066" />
      <stop offset="100%" stop-color="#C59B27" />
    </linearGradient>
  </defs>
  <rect width="600" height="520" rx="32" fill="#090D16" />
  <g transform="translate(170, 30) scale(0.52)">
    {get_mascot_svg("url(#heroGold)", "darkhero")}
  </g>
  
  <!-- "SIGA Plus" Stack -->
  <text x="300" y="340" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="72" letter-spacing="2">
    <tspan fill="#FFFFFF">SIGA </tspan>
    <tspan fill="url(#heroGold)">Plus</tspan>
  </text>
  
  <!-- Star Line Divider (─── ✦ ───) -->
  <path d="M 180,380 L 270,380 M 330,380 L 420,380" stroke="#C59B27" stroke-width="1.5" stroke-linecap="round" opacity="0.6" />
  <path d="M 300,373 L 303,380 L 310,380 L 304,384 L 306,391 L 300,386 L 294,391 L 296,384 L 290,380 L 297,380 Z" fill="#FFE066" />
</svg>"""

with open("public/brands/siga-plus-dark-hero.svg", "w", encoding="utf-8") as f:
    f.write(svg_dark_hero)

# SVG 4: Horizontal Brand Header with Swoosh (Image Variation 4)
svg_horizontal = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 220" fill="none">
  <defs>
    <linearGradient id="hGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FACC15" />
      <stop offset="100%" stop-color="#CA8A04" />
    </linearGradient>
  </defs>
  <g transform="translate(10, 10) scale(0.38)">
    {get_mascot_svg("url(#hGold)", "horiz")}
  </g>
  
  <text x="225" y="142" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="94" letter-spacing="-3" fill="#0A192F">SIGA</text>
  <text x="495" y="142" font-family="Georgia, serif" font-style="italic" font-weight="800" font-size="94" letter-spacing="-1" fill="#0A192F">Plus</text>
  
  <!-- Sweeping Golden Swoosh Stroke -->
  <path d="M 480,165 C 550,158 670,148 720,166 C 630,172 520,176 480,165 Z" fill="url(#hGold)" />
</svg>"""

with open("public/brands/siga-plus-horizontal.svg", "w", encoding="utf-8") as f:
    f.write(svg_horizontal)

print("Generated 4 distinct SIGA Plus logo variations successfully!")
