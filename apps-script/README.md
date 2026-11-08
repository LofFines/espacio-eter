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
| Ara confirma | Schedule (API de Conversiones, desde el script) | — |

## Para pasarlo a producción (con OK de Leandro)
1. Completar «Alumnas fijas» (columna L de Grilla) en las clases de Pole.
2. Abrir la planilla → Extensiones → Apps Script, pegar `Code.gs`, Implementar → Aplicación web (ejecutar como: yo; acceso: cualquiera). La pestaña «Reservas» se crea sola con la primera reserva.
3. Copiar la URL `/exec` en `CONFIG.API_URL` de `reservas.js`.
4. Enlazar `reservas.html` desde la landing y corregir la grilla de `index.html` (ver PR).

## Aviso a Meta cuando Ara confirma (API de Conversiones)
- Al reservar, si la persona aceptó cookies, se guardan en la fila `_fbp`, `_fbc` (o se arma desde el `fbclid` del anuncio), la URL sin parámetros y el navegador. Sin consentimiento no se guarda nada de eso ni se avisa a Meta.
- Al tocar **Reservas → Confirmar reserva seleccionada**, el script manda un `Schedule` al píxel 1028287166250408 con el WhatsApp hasheado (SHA-256, formato 549…), fbp/fbc y `event_id` = código de reserva (no duplica si se reintenta). La columna «Aviso a Meta» queda en `enviado dd/MM HH:mm` o `error …`.
- **Token:** Administrador de eventos → píxel «mensajes Eter» → Configuración → API de Conversiones → Generar token de acceso. En Apps Script: Configuración del proyecto → Propiedades del script → `META_CAPI_TOKEN`. No vence; se cambia solo si se revoca.
- **Si falla:** llega un mail (máximo uno por día) a la cuenta que implementó el script. Las reservas siguen andando. Después de arreglar el token: **Reservas → Reintentar aviso a Meta**.
- Para optimizar: empezar por `SolicitudReserva` (más volumen) y pasar a `Schedule` cuando haya ~50 confirmadas por semana.
