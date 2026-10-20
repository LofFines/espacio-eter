(() => {
      'use strict';

      const CONFIG = Object.freeze({
        WA_ORIGIN: 'https://wa.me/5491123978429',
        ALLOWED_FILTERS: Object.freeze(['all', 'pole', 'complemento', 'baile'])
      });

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
        const msg = encodeURIComponent(
          `Hola Espacio Éter! ✨ Vi la grilla de clases y quiero consultar cupos en San Martín 39 (Ciudadela) para el horario de: ${cleanName}. ¿Quedan lugares disponibles?`
        );
        const url = `${CONFIG.WA_ORIGIN}?text=${msg}`;
        waBtn.setAttribute('href', url);
        stickyBtn.setAttribute('href', url);

        waBtn.classList.add('ring-4', 'ring-white/60');
        setTimeout(() => waBtn.classList.remove('ring-4', 'ring-white/60'), 650);
      }

      // Delegación centralizada de eventos (sin atributos onclick inline)
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

        const waLink = e.target.closest('a[href*="wa.me"]');
        if (waLink) {
          const href = waLink.getAttribute('href') || '';
          // Protección Anti-Hijacking: verificar que siempre apunte al número oficial de Espacio Éter
          if (!href.startsWith(CONFIG.WA_ORIGIN)) {
            e.preventDefault();
            window.open(CONFIG.WA_ORIGIN, '_blank', 'noopener,noreferrer');
            return;
          }
          if (typeof window.fbq === 'function') {
            const ev = waLink.hasAttribute('data-lead') ? 'Lead' : 'Contact';
            window.fbq('track', ev, {
              content_name: (waLink.getAttribute('data-wa-origen') || 'general').slice(0, 40),
              content_category: 'Pole Ciudadela'
            });
          }
        }
      });
    })();
