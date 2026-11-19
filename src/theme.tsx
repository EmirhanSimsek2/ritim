import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Palette } from 'lucide-react';
const PALETTES = [
  { id: 'forest', name: 'Orman' },
  { id: 'ocean', name: 'Okyanus' },
  { id: 'lavender', name: 'Lavanta' },
  { id: 'amber', name: 'Kehribar' },
  { id: 'vscode', name: 'Arduvaz' },
  { id: 'youtube', name: 'Obsidyen' },
];
const MODES = ['system', 'light', 'dark'];
function preference(key: string, allowed: string[], fallback: string) {
  try {
    const value = localStorage.getItem(key);
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
export default function ThemeControl() {
  const [theme, setTheme] = useState(() =>
    preference('ritim-theme', MODES, 'dark'),
  );
  const [palette, setPalette] = useState(() =>
    preference(
      'ritim-palette',
      PALETTES.map((p) => p.id),
      'youtube',
    ),
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme:dark)');
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      root.dataset.palette = palette;
      const color = getComputedStyle(root).getPropertyValue('--bg').trim();
      if (color)
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute('content', color);
    };
    apply();
    try {
      localStorage.setItem('ritim-theme', theme);
      localStorage.setItem('ritim-palette', palette);
    } catch {}
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, palette]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === 'ritim-theme' || e.key === null)
        setTheme(preference('ritim-theme', MODES, 'dark'));
      if (e.key === 'ritim-palette' || e.key === null)
        setPalette(
          preference(
            'ritim-palette',
            PALETTES.map((p) => p.id),
            'youtube',
          ),
        );
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return (
    <div
      className="appearance-controls"
      role="group"
      aria-label="Görünüm ayarları"
    >
      <label className="theme-control palette-control">
        <span className="sr-only">Renk paleti</span>
        <Palette size={15} />
        <select
          aria-label="Renk paleti"
          value={palette}
          onChange={(e) => setPalette(e.target.value)}
        >
          {PALETTES.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="theme-control">
        <span className="sr-only">Görünüm</span>
        {theme === 'dark' ? (
          <Moon size={15} />
        ) : theme === 'light' ? (
          <Sun size={15} />
        ) : (
          <Monitor size={15} />
        )}
        <select
          aria-label="Görünüm"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="system">Sistem</option>
          <option value="light">Açık</option>
          <option value="dark">Koyu</option>
        </select>
      </label>
    </div>
  );
}
