# Reservas online — prototipo (NO publicado)

**Estado:** versión de prueba. Nada de esto está activo en espacioeter.com.ar: `reservas.html` no está enlazada desde la landing y `CONFIG.API_URL` está vacío, así que corre siempre en modo preview con datos simulados (`reservas-data.js`), sin guardar reservas ni mandar eventos.

## Cómo verla
`https://espacioeter.com.ar/reservas.html?preview=1` (solo si se mergea) o localmente: `python3 -m http.server` y abrir `/reservas.html`.

## Flujo
1. Grilla con lugares por clase (Pole: cupo − alumnas fijas − confirmadas; el resto «Cupo amplio»).
2. Día (próximas 2 semanas, hasta que empieza la clase) y modalidad: clase de prueba, clase suelta o mes.
3. Nombre, WhatsApp (y adulto responsable en Acro infantil) + aceptación de condiciones.
4. Recién ahí se ven precios: seña $10.000 que se descuenta; la clase de prueba no muestra precio.
5. Código de reserva, alias `espacioeter.mp` (titular Araceli Meli) con botón copiar y botón de WhatsApp con mensaje armado para mandar el comprobante. Estado «pendiente» hasta que Ara confirma.

## Eventos (solo con consentimiento de cookies, sin datos personales)
| Paso | Meta | GA4 |
|---|---|---|
| Ve la grilla | VerHorarios (custom) | ver_horarios |
| Elige clase | ViewContent | eligio_horario |
| Sigue al formulario | IniciarReserva (custom) | iniciar_reserva |
| Reserva registrada | SolicitudReserva (custom) | solicitud_reserva |
| Abre WhatsApp | Contact (pixel.js) | clic_whatsapp (ga4.js) |
| Ara confirma | Schedule | reserva_confirmada — **pendiente**: pasa en la planilla, no en el navegador; requiere Conversions API / Measurement Protocol (a definir). |

## Para pasarlo a producción (con OK de Leandro)
1. Completar «Alumnas fijas» (columna L de Grilla) en las clases de Pole.
2. Abrir la planilla → Extensiones → Apps Script, pegar `Code.gs`, Implementar → Aplicación web (ejecutar como: yo; acceso: cualquiera). La pestaña «Reservas» se crea sola con la primera reserva.
3. Copiar la URL `/exec` en `CONFIG.API_URL` de `reservas.js`.
4. Enlazar `reservas.html` desde la landing y corregir la grilla de `index.html` (ver PR).
