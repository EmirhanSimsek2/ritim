import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../src/lib/api.ts';

async function response(body, status, action) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(body, { status });
  try { await action(); } finally { globalThis.fetch = previous; }
}
test('HTML/boş hata yanıtları teknik ayrıştırma hatası yerine anlaşılır mesaj ve HTTP durumu taşır', async () => {
  for (const status of [401, 409, 413, 429, 502, 504]) {
    await response('<html>upstream secret diagnostic</html>', status, async () => {
      const result = await fetchJson('/api/state', {}, 'Kayıtlar yüklenemedi.');
      assert.equal(result.response.status, status);
      assert.ok(result.data.error);
      assert.doesNotMatch(result.data.error, /SyntaxError|Unexpected|<html>|secret/);
    });
  }
});
test('Geçerli hata mesajı korunur; hata nesnesi veya bozuk başarılı yanıt arayüze sızmaz', async () => {
  await response(JSON.stringify({ error: 'Kaydı kontrol et.' }), 400, async () => {
    assert.equal((await fetchJson('/api/state', {}, 'Kaydedilemedi.')).data.error, 'Kaydı kontrol et.');
  });
  await response('{"error":{"detail":"internal"}}', 503, async () => {
    assert.doesNotMatch((await fetchJson('/api/state', {}, 'Kaydedilemedi.')).data.error, /internal|object/);
  });
  for (const body of ['', 'null', '[]', '<html>upstream</html>']) {
    await response(body, 200, async () => {
      await assert.rejects(fetchJson('/api/state', {}, 'Kayıtlar yüklenemedi.'), /geçerli bir yanıt alınamadı/);
    });
  }
  await response('{"revision":3}', 200, async () => {
    assert.equal((await fetchJson('/api/state', {}, 'Kaydedilemedi.')).data.revision, 3);
  });
});
test('Ağ kopmasında tarayıcı TypeError metni yerine Türkçe yeniden deneme mesajı gelir', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw TypeError('Failed to fetch private detail'); };
  try { await assert.rejects(fetchJson('/api/state', {}, 'Kaydedilemedi.'), /Bağlantını kontrol edip yeniden dene/); }
  finally { globalThis.fetch = previous; }
});
test('Askıda kalan fetch veya gövde akışı süre sınırıyla iptal edilip Türkçe hata verir', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = (_path, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    await assert.rejects(
      fetchJson('/api/state', {}, 'Kayıtlar yüklenemedi.', 20),
      /Sunucu zamanında yanıt vermedi\. Bağlantını kontrol edip yeniden dene/,
    );

    globalThis.fetch = async (_path, init) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }),
    });
    await assert.rejects(
      fetchJson('/api/state', {}, 'Kayıtlar yüklenemedi.', 20),
      /Sunucu zamanında yanıt vermedi\. Bağlantını kontrol edip yeniden dene/,
    );

    const external = new AbortController();
    globalThis.fetch = (_path, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const pending = fetchJson('/api/state', { signal: external.signal }, 'Kayıtlar yüklenemedi.', 5000);
    external.abort();
    await assert.rejects(pending, /Kayıtlar yüklenemedi\. Bağlantını kontrol edip yeniden dene/);
  } finally {
    globalThis.fetch = previous;
  }
});
