/** @OnlyCurrentDoc */
/**
 * API de reservas de Espacio Éter (Google Apps Script, vinculado a la planilla).
 * Planilla: «Éter – Grilla de horarios y cupos» (pestañas Grilla, Precios y Reservas).
 *
 * ESTADO REAL (10/11/2026): hay una implementación web app ACTIVA (ejecutar como Leandro, acceso «Cualquier usuario»)
 * y su URL /exec está en reservas.js (CONFIG.API_URL), en un repo público. Cualquier cambio de este archivo
 * NO llega a producción hasta que alguien lo pega en el editor de Apps Script y vuelve a implementar (ver README).
 *
 *  GET  ?accion=datos  → clases activas, precios activos, combo y confirmadas por fecha (sin datos personales).
 *  POST {accion:'reservar', ...} → valida TODO del lado del servidor y agrega una fila «pendiente» en Reservas.
 *  Menú «Reservas» en la planilla (solo para quien la edita, Ara): confirmar / rechazar la fila seleccionada.
 *
 * Reglas: seña $10.000; pendientes no ocupan cupo; lugares = cupo − alumnas fijas − confirmadas;
 * cupo vacío = cupo amplio; se puede reservar hasta que empieza la clase y hasta DIAS_MAX días adelante.
 *
 * Seguridad:
 *  - Toda celda que se escribe pasa por celda_() (neutraliza fórmulas: = + - @ tab CR).
 *  - Antiabuso: tope de tamaño del body, honeypot indistinguible, captcha Turnstile opcional
 *    (Script Property TURNSTILE_SECRET), máx. MAX_PENDIENTES_WA pendientes activas por WhatsApp,
 *    tope global por hora (Script Property TOPE_RESERVAS_HORA, default 30) y sin duplicados WhatsApp+clase+fecha.
 *  - Los errores devuelven JSON genérico, sin stack.
 */
var SENA = 10000;
var TZ = 'America/Argentina/Buenos_Aires';
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MAX_BODY = 4096;            // bytes aprox. del body del POST
var DIAS_MAX = 60;              // se puede reservar desde hoy hasta hoy + 60 días
var MAX_PENDIENTES_WA = 3;      // pendientes activas por WhatsApp normalizado
var TOPE_HORA_DEFAULT = 30;     // reservas nuevas por hora (todas juntas); configurable con TOPE_RESERVAS_HORA
var AVISO_VERSION = '2026-11-10'; // versión de privacidad.html que acepta la persona (cambiarla junto con el aviso)
var TURNSTILE_HOSTS = ['espacioeter.com.ar', 'www.espacioeter.com.ar'];
var COLS = ['Código reserva', 'ID ocurrencia', 'Creada el', 'Nombre', 'WhatsApp', 'Adulto responsable', 'Modalidad', 'Disciplina', 'Plan/Frecuencia',
  'ID clase', 'Fecha clase', 'Hora inicio', 'Estado', 'Precio acordado', 'Seña', 'Seña verificada', 'Referencia pago', 'Confirmada el', 'Confirmada por',
  'Reprogramada desde', 'Incluida en alumnas fijas', 'Consentimiento medición', 'Notas',
  'fbp', 'fbc', 'URL origen', 'Navegador', 'Aviso a Meta',
  // Columnas nuevas (solo al final): constancia de aceptación del aviso de privacidad.
  'Aviso aceptado el', 'Versión aviso'];
// Columnas (1-based) usadas por el panel de Ara y la API de Conversiones.
var C = { ID_OCURRENCIA: 2, ESTADO: 13, ID_CLASE: 10, FECHA: 11, CONSENT: 22, FBP: 24, FBC: 25, URL: 26, UA: 27, AVISO: 28 };
// API de Conversiones de Meta: el token va en Propiedades del script (META_CAPI_TOKEN), nunca en la web ni en el repo.
var PIXEL_ID = '1028287166250408';

var ss__ = null;
// Script vinculado: getActiveSpreadsheet() funciona también desde la web app y, con @OnlyCurrentDoc,
// el script solo tiene acceso a ESTA planilla (no a todas las de la cuenta).
function ss_() { return ss__ || (ss__ = SpreadsheetApp.getActiveSpreadsheet()); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function si_(v) { return String(v).trim().toLowerCase() === 'sí' || String(v).trim().toLowerCase() === 'si'; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

/**
 * Neutraliza inyección de fórmulas en Sheets: convierte a String, saca caracteres de control,
 * recorta a max y, si empieza con = + - @ (o tab/CR), antepone ' para que quede como texto.
 */
function celda_(v, max) {
  var orig = String(v == null ? '' : v);
  var s = orig.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim().slice(0, max || 100);
  var peligro = /^[=+\-@]/.test(s) || /^\s*[=+\-@\t\r]/.test(orig);
  return peligro && s.charAt(0) !== "'" ? "'" + s : s;
}
// Aplica celda_ a cada valor de texto de la fila; números y fechas los genera el servidor y van tal cual.
function filaSegura_(arr) {
  return arr.map(function (v) { return (typeof v === 'number' || v instanceof Date) ? v : celda_(v, 500); });
}

// Horas: Date de 1899, fracción del día (0.79 = 19:00) o texto «19:00».
function hhmm_(v) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; if (v instanceof Date) return p(v.getHours()) + ':' + p(v.getMinutes()); var s = String(v).trim(); if (typeof v === 'number' || /^\d*\.\d+$/.test(s)) { var m = Math.round(Number(s) * 1440) % 1440; return p(Math.floor(m / 60)) + ':' + p(m % 60); } var t = s.match(/^(\d{1,2}):(\d{2})/); return t ? p(Number(t[1])) + ':' + t[2] : s; }

// Fecha «yyyy-MM-dd» canónica a partir de un texto o de un Date de la planilla. null si no es una fecha real.
function fechaIso_(v) {
  if (v instanceof Date) return isNaN(v) ? null : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return s;
}
function diaNum_(iso) { var p = iso.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
function diaSemana_(iso) { var p = iso.split('-'); return DIAS[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()]; }
function hoyIso_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
// Clave de ocurrencia SIEMPRE con la fecha normalizada (evita «+002026-11-16» ≠ «2026-11-16»).
function ocurrencia_(claseId, fecha) { var f = fechaIso_(fecha); return f ? String(claseId) + '|' + f : null; }
function ocurrenciaDeFila_(f) { return ocurrencia_(f[C.ID_CLASE - 1], f[C.FECHA - 1]) || String(f[C.ID_OCURRENCIA - 1]); }

// Normaliza un celular argentino a formato internacional sin «+» (ej. 5491123456789), como pide Meta.
function telefonoAR_(wa) {
  var d = String(wa).replace(/\D/g, '');
  if (d.indexOf('54') === 0) d = d.slice(2);
  if (d.charAt(0) === '0') d = d.slice(1);
  if (d.charAt(0) === '9') d = d.slice(1);
  if (d.length === 12 && d.slice(2, 4) === '15') d = d.slice(0, 2) + d.slice(4); // 11 15 xxxx xxxx
  return '549' + d;
}
function codigoReserva_() {
  // Prefijo RES- para no confundir con los ID de clase (ETR-001…). Mismo formato también para el honeypot.
  return 'RES-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function leerClases_() {
  var v = ss_().getSheetByName('Grilla').getDataRange().getValues();
  var h = v[0].map(String), out = [];
  var ix = function (n) { return h.indexOf(n); };
  for (var r = 2; r < v.length; r++) { // fila 2 = EJEMPLO
    var f = v[r];
    if (!f[ix('ID')] || !si_(f[ix('Activa')])) continue;
    out.push({
      id: String(f[ix('ID')]), disciplina: String(f[ix('Disciplina')]), profe: String(f[ix('Profe')]),
      dia: String(f[ix('Día')]).trim().toLowerCase(), inicio: hhmm_(f[ix('Hora inicio')]), fin: hhmm_(f[ix('Hora fin')]),
      nivel: String(f[ix('Nivel')] || ''), cupo: f[ix('Cupo máximo')] === '' ? null : Number(f[ix('Cupo máximo')]),
      fijas: Number(f[ix('Alumnas fijas')] || 0), prueba: si_(f[ix('Acepta clase de prueba')])
    });
  }
  return out;
}
function leerPrecios_() {
  var v = ss_().getSheetByName('Precios').getDataRange().getValues(), out = [], combo = null;
  for (var r = 2; r < v.length; r++) {
    if (v[r][0] && si_(v[r][4])) out.push({ disciplina: String(v[r][0]), plan: String(v[r][1]), precio: Number(v[r][2]) });
  }
  if (v[2] && v[2][7]) combo = { disciplinas: parseInt(v[2][7], 10) || 3, descuento: (function (d) { d = parseFloat(d) || 10; return d < 1 ? d * 100 : d; })(v[2][8]) }; // H3:I3
  return { precios: out, combo: combo };
}
function hojaReservas_() {
  var s = ss_().getSheetByName('Reservas');
  if (!s) { s = ss_().insertSheet('Reservas'); s.appendRow(COLS); s.setFrozenRows(1); }
  return s;
}
function filasReservas_() { return hojaReservas_().getDataRange().getValues(); }
function confirmadas_(v) {
  v = v || filasReservas_();
  var out = {};
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][C.ESTADO - 1]).toLowerCase() !== 'confirmada' || si_(v[r][20])) continue;
    var k = ocurrenciaDeFila_(v[r]); out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function doGet(e) {
  try {
    var accion = e && e.parameter ? String(e.parameter.accion || '') : '';
    if (accion !== 'datos') return json_({ ok: false, error: 'acción inválida' });
    var p = leerPrecios_();
    return json_({ ok: true, clases: leerClases_(), precios: p.precios, combo: p.combo, confirmadas: confirmadas_() });
  } catch (err) {
    console.error('doGet: ' + (err && err.stack || err));
    return json_({ ok: false, error: 'Error interno' });
  }
}

/* ---------- Captcha (Cloudflare Turnstile), opcional ---------- */
// Se activa solo si existe la Script Property TURNSTILE_SECRET (la carga Leandro a mano; nunca en el repo).
function turnstileOk_(token) {
  var secret = prop_('TURNSTILE_SECRET');
  if (!secret) return true; // desactivado
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    var res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post', payload: { secret: secret, response: token }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return false;
    var d = JSON.parse(res.getContentText());
    return d.success === true && (!d.hostname || TURNSTILE_HOSTS.indexOf(d.hostname) >= 0);
  } catch (err) {
    console.error('turnstile: ' + err);
    return false;
  }
}

function topeHora_() { var n = parseInt(prop_('TOPE_RESERVAS_HORA'), 10); return n > 0 ? n : TOPE_HORA_DEFAULT; }
function claveHora_() { return 'h:' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH'); }
function opcional_(v, max) { return v == null || v === '' || (typeof v === 'string' && v.length <= max); }

var ERR = {
  datos: 'Datos inválidos.',
  nombre: 'Revisá tu nombre (entre 2 y 60 caracteres).',
  wa: 'Revisá el número de WhatsApp (entre 8 y 15 dígitos).',
  acepto: 'Tenés que aceptar las condiciones y el aviso de privacidad.',
  modalidad: 'Modalidad inválida.',
  fecha: 'Fecha inválida.',
  rango: 'Solo se puede reservar desde hoy y hasta ' + DIAS_MAX + ' días adelante.',
  captcha: 'No pudimos verificar que no seas un robot. Recargá la página y probá de nuevo.',
  tope: 'Hay muchas reservas en este momento. Probá en un rato o escribinos por WhatsApp.',
  pendientes: 'Ya tenés reservas pendientes. Pagá la seña o escribinos por WhatsApp.',
  ocupado: 'Hay mucha gente reservando, probá en unos segundos.'
};

function doPost(e) {
  try { return reservar_(e); } catch (err) {
    console.error('doPost: ' + (err && err.stack || err));
    return json_({ ok: false, error: 'Error interno' });
  }
}

function reservar_(e) {
  // 1) Validaciones baratas, sin tocar la planilla ni tomar el lock.
  var raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (!raw || raw.length > MAX_BODY) return json_({ ok: false, error: ERR.datos });
  var b;
  try { b = JSON.parse(raw); } catch (_) { return json_({ ok: false, error: ERR.datos }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json_({ ok: false, error: ERR.datos });
  if (b.accion !== 'reservar') return json_({ ok: false, error: ERR.datos });
  if (typeof b.claseId !== 'string' || !/^[A-Za-z0-9_-]{1,20}$/.test(b.claseId)) return json_({ ok: false, error: ERR.datos });
  if (!opcional_(b.plan, 60) || !opcional_(b.adulto, 60) || !opcional_(b.web, 200) || !opcional_(b.fbp, 200) || !opcional_(b.fbc, 300) ||
    !opcional_(b.url, 300) || !opcional_(b.ua, 400) || !opcional_(b.turnstile, 2048)) return json_({ ok: false, error: ERR.datos });
  if (b.consentimientoMedicion != null && b.consentimientoMedicion !== 'Sí' && b.consentimientoMedicion !== 'No') return json_({ ok: false, error: ERR.datos });
  if (typeof b.nombre !== 'string') return json_({ ok: false, error: ERR.nombre });
  var nombre = b.nombre.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (nombre.length < 2 || nombre.length > 60) return json_({ ok: false, error: ERR.nombre });
  if (typeof b.whatsapp !== 'string' || b.whatsapp.length > 25 || /[^\d+\s().-]/.test(b.whatsapp)) return json_({ ok: false, error: ERR.wa });
  var waDig = b.whatsapp.replace(/\D/g, '');
  if (waDig.length < 8 || waDig.length > 15) return json_({ ok: false, error: ERR.wa });
  var wa = (b.whatsapp.trim().charAt(0) === '+' ? '+' : '') + waDig;
  var waKey = telefonoAR_(waDig);
  if (b.acepto !== true) return json_({ ok: false, error: ERR.acepto });
  if (['prueba', 'suelta', 'mes'].indexOf(b.modalidad) < 0) return json_({ ok: false, error: ERR.modalidad });
  if (b.modalidad === 'mes' && (typeof b.plan !== 'string' || !b.plan)) return json_({ ok: false, error: 'Elegí un plan.' });
  var fechaIso = typeof b.fecha === 'string' ? fechaIso_(b.fecha) : null;
  if (!fechaIso) return json_({ ok: false, error: ERR.fecha });
  var dif = diaNum_(fechaIso) - diaNum_(hoyIso_());
  if (dif < 0 || dif > DIAS_MAX) return json_({ ok: false, error: ERR.rango });

  // 2) Captcha (si está activado).
  if (!turnstileOk_(b.turnstile)) return json_({ ok: false, error: ERR.captcha });

  // 3) Honeypot: respuesta indistinguible de una reserva válida, sin escribir nada.
  if (b.web) return json_({ ok: true, codigo: codigoReserva_(), estado: 'pendiente' });

  // 4) Topes con caché (baratos) antes del lock.
  var cache = CacheService.getScriptCache();
  var kHora = claveHora_(), kWa = 'wa:' + waKey, tope = topeHora_();
  if (Number(cache.get(kHora) || 0) >= tope) return json_({ ok: false, error: ERR.tope });
  if (Number(cache.get(kWa) || 0) >= MAX_PENDIENTES_WA) return json_({ ok: false, error: ERR.pendientes });

  // 5) Lock corto: lectura de la planilla, validaciones contra datos reales y escritura.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) return json_({ ok: false, error: ERR.ocupado });
  try {
    var nHora = Number(cache.get(kHora) || 0);
    if (nHora >= tope) return json_({ ok: false, error: ERR.tope });
    var clase = leerClases_().filter(function (c) { return c.id === b.claseId; })[0];
    if (!clase) return json_({ ok: false, error: 'Esa clase ya no está disponible.' });
    if (diaSemana_(fechaIso) !== clase.dia || !/^\d{2}:\d{2}$/.test(clase.inicio)) return json_({ ok: false, error: ERR.fecha });
    var inicio = new Date(fechaIso + 'T' + clase.inicio + ':00-03:00');
    if (isNaN(inicio) || inicio <= new Date()) return json_({ ok: false, error: 'Esa clase ya empezó.' });
    var infantil = /infantil/i.test(clase.disciplina);
    var adulto = typeof b.adulto === 'string' ? b.adulto.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (infantil && (adulto.length < 2 || adulto.length > 60)) return json_({ ok: false, error: 'Poné el nombre de la persona adulta responsable.' });
    if (!infantil) adulto = '';

    // Lista blanca de modalidades y planes según la planilla; el precio lo calcula siempre el servidor.
    var precios = leerPrecios_().precios.filter(function (p) { return p.disciplina === clase.disciplina; });
    var precio = '', plan = '';
    if (b.modalidad === 'prueba' && !clase.prueba) return json_({ ok: false, error: 'Esa clase no tiene clase de prueba.' });
    if (b.modalidad === 'suelta') {
      var ps = precios.filter(function (p) { return /suelta/i.test(p.plan); })[0];
      if (!ps) return json_({ ok: false, error: 'Esa modalidad no está disponible para esta clase.' });
      precio = ps.precio;
    }
    if (b.modalidad === 'mes') {
      var pm = precios.filter(function (p) { return p.plan === b.plan && !/suelta/i.test(p.plan); })[0];
      if (!pm) return json_({ ok: false, error: 'Plan inválido.' });
      precio = pm.precio; plan = pm.plan; // se escribe el plan de la planilla, no el que mandó el cliente
    }

    var ocurrencia = ocurrencia_(clase.id, fechaIso);
    var filas = filasReservas_(), hoy = hoyIso_(), pendientesWa = 0;
    for (var r = 1; r < filas.length; r++) {
      var f = filas[r], est = String(f[C.ESTADO - 1]).toLowerCase();
      if (telefonoAR_(f[4]) !== waKey) continue;
      if ((est === 'pendiente' || est === 'confirmada') && ocurrenciaDeFila_(f) === ocurrencia) return json_({ ok: false, error: 'Ya hay una reserva con ese WhatsApp para esa clase y fecha.' });
      var ff = fechaIso_(f[C.FECHA - 1]);
      if (est === 'pendiente' && (!ff || ff >= hoy)) pendientesWa++;
    }
    if (pendientesWa >= MAX_PENDIENTES_WA) return json_({ ok: false, error: ERR.pendientes });
    if (clase.cupo != null) {
      var libres = clase.cupo - clase.fijas - (confirmadas_(filas)[ocurrencia] || 0);
      if (libres <= 0) return json_({ ok: false, error: 'Esa clase está completa. Elegí otro día.' });
    }

    var med = b.consentimientoMedicion === 'Sí';
    var codigo = codigoReserva_();
    var ahora = new Date();
    hojaReservas_().appendRow(filaSegura_([
      codigo, ocurrencia, ahora, celda_(nombre, 60), "'" + wa, celda_(adulto, 60), b.modalidad, celda_(clase.disciplina, 80),
      celda_(plan, 60), celda_(clase.id, 20), fechaIso, clase.inicio, 'pendiente', precio, SENA, 'No', '', '', '', '', 'No',
      med ? 'Sí' : 'No', '',
      // Datos de medición: solo si la persona aceptó cookies.
      med ? celda_(b.fbp, 200) : '',
      med ? celda_(b.fbc, 300) : '',
      med ? celda_(String(b.url || '').split(/[?#]/)[0], 300) : '',
      med ? celda_(b.ua, 400) : '',
      med ? 'pendiente' : 'sin consentimiento',
      Utilities.formatDate(ahora, TZ, 'yyyy-MM-dd HH:mm:ss'), AVISO_VERSION
    ]));
    cache.put(kHora, String(nHora + 1), 3600);
    cache.put(kWa, String(pendientesWa + 1), 6 * 3600);
    return json_({ ok: true, codigo: codigo, estado: 'pendiente' });
  } finally { lock.releaseLock(); }
}

/* ---------- Panel de Ara dentro de la planilla ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Reservas')
    .addItem('Confirmar reserva seleccionada (seña verificada)', 'confirmarSeleccionada')
    .addItem('Marcar como rechazada / cancelada', 'rechazarSeleccionada')
    .addItem('Reintentar aviso a Meta', 'reintentarAvisoMeta')
    .addToUi();
}
function cambiarEstado_(estado) {
  var s = SpreadsheetApp.getActiveSheet();
  if (s.getName() !== 'Reservas') { SpreadsheetApp.getUi().alert('Parate en una fila de la pestaña Reservas.'); return; }
  var r = s.getActiveRange().getRow();
  if (r < 2) return;
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (estado === 'confirmada') {
      var fila = s.getRange(r, 1, 1, COLS.length).getValues()[0];
      var oc = ocurrencia_(fila[C.ID_CLASE - 1], fila[C.FECHA - 1]);
      if (!oc) { SpreadsheetApp.getUi().alert('La fecha de esa fila no es válida (tiene que ser una fecha real). Revisala antes de confirmar.'); return; }
      var clase = leerClases_().filter(function (c) { return c.id === String(fila[C.ID_CLASE - 1]); })[0];
      if (clase && clase.cupo != null) {
        var libres = clase.cupo - clase.fijas - (confirmadas_()[oc] || 0);
        if (libres <= 0 && String(fila[C.ESTADO - 1]) !== 'confirmada') { SpreadsheetApp.getUi().alert('No quedan lugares en esa fecha.'); return; }
      }
      s.getRange(r, 16).setValue('Sí');
      s.getRange(r, 18).setValue(new Date());
      s.getRange(r, 19).setValue(celda_(Session.getActiveUser().getEmail() || 'Ara', 100));
    }
    s.getRange(r, C.ESTADO).setValue(celda_(estado, 20));
  } finally { lock.releaseLock(); }
  if (estado === 'confirmada') avisarMeta_(s, r);
}

/**
 * Opcional: marcar como «vencida» las pendientes de más de 48 h o cuya clase ya pasó.
 * Para activarlo, Leandro crea un activador diario (Activadores → Añadir → vencerPendientes → Según tiempo → Diario).
 */
function vencerPendientes() {
  var s = hojaReservas_(), v = s.getDataRange().getValues(), hoy = hoyIso_(), lim = Date.now() - 48 * 3600 * 1000, n = 0;
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][C.ESTADO - 1]).toLowerCase() !== 'pendiente') continue;
    var ff = fechaIso_(v[r][C.FECHA - 1]), creada = v[r][2] instanceof Date ? v[r][2].getTime() : NaN;
    if ((ff && ff < hoy) || (!isNaN(creada) && creada < lim)) { s.getRange(r + 1, C.ESTADO).setValue('vencida'); n++; }
  }
  return n;
}

/* ---------- API de Conversiones: «Schedule» cuando Ara confirma ---------- */
function sha256_(txt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function avisarMeta_(s, r) {
  var fila = s.getRange(r, 1, 1, C.AVISO).getValues()[0];
  var celda = s.getRange(r, C.AVISO);
  if (String(fila[C.CONSENT - 1]) !== 'Sí') { celda.setValue('sin consentimiento'); return; }
  if (String(fila[C.AVISO - 1]).indexOf('enviado') === 0) return; // ya se mandó (no duplicar)
  var token = prop_('META_CAPI_TOKEN');
  if (!token) { celda.setValue('error: falta META_CAPI_TOKEN'); avisarError_('Falta cargar el token de la API de Conversiones en el script.'); return; }
  var user = { ph: [sha256_(telefonoAR_(fila[4]))], country: [sha256_('ar')] };
  if (fila[C.FBP - 1]) user.fbp = String(fila[C.FBP - 1]).replace(/^'/, '');
  if (fila[C.FBC - 1]) user.fbc = String(fila[C.FBC - 1]).replace(/^'/, '');
  if (fila[C.UA - 1]) user.client_user_agent = String(fila[C.UA - 1]).replace(/^'/, '');
  var evento = {
    event_name: 'Schedule',
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(fila[0]), // código de reserva: evita duplicados si se reintenta
    action_source: 'website',
    event_source_url: String(fila[C.URL - 1] || 'https://espacioeter.com.ar/reservas.html').replace(/^'/, ''),
    user_data: user,
    custom_data: { content_name: String(fila[7]), content_category: String(fila[6]) }
  };
  try {
    // El token va en el body (no en la URL) para que no quede en logs de URLs.
    var res = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + PIXEL_ID + '/events', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ data: [evento], access_token: token }), muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      celda.setValue('enviado ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm'));
    } else {
      celda.setValue('error ' + res.getResponseCode());
      avisarError_('Meta rechazó el aviso de la reserva ' + fila[0] + ' (código ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 500));
    }
  } catch (e) {
    celda.setValue('error de conexión');
    avisarError_('No se pudo conectar con Meta para la reserva ' + fila[0] + ': ' + e.message);
  }
}
// Mail a quien implementó el script (Leandro), como máximo uno por día para no llenar la casilla.
function avisarError_(txt) {
  var props = PropertiesService.getScriptProperties();
  var hoy = hoyIso_();
  if (props.getProperty('ULTIMO_AVISO_ERROR') === hoy) return;
  props.setProperty('ULTIMO_AVISO_ERROR', hoy);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Reservas Éter: falló el aviso a Meta',
    txt + '\n\nLas reservas siguen funcionando; solo se cortó el envío a Meta. Si el token dejó de andar, generá uno nuevo en el Administrador de eventos y reemplazalo en Propiedades del script (META_CAPI_TOKEN). Después, en la planilla: Reservas → Reintentar aviso a Meta.');
}
function reintentarAvisoMeta() {
  var s = SpreadsheetApp.getActiveSheet();
  if (s.getName() !== 'Reservas') { SpreadsheetApp.getUi().alert('Parate en la pestaña Reservas.'); return; }
  var v = s.getDataRange().getValues(), n = 0;
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][C.ESTADO - 1]) === 'confirmada' && String(v[r][C.AVISO - 1]).indexOf('error') === 0) { avisarMeta_(s, r + 1); n++; }
  }
  SpreadsheetApp.getUi().alert('Reintentadas: ' + n);
}
function confirmarSeleccionada() { cambiarEstado_('confirmada'); }
function rechazarSeleccionada() { cambiarEstado_('cancelada'); }
