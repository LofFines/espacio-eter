# Reservas online — estado real y despliegue

**Estado real (10/11/2026):**
- El Apps Script **ya está implementado como aplicación web** (ejecutar como Leandro, acceso «Cualquier usuario») y su URL `/exec` está en `reservas.js` → `CONFIG.API_URL`. El repo es público, así que esa URL es pública.
- El código de **esa implementación es el viejo** (sin saneo de fórmulas ni antiabuso). Este `Code.gs` corregido **no llega a producción hasta que alguien lo pega en el editor y vuelve a implementar** (ver «Despliegue seguro»).
- En esta rama `reservas.html` **ya está enlazada desde la landing** (botón «Reservá tu clase online» en el hero, `#heroReservaBtn`, y link debajo de la grilla, `#grillaReservaLink`). Si la rama se mergea a `main`, la página queda publicada y desde ese momento escribe en la planilla real: **no mergear antes de volver a implementar el Apps Script con este `Code.gs`**.
- Modo preview (sin escribir nada): `reservas.html?preview=1`, o dejar `CONFIG.API_URL: ''`.

## Despliegue seguro (lo hace Leandro, a mano)
1. **Ya:** en la planilla → Extensiones → Apps Script → Implementar → Gestionar implementaciones → **archivar** la implementación actual (o pausarla hasta tener el código nuevo).
2. Pegar este `Code.gs` completo. En Configuración del proyecto, activar «Mostrar el archivo de manifiesto appsscript.json» y pegar `appsscript.json` (scopes mínimos: solo esta planilla, menú, mail, requests externas y email del usuario). Al guardar, Google pide autorizar de nuevo: revisar que la lista de permisos sea la corta.
3. Implementar → **Nueva implementación** → Aplicación web (ejecutar como: yo; acceso: cualquier usuario). La URL `/exec` nueva es distinta: copiarla en `CONFIG.API_URL` de `reservas.js`. (Si en cambio se edita la implementación existente y se elige «Nueva versión», la URL sigue siendo la misma.) Verificar que `reservas.js` apunte a la implementación que tiene el código nuevo.
4. En la pestaña **Reservas**, agregar al final (columnas AC y AD) los encabezados **`Aviso aceptado el`** y **`Versión aviso`**. No mover ni borrar columnas existentes. Recomendado: poner las columnas D a I y X a AA con formato «Texto sin formato».
5. Revisar la pestaña Reservas por filas que no reconozcas (sobre todo nombres que empiecen con `=`, `+`, `-` o `@`). **Si la planilla muestra «Permitir acceso» para `IMAGE`/`IMPORT…`, no lo aceptes.**
6. Opcional: activador diario de `vencerPendientes` (Activadores → Añadir activador → `vencerPendientes` → Según tiempo → Diario) para marcar «vencida» las pendientes de más de 48 h o con la clase ya pasada.

## Propiedades del script (Configuración del proyecto → Propiedades del script)
| Propiedad | Para qué | Obligatoria |
|---|---|---|
| `META_CAPI_TOKEN` | API de Conversiones (aviso a Meta cuando Ara confirma) | Solo si se usa CAPI |
| `TURNSTILE_SECRET` | Activa el captcha Cloudflare Turnstile del lado del servidor | No (vacío = sin captcha) |
| `TOPE_RESERVAS_HORA` | Tope global de reservas nuevas por hora (default 30) | No |

Los secretos van **solo** en Propiedades del script, nunca en el repo ni en `reservas.js`.

## Antiabuso y validación (servidor)
- Body > 4 KB, JSON inválido, `null` o array → `{ok:false,error:"Datos inválidos."}`. Cualquier error interno → `{ok:false,error:"Error interno"}` (el detalle va a `console.error`, sin stack al cliente).
- Honeypot (`web`): responde igual que una reserva real (`RES-XXXXXX`, `pendiente`) sin escribir nada.
- Máximo **3 pendientes activas por WhatsApp** (normalizado a 549…), sin duplicados WhatsApp + clase + fecha, y tope global por hora con `CacheService`.
- Validaciones baratas antes del `LockService.tryLock` (4 s); la lectura de la planilla y la escritura van dentro del lock.
- Lista blanca de modalidades y planes según la pestaña Precios; clase de prueba solo si «Acepta clase de prueba = Sí»; fecha `AAAA-MM-DD` real, entre hoy y hoy + 60 días y del día de la clase; precio y plan siempre de la planilla; nombre 2–60, WhatsApp 8–15 dígitos, adulto 2–60 solo en Acro infantil; `acepto: true` obligatorio.
- Toda celda pasa por `celda_()`: saca caracteres de control, recorta y antepone `'` si empieza con `=`, `+`, `-`, `@`, tab o CR.
- Códigos de reserva con prefijo `RES-` (los ID de clase siguen siendo `ETR-001`…).

## Captcha opcional (Cloudflare Turnstile)
1. Leandro crea un widget en dash.cloudflare.com → Turnstile, para `espacioeter.com.ar` (y `www.`). Le da una *site key* (pública) y una *secret key*.
2. *Secret key* → Propiedades del script → `TURNSTILE_SECRET`.
3. *Site key* → `reservas.js` → `CONFIG.TURNSTILE_SITEKEY`.
4. En la CSP de `reservas.html`: sumar `https://challenges.cloudflare.com` a `script-src` y agregar `frame-src https://challenges.cloudflare.com;`.
5. Si se activa, el aviso de privacidad ya menciona Cloudflare Turnstile; si no se activa nunca, se puede sacar esa frase.
Mientras `TURNSTILE_SECRET` no exista, el servidor no lo exige; mientras la site key esté vacía, la web no carga nada de Cloudflare.

## Flujo
1. Grilla con lugares por clase (Pole: cupo − alumnas fijas − confirmadas; el resto «Cupo amplio»).
2. Día (próximas 2 semanas, hasta que empieza la clase) y modalidad: clase de prueba, clase suelta o mes.
3. Nombre, WhatsApp (y adulto responsable en Acro infantil) + aceptación de condiciones y del aviso de privacidad (se manda `acepto: true` y el servidor guarda fecha/hora y versión del aviso).
4. Recién ahí se ven precios: seña $10.000 que se descuenta; la clase de prueba no muestra precio.
5. Código de reserva (`RES-XXXXXX`), alias `espacioeter.mp` (titular Araceli Meli) con botón copiar y botón de WhatsApp con mensaje armado para mandar el comprobante (sin el nombre, para que no viaje en URLs medidas). Estado «pendiente» hasta que Ara confirma.

## Eventos (solo con consentimiento de cookies, sin datos personales)
| Paso | Meta | GA4 |
|---|---|---|
| Ve la grilla | VerHorarios (custom) | ver_horarios |
| Elige clase | ViewContent | eligio_horario |
| Sigue al formulario | IniciarReserva (custom) | iniciar_reserva |
| Reserva registrada | SolicitudReserva (custom) | solicitud_reserva |
| Abre WhatsApp | Contact (pixel.js) | clic_whatsapp (ga4.js) |
| Ara confirma | Schedule (API de Conversiones, desde el script) | — |

## Pendiente antes de publicar (con OK de Leandro)
1. Completar «Alumnas fijas» (columna L de Grilla) en las clases de Pole.
2. Hacer el «Despliegue seguro» de arriba.
3. ~~Completar en `privacidad.html` los datos del responsable y el plazo~~ — hecho el 10/11 (sin razón social ni CUIT por decisión de Leandro; sin email porque el estudio no publica uno; plazo: 12 meses).
4. ~~Enlazar `reservas.html` desde la landing~~ — hecho en esta rama (hero y grilla de `index.html`).
5. Verificar que el proyecto de Apps Script sea el **vinculado** a la planilla (se abre desde la planilla → Extensiones → Apps Script): el código usa `getActiveSpreadsheet()` + `@OnlyCurrentDoc` y en un proyecto suelto todas las reservas darían «Error interno».

## Aviso a Meta cuando Ara confirma (API de Conversiones)
- Al reservar, si la persona aceptó cookies, se guardan en la fila `_fbp`, `_fbc` (o se arma desde el `fbclid` del anuncio), la URL sin parámetros y el navegador. Sin consentimiento no se guarda nada de eso ni se avisa a Meta.
- Al tocar **Reservas → Confirmar reserva seleccionada**, el script manda un `Schedule` al píxel 1028287166250408 con el WhatsApp hasheado (SHA-256, formato 549…), fbp/fbc y `event_id` = código de reserva (no duplica si se reintenta). La columna «Aviso a Meta» queda en `enviado dd/MM HH:mm` o `error …`.
- El token viaja en el body del POST a Meta (no en la URL).
- **Token:** Administrador de eventos → píxel «mensajes Eter» → Configuración → API de Conversiones → Generar token de acceso. En Apps Script: Configuración del proyecto → Propiedades del script → `META_CAPI_TOKEN`. No vence; se cambia solo si se revoca.
- **Si falla:** llega un mail (máximo uno por día) a la cuenta que implementó el script. Las reservas siguen andando. Después de arreglar el token: **Reservas → Reintentar aviso a Meta**.
- Para optimizar: empezar por `SolicitudReserva` (más volumen) y pasar a `Schedule` cuando haya ~50 confirmadas por semana.
