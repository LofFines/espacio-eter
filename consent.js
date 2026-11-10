/*
 * Consentimiento de cookies de Espacio Éter.
 * - Guarda la elección en localStorage: eter_consent_v1 = 'granted' | 'denied' y eter_consent_v1_fecha (ISO).
 * - Sin elección o con 'denied' no se carga ningún script de Meta ni de Google (pixel.js y ga4.js salen sin hacer nada).
 * - Al aceptar, se inyectan pixel.js y ga4.js (que ahora sí corren: PageView + page_view con Consent Mode granted).
 * - «Configurar cookies» (botón [data-consent-open] en el pie) reabre el banner. Si alguien que había aceptado
 *   rechaza, se guarda 'denied' y se recarga la página para que no quede nada cargado.
 */
(function () {
  'use strict';
  var KEY = 'eter_consent_v1';
  // Solo 'granted' o 'denied' cuentan como elección; cualquier otro valor (corrupto) = sin elección → se muestra el banner.
  function get() { try { var v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null; } catch (_) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); localStorage.setItem(KEY + '_fecha', new Date().toISOString()); } catch (_) {} }
  function load(src) { var s = document.createElement('script'); s.src = src; document.head.appendChild(s); }

  var box = null, lastFocus = null;
  function build() {
    box = document.createElement('div');
    box.className = 'eter-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-label', 'Cookies de medición');
    box.setAttribute('aria-describedby', 'eterConsentText');
    box.hidden = true;
    box.innerHTML =
      // Si reservás y aceptaste, al confirmarse la reserva se le avisa a Meta con el WhatsApp cifrado (hash SHA-256).
      '<p id="eterConsentText">Usamos cookies de Meta y Google Analytics para medir visitas, anuncios y reservas (con tu WhatsApp cifrado), solo si aceptás. ' +
      '<a href="privacidad.html">Más info</a></p>' +
      '<div class="eter-consent-btns">' +
      '<button type="button" data-consent="denied">Rechazar</button>' +
      '<button type="button" data-consent="granted">Aceptar</button>' +
      '</div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-consent]');
      if (b) choose(b.getAttribute('data-consent'));
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && get()) close();
    });
    // Primero en el body: con Tab es lo primero que se recorre (no mueve el foco solo ni bloquea la página).
    document.body.insertBefore(box, document.body.firstChild);
    window.addEventListener('resize', place);
  }
  function open(focus) {
    if (!box) build();
    box.hidden = false;
    place();
    if (focus) { lastFocus = document.activeElement; box.querySelector('button').focus(); }
  }
  // Se ubica justo arriba del botón fijo «Reservar mi clase de prueba / WhatsApp», sin taparlo.
  function place() {
    if (!box || box.hidden) return;
    var s = document.getElementById('stickyWaBtn');
    if (!s) return;
    var top = s.getBoundingClientRect().top;
    if (top > 0) box.style.bottom = Math.max(8, Math.round(window.innerHeight - top + 6)) + 'px';
  }
  function close() {
    if (box) box.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }
  function choose(v) {
    var prev = get();
    set(v);
    close();
    if (v === 'granted' && prev !== 'granted') { load('pixel.js'); load('ga4.js'); }
    if (v === 'denied' && prev === 'granted') location.reload();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-consent-open]');
    if (t) { e.preventDefault(); open(true); }
  });
  if (!get()) open(false);
})();
