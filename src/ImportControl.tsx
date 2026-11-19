import { useRef, useState } from 'react';
import { Upload, LoaderCircle } from 'lucide-react';
import { stateSchema, type TrackerState } from './lib/model';
import { prepareImport } from './lib/import-backup';
import { fetchJson } from './lib/api';

class ImportRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export default function ImportControl({ revision, onImported }: {
  data: TrackerState;
  revision: number;
  onImported: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const restoring = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function post(path: string, payload: unknown) {
    const { response, data } = await fetchJson<{ id?: string }>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 'Aktarım tamamlanamadı.');
    if (!response.ok) throw new ImportRequestError(data.error || 'Aktarım tamamlanamadı.', response.status);
    return data;
  }

  async function upload(path: string, batches: unknown[][], label: string, total: number) {
    let sent = 0;
    for (const batch of batches) {
      setMessage(`${label} · ${sent}/${total}`);
      await post(path, batch);
      sent += batch.length;
    }
    if (total) setMessage(`${label} · ${sent}/${total}`);
  }

  async function restore(file: File) {
    if (restoring.current) return;
    restoring.current = true;
    setBusy(true);
    setFailed(false);
    setMessage('');
    let commitSent = false;
    try {
      if (file.size > 10000000) throw Error('Yedek dosyası 10 MB sınırını aşıyor.');
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); }
      catch { throw Error('Yedek dosyası okunamadı. Geçerli bir Ritim JSON yedeği seç.'); }
      const source = raw !== null && typeof raw === 'object' && 'data' in raw
        ? raw.data
        : raw;
      const parsed = stateSchema.safeParse(source);
      if (!parsed.success) throw Error('Bu dosya geçerli bir Ritim yedeği değil.');
      const incoming = parsed.data;
      const prepared = prepareImport(incoming, revision);
      const blockCount = Object.values(incoming.days).reduce((sum, day) => sum + day.blocks.length, 0);
      if (!confirm(`${prepared.begin.entries} oturum, ${prepared.begin.days} günlük, ${blockCount} zaman bloğu, ${incoming.habits.length} alışkanlık ve ${prepared.begin.habitDays} gün alışkanlık kaydı geri yüklenecek. Mevcut kayıtların ve alışkanlık planlarının tamamının yerini bu yedek alacak. Önce kendi yedeğini indirdiğinden emin ol. Devam edilsin mi?`)) return;
      setBusy(true);
      setMessage('Yedek hazırlanıyor…');
      const started = await post('/api/import/begin', prepared.begin);
      if (!started.id || !/^[a-f0-9-]{36}$/.test(started.id))
        throw Error('Aktarım başlatılamadı. Sunucudan geçerli bir yanıt alınamadı.');
      const base = `/api/import/${started.id}`;
      await upload(base + '/entries', prepared.entries, 'Oturumlar aktarılıyor', prepared.begin.entries);
      await upload(base + '/days', prepared.days, 'Günlükler aktarılıyor', prepared.begin.days);
      await upload(base + '/habit-days', prepared.habitDays, 'Alışkanlık kayıtları aktarılıyor', prepared.begin.habitDays);
      commitSent = true;
      setMessage('Yedek doğrulanıyor…');
      await post(base + '/commit', {});
      setMessage('Yedek geri yüklendi.');
      onImported();
    } catch (cause) {
      setFailed(true);
      const error = cause instanceof Error ? cause.message : 'Aktarım tamamlanamadı.';
      const rejected = cause instanceof ImportRequestError && [400, 401, 403, 404, 409, 413, 429].includes(cause.status);
      setMessage(error + (commitSent && !rejected
        ? ' Son onayın sonucu doğrulanamadı. Yeniden aktarmadan önce kayıtlarını yenileyip kontrol et.'
        : ' Mevcut kayıtların değiştirilmedi.'));
    } finally {
      restoring.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="import-control">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.[0]) restore(event.target.files[0]);
        }}
      />
      <button className="text-button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}
        Yedekten geri yükle
      </button>
      {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'import-error' : 'import-status'}>{message}</p>}
    </div>
  );
}
