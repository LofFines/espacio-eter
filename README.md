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
