/*
 * Reservas online de Espacio Éter — PROTOTIPO.
 * Flujo: grilla → día + modalidad (prueba / suelta / mes) → datos → precios + seña → pago por alias + WhatsApp.
 * Reglas (definidas por Leandro, 7/11/2026):
 *  - Seña $10.000 en todos los casos; se descuenta de la clase, del mes o de la clase de prueba.
 *  - La clase de prueba NO muestra precio (solo la seña).
 *  - Se puede reservar hasta que empieza la clase.
 *  - El lugar se guarda solo con la seña paga: la reserva queda «pendiente» hasta que Ara la confirma.
 *    Las pendientes no descuentan cupo. Lugares = cupo − alumnas fijas − confirmadas de esa fecha.
 *  - Cupo vacío = cupo amplio (sin límite). Hoy solo Pole tiene cupo (8).
 *  - Precios visibles recién después de cargar nombre y WhatsApp.
 *  - Combo: 3 disciplinas, 10% de descuento.
 * Modo preview (?preview=1 o sin API_URL): usa reservas-data.js, no guarda nada y los eventos solo
 * se muestran en un panel en pantalla (no se mandan a Meta ni a Google).
 *
 * ESTADO REAL: CONFIG.API_URL apunta a la implementación /exec del Apps Script que YA está activa
 * (acceso «Cualquier usuario»). Si se crea una implementación nueva, la URL cambia y hay que actualizarla acá.
 * Seguridad: el DOM se arma con createElement/textContent (nada de innerHTML con datos); toda la validación
 * real la hace el servidor (apps-script/Code.gs). Captcha opcional: TURNSTILE_SITEKEY (vacío = desactivado).
 */
(function () {
  'use strict';

  var CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbyghZ1rFK5dOKRH8SSxFtMpXoqZ7-Aris2p2HSv0k-QyUp3V5n3-RxRu_brcswZzTmqyw/exec', // URL /exec del Apps Script. Vacío = preview obligatorio.
    WA: 'https://wa.me/5491123978429',
    SENA: 10000,
    ALIAS: 'espacioeter.mp',
    TITULAR: 'Araceli Meli',
    DIAS_A_MOSTRAR: 14,
    // Cloudflare Turnstile (opcional). Vacío = desactivado. Si se completa, hay que cargar TURNSTILE_SECRET en
    // Propiedades del script y sumar https://challenges.cloudflare.com a script-src y frame-src en la CSP de reservas.html.
    TURNSTILE_SITEKEY: ''
  };
  var qs = new URLSearchParams(location.search);
  var PREVIEW = qs.get('preview') === '1' || !CONFIG.API_URL;
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var ORDEN_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var FILTROS = { todas: null, pole: /^pole/i, baile: /salsa|bachata/i, complemento: /funcional|flexi|acro/i };

  var datos = null;
  var st = { clase: null, fecha: null, modalidad: null, plan: null, nombre: '', whatsapp: '', adulto: '', turnstile: '' };
  var $ = function (id) { return document.getElementById(id); };
  var pesos = function (n) { return '$' + Number(n).toLocaleString('es-AR'); };

  // ---------- Eventos de medición (solo con consentimiento, sin datos personales) ----------
  function consent() { try { return localStorage.getItem('eter_consent_v1') === 'granted'; } catch (_) { return false; } }
  function track(meta, ga, params) {
    params = params || {};
    if (PREVIEW) { log('evento → Meta: ' + meta + ' · GA4: ' + ga + ' ' + JSON.stringify(params)); return; }
    if (!consent()) return;
    var std = ['ViewContent', 'Schedule', 'Contact', 'Lead'];
    if (typeof window.fbq === 'function') window.fbq(std.indexOf(meta) >= 0 ? 'track' : 'trackCustom', meta, params);
    if (typeof window.gtag === 'function') window.gtag('event', ga, params);
  }
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function medicion() {
    var fbc = cookie('_fbc');
    if (!fbc) { var id = qs.get('fbclid') || (window.__eterUtm || {}).fbclid || ''; try { id = id || (JSON.parse(sessionStorage.getItem('eter_utm') || '{}').fbclid || ''); } catch (_) {} if (id) fbc = 'fb.1.' + Date.now() + '.' + id; }
    return { fbp: cookie('_fbp'), fbc: fbc };
  }
  function log(txt) {
    var d = $('debug'); if (!d) return;
    d.classList.remove('oculto');
    var p = document.createElement('div'); p.textContent = txt; d.appendChild(p); d.scrollTop = d.scrollHeight;
  }

  // ---------- Datos ----------
  function cargar() {
    if (PREVIEW) { $('previewBanner').classList.remove('oculto'); return Promise.resolve(window.ETER_PREVIEW_DATA); }
    return fetch(CONFIG.API_URL + '?accion=datos', { method: 'GET' }).then(function (r) { return r.json(); }).then(normalizar);
  }
  // Las horas pueden llegar como fracción del día (0.79 = 19:00); las pasamos a «HH:MM».
  function hora(v) {
    var s = String(v == null ? '' : v).trim();
    if (/^\d*\.\d+$/.test(s) || /^\d+$/.test(s)) { var m = Math.round(Number(s) * 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
    var t = s.match(/^(\d{1,2}):(\d{2})/); return t ? ('0' + t[1]).slice(-2) + ':' + t[2] : s;
  }
  function normalizar(d) {
    (d && d.clases || []).forEach(function (c) { c.inicio = hora(c.inicio); c.fin = hora(c.fin); });
    return d;
  }
  function confirmadas(id, iso) {
    var c = (datos.confirmadas || {})[id + '|' + iso];
    return c ? Number(c) : 0;
  }
  function lugares(clase, iso) {
    if (clase.cupo == null || clase.cupo === '') return null; // cupo amplio
    return Math.max(0, Number(clase.cupo) - Number(clase.fijas || 0) - confirmadas(clase.id, iso));
  }
  function badge(n) {
    if (n === null) return el('span', { class: 'badge' }, ['Cupo amplio']);
    if (n === 0) return el('span', { class: 'badge lleno' }, ['Completa']);
    if (n <= 2) return el('span', { class: 'badge pocos' }, ['Quedan ' + n]);
    return el('span', { class: 'badge' }, [n + ' lugares']);
  }
  function proximasFechas(clase) {
    var out = [], hoy = new Date(), idx = DIAS.indexOf(clase.dia);
    var hm = clase.inicio.split(':');
    for (var i = 0; i < CONFIG.DIAS_A_MOSTRAR; i++) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i, +hm[0], +hm[1]);
      if (d.getDay() !== idx) continue;
      if (d <= hoy) continue; // se puede reservar hasta que empieza
      out.push(d);
    }
    return out;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fechaLarga(d) { return DIAS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
  function preciosDe(disc) { return datos.precios.filter(function (p) { return p.disciplina === disc; }); }
  // Arma nodos sin innerHTML: los textos van siempre como textContent (no se interpretan como HTML).
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') n.className = v; else n.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (k) { if (k != null) n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); });
    return n;
  }
  function poner(id, nodos) { var c = $(id); c.textContent = ''; (Array.isArray(nodos) ? nodos : [nodos]).forEach(function (x) { c.appendChild(x); }); }

  // ---------- Paso 1: grilla ----------
  var filtroActual = 'todas', vioGrilla = false;
  function pintarFiltros() {
    poner('filtros', Object.keys(FILTROS).map(function (k) {
      return el('button', { type: 'button', class: 'chip' + (k === filtroActual ? ' on' : ''), 'data-filtro': k }, [k[0].toUpperCase() + k.slice(1)]);
    }));
  }
  function pintarGrilla() {
    var re = FILTROS[filtroActual], bloques = [];
    ORDEN_DIAS.forEach(function (dia) {
      var cl = datos.clases.filter(function (c) { return c.dia === dia && (!re || re.test(c.disciplina)); })
        .sort(function (a, b) { return a.inicio.localeCompare(b.inicio); });
      if (!cl.length) return;
      bloques.push(el('div', { class: 'dia' }, [el('h3', {}, [dia])].concat(cl.map(function (c) {
        var f = proximasFechas(c)[0];
        var n = f ? lugares(c, iso(f)) : null;
        return el('button', { type: 'button', class: 'clase', 'data-clase': c.id }, [
          el('span', { class: 'hora' }, [c.inicio + '–' + c.fin]),
          el('span', { class: 'nom' }, [c.disciplina, el('small', {}, [c.profe + (c.nivel ? ' · ' + c.nivel : '')])]),
          badge(n)
        ]);
      }))));
    });
    poner('grilla', bloques.length ? bloques : el('p', { class: 'nota' }, ['No hay clases para este filtro.']));
  }

  // ---------- Paso 2 ----------
  function elegirClase(id) {
    st.clase = datos.clases.filter(function (c) { return c.id === id; })[0];
    if (!st.clase) return;
    st.fecha = null; st.modalidad = null; st.plan = null;
    track('ViewContent', 'eligio_horario', { content_name: st.clase.disciplina + ' ' + st.clase.dia + ' ' + st.clase.inicio, content_category: 'Reserva' });
    $('claseElegida').textContent = st.clase.disciplina + ' · ' + st.clase.dia + ' ' + st.clase.inicio + ' a ' + st.clase.fin + ' · con ' + st.clase.profe;
    var fechas = proximasFechas(st.clase).map(function (d) {
      var n = lugares(st.clase, iso(d)), lleno = n === 0;
      return el('label', { class: 'opcion' + (lleno ? ' dis' : '') }, [
        el('input', { type: 'radio', name: 'fecha', value: iso(d), disabled: lleno }),
        el('div', {}, [el('strong', {}, [fechaLarga(d) + ' · ' + st.clase.inicio + ' hs']), el('span', {}, [n === null ? 'Cupo amplio' : n === 0 ? 'Completa' : 'Quedan ' + n + ' lugares'])])
      ]);
    });
    poner('fechas', fechas.length ? fechas : el('p', { class: 'nota' }, ['No hay fechas disponibles en las próximas 2 semanas.']));
    var pr = preciosDe(st.clase.disciplina);
    var hayPrueba = st.clase.prueba === true;
    var haySuelta = pr.some(function (p) { return /suelta/i.test(p.plan); });
    var hayMes = pr.some(function (p) { return !/suelta/i.test(p.plan); });
    var mods = [
      ['prueba', 'Clase de prueba', 'Tu primera clase para conocer el estudio.', hayPrueba],
      ['suelta', 'Clase suelta', 'Venís a esta clase puntual.', haySuelta],
      ['mes', 'El mes', 'Te anotás con plan mensual desde esta fecha.', hayMes]
    ];
    poner('modalidades', mods.map(function (m) {
      return el('label', { class: 'opcion' + (m[3] ? '' : ' dis') }, [
        el('input', { type: 'radio', name: 'modalidad', value: m[0], disabled: !m[3] }),
        el('div', {}, [el('strong', {}, [m[1]]), el('span', {}, [m[3] ? m[2] : 'No disponible para esta disciplina.'])])
      ]);
    }));
    var infantil = /infantil/i.test(st.clase.disciplina);
    $('adultoBox').classList.toggle('oculto', !infantil);
    // En Acro infantil reserva la persona adulta: el nombre es de la nena o el nene y el WhatsApp, del adulto.
    document.querySelector('label[for=nombre]').textContent = infantil ? 'Nombre y apellido de la nena o el nene' : 'Nombre y apellido';
    document.querySelector('label[for=whatsapp]').textContent = infantil ? 'WhatsApp de la persona adulta responsable' : 'WhatsApp';
    ir(2);
  }

  // ---------- Paso 4 ----------
  function pintarPaso4() {
    var pr = preciosDe(st.clase.disciplina);
    $('planesBox').classList.toggle('oculto', st.modalidad !== 'mes');
    if (st.modalidad === 'mes') {
      var planes = pr.filter(function (p) { return !/suelta/i.test(p.plan); });
      poner('planes', planes.map(function (p, i) {
        return el('label', { class: 'opcion' }, [
          el('input', { type: 'radio', name: 'plan', value: p.plan, checked: st.plan ? st.plan === p.plan : i === 0 }),
          el('div', {}, [el('strong', {}, [p.plan]), el('span', {}, [pesos(p.precio) + ' por mes'])])
        ]);
      }));
      if (!st.plan && planes[0]) st.plan = planes[0].plan;
      var cb = datos.combo;
      $('comboNota').textContent = cb ? 'Combo: si te anotás en ' + cb.disciplinas + ' disciplinas tenés ' + cb.descuento + '% de descuento (lo aplica Ara).' : '';
    }
    var filas = [['Clase', st.clase.disciplina + ' con ' + st.clase.profe], ['Día', fechaLarga(new Date(st.fecha + 'T12:00')) + ' · ' + st.clase.inicio + ' hs']];
    if (st.modalidad === 'prueba') {
      filas.push(['Reserva', 'Clase de prueba']);
      filas.push(['Seña para reservar', pesos(CONFIG.SENA)]);
      filas.push(['', 'La seña se descuenta de tu clase de prueba.']);
    } else {
      var p = st.modalidad === 'suelta' ? pr.filter(function (x) { return /suelta/i.test(x.plan); })[0] : pr.filter(function (x) { return x.plan === st.plan; })[0];
      var precio = p ? p.precio : 0;
      filas.push(['Reserva', st.modalidad === 'suelta' ? 'Clase suelta' : 'Mes · ' + st.plan]);
      filas.push(['Precio', pesos(precio)]);
      filas.push(['Seña ahora', pesos(CONFIG.SENA)]);
      filas.push(['Saldo a pagar en el estudio', el('span', { class: 'total' }, [pesos(Math.max(0, precio - CONFIG.SENA))])]);
    }
    poner('resumen', filas.map(function (f) { return el('div', {}, [el('span', {}, [f[0]]), el('span', {}, [f[1]])]); }));
    prepararCaptcha();
  }

  // ---------- Captcha opcional (Cloudflare Turnstile) ----------
  var captchaListo = false;
  function prepararCaptcha() {
    if (!CONFIG.TURNSTILE_SITEKEY || PREVIEW || captchaListo) return;
    captchaListo = true;
    window.eterTurnstileOnload = function () {
      window.turnstile.render('#turnstile', {
        sitekey: CONFIG.TURNSTILE_SITEKEY, language: 'es',
        callback: function (t) { st.turnstile = t; },
        'expired-callback': function () { st.turnstile = ''; },
        'error-callback': function () { st.turnstile = ''; }
      });
    };
    $('turnstile').classList.remove('oculto');
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=eterTurnstileOnload';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
  function reiniciarCaptcha() { st.turnstile = ''; try { if (window.turnstile) window.turnstile.reset('#turnstile'); } catch (_) {} }

  // ---------- Paso 5 ----------
  function codigoNuevo() {
    // Mismo formato que el servidor: RES- + 6 hexadecimales (los ID de clase usan ETR-).
    var r = new Uint8Array(3); crypto.getRandomValues(r);
    return 'RES-' + Array.prototype.map.call(r, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  function reservar() {
    var btn = $('reservar'); $('err4').textContent = '';
    if (CONFIG.TURNSTILE_SITEKEY && !PREVIEW && !st.turnstile) { $('err4').textContent = 'Completá la verificación antes de reservar.'; return; }
    btn.disabled = true;
    var body = {
      accion: 'reservar', claseId: st.clase.id, fecha: st.fecha, modalidad: st.modalidad, plan: st.plan || '',
      nombre: st.nombre, whatsapp: st.whatsapp, adulto: st.adulto, web: $('web').value,
      acepto: $('acepto').checked === true,
      consentimientoMedicion: consent() ? 'Sí' : 'No'
    };
    if (st.turnstile) body.turnstile = st.turnstile;
    // Para la API de Conversiones (aviso a Meta cuando Ara confirma): solo con consentimiento.
    if (consent()) { var m = medicion(); body.fbp = m.fbp; body.fbc = m.fbc; body.url = location.origin + location.pathname; body.ua = navigator.userAgent; }
    var p = PREVIEW
      ? new Promise(function (ok) { setTimeout(function () { log('preview: no se guardó nada (se mandaría a la pestaña Reservas)'); ok({ ok: true, codigo: codigoNuevo(), estado: 'pendiente' }); }, 400); })
      // text/plain evita el preflight CORS que Apps Script no responde.
      : fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
    p.then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) { reiniciarCaptcha(); $('err4').textContent = (res && typeof res.error === 'string' && res.error.slice(0, 200)) || 'No se pudo registrar la reserva. Probá de nuevo o escribinos por WhatsApp.'; return; }
      track('SolicitudReserva', 'solicitud_reserva', { content_name: st.clase.disciplina, content_category: st.modalidad });
      mostrarPago(res.codigo);
    }).catch(function () { btn.disabled = false; reiniciarCaptcha(); $('err4').textContent = 'Sin conexión. Probá de nuevo o escribinos por WhatsApp.'; });
  }
  function mostrarPago(codigo) {
    $('codigo').textContent = String(codigo || '');
    var mod = st.modalidad === 'prueba' ? 'clase de prueba' : st.modalidad === 'suelta' ? 'clase suelta' : 'mes (' + st.plan + ')';
    var msg = 'Hola Ara! Hice la reserva ' + codigo + ' en la web: ' + st.clase.disciplina + ', ' + fechaLarga(new Date(st.fecha + 'T12:00')) + ' ' + st.clase.inicio + ' hs, ' + mod + '. Te mando el comprobante de la seña de $10.000.';
    // Sin el nombre en el link: si GA4 tiene «clics salientes» activado, la URL completa no lleva datos personales.
    var a = $('waComprobante');
    a.href = CONFIG.WA + '?text=' + encodeURIComponent(msg);
    a.setAttribute('data-wa-clase', st.clase.disciplina);
    ir(5);
  }

  // ---------- Navegación ----------
  function ir(n) {
    [1, 2, 3, 4, 5].forEach(function (i) { $('paso' + i).classList.toggle('oculto', i !== n); });
    document.querySelectorAll('.pasos span').forEach(function (s) { s.classList.toggle('on', +s.getAttribute('data-paso') <= n); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var f = t.closest('[data-filtro]');
    if (f) { filtroActual = f.getAttribute('data-filtro'); pintarFiltros(); pintarGrilla(); return; }
    var c = t.closest('[data-clase]');
    if (c) { elegirClase(c.getAttribute('data-clase')); return; }
    var v = t.closest('[data-volver]');
    if (v) { ir(+v.getAttribute('data-volver')); return; }
    if (t.id === 'ir3') {
      var fe = document.querySelector('input[name=fecha]:checked'), mo = document.querySelector('input[name=modalidad]:checked');
      if (!fe || !mo) { $('err2').textContent = 'Elegí el día y qué querés reservar.'; return; }
      $('err2').textContent = ''; st.fecha = fe.value; st.modalidad = mo.value;
      track('IniciarReserva', 'iniciar_reserva', { content_name: st.clase.disciplina, content_category: st.modalidad });
      ir(3); return;
    }
    if (t.id === 'ir4') {
      var nom = $('nombre').value.replace(/\s+/g, ' ').trim(), wa = $('whatsapp').value.replace(/[^\d+]/g, ''), dig = wa.replace(/\D/g, '').length;
      if (nom.length < 2 || nom.length > 60) { $('err3').textContent = 'Poné tu nombre y apellido (hasta 60 caracteres).'; return; }
      if (dig < 8 || dig > 15) { $('err3').textContent = 'Revisá el número de WhatsApp.'; return; }
      var ad = $('adulto').value.replace(/\s+/g, ' ').trim();
      if (!$('adultoBox').classList.contains('oculto') && (ad.length < 2 || ad.length > 60)) { $('err3').textContent = 'Poné el nombre de la persona adulta responsable.'; return; }
      if (!$('acepto').checked) { $('err3').textContent = 'Tenés que aceptar las condiciones.'; return; }
      $('err3').textContent = ''; st.nombre = nom; st.whatsapp = wa; st.adulto = $('adultoBox').classList.contains('oculto') ? '' : ad;
      pintarPaso4(); ir(4); return;
    }
    if (t.id === 'reservar') { reservar(); return; }
    if (t.id === 'copiar') {
      var ok = function () { t.textContent = '¡Copiado!'; setTimeout(function () { t.textContent = 'Copiar'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(CONFIG.ALIAS).then(ok, ok); else ok();
      return;
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.name === 'plan') { st.plan = e.target.value; pintarPaso4(); }
  });

  cargar().then(function (d) {
    datos = d;
    pintarFiltros(); pintarGrilla(); ir(1);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en, ob) {
        if (en[0].isIntersecting && !vioGrilla) { vioGrilla = true; track('VerHorarios', 'ver_horarios', { content_category: 'Reserva' }); ob.disconnect(); }
      }).observe($('grilla'));
    }
  }).catch(function () {
    poner('grilla', el('p', { class: 'nota' }, ['No pudimos cargar los horarios. ', el('a', { href: CONFIG.WA }, ['Escribinos por WhatsApp']), '.']));
  });
})();
