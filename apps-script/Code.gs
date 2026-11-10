/**
 * API de reservas de Espacio Éter (Google Apps Script) — PROTOTIPO, NO DESPLEGADO.
 * Planilla: «Éter – Grilla de horarios y cupos» (pestañas Grilla, Precios y Reservas).
 *
 *  GET  ?accion=datos  → clases activas, precios activos, combo y confirmadas por fecha (sin datos personales).
 *  POST {accion:'reservar', ...} → valida y agrega una fila «pendiente» en Reservas. Devuelve el código.
 *  Menú «Reservas» en la planilla (solo para quien la edita, Ara): confirmar / rechazar la fila seleccionada.
 *
 * Reglas: seña $10.000; pendientes no ocupan cupo; lugares = cupo − alumnas fijas − confirmadas;
 * cupo vacío = cupo amplio; se puede reservar hasta que empieza la clase.
 */
var SHEET_ID = '1a8DpmwzTYMlOZyMw_Xyu5xJgqQ70dlyfbrvRajhweRM';
var SENA = 10000;
var TZ = 'America/Argentina/Buenos_Aires';
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var COLS = ['Código reserva', 'ID ocurrencia', 'Creada el', 'Nombre', 'WhatsApp', 'Adulto responsable', 'Modalidad', 'Disciplina', 'Plan/Frecuencia',
  'ID clase', 'Fecha clase', 'Hora inicio', 'Estado', 'Precio acordado', 'Seña', 'Seña verificada', 'Referencia pago', 'Confirmada el', 'Confirmada por',
  'Reprogramada desde', 'Incluida en alumnas fijas', 'Consentimiento medición', 'Notas',
  'fbp', 'fbc', 'URL origen', 'Navegador', 'Aviso a Meta'];
// Columnas (1-based) usadas por el panel de Ara y la API de Conversiones.
var C = { CONSENT: 22, FBP: 24, FBC: 25, URL: 26, UA: 27, AVISO: 28 };
// API de Conversiones de Meta: el token va en Propiedades del script (META_CAPI_TOKEN), nunca en la web ni en el repo.
var PIXEL_ID = '1028287166250408';

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function si_(v) { return String(v).trim().toLowerCase() === 'sí' || String(v).trim().toLowerCase() === 'si'; }
// Horas: Date de 1899, fracción del día (0.79 = 19:00) o texto «19:00».
function hhmm_(v) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; if (v instanceof Date) return p(v.getHours()) + ':' + p(v.getMinutes()); var s = String(v).trim(); if (typeof v === 'number' || /^\d*\.\d+$/.test(s)) { var m = Math.round(Number(s) * 1440) % 1440; return p(Math.floor(m / 60)) + ':' + p(m % 60); } var t = s.match(/^(\d{1,2}):(\d{2})/); return t ? p(Number(t[1])) + ':' + t[2] : s; }


function leerClases_() {
  var v = ss_().getSheetByName('Grilla').getDataRange().getValues();
  var h = v[0].map(String), out = [];
  var ix = function (n) { return h.indexOf(n); };
  for (var r = 2; r < v.length; r++) { // fila 2 = EJEMPLO
    var f = v[r];
    if (!f[ix('ID')] || !si_(f[ix('Activa')])) continue;
    out.push({
      id: String(f[ix('ID')]), disciplina: String(f[ix('Disciplina')]), profe: String(f[ix('Profe')]),
      dia: String(f[ix('Día')]).toLowerCase(), inicio: hhmm_(f[ix('Hora inicio')]), fin: hhmm_(f[ix('Hora fin')]),
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
function confirmadas_() {
  var v = hojaReservas_().getDataRange().getValues(), out = {};
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][12]).toLowerCase() !== 'confirmada' || si_(v[r][20])) continue;
    var k = v[r][1]; out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function doGet(e) {
  if ((e.parameter.accion || '') !== 'datos') return json_({ ok: false, error: 'acción inválida' });
  var p = leerPrecios_();
  return json_({ ok: true, clases: leerClases_(), precios: p.precios, combo: p.combo, confirmadas: confirmadas_() });
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: 'Datos inválidos' }); }
  if (b.web) return json_({ ok: true, codigo: 'ETR-XXXXX', estado: 'pendiente' }); // honeypot: bot
  var nombre = String(b.nombre || '').trim().slice(0, 80), wa = String(b.whatsapp || '').replace(/[^\d+]/g, '').slice(0, 20);
  if (nombre.length < 3 || wa.replace(/\D/g, '').length < 8) return json_({ ok: false, error: 'Revisá nombre y WhatsApp.' });
  if (['prueba', 'suelta', 'mes'].indexOf(b.modalidad) < 0) return json_({ ok: false, error: 'Modalidad inválida.' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, error: 'Hay mucha gente reservando, probá en unos segundos.' });
  try {
    var clase = leerClases_().filter(function (c) { return c.id === b.claseId; })[0];
    if (!clase) return json_({ ok: false, error: 'Esa clase ya no está disponible.' });
    var fecha = new Date(b.fecha + 'T' + clase.inicio + ':00-03:00');
    if (isNaN(fecha) || DIAS[Number(Utilities.formatDate(fecha, TZ, 'u')) % 7] !== clase.dia) return json_({ ok: false, error: 'Fecha inválida.' });
    if (fecha <= new Date()) return json_({ ok: false, error: 'Esa clase ya empezó.' });
    var ocurrencia = clase.id + '|' + b.fecha;
    if (clase.cupo != null) {
      var libres = clase.cupo - clase.fijas - (confirmadas_()[ocurrencia] || 0);
      if (libres <= 0) return json_({ ok: false, error: 'Esa clase está completa. Elegí otro día.' });
    }
    var precios = leerPrecios_().precios.filter(function (p) { return p.disciplina === clase.disciplina; });
    var precio = '';
    if (b.modalidad === 'suelta') precio = (precios.filter(function (p) { return /suelta/i.test(p.plan); })[0] || {}).precio || '';
    if (b.modalidad === 'mes') precio = (precios.filter(function (p) { return p.plan === b.plan; })[0] || {}).precio || '';
    var codigo = 'ETR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
    hojaReservas_().appendRow([codigo, ocurrencia, new Date(), nombre, "'" + wa, String(b.adulto || '').slice(0, 80), b.modalidad, clase.disciplina,
      b.modalidad === 'mes' ? b.plan : '', clase.id, b.fecha, clase.inicio, 'pendiente', precio, SENA, 'No', '', '', '', '', 'No',
      b.consentimientoMedicion === 'Sí' ? 'Sí' : 'No', '',
      // Datos de medición: solo si la persona aceptó cookies.
      b.consentimientoMedicion === 'Sí' ? String(b.fbp || '').slice(0, 200) : '',
      b.consentimientoMedicion === 'Sí' ? String(b.fbc || '').slice(0, 300) : '',
      b.consentimientoMedicion === 'Sí' ? String(b.url || '').split('?')[0].slice(0, 300) : '',
      b.consentimientoMedicion === 'Sí' ? String(b.ua || '').slice(0, 400) : '',
      b.consentimientoMedicion === 'Sí' ? 'pendiente' : 'sin consentimiento']);
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
      var clase = leerClases_().filter(function (c) { return c.id === fila[9]; })[0];
      if (clase && clase.cupo != null) {
        var libres = clase.cupo - clase.fijas - (confirmadas_()[fila[1]] || 0);
        if (libres <= 0 && String(fila[12]) !== 'confirmada') { SpreadsheetApp.getUi().alert('No quedan lugares en esa fecha.'); return; }
      }
      s.getRange(r, 16).setValue('Sí');
      s.getRange(r, 18).setValue(new Date());
      s.getRange(r, 19).setValue(Session.getActiveUser().getEmail() || 'Ara');
    }
    s.getRange(r, 13).setValue(estado);
  } finally { lock.releaseLock(); }
  if (estado === 'confirmada') avisarMeta_(s, r);
}

/* ---------- API de Conversiones: «Schedule» cuando Ara confirma ---------- */
function sha256_(txt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
// Normaliza un celular argentino a formato internacional sin «+» (ej. 5491123456789), como pide Meta.
function telefonoAR_(wa) {
  var d = String(wa).replace(/\D/g, '');
  if (d.indexOf('54') === 0) d = d.slice(2);
  if (d.charAt(0) === '0') d = d.slice(1);
  if (d.charAt(0) === '9') d = d.slice(1);
  if (d.length === 12 && d.slice(2, 4) === '15') d = d.slice(0, 2) + d.slice(4); // 11 15 xxxx xxxx
  return '549' + d;
}
function avisarMeta_(s, r) {
  var fila = s.getRange(r, 1, 1, C.AVISO).getValues()[0];
  var celda = s.getRange(r, C.AVISO);
  if (String(fila[C.CONSENT - 1]) !== 'Sí') { celda.setValue('sin consentimiento'); return; }
  if (String(fila[C.AVISO - 1]).indexOf('enviado') === 0) return; // ya se mandó (no duplicar)
  var token = PropertiesService.getScriptProperties().getProperty('META_CAPI_TOKEN');
  if (!token) { celda.setValue('error: falta META_CAPI_TOKEN'); avisarError_('Falta cargar el token de la API de Conversiones en el script.'); return; }
  var user = { ph: [sha256_(telefonoAR_(fila[4]))], country: [sha256_('ar')] };
  if (fila[C.FBP - 1]) user.fbp = String(fila[C.FBP - 1]);
  if (fila[C.FBC - 1]) user.fbc = String(fila[C.FBC - 1]);
  if (fila[C.UA - 1]) user.client_user_agent = String(fila[C.UA - 1]);
  var evento = {
    event_name: 'Schedule',
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(fila[0]), // código de reserva: evita duplicados si se reintenta
    action_source: 'website',
    event_source_url: String(fila[C.URL - 1] || 'https://espacioeter.com.ar/reservas.html'),
    user_data: user,
    custom_data: { content_name: String(fila[7]), content_category: String(fila[6]) }
  };
  try {
    var res = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + PIXEL_ID + '/events?access_token=' + encodeURIComponent(token), {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ data: [evento] }), muteHttpExceptions: true
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
  var hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
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
    if (String(v[r][12]) === 'confirmada' && String(v[r][C.AVISO - 1]).indexOf('error') === 0) { avisarMeta_(s, r + 1); n++; }
  }
  SpreadsheetApp.getUi().alert('Reintentadas: ' + n);
}
function confirmarSeleccionada() { cambiarEstado_('confirmada'); }
function rechazarSeleccionada() { cambiarEstado_('cancelada'); }
