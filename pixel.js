/*
 * Meta Pixel de Espacio Éter — píxel «mensajes Eter» (cuenta publicitaria Lean Fines).
 * Se carga en TODAS las páginas, en el <head>, sin defer.
 *  - PageView en cada carga.
 *  - Contact al tocar cualquier link de WhatsApp (wa.me, api.whatsapp.com, whatsapp://),
 *    con un único listener delegado: cubre links actuales y futuros, sin bloquear la navegación.
 *
 * Consentimiento: CONSENT_MODE = 'opt-out' (por defecto). El píxel carga y el aviso de cookies
 * informa y permite rechazar; si la persona rechaza, no vuelve a cargar y se revoca el consentimiento.
 * Si en algún momento se requiere consentimiento previo, cambiar a 'opt-in': el píxel carga
 * recién al tocar "Aceptar" (y entonces se dispara el PageView). Ojo: en opt-in muchas visitas
 * no se miden, porque mucha gente ignora el aviso.
 */
(function () {
  'use strict';
  var PIXEL_ID = '1028287166250408';
  var CONSENT_MODE = 'opt-out'; // 'opt-out' | 'opt-in'
  var KEY = 'eter_cookies_v1';   // valores: 'aceptar' | 'rechazar'
  var WA_RE = /^(https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\/|whatsapp:\/\/)/i;

  function getChoice() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadPixel() {
    if (window.fbq) return;
    /* Código base oficial de Meta */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function shouldLoad() {
    var c = getChoice();
    if (c === 'rechazar') return false;
    return CONSENT_MODE === 'opt-out' || c === 'aceptar';
  }

  if (shouldLoad()) loadPixel();

  // Contact en clic a WhatsApp (fase de captura; no hace preventDefault).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !WA_RE.test(a.getAttribute('href') || '')) return;
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Contact', { content_name: a.getAttribute('data-wa-origen') || 'whatsapp' });
    }
  }, true);

  // Aviso de cookies
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('cookieBanner');
    if (banner && !getChoice()) banner.classList.remove('hidden');

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cookie]');
      if (b) {
        var v = b.getAttribute('data-cookie') === 'rechazar' ? 'rechazar' : 'aceptar';
        setChoice(v);
        if (banner) banner.classList.add('hidden');
        if (v === 'aceptar') loadPixel();
        else if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
        return;
      }
      if (e.target.closest('[data-cookie-reset]')) {
        try { localStorage.removeItem(KEY); } catch (err) {}
        if (banner) banner.classList.remove('hidden');
      }
    });
  });
})();
