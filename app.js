(() => {
  'use strict';

  const CONFIG = Object.freeze({
    WA_ORIGIN: 'https://wa.me/5491123978429',
    ALLOWED_FILTERS: Object.freeze(['all', 'pole', 'complemento', 'baile'])
  });

  // ---- UTMs: se guardan en sessionStorage y se suman cortitas al tag del mensaje de WhatsApp.
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  const UTM_STORE = 'eter_utm';
  function readUtm() {
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(UTM_STORE) || '{}') || {}; } catch (_) { saved = {}; }
    const qs = new URLSearchParams(window.location.search);
    let changed = false;
    UTM_KEYS.forEach(k => {
      const v = qs.get(k);
      if (v) { saved[k] = String(v).slice(0, 200); changed = true; }
    });
    if (changed) { try { sessionStorage.setItem(UTM_STORE, JSON.stringify(saved)); } catch (_) {} }
    return saved;
  }
  const UTM = readUtm();
  function waTag() {
    const camp = (UTM.utm_campaign || '').replace(/[\[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
    return camp ? `[web-meta · ${camp}]` : '[web-meta]';
  }
  function waUrl(text) {
    return `${CONFIG.WA_ORIGIN}?text=${encodeURIComponent(`${text} ${waTag()}`)}`;
  }
  // Reescribe el tag [web-meta] de todos los links de WhatsApp con la campaña (si vino por anuncio).
  function tagWaLinks() {
    const tag = waTag();
    if (tag === '[web-meta]') return;
    document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a => {
      try {
        const u = new URL(a.href);
        const t = u.searchParams.get('text');
        if (t && t.endsWith('[web-meta]')) {
          u.searchParams.set('text', t.slice(0, -'[web-meta]'.length) + tag);
          a.setAttribute('href', `${CONFIG.WA_ORIGIN}?text=${encodeURIComponent(u.searchParams.get('text'))}`);
        }
      } catch (_) {}
    });
  }
  window.__eterUtm = UTM;

  function toggleMyth(id) {
    const safeId = String(id).replace(/[^0-9]/g, '');
    const body = document.getElementById('myth-body-' + safeId);
    const icon = document.getElementById('myth-icon-' + safeId);
    if (!body || !icon) return;
    if (body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      icon.textContent = '−';
    } else {
      body.classList.add('hidden');
      icon.textContent = '+';
    }
  }

  function filterDiscipline(cat) {
    if (!CONFIG.ALLOWED_FILTERS.includes(cat)) return;
    const dayCards = document.querySelectorAll('.day-card');
    CONFIG.ALLOWED_FILTERS.forEach(f => {
      const btn = document.getElementById('filter-' + f);
      if (!btn) return;
      if (f === cat) {
        btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold bg-[#e6007e] text-white shadow-rosa transition';
      } else {
        btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold bg-[#161332]/80 text-white/80 hover:text-white border border-white/20 transition';
      }
    });

    dayCards.forEach(card => {
      const rows = card.querySelectorAll('.class-row');
      let visibleCount = 0;
      rows.forEach(row => {
        const rowCats = (row.dataset.cat || '').split(' ');
        if (cat === 'all' || rowCats.includes(cat)) {
          row.classList.remove('hidden');
          row.classList.add('flex');
          visibleCount++;
        } else {
          row.classList.add('hidden');
          row.classList.remove('flex');
        }
      });
      if (visibleCount === 0) {
        card.classList.add('hidden');
        card.classList.remove('flex');
      } else {
        card.classList.remove('hidden');
        card.classList.add('flex');
      }
    });
  }

  function selectClass(className) {
    const cleanName = String(className || '').slice(0, 120);
    const label = document.getElementById('selectedScheduleLabel');
    const waBtn = document.getElementById('scheduleWaBtn');
    const stickyBtn = document.getElementById('stickyWaBtn');
    if (!label || !waBtn || !stickyBtn) return;

    label.textContent = cleanName;
    const url = waUrl(`Hola Araceli! Vi la web y quiero reservar una clase de prueba de ${cleanName}. ¿Qué días tienen lugar?`);
    waBtn.setAttribute('href', url);
    stickyBtn.setAttribute('href', url);
    waBtn.setAttribute('data-wa-clase', cleanName);
    stickyBtn.setAttribute('data-wa-clase', cleanName);

    waBtn.classList.add('ring-4', 'ring-white/60');
    setTimeout(() => waBtn.classList.remove('ring-4', 'ring-white/60'), 650);

    if (typeof window.fbq === 'function') {
      window.fbq('track', 'ViewContent', {
        content_name: cleanName,
        content_category: 'Seleccion Horario Grilla'
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tagWaLinks); else tagWaLinks();

  document.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-filter-cat]');
    if (filterBtn) {
      filterDiscipline(filterBtn.getAttribute('data-filter-cat'));
      return;
    }

    const classBtn = e.target.closest('[data-select-class]');
    if (classBtn) {
      selectClass(classBtn.getAttribute('data-select-class'));
      return;
    }

    const mythCard = e.target.closest('[data-toggle-myth]');
    if (mythCard) {
      toggleMyth(mythCard.getAttribute('data-toggle-myth'));
      return;
    }

    // El evento Contact de WhatsApp lo dispara pixel.js (listener delegado único).
    const waLink = e.target.closest('a[href*="wa.me"]');
    if (waLink) {
      const href = waLink.getAttribute('href') || '';
      if (!href.startsWith(CONFIG.WA_ORIGIN)) {
        e.preventDefault();
        window.open(CONFIG.WA_ORIGIN, '_blank', 'noopener,noreferrer');
      }
    }
  });
})();
