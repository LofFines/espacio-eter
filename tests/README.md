# Pruebas de seguridad de reservas (no tocan nada real)

- `node tests/gs-tests.js` → corre `apps-script/Code.gs` en Node con mocks de SpreadsheetApp, CacheService, LockService,
  UrlFetchApp y PropertiesService (47 casos: fórmulas, fechas raras, null, 5 KB, planes inválidos, prueba en clase sin prueba,
  duplicados, más de 3 pendientes, honeypot, topes, Turnstile, errores internos). Resultado en `gs-results.txt`.
- `python3 -m http.server 8931 --bind 127.0.0.1` y `node tests/e2e-reservas.js` (requiere `playwright` y Chrome) → Playwright
  headless con el backend mockeado con `page.route` (ningún request a script.google.com), Meta y Google abortados.
  Resultado en `e2e-results.txt` y `e2e-results.json`.
- `node tests/puppeteer-reservas.js` (puppeteer-core + Chrome, servidor local en el puerto 8822) → links de la landing a `reservas.html`,
  flujo suelta / prueba / Acro infantil, `acepto: true` en el POST, sin precio de la clase de prueba y XSS en el resumen.
  Backend mockeado con request interception (ningún request a script.google.com). Resultado en `puppeteer-results.txt`.
