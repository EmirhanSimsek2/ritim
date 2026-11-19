import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyRound, LogIn } from 'lucide-react';
import Tracker from './Tracker';
import ThemeControl from './theme';
import { fetchJson } from './lib/api';
import './globals.css';
import './dark.css';
import './palettes.css';
import './records.css';
import './workspace.css';
export default function App() {
  const [status, setStatus] = useState<'loading' | 'in' | 'out'>('loading');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check() {
    try {
      const { response, data } = await fetchJson<Record<string, unknown>>(
        '/api/session', { cache: 'no-store' }, 'Bağlantı kurulamadı.',
      );
      if (response.status === 401) { setStatus('out'); return; }
      if (!response.ok) throw Error(data.error);
      setStatus('in');
    } catch (cause) {
      setStatus('out');
      setError(cause instanceof Error ? cause.message : 'Bağlantı kurulamadı.');
    }
  }
  useEffect(() => {
    check();
    const expired = () => setStatus('out');
    window.addEventListener('ritim-session-expired', expired);
    return () => window.removeEventListener('ritim-session-expired', expired);
  }, []);

  async function login(form: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    setError('');
    const key = String(new FormData(form).get('key')).trim();
    try {
      const { response, data } = await fetchJson<Record<string, unknown>>('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }, 'Giriş yapılamadı.');
      if (!response.ok) throw Error(data.error);
      setStatus('in');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Giriş yapılamadı.');
    } finally { setBusy(false); }
  }

  if (status === 'in') return <Tracker />;
  if (status === 'loading') return (
    <main className="load-screen"><span className="brand-mark">r.</span><p>Özel alanın açılıyor…</p></main>
  );
  return (
    <main className="login-page">
      <div className="login-theme"><ThemeControl /></div>
      <section className="login-card">
        <span className="brand-mark">r.</span>
        <span className="eyebrow">KENDİ TEMPOYLA İLERLE</span>
        <h1>Ritim’e hoş geldin.</h1>
        <p>Zamanın, öğrenmen ve kendin için ayırdığın küçük anlar.</p>
        <form onSubmit={(event) => { event.preventDefault(); login(event.currentTarget); }}>
          <label className="field">
            <span><KeyRound size={14} /> Kişisel giriş anahtarın</span>
            <input name="key" type="password" autoComplete="current-password" required minLength={32} maxLength={200} placeholder="Giriş anahtarını yapıştır" autoCapitalize="none" spellCheck={false} />
          </label>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="button primary full" disabled={busy}>
            <LogIn size={17} />{busy ? 'Kontrol ediliyor…' : 'Özel alanıma gir'}
          </button>
        </form>
        <div className="login-note">
          <KeyRound size={17} />
          <p>Anahtarın bu cihazda oturum açar. Oturumun 30 gün sürer; anahtarını parola yöneticinde saklayabilirsin.</p>
        </div>
        <small>AI aboneliği gerekmez · Verilerin kişisel hesabında</small>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.pathname.replace(/\/$/, '') === '/onizleme' ? <Tracker demo /> : <App />}</StrictMode>,
);
