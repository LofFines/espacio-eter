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
  'Reprogramada desde', 'Incluida en alumnas fijas', 'Consentimiento medición', 'Notas'];

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function si_(v) { return String(v).trim().toLowerCase() === 'sí' || String(v).trim().toLowerCase() === 'si'; }
function hhmm_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v).trim(); }

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
      b.consentimientoMedicion === 'Sí' ? 'Sí' : 'No', '']);
    return json_({ ok: true, codigo: codigo, estado: 'pendiente' });
  } finally { lock.releaseLock(); }
}

/* ---------- Panel de Ara dentro de la planilla ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Reservas')
    .addItem('Confirmar reserva seleccionada (seña verificada)', 'confirmarSeleccionada')
    .addItem('Marcar como rechazada / cancelada', 'rechazarSeleccionada')
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
}
function confirmarSeleccionada() { cambiarEstado_('confirmada'); }
function rechazarSeleccionada() { cambiarEstado_('cancelada'); }
