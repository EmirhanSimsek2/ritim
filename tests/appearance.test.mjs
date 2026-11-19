import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
function bootstrap({ stored = {}, blocked = false, systemDark = false, color = '#0f0f0f' } = {}) {
  const root = { dataset: {} };
  const listeners = [];
  const meta = { color: '#0f0f0f', setAttribute(name, value) { assert.equal(name, 'content'); this.color = value; } };
  const requests = [];
  runInNewContext(source, {
    localStorage: { getItem(key) { if (blocked) throw Error('blocked'); return stored[key] ?? null; } },
    matchMedia: () => ({ matches: systemDark }),
    document: { documentElement: root, readyState: 'loading', querySelector: () => meta, addEventListener(name, callback) { assert.equal(name, 'DOMContentLoaded'); listeners.push(callback); } },
    getComputedStyle: () => ({ getPropertyValue(name) { requests.push(name); return color; } }),
  });
  return { root, meta, requests, ready() { listeners.forEach(callback => callback()); } };
}

test('Tercihsiz açılış Obsidyen/Koyu başlar; pencere rengi vurgu yerine arka plandır', () => {
  const result = bootstrap();
  assert.equal(result.root.dataset.palette, 'youtube');
  assert.equal(result.root.dataset.theme, 'dark');
  result.ready();
  assert.equal(result.meta.color, '#0f0f0f');
  assert.deepEqual(result.requests, ['--bg']);
});

test('Kaydedilmiş palet/açık/sistem seçimleri korunur; CSS hazır olduğunda pencere rengi eşitlenir', () => {
  const light = bootstrap({ stored: { 'ritim-palette': 'ocean', 'ritim-theme': 'light' }, color: '#f2f6fc' });
  assert.equal(light.root.dataset.palette, 'ocean');
  assert.equal(light.root.dataset.theme, 'light');
  assert.equal(light.meta.color, '#0f0f0f');
  light.ready();
  assert.equal(light.meta.color, '#f2f6fc');
  const system = bootstrap({ stored: { 'ritim-palette': 'vscode', 'ritim-theme': 'system' }, systemDark: true, color: '#282c34' });
  system.ready();
  assert.equal(system.root.dataset.theme, 'dark');
  assert.equal(system.meta.color, '#282c34');
});

test('Geçersiz veya erişilemeyen yerel tercihler Obsidyen/Koyu güvenli varsayılanına döner', () => {
  for (const options of [{ blocked: true }, { stored: { 'ritim-palette': 'unknown', 'ritim-theme': 'unknown' } }]) {
    const result = bootstrap(options);
    result.ready();
    assert.equal(result.root.dataset.theme, 'dark');
    assert.equal(result.root.dataset.palette, 'youtube');
  }
});
