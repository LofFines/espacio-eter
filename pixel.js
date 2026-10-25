/*
 * Meta Pixel de Espacio Éter — píxel «mensajes Eter» (cuenta publicitaria Lean Fines).
 * Se carga en TODAS las páginas, en el <head>, sin defer.
 *  - PageView en cada carga.
 *  - Contact al tocar cualquier link de WhatsApp (wa.me, api.whatsapp.com, whatsapp://),
 *    con un único listener delegado: cubre links actuales y futuros, sin bloquear la navegación.
 */
(function () {
  'use strict';
  var PIXEL_ID = '1028287166250408';
  var WA_RE = /^(https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\/|whatsapp:\/\/)/i;

  if (!window.fbq) {
    /* Código base oficial de Meta */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  // Contact en clic a WhatsApp (fase de captura; no hace preventDefault).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !WA_RE.test(a.getAttribute('href') || '')) return;
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Contact', { content_name: a.getAttribute('data-wa-origen') || 'whatsapp', content_category: a.getAttribute('data-wa-clase') || 'sin-clase' });
    }
  }, true);
})();
