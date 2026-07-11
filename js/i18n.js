// t(key) — reads window.appState.settings.language, falls back to en-US, then the raw key.
window.t = function t(key) {
  const lang = window.appState && window.appState.settings ? window.appState.settings.language : 'en-US';
  const dict = window.LOCALES[lang] || window.LOCALES['en-US'];
  return dict[key] || window.LOCALES['en-US'][key] || key;
};
