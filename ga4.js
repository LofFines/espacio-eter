/*
 * Google Analytics 4 de Espacio Éter (G-ZPMV7H6E9J).
 * gtag.js se inyecta recién después de `load` + requestIdleCallback para no tocar LCP/CLS.
 * Los eventos previos quedan en dataLayer y se envían cuando carga.
 *  - page_view: automático (config). page_location no se reescribe: las UTMs salen de la URL.
 *  - clic_whatsapp: al tocar cualquier link de WhatsApp (mismo criterio que el Contact del píxel).
 *  - eligio_horario: al elegir un horario en la grilla (equivale al ViewContent del píxel).
 * Consentimiento: solo corre si localStorage.eter_consent_v1 === 'granted' (consent.js lo inyecta al
 * aceptar). Consent Mode v2: como gtag no se carga nunca sin consentimiento, el 'default' (todo
 * denied) y el 'update' (granted) van juntos acá, en ese orden, antes de cualquier config.
 * Sin PII, sin value ni currency, y link_url sin el texto del mensaje.
 */
(function () {
  'use strict';
  try { if (localStorage.getItem('eter_consent_v1') !== 'granted') return; } catch (_) { return; }
  if (window.__eterGa) return; window.__eterGa = true;
  var GA_ID = 'G-ZPMV7H6E9J';
  var WA_RE = /^(https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\/|whatsapp:\/\/)/i;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', GA_ID);

  function inject() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }
  function later() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(inject, { timeout: 3000 });
    else setTimeout(inject, 1);
  }
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });

  function linkSinTexto(href) {
    try { var u = new URL(href, location.href); return u.origin + u.pathname; } catch (_) { return String(href).split('?')[0]; }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href]');
    if (a && WA_RE.test(a.getAttribute('href') || '')) {
      window.gtag('event', 'clic_whatsapp', {
        content_name: a.getAttribute('data-wa-origen') || 'whatsapp',
        content_category: a.getAttribute('data-wa-clase') || 'sin-clase',
        link_url: linkSinTexto(a.getAttribute('href')),
        transport_type: 'beacon'
      });
      return;
    }
    var sel = t.closest('[data-select-class]');
    if (sel) {
      window.gtag('event', 'eligio_horario', {
        content_type: 'horario_grilla',
        content_name: String(sel.getAttribute('data-select-class') || '').slice(0, 100),
        content_category: 'Seleccion Horario Grilla'
      });
    }
  }, true);
})();
