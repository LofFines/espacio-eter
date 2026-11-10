// Playwright headless sobre la rama servida en local. El backend del Apps Script se MOCKEA con route():
// ningún request llega a script.google.com. Meta/Google se registran y se ABORTAN. Escribe tests/e2e-results.{json,txt}.
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm');
const BASE = process.env.BASE || 'http://127.0.0.1:8931';
const w = {}; vm.runInNewContext(fs.readFileSync(__dirname + '/../reservas-data.js', 'utf8'), { window: w });
const DATOS = JSON.parse(JSON.stringify(w.ETER_PREVIEW_DATA));
const TRK = /(facebook\.(net|com)|fbcdn\.net|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)/i;
const out = {}; const checks = [];
const check = (name, cond, info) => checks.push({ name, ok: !!cond, info: cond ? undefined : info });

function evil() {
  const d = JSON.parse(JSON.stringify(DATOS));
  d.clases.push({ id: 'x" onmouseover="window.__x3=1', disciplina: '<span class="z"><img src=x onerror="window.__x1=1"><a id="evilLink" href="https://evil.example/pago">Pagá acá</a></span>', profe: '<img src=y onerror="window.__x2=1">', dia: 'lunes', inicio: '18:00', fin: '19:00', nivel: '"><svg onload="window.__x5=1">', cupo: null, fijas: 0, prueba: true });
  const disc = d.clases[d.clases.length - 1].disciplina;
  d.precios.push({ disciplina: disc, plan: '<img src=z onerror="window.__x4=1">', precio: 50000 });
  d.precios.push({ disciplina: disc, plan: 'Clase suelta', precio: 1 });
  return d;
}

async function scenario(browser, name, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  const log = { trackers: [], apps: [], otherExternal: [], posts: [], console: [], cspViolations: [] };
  await ctx.addInitScript(() => { document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
  if (opts.consent) await ctx.addInitScript(v => { if (!sessionStorage.getItem('__init')) { localStorage.setItem('eter_consent_v1', v); sessionStorage.setItem('__init', '1'); } }, opts.consent);
  await ctx.route('**/*', async route => {
    const r = route.request(), u = new URL(r.url());
    if (u.hostname === '127.0.0.1') {
      if (opts.rewrite && opts.rewrite[u.pathname]) { const resp = await route.fetch(); return route.fulfill({ response: resp, body: opts.rewrite[u.pathname](await resp.text()) }); }
      return route.continue();
    }
    if (/script\.google(usercontent)?\.com$/.test(u.hostname)) {
      log.apps.push(r.method() + ' ' + u.hostname + u.search);
      if (r.method() === 'POST') { log.posts.push({ headers: r.headers()['content-type'], body: JSON.parse(r.postData() || '{}') }); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(opts.postResp || { ok: true, codigo: 'RES-ABC123', estado: 'pendiente' }) }); }
      if (u.searchParams.get('accion') === 'datos') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(opts.datos || DATOS) });
      return route.abort();
    }
    if (u.hostname === 'challenges.cloudflare.com' && opts.fakeTurnstile) {
      log.otherExternal.push('cloudflare(mock) ' + u.pathname);
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.turnstile={render:function(s,o){setTimeout(function(){o.callback("tok-fake")},50)},reset:function(){}};setTimeout(function(){window.eterTurnstileOnload()},10);' });
    }
    if (TRK.test(u.hostname)) { log.trackers.push(r.method() + ' ' + u.hostname + u.pathname); return route.abort(); }
    log.otherExternal.push(u.hostname + u.pathname); return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); log.console.push(m.type() + ': ' + t.slice(0, 200)); if (/Content Security Policy/i.test(t)) log.cspViolations.push(t.slice(0, 220)); });
  page.on('pageerror', e => log.console.push('pageerror: ' + e.message));
  page.on('dialog', d => { log.console.push('DIALOG: ' + d.message()); d.dismiss(); });
  await page.goto(BASE + (opts.path || '/reservas.html'), { waitUntil: 'load' });
  await page.waitForTimeout(800);
  log.result = await opts.fn(page, ctx, log);
  await page.waitForTimeout(1500);
  log.cspEvents = await page.evaluate(() => window.__csp || []).catch(() => []);
  log.cookies = (await ctx.cookies()).map(c => c.name);
  log.ls = await page.evaluate(() => Object.assign({}, localStorage)).catch(() => ({}));
  out[name] = log;
  await ctx.close();
  return log;
}

async function flujo(page, { clase = 'ETR-001', modalidad = 'suelta', nombre = 'Ana Prueba', wa = '11 2345 6789', plan, adulto } = {}) {
  const banner = await page.$('.eter-consent:not([hidden])');
  await page.click(`[data-clase="${clase}"]`);
  await page.check('input[name=fecha]:not([disabled])');
  await page.check(`input[name=modalidad][value=${modalidad}]`);
  await page.click('#ir3');
  await page.fill('#nombre', nombre); await page.fill('#whatsapp', wa);
  if (adulto !== undefined) await page.fill('#adulto', adulto);
  await page.check('#acepto');
  await page.click('#ir4');
  const err3 = await page.$eval('#err3', e => e.textContent);
  if (err3) return { err3 };
  if (plan) await page.check(`input[name=plan][value="${plan}"]`);
  const resumen = await page.$eval('#resumen', e => e.innerText);
  await page.waitForTimeout(300);
  await page.click('#reservar');
  await page.waitForSelector('#paso5:not(.oculto)', { timeout: 5000 }).catch(() => {});
  const href = await page.$eval('#waComprobante', a => a.href);
  return { bannerVisible: !!banner, resumen, codigo: await page.$eval('#codigo', e => e.textContent), waHref: href, waTexto: decodeURIComponent(href.split('?text=')[1] || ''), err4: await page.$eval('#err4', e => e.textContent) };
}
const sinCsp = l => l.cspViolations.length === 0 && l.cspEvents.length === 0;

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  let l;
  l = await scenario(browser, 'A_sin_consentimiento_flujo_suelta', { fn: p => flujo(p) });
  check('A flujo completo: código RES- visible', l.result.codigo === 'RES-ABC123', l.result);
  check('A sin consentimiento: 0 requests a Meta/Google', l.trackers.length === 0, l.trackers);
  check('A banner de cookies visible sin elección', l.result.bannerVisible, l.result);
  check('A POST con acepto:true, consentimientoMedicion No, sin fbp/url/ua, text/plain', l.posts.length === 1 && l.posts[0].body.acepto === true && l.posts[0].body.consentimientoMedicion === 'No' && !('fbp' in l.posts[0].body) && !('ua' in l.posts[0].body) && /text\/plain/.test(l.posts[0].headers), l.posts);
  check('A link de WhatsApp a 5491123978429 con código y SIN el nombre', l.result.waHref.startsWith('https://wa.me/5491123978429?text=') && /RES-ABC123/.test(l.result.waTexto) && !/Ana Prueba/.test(l.result.waTexto), l.result);
  check('A sin violaciones de CSP', sinCsp(l), [l.cspViolations, l.cspEvents]);
  check('A el precio $5.000 no aparece', !/\$\s?5\.000(?!\d)/.test(l.result.resumen), l.result.resumen);

  l = await scenario(browser, 'B_rechazo_flujo_mes', { consent: 'denied', fn: p => flujo(p, { modalidad: 'mes', plan: '2 veces por semana' }) });
  check('B rechazo: 0 requests a Meta/Google y flujo ok', l.trackers.length === 0 && l.result.codigo === 'RES-ABC123' && l.posts[0].body.plan === '2 veces por semana', [l.trackers, l.result]);
  check('B sin violaciones de CSP', sinCsp(l), [l.cspViolations, l.cspEvents]);

  l = await scenario(browser, 'C_acepta_flujo_prueba', { consent: 'granted', fn: async (p, ctx) => { await ctx.addCookies([{ name: '_fbp', value: 'fb.1.123.456', url: BASE }]); return flujo(p, { modalidad: 'prueba', nombre: 'Ana & <b>"Test"</b>' }); } });
  check('C con consentimiento: se piden fbevents.js y gtag/js (abortados)', l.trackers.some(t => /fbevents/.test(t)) && l.trackers.some(t => /gtag\/js/.test(t)), l.trackers);
  check('C POST con consentimiento Sí y fbp', l.posts[0] && l.posts[0].body.consentimientoMedicion === 'Sí' && l.posts[0].body.fbp === 'fb.1.123.456', l.posts);
  check('C clase de prueba: resumen sin precio, solo seña $10.000', /Seña para reservar\s*\$10\.000/.test(l.result.resumen) && !/\bPrecio\b/.test(l.result.resumen), l.result.resumen);
  check('C sin violaciones de CSP (scripts de terceros permitidos)', sinCsp(l), [l.cspViolations, l.cspEvents]);

  l = await scenario(browser, 'D_acepta_desde_banner_luego_revoca', { fn: async (p, ctx, log) => {
    await p.click('.eter-consent [data-consent="granted"]'); await p.waitForTimeout(1500);
    const antes = log.trackers.length;
    await p.click('[data-consent-open]'); await Promise.all([p.waitForNavigation({ timeout: 5000 }).catch(() => 'sin-recarga'), p.click('.eter-consent [data-consent="denied"]')]);
    const marca = log.trackers.length; await p.waitForTimeout(2500);
    return { antes, despues: log.trackers.length - marca, consent: await p.evaluate(() => localStorage.getItem('eter_consent_v1')), fbq: await p.evaluate(() => typeof window.fbq), gtag: await p.evaluate(() => typeof window.gtag) };
  } });
  check('D aceptar carga trackers; revocar recarga y quedan 0', l.result.antes > 0 && l.result.despues === 0 && l.result.consent === 'denied' && l.result.fbq === 'undefined' && l.result.gtag === 'undefined', l.result);

  l = await scenario(browser, 'E_xss_datos_maliciosos_del_GET', { datos: evil(), fn: async p => {
    const r = {};
    r.imgsGrilla = await p.$$eval('#grilla img, #grilla svg, #grilla a', a => a.length);
    await p.click('[data-clase^="x\\""]').catch(e => (r.clickErr = e.message.slice(0, 100)));
    r.imgsFechas = await p.$$eval('#claseElegida *, #fechas img, #modalidades img', a => a.length);
    await p.check('input[name=fecha]:not([disabled])'); await p.check('input[name=modalidad][value=mes]');
    await p.click('#ir3'); await p.fill('#nombre', 'Ana Prueba'); await p.fill('#whatsapp', '1123456789'); await p.check('#acepto'); await p.click('#ir4');
    r.inyectadosResumenPlanes = await p.$$eval('#resumen img, #resumen a, #resumen svg, #planes img, #planes a', a => a.length);
    r.textoResumen = await p.$eval('#resumen', e => e.innerText.slice(0, 200));
    r.flags = await p.evaluate(() => [1, 2, 3, 4, 5].map(i => window['__x' + i] || 0));
    return r;
  } });
  check('E XSS: ningún <img>/<a>/<svg> inyectado en grilla, fechas, planes ni resumen; 0 flags', l.result.imgsGrilla === 0 && l.result.imgsFechas === 0 && l.result.inyectadosResumenPlanes === 0 && l.result.flags.every(x => x === 0) && /<span class="z">/.test(l.result.textoResumen), l.result);

  l = await scenario(browser, 'F_preview_no_toca_red', { path: '/reservas.html?preview=1', fn: p => flujo(p) });
  check('F preview: 0 requests externas y 0 POST; código RES- local', l.trackers.length === 0 && l.apps.length === 0 && l.otherExternal.length === 0 && /^RES-[0-9A-F]{6}$/.test(l.result.codigo), [l.apps, l.otherExternal, l.result]);

  l = await scenario(browser, 'G_POST_error_con_HTML', { postResp: { ok: false, error: '<img src=x onerror="window.__e=1">Error' }, fn: async p => { const r = await flujo(p); r.err4Hijos = await p.$eval('#err4', e => e.children.length); r.flag = await p.evaluate(() => window.__e || 0); return r; } });
  check('G error del servidor se muestra como texto (sin HTML)', l.result.err4Hijos === 0 && l.result.flag === 0 && /<img/.test(l.result.err4), l.result);

  l = await scenario(browser, 'H_acro_infantil', { fn: async p => {
    const sinAdulto = await flujo(p, { clase: 'ETR-020', modalidad: 'prueba', nombre: 'Nena Test' });
    await p.fill('#adulto', 'Mamá Test'); await p.click('#ir4'); await p.click('#reservar');
    await p.waitForSelector('#paso5:not(.oculto)', { timeout: 5000 }).catch(() => {});
    return { sinAdulto, label: await p.$eval('label[for=nombre]', e => e.textContent), codigo: await p.$eval('#codigo', e => e.textContent) };
  } });
  check('H Acro infantil: exige adulto, etiqueta para el nombre del menor y POST con adulto', /adulta/.test(l.result.sinAdulto.err3 || '') && /nena o el nene/.test(l.result.label) && l.posts[0] && l.posts[0].body.adulto === 'Mamá Test', [l.result, l.posts]);

  l = await scenario(browser, 'I_turnstile_activado_mock', { fakeTurnstile: true,
    rewrite: {
      '/reservas.js': t => t.replace("TURNSTILE_SITEKEY: ''", "TURNSTILE_SITEKEY: '1x00000000000000000000AA'"),
      '/reservas.html': t => t.replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com").replace("object-src 'none'", "frame-src https://challenges.cloudflare.com; object-src 'none'")
    }, fn: p => flujo(p)
  });
  check('I Turnstile (activado por prueba, CSP ajustada): el token viaja en el POST', l.posts[0] && l.posts[0].body.turnstile === 'tok-fake' && l.result.codigo === 'RES-ABC123' && sinCsp(l), [l.posts, l.result, l.cspViolations]);

  l = await scenario(browser, 'J_turnstile_desactivado_no_carga_cloudflare', { fn: p => flujo(p) });
  check('J Turnstile desactivado: ningún request a Cloudflare', !l.otherExternal.some(x => /cloudflare/.test(x)) && !l.posts[0].body.turnstile, [l.otherExternal, l.posts]);

  l = await scenario(browser, 'K_index_sin_consentimiento_utm', { path: '/index.html?utm_source=ig&utm_campaign=test&fbclid=ABC', fn: async p => {
    await p.waitForTimeout(1500);
    return {
      noscript: await p.$$eval('noscript', a => a.length), tailwindCDN: await p.$$eval('script[src*="cdn.tailwindcss"]', a => a.length),
      tailwindEstatico: await p.$$eval('link[href*="tailwind.min.css"]', a => a.length),
      wa: await p.$$eval('a[href*="wa.me"]', a => a.map(x => decodeURIComponent(x.href))),
      bannerTexto: await p.$eval('#eterConsentText', e => e.textContent).catch(() => ''),
      precio5000: await p.evaluate(() => /\$\s?5\.000(?!\d)/.test(document.documentElement.innerHTML))
    };
  } });
  check('K index: 0 trackers sin consentimiento', l.trackers.length === 0, l.trackers);
  check('K index: 0 noscript, Tailwind estático sin CDN', l.result.noscript === 0 && l.result.tailwindCDN === 0 && l.result.tailwindEstatico === 1, l.result);
  check('K index: links de WhatsApp a 5491123978429 con UTM [web-meta · test]', l.result.wa.length > 0 && l.result.wa.every(h => h.includes('wa.me/5491123978429')) && l.result.wa.some(h => h.includes('[web-meta · test]')), l.result.wa);
  check('K index: banner menciona Meta, Google y el WhatsApp cifrado', /Meta/.test(l.result.bannerTexto) && /Google/.test(l.result.bannerTexto) && /WhatsApp cifrado/.test(l.result.bannerTexto), l.result.bannerTexto);
  check('K index: sin $5.000 y sin violaciones de CSP', !l.result.precio5000 && sinCsp(l), [l.result.precio5000, l.cspViolations]);

  l = await scenario(browser, 'L_privacidad_sin_consentimiento', { path: '/privacidad.html', fn: async p => ({
    banner: !!(await p.$('.eter-consent:not([hidden])')), noscript: await p.$$eval('noscript', a => a.length),
    texto: await p.$eval('main', e => e.innerText), csp: await p.$eval('meta[http-equiv="Content-Security-Policy"]', m => m.content),
    configurar: await p.$$eval('[data-consent-open]', a => a.length)
  }) });
  const idxCsp = (fs.readFileSync(__dirname + '/../index.html', 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  check('L privacidad: banner visible, 0 trackers, 0 noscript, «Configurar cookies» presente', l.result.banner && l.trackers.length === 0 && l.result.noscript === 0 && l.result.configurar === 1, [l.result.banner, l.trackers]);
  check('L privacidad: misma CSP que index.html y sin violaciones', l.result.csp === idxCsp && sinCsp(l), [l.result.csp, l.cspViolations]);
  check('L privacidad: sin «no tiene formularios», con sección de reservas, hash, menores, Google, transferencia y placeholders', !/no tiene formularios/i.test(l.result.texto) && /Reservas online/.test(l.result.texto) && /SHA-256/.test(l.result.texto) && /Acro infantil/.test(l.result.texto) && /Transferencia internacional/.test(l.result.texto) && /no usamos Google Fonts/.test(l.result.texto) && /\[COMPLETAR: razón social/.test(l.result.texto) && /\[COMPLETAR: CUIT\]/.test(l.result.texto) && /\[COMPLETAR: email/.test(l.result.texto) && /\[COMPLETAR: plazo/.test(l.result.texto) && /AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA/.test(l.result.texto), l.result.texto.slice(0, 300));

  l = await scenario(browser, 'M_privacidad_con_consentimiento', { path: '/privacidad.html', consent: 'granted', fn: async p => { await p.waitForTimeout(2500); return {}; } });
  check('M privacidad con consentimiento: Pixel y GA4 cargan sin violaciones de CSP', l.trackers.some(t => /fbevents/.test(t)) && l.trackers.some(t => /gtag\/js/.test(t)) && sinCsp(l), [l.trackers, l.cspViolations]);

  await browser.close();
  fs.writeFileSync(__dirname + '/e2e-results.json', JSON.stringify(out, null, 2));
  const pass = checks.filter(c => c.ok).length, fail = checks.length - pass;
  const txt = checks.map(c => (c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.ok ? '' : '  → ' + JSON.stringify(c.info).slice(0, 600))).join('\n') + `\n\nResultado: ${pass} PASS, ${fail} FAIL (${new Date().toISOString()}). Backend mockeado con page.route; 0 requests reales a script.google.com.`;
  fs.writeFileSync(__dirname + '/e2e-results.txt', txt + '\n');
  console.log(txt);
  process.exit(fail ? 1 : 0);
})();
