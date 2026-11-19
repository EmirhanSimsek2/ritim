(function () {
  var theme = 'dark',
    palette = 'youtube';
  try {
    var t = localStorage.getItem('ritim-theme'),
      p = localStorage.getItem('ritim-palette');
    if (['system', 'light', 'dark'].indexOf(t) !== -1) theme = t;
    if (
      ['forest', 'ocean', 'lavender', 'amber', 'vscode', 'youtube'].indexOf(
        p,
      ) !== -1
    )
      palette = p;
  } catch (e) {}
  var root = document.documentElement;
  root.dataset.theme =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme:dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.dataset.palette = palette;
  function syncChrome() {
    var color = getComputedStyle(root).getPropertyValue('--bg').trim(),
      meta = document.querySelector('meta[name="theme-color"]');
    if (color && meta) meta.setAttribute('content', color);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', syncChrome, { once: true });
  else syncChrome();
})();
