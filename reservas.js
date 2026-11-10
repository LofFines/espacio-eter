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
 */
(function () {
  'use strict';

  var CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbyghZ1rFK5dOKRH8SSxFtMpXoqZ7-Aris2p2HSv0k-QyUp3V5n3-RxRu_brcswZzTmqyw/exec', // URL /exec del Apps Script. Vacío = preview obligatorio.
    WA: 'https://wa.me/5491123978429',
    SENA: 10000,
    ALIAS: 'espacioeter.mp',
    TITULAR: 'Araceli Meli',
    DIAS_A_MOSTRAR: 14
  };
  var qs = new URLSearchParams(location.search);
  var PREVIEW = qs.get('preview') === '1' || !CONFIG.API_URL;
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var ORDEN_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var FILTROS = { todas: null, pole: /^pole/i, baile: /salsa|bachata/i, complemento: /funcional|flexi|acro/i };

  var datos = null;
  var st = { clase: null, fecha: null, modalidad: null, plan: null, nombre: '', whatsapp: '', adulto: '' };
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
    if (n === null) return '<span class="badge">Cupo amplio</span>';
    if (n === 0) return '<span class="badge lleno">Completa</span>';
    if (n <= 2) return '<span class="badge pocos">Quedan ' + n + '</span>';
    return '<span class="badge">' + n + ' lugares</span>';
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
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- Paso 1: grilla ----------
  var filtroActual = 'todas', vioGrilla = false;
  function pintarFiltros() {
    $('filtros').innerHTML = Object.keys(FILTROS).map(function (k) {
      return '<button type="button" class="chip' + (k === filtroActual ? ' on' : '') + '" data-filtro="' + k + '">' + k[0].toUpperCase() + k.slice(1) + '</button>';
    }).join('');
  }
  function pintarGrilla() {
    var re = FILTROS[filtroActual], html = '';
    ORDEN_DIAS.forEach(function (dia) {
      var cl = datos.clases.filter(function (c) { return c.dia === dia && (!re || re.test(c.disciplina)); })
        .sort(function (a, b) { return a.inicio.localeCompare(b.inicio); });
      if (!cl.length) return;
      html += '<div class="dia"><h3>' + dia + '</h3>' + cl.map(function (c) {
        var f = proximasFechas(c)[0];
        var n = f ? lugares(c, iso(f)) : null;
        return '<button type="button" class="clase" data-clase="' + esc(c.id) + '"><span class="hora">' + esc(c.inicio) + '–' + esc(c.fin) + '</span>' +
          '<span class="nom">' + esc(c.disciplina) + '<small>' + esc(c.profe) + (c.nivel ? ' · ' + esc(c.nivel) : '') + '</small></span>' + badge(n) + '</button>';
      }).join('') + '</div>';
    });
    $('grilla').innerHTML = html || '<p class="nota">No hay clases para este filtro.</p>';
  }

  // ---------- Paso 2 ----------
  function elegirClase(id) {
    st.clase = datos.clases.filter(function (c) { return c.id === id; })[0];
    if (!st.clase) return;
    st.fecha = null; st.modalidad = null; st.plan = null;
    track('ViewContent', 'eligio_horario', { content_name: st.clase.disciplina + ' ' + st.clase.dia + ' ' + st.clase.inicio, content_category: 'Reserva' });
    $('claseElegida').textContent = st.clase.disciplina + ' · ' + st.clase.dia + ' ' + st.clase.inicio + ' a ' + st.clase.fin + ' · con ' + st.clase.profe;
    $('fechas').innerHTML = proximasFechas(st.clase).map(function (d) {
      var n = lugares(st.clase, iso(d)), lleno = n === 0;
      return '<label class="opcion' + (lleno ? ' dis' : '') + '"><input type="radio" name="fecha" value="' + iso(d) + '"' + (lleno ? ' disabled' : '') + ' />' +
        '<div><strong>' + fechaLarga(d) + ' · ' + esc(st.clase.inicio) + ' hs</strong><span>' + (n === null ? 'Cupo amplio' : n === 0 ? 'Completa' : 'Quedan ' + n + ' lugares') + '</span></div></label>';
    }).join('') || '<p class="nota">No hay fechas disponibles en las próximas 2 semanas.</p>';
    var pr = preciosDe(st.clase.disciplina);
    var hayPrueba = st.clase.prueba !== false;
    var haySuelta = pr.some(function (p) { return /suelta/i.test(p.plan); });
    var hayMes = pr.some(function (p) { return !/suelta/i.test(p.plan); });
    var mods = [
      ['prueba', 'Clase de prueba', 'Tu primera clase para conocer el estudio.', hayPrueba],
      ['suelta', 'Clase suelta', 'Venís a esta clase puntual.', haySuelta],
      ['mes', 'El mes', 'Te anotás con plan mensual desde esta fecha.', hayMes]
    ];
    $('modalidades').innerHTML = mods.map(function (m) {
      return '<label class="opcion' + (m[3] ? '' : ' dis') + '"><input type="radio" name="modalidad" value="' + m[0] + '"' + (m[3] ? '' : ' disabled') + ' />' +
        '<div><strong>' + m[1] + '</strong><span>' + (m[3] ? m[2] : 'No disponible para esta disciplina.') + '</span></div></label>';
    }).join('');
    $('adultoBox').classList.toggle('oculto', !/infantil/i.test(st.clase.disciplina));
    ir(2);
  }

  // ---------- Paso 4 ----------
  function pintarPaso4() {
    var pr = preciosDe(st.clase.disciplina);
    $('planesBox').classList.toggle('oculto', st.modalidad !== 'mes');
    if (st.modalidad === 'mes') {
      var planes = pr.filter(function (p) { return !/suelta/i.test(p.plan); });
      $('planes').innerHTML = planes.map(function (p, i) {
        return '<label class="opcion"><input type="radio" name="plan" value="' + esc(p.plan) + '"' + ((st.plan ? st.plan === p.plan : i === 0) ? ' checked' : '') + ' />' +
          '<div><strong>' + esc(p.plan) + '</strong><span>' + pesos(p.precio) + ' por mes</span></div></label>';
      }).join('');
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
      filas.push(['Saldo a pagar en el estudio', '<span class="total">' + pesos(Math.max(0, precio - CONFIG.SENA)) + '</span>']);
    }
    $('resumen').innerHTML = filas.map(function (f) { return '<div><span>' + esc(f[0]) + '</span><span>' + (f[1].indexOf('<span') === 0 ? f[1] : esc(f[1])) + '</span></div>'; }).join('');
  }

  // ---------- Paso 5 ----------
  function codigoNuevo() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    var r = new Uint32Array(5); crypto.getRandomValues(r);
    for (var i = 0; i < 5; i++) s += abc[r[i] % abc.length];
    return 'ETR-' + s;
  }
  function reservar() {
    var btn = $('reservar'); btn.disabled = true; $('err4').textContent = '';
    var body = {
      accion: 'reservar', claseId: st.clase.id, fecha: st.fecha, modalidad: st.modalidad, plan: st.plan || '',
      nombre: st.nombre, whatsapp: st.whatsapp, adulto: st.adulto, web: $('web').value,
      consentimientoMedicion: consent() ? 'Sí' : 'No'
    };
    // Para la API de Conversiones (aviso a Meta cuando Ara confirma): solo con consentimiento.
    if (consent()) { var m = medicion(); body.fbp = m.fbp; body.fbc = m.fbc; body.url = location.origin + location.pathname; body.ua = navigator.userAgent; }
    var p = PREVIEW
      ? new Promise(function (ok) { setTimeout(function () { log('preview: no se guardó nada (se mandaría a la pestaña Reservas)'); ok({ ok: true, codigo: codigoNuevo(), estado: 'pendiente' }); }, 400); })
      // text/plain evita el preflight CORS que Apps Script no responde.
      : fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
    p.then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) { $('err4').textContent = (res && res.error) || 'No se pudo registrar la reserva. Probá de nuevo o escribinos por WhatsApp.'; return; }
      track('SolicitudReserva', 'solicitud_reserva', { content_name: st.clase.disciplina, content_category: st.modalidad });
      mostrarPago(res.codigo);
    }).catch(function () { btn.disabled = false; $('err4').textContent = 'Sin conexión. Probá de nuevo o escribinos por WhatsApp.'; });
  }
  function mostrarPago(codigo) {
    $('codigo').textContent = codigo;
    var mod = st.modalidad === 'prueba' ? 'clase de prueba' : st.modalidad === 'suelta' ? 'clase suelta' : 'mes (' + st.plan + ')';
    var msg = 'Hola Ara! Hice la reserva ' + codigo + ' en la web: ' + st.clase.disciplina + ', ' + fechaLarga(new Date(st.fecha + 'T12:00')) + ' ' + st.clase.inicio + ' hs, ' + mod + '. Te mando el comprobante de la seña de $10.000. Soy ' + st.nombre + '.';
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
      var nom = $('nombre').value.trim(), wa = $('whatsapp').value.replace(/[^\d+]/g, '');
      if (nom.length < 3) { $('err3').textContent = 'Poné tu nombre y apellido.'; return; }
      if (wa.replace(/\D/g, '').length < 8) { $('err3').textContent = 'Revisá el número de WhatsApp.'; return; }
      if (!$('adultoBox').classList.contains('oculto') && $('adulto').value.trim().length < 3) { $('err3').textContent = 'Poné el nombre de la persona adulta responsable.'; return; }
      if (!$('acepto').checked) { $('err3').textContent = 'Tenés que aceptar las condiciones.'; return; }
      $('err3').textContent = ''; st.nombre = nom; st.whatsapp = wa; st.adulto = $('adulto').value.trim();
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
    $('grilla').innerHTML = '<p class="nota">No pudimos cargar los horarios. <a href="' + CONFIG.WA + '">Escribinos por WhatsApp</a>.</p>';
  });
})();
