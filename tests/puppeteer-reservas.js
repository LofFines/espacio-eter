// Puppeteer-core sobre el servidor local (puerto 8822). Backend del Apps Script MOCKEADO con request interception:
// ningún request llega a script.google.com. Meta/Google/Cloudflare se abortan. node tests/puppeteer-reservas.js
const puppeteer = require(process.env.PPTR || '/workspace/reservas-preview/tool/node_modules/puppeteer-core');
const fs = require('fs'), vm = require('vm');
const BASE = process.env.BASE || 'http://localhost:8822';
const w = {}; vm.runInNewContext(fs.readFileSync(__dirname + '/../reservas-data.js', 'utf8'), { window: w });
const DATOS = JSON.parse(JSON.stringify(w.ETER_PREVIEW_DATA));
const res = []; const ck = (n, c, i) => res.push((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '  → ' + JSON.stringify(i)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(b, datos, log) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(() => { document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective)); });
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = new URL(r.url());
    if (u.hostname === 'localhost') return r.continue();
    if (/script\.google(usercontent)?\.com$/.test(u.hostname)) {
      if (r.method() === 'POST') { log.posts.push(JSON.parse(r.postData() || 'null')); return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, codigo: 'RES-ABC123', estado: 'pendiente' }) }); }
      log.gets.push(u.search);
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(datos) });
    }
    log.ext.push(u.hostname); return r.abort();
  });
  p.on('pageerror', e => log.err.push(e.message));
  return p;
}
async function flujo(p, claseId, modalidad, opts = {}) {
  await p.goto(BASE + '/reservas.html', { waitUntil: 'networkidle0' }); await sleep(500);
  const k = sel => p.$eval(sel, e => e.click());
  await k(`[data-clase="${claseId}"]`); await sleep(200);
  await p.$$eval('input[name=fecha]:not([disabled])', e => e[0].click());
  await k(`input[name=modalidad][value=${modalidad}]`); await k('#ir3'); await sleep(200);
  await p.type('#nombre', opts.nombre || 'Ana Prueba'); await p.type('#whatsapp', '11 2345 6789');
  if (opts.adulto) await p.type('#adulto', opts.adulto);
  if (opts.sinAcepto) { await k('#ir4'); return; }
  await k('#acepto'); await k('#ir4'); await sleep(200);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  // 1) Landing: links a reservas.html
  { const log = { posts: [], gets: [], ext: [], err: [] }; const p = await page(b, DATOS, log);
    await p.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
    const links = await p.$$eval('a[href="reservas.html"]', a => a.map(x => ({ id: x.id, t: x.textContent.trim(), vis: !!(x.offsetWidth || x.offsetHeight) })));
    ck('landing: 2 links visibles «Reservá tu clase online» (hero y grilla)', links.length === 2 && links.every(l => l.vis && /Reservá tu clase/.test(l.t)), links);
    await p.screenshot({ path: '/workspace/eter-reservas-hero.png' });
    await p.click('#heroReservaBtn'); await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    ck('landing: el botón del hero abre reservas.html', /reservas\.html$/.test(p.url()), p.url());
    ck('landing: sin consentimiento 0 requests a Meta/Google', log.ext.filter(h => /facebook|google-analytics|googletagmanager/.test(h)).length === 0, log.ext);
    await p.close(); }
  // 2) Clase suelta + resumen + POST con acepto
  { const log = { posts: [], gets: [], ext: [], err: [] }; const p = await page(b, DATOS, log);
    await flujo(p, 'ETR-001', 'suelta');
    const resumen = await p.$eval('#resumen', e => e.textContent);
    ck('suelta: resumen con seña $10.000', /10\.000/.test(resumen), resumen);
    await p.$eval('#reservar', e => e.click()); await sleep(600);
    const pago = await p.$eval('#paso5', e => e.textContent);
    ck('suelta: POST con acepto:true y sin precio del cliente', log.posts.length === 1 && log.posts[0].acepto === true && !('precio' in log.posts[0]), log.posts);
    ck('suelta: paso 5 muestra código, alias espacioeter.mp y titular Araceli Meli', /RES-ABC123/.test(pago) && /espacioeter\.mp/.test(pago) && /Araceli Meli/.test(pago), pago.slice(0, 300));
    ck('suelta: sin errores JS ni violaciones de CSP', !log.err.length && !(await p.evaluate(() => (window.__csp || []).length)), { err: log.err });
    await p.screenshot({ path: '/workspace/eter-reservas-paso5.png' }); await p.close(); }
  // 3) Clase de prueba: nunca muestra precio
  { const log = { posts: [], gets: [], ext: [], err: [] }; const p = await page(b, DATOS, log);
    const conPrueba = DATOS.clases.find(c => c.prueba !== false && !/infantil/i.test(c.disciplina));
    await flujo(p, conPrueba.id, 'prueba');
    const t = await p.evaluate(() => document.body.innerText);
    ck('prueba: muestra solo la seña, sin $5.000 ni otro precio', /10\.000/.test(t) && !/5\.000/.test(t) && !/Precio/.test(await p.$eval('#resumen', e => e.textContent)), t.slice(0, 400));
    await p.close(); }
  // 4) Sin «Acepto» no avanza
  { const log = { posts: [], gets: [], ext: [], err: [] }; const p = await page(b, DATOS, log);
    await flujo(p, 'ETR-001', 'suelta', { sinAcepto: true });
    ck('sin acepto: no avanza y muestra error', /aceptar/.test(await p.$eval('#err3', e => e.textContent)) && log.posts.length === 0);
    await p.close(); }
  // 5) Acro infantil pide adulto y lo manda
  { const acro = DATOS.clases.find(c => /infantil/i.test(c.disciplina));
    if (acro) { const log = { posts: [], gets: [], ext: [], err: [] }; const p = await page(b, DATOS, log);
      await flujo(p, acro.id, acro.prueba !== false ? 'prueba' : 'suelta', { adulto: 'Marta Adulta' });
      await p.$eval('#reservar', e => e.click()); await sleep(600);
      ck('acro infantil: POST con adulto', log.posts[0] && log.posts[0].adulto === 'Marta Adulta', log.posts); await p.close(); } }
  // 6) XSS en el resumen (B1): disciplina maliciosa desde el GET
  { const d = JSON.parse(JSON.stringify(DATOS));
    const disc = '<span class="total"><a id="evilLink" href="https://evil.example/pago">Pagá acá</a><img id="evilImg" src=x></span>';
    d.clases.push({ id: 'ETR-666', disciplina: disc, profe: '<img id="evilProfe" src=y>', dia: 'lunes', inicio: '23:00', fin: '23:30', nivel: '', cupo: null, fijas: 0, prueba: true });
    d.precios.push({ disciplina: disc, plan: 'Clase suelta', precio: 20000 });
    const log = { posts: [], gets: [], ext: [], err: [] }; const p = await page(b, d, log);
    await flujo(p, 'ETR-666', 'suelta');
    const n = await p.evaluate(() => document.querySelectorAll('#evilLink,#evilImg,#evilProfe').length);
    const txt = await p.$eval('#resumen', e => e.textContent);
    ck('B1: datos maliciosos del GET quedan como texto (0 nodos inyectados)', n === 0 && /evil\.example/.test(txt), { n, txt });
    await p.close(); }
  await b.close();
  const pass = res.filter(r => r.startsWith('PASS')).length;
  const outTxt = res.join('\n') + `\nResultado: ${pass} PASS, ${res.length - pass} FAIL (${new Date().toISOString()})\n`;
  fs.writeFileSync(__dirname + '/puppeteer-results.txt', outTxt); console.log(outTxt);
})().catch(e => { console.error(e); process.exit(1); });
