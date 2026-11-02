// Apply the saved appearance before styles paint to avoid a light flash.
(function () {
  'use strict';
  var icons = {
    light: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
    dark: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>'
  };
  function theme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function icon() { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[theme()] + '</svg>'; }
  function label() { return theme() === 'dark' ? 'เปิดโหมดสว่าง' : 'เปิดโหมดมืด'; }
  function apply(value) {
    document.documentElement.setAttribute('data-theme', value === 'dark' ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme() === 'dark' ? '#000000' : '#ffffff');
    document.querySelectorAll('[data-act="toggle-theme"]').forEach(function (button) {
      button.innerHTML = icon(); button.setAttribute('aria-label', label()); button.setAttribute('title', label());
      button.setAttribute('aria-pressed', String(theme() === 'dark'));
    });
  }
  var saved = 'light';
  try { saved = window.localStorage.getItem('csm_theme') || 'light'; } catch (e) {}
  apply(saved);
  window.CSMTheme = {
    toggle: function () {
      apply(theme() === 'dark' ? 'light' : 'dark');
      try { window.localStorage.setItem('csm_theme', theme()); } catch (e) {}
    },
    button: function (extraClass) {
      return '<button type="button" class="icon-btn-dark theme-toggle ' + (extraClass || '') + '" data-act="toggle-theme" aria-label="' + label() + '" title="' + label() + '" aria-pressed="' + (theme() === 'dark') + '">' + icon() + '</button>';
    }
  };
  window.addEventListener('storage', function (event) { if (event.key === 'csm_theme') apply(event.newValue); });
})();
