#!/usr/bin/env python3
"""Convierte fotos originales a WebP 480 y 960 px de ancho, recortando a la proporción.
Uso: python3 scripts/fotos.py <original.jpg|png> <carpeta-destino> <nombre> <4:5|4:3|1:1>
Ej:  python3 scripts/fotos.py ~/Descargas/IMG_1234.jpg img/profes sofia 4:5
Genera img/profes/sofia-480.webp y sofia-960.webp. Requiere Pillow (pip install pillow)."""
import sys, os
from PIL import Image, ImageOps
MAX_KB = {480: 60, 960: 160}
src, dst, name, ratio = sys.argv[1:5]
rw, rh = map(int, ratio.split(':'))
im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
if max(im.size) < 1200: print(f'AVISO: original de {im.size}, se recomienda >=1200 px del lado largo')
w, h = im.size
if w / h > rw / rh: nw = int(h * rw / rh); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
else: nh = int(w * rh / rw); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
os.makedirs(dst, exist_ok=True)
for W in (480, 960):
    out = os.path.join(dst, f'{name}-{W}.webp'); r = im.resize((W, round(W * rh / rw)), Image.LANCZOS)
    for q in (80, 72, 64, 56):
        r.save(out, 'WEBP', quality=q, method=6)
        if os.path.getsize(out) <= MAX_KB[W] * 1024: break
    print(f'{out}  {r.size[0]}x{r.size[1]}  {os.path.getsize(out)//1024} KB  q={q}')
