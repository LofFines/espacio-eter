# espacio-eter
Espacio Éter - Mini Landing Page Oficial (Ciudadela)

## CSS (Tailwind estático)
`tailwind.min.css` se genera con Tailwind 3.4.17 (ya no se usa cdn.tailwindcss.com). Si agregás clases nuevas en el HTML/JS, regenerá:

    npx tailwindcss@3.4.17 -i tailwind.src.css -o tailwind.min.css --minify

## Meta Pixel
Configuración en `pixel.js` (ID 1028287166250408, «mensajes Eter»).

## Fuentes e imágenes
Fuentes locales en `fonts/` (WOFF2, subset latino): Montserrat variable 400–900, Montserrat Italic 800 y Syne 800. Se precarga Syne (titulares). El hero usa `salon-eter-480.webp` / `salon-eter-764.webp`; `salon-eter.jpg` queda solo para og:image y schema.

## UTMs para los anuncios de Meta
En cada anuncio, en "Parámetros de URL":

    utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}

`app.js` guarda `utm_*` y `fbclid` en `sessionStorage` (`eter_utm`) y agrega la campaña al final del mensaje de WhatsApp: `[web-meta · nombre-campaña]` (máx. 30 caracteres). Sin UTM queda `[web-meta]`.

## Reseñas
Las tarjetas están en `index.html`, `#resenas-grid` → `figure.resena-card` (una por reseña, texto exacto de Google Maps; solo se recorta con "[…]").

## Fotos y bloques ocultos

Hay tres bloques ocultos dentro de un `<template>` o de un comentario en `index.html`, así no se renderizan ni se indexan:

| Bloque | Dónde | Cómo reactivarlo |
|---|---|---|
| Galería de alumnas | `<template id="tpl-galeria">` (dentro de `#resenas`) | Borrar las etiquetas `<template id="tpl-galeria">` y `</template>` y dejar el contenido |
| Ara + profes | `<template id="tpl-profes">` (después de `#resenas`) | Igual: sacar `<template>`/`</template>` |
| Horario WhatsApp, razón social y CUIT | Comentario en el `<footer>` | Descomentar y completar con los datos reales |

Después de reactivar un bloque hay que regenerar Tailwind, porque las clases de un template no se compilan:
`npx -y tailwindcss@3.4.17 -i tailwind.src.css -o tailwind.min.css --minify`. Antes de publicar, revisar que no queden textos de ejemplo («Nombre», «Disciplina», «(bio real)»).

### Especificación de fotos

- **Original:** JPG o PNG de al menos **1200 px del lado largo**, nítido y con luz natural. Hace falta permiso de cada persona que aparece.
- **Publicado:** WebP de **480 y 960 px de ancho**. Peso máximo: **60 KB** el de 480 y **160 KB** el de 960.
- **Proporciones:** profes y Ara en retrato **4:5**; galería de alumnas en **1:1** (o 4:3); estudio en **4:3**.
- **Nombres:** en minúsculas, sin acentos ni espacios, terminados en `-480.webp` y `-960.webp`.
  - `img/ara/ara-480.webp`, `img/ara/ara-960.webp`
  - `img/profes/<nombre>-480.webp` (ej. `sofia-480.webp`)
  - `img/alumnas/alumnas-01-480.webp`, `alumnas-02-…` (numeradas)
  - `img/estudio/estudio-01-480.webp`, …
- **Conversión:** `python3 scripts/fotos.py original.jpg img/profes sofia 4:5`. Recorta al centro, genera los dos tamaños y baja la calidad hasta entrar en el peso máximo.

**Agregar una profe:** convertir la foto y después, dentro de `tpl-profes`, duplicar un `<figure class="profe-card">` y cambiar las rutas, el `alt`, el nombre y la disciplina. Se pueden sumar todas las que hagan falta, porque la grilla es de 2 columnas en celular y 3 en escritorio.
**Agregar una foto a la galería:** convertirla con `1:1` y duplicar un `<picture>` dentro de `#fotos-clases` con el número siguiente.
