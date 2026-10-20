/* Meta Pixel con consentimiento (Espacio Éter). Reemplazar PIXEL_ID por el ID real. */
(function () {
  'use strict';
  var PIXEL_ID = 'REEMPLAZAR_PIXEL_ID'; // solo dígitos, lo carga Leandro
  var KEY = 'eter_cookies_v1';

  function loadPixel() {
    if (window.fbq || !/^\d{10,20}$/.test(PIXEL_ID)) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('cookieBanner');
    var c = get();
    if (c === 'aceptar') loadPixel();
    else if (c !== 'rechazar' && banner) banner.classList.remove('hidden');

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cookie]');
      if (b) {
        var v = b.getAttribute('data-cookie') === 'aceptar' ? 'aceptar' : 'rechazar';
        set(v);
        if (banner) banner.classList.add('hidden');
        if (v === 'aceptar') loadPixel();
        return;
      }
      if (e.target.closest('[data-cookie-reset]')) {
        try { localStorage.removeItem(KEY); } catch (err) {}
        if (banner) banner.classList.remove('hidden');
      }
    });
  });
})();
