"""Gera a arte geométrica dos instaladores; os BMP/PNG ficam versionados.
Não é necessário Python para compilar o instalador: executar só ao mudar o design.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "installer"
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path("/usr/share/fonts/truetype/dejavu")


def font(size, bold=False):
    return ImageFont.truetype(str(FONT / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)


header = Image.new("RGB", (150, 57), "white")
draw = ImageDraw.Draw(header)
draw.rounded_rectangle((6, 12, 38, 44), radius=9, fill="#225de5")
draw.text((14, 14), "S", font=font(21, True), fill="white")
draw.text((47, 11), "SIGA", font=font(18, True), fill="#17253c")
draw.text((48, 34), "DESKTOP", font=font(8, True), fill="#5b6b81")
header.save(OUT / "header.bmp")

sidebar = Image.new("RGB", (164, 314))
draw = ImageDraw.Draw(sidebar)
for y in range(314):
    t = y / 313
    draw.line((0, y, 164, y), fill=(int(26 - 12*t), int(52 - 21*t), int(92 - 32*t)))
draw.rounded_rectangle((20, 26, 62, 68), radius=12, fill="#3674ed")
draw.text((32, 30), "S", font=font(28, True), fill="white")
draw.text((20, 91), "SIGA", font=font(25, True), fill="white")
draw.text((21, 123), "Desktop", font=font(16), fill="#c3d6f0")
draw.line((20, 159, 144, 159), fill="#3a5478", width=1)
for y, title, subtitle in [(180, "Uma escola", "ligada."), (238, "Organizar.", "Ensinar. Evoluir.")]:
    draw.text((20, y), title, font=font(13, True), fill="#e7f0fc")
    draw.text((20, y+21), subtitle, font=font(11), fill="#aec5e5")
draw.text((20, 290), "ONSOFT", font=font(8, True), fill="#9bc5ff")
sidebar.save(OUT / "sidebar.bmp")

background = Image.new("RGB", (660, 400), "#f4f7fb")
draw = ImageDraw.Draw(background)
draw.rounded_rectangle((28, 25, 68, 65), radius=12, fill="#225de5")
draw.text((40, 29), "S", font=font(26, True), fill="white")
draw.text((82, 26), "SIGA Desktop", font=font(22, True), fill="#17253c")
draw.text((83, 53), "A sua escola, num só lugar.", font=font(11), fill="#5b6b81")
for x in (180, 480):
    draw.rounded_rectangle((x-77, 100, x+77, 251), radius=20, fill="white", outline="#dce4ef", width=1)
draw.line((293, 170, 365, 170), fill="#225de5", width=3)
draw.polygon([(365, 170), (354, 164), (354, 176)], fill="#225de5")
draw.text((195, 291), "Arraste para Aplicações", font=font(18, True), fill="#17253c")
draw.text((147, 323), "Depois, abra o SIGA e entre com a sua conta escolar.", font=font(12), fill="#5b6b81")
draw.text((245, 365), "ONSOFT  ·  portal-siga.com", font=font(10), fill="#5b6b81")
background.save(OUT / "dmg-background.png")
print("Installer artwork generated: header 150×57, sidebar 164×314, DMG 660×400")
