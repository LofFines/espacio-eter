// Ejecuta apps-script/Code.gs en Node con mocks de Apps Script (SpreadsheetApp, CacheService, LockService,
// UrlFetchApp, PropertiesService, Utilities, ContentService, Session, MailApp). No toca nada real.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TZ = 'America/Argentina/Buenos_Aires';

function datosPreview() {
  const w = {}; vm.runInNewContext(fs.readFileSync(ROOT + '/reservas-data.js', 'utf8'), { window: w });
  return JSON.parse(JSON.stringify(w.ETER_PREVIEW_DATA));
}
function formatDate(d, tz, f) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false }).formatToParts(d).map(p => [p.type, p.value]));
  const u = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return f.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day).replace('HH', hh).replace('mm', parts.minute).replace('ss', parts.second).replace(/\bu\b/, String(u));
}
function mkSheet(name, rows, env) {
  const s = {
    rows, name,
    getName: () => name,
    getDataRange: () => ({ getValues: () => { if (env.throwOnRead) throw new Error('boom interno ' + __filename); return rows.map(r => r.slice()); } }),
    appendRow: r => { rows.push(r.slice()); env.appended.push({ sheet: name, row: r.slice() }); },
    setFrozenRows() {},
    getRange: (r, c, nr, nc) => ({
      getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) { const row = rows[r - 1 + i] || []; out.push(Array.from({ length: nc || 1 }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return out; },
      setValue: v => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; env.setValues.push({ r, c, v }); },
      getRow: () => r
    }),
    getActiveRange: () => ({ getRow: () => env.activeRow })
  };
  return s;
}
function mk(opts = {}) {
  const d = datosPreview();
  const grillaH = ['ID', 'Disciplina', 'Profe', 'Día', 'Hora inicio', 'Hora fin', 'Nivel', 'Cupo máximo', 'Activa', 'Acepta clase de prueba', 'x', 'Alumnas fijas'];
  const grilla = [grillaH, ['EJEMPLO']].concat(d.clases.map(c => [c.id, c.disciplina, c.profe, c.dia, c.inicio, c.fin, c.nivel, c.cupo == null ? '' : c.cupo, 'Sí', c.prueba ? 'Sí' : 'No', '', c.fijas]));
  grilla.push(['ETR-099', 'Pole sport', 'X', 'lunes', '19:00', '20:00', '', 8, 'Sí', 'No', '', 0]); // sin clase de prueba
  grilla.push(['ETR-098', 'Pole sport', 'X', 'lunes', '18:00', '19:00', '', 1, 'Sí', 'Sí', '', 0]);  // cupo 1
  const precios = [['Disciplina', 'Plan', 'Precio', '', 'Activo', '', '', '', ''], ['ej']].concat(d.precios.map(p => [p.disciplina, p.plan, p.precio, '', 'Sí']));
  precios[2][7] = 3; precios[2][8] = 0.1;
  const env = { appended: [], setValues: [], fetches: [], mails: [], alerts: [], cache: new Map(), props: Object.assign({}, opts.props || {}), locked: false, activeRow: 2, throwOnRead: false, fetchResp: opts.fetchResp || null, consoleErr: [] };
  const sheets = { Grilla: mkSheet('Grilla', grilla, env), Precios: mkSheet('Precios', precios, env) };
  if (opts.reservas !== false) sheets.Reservas = mkSheet('Reservas', [['Código reserva']], env);
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n, [], env)) };
  env.sheets = sheets;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => { throw new Error('openById no debería usarse'); }, getActiveSheet: () => sheets[env.activeSheet || 'Reservas'], getUi: () => ({ alert: m => env.alerts.push(m), createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }) },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ tryLock: () => (env.locked ? false : (env.locked = true)), waitLock: () => { env.locked = true; }, releaseLock: () => { env.locked = false; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (env.cache.has(k) ? env.cache.get(k) : null), put: (k, v) => env.cache.set(k, String(v)) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in env.props ? env.props[k] : null), setProperty: (k, v) => { env.props[k] = v; } }) },
    UrlFetchApp: { fetch: (url, o) => { env.fetches.push({ url, o }); const r = env.fetchResp || { code: 200, body: '{"success":true,"hostname":"espacioeter.com.ar"}' }; return { getResponseCode: () => r.code, getContentText: () => r.body }; } },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate, computeDigest: (a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' } },
    Session: { getActiveUser: () => ({ getEmail: () => 'ara@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    MailApp: { sendEmail: (...a) => env.mails.push(a) },
    console: { log() {}, error: m => env.consoleErr.push(String(m)) },
    Date, JSON, String, Number, Math, isNaN, parseInt, parseFloat, Array, Object, RegExp
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + '/apps-script/Code.gs', 'utf8'), ctx);
  const post = b => JSON.parse(ctx.doPost({ postData: { contents: typeof b === 'string' ? b : JSON.stringify(b) } }).t);
  const get = p => JSON.parse(ctx.doGet(p === undefined ? undefined : { parameter: p }).t);
  const reservas = () => (sheets.Reservas ? sheets.Reservas.rows.slice(1) : []);
  return { ctx, env, post, get, reservas, sheets };
}
// Próxima fecha (yyyy-MM-dd, hora de Buenos Aires) del día de semana pedido, desde mañana + offset semanas.
function proxima(dia, semanas = 0) {
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hoy = formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-').map(Number);
  const t = new Date(Date.UTC(hoy[0], hoy[1] - 1, hoy[2]));
  for (let i = 1; i <= 7; i++) { const x = new Date(t.getTime() + i * 864e5); if (DIAS[x.getUTCDay()] === dia) return new Date(x.getTime() + semanas * 7 * 864e5).toISOString().slice(0, 10); }
}
function sumarDias(n) { const hoy = formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-').map(Number); return new Date(Date.UTC(hoy[0], hoy[1] - 1, hoy[2]) + n * 864e5).toISOString().slice(0, 10); }
module.exports = { mk, proxima, sumarDias, formatDate };
