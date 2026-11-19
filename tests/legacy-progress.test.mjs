import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../worker/index.ts';
import { blankDay, daySchema, initialState, stateSchema, summarise } from '../src/lib/model.ts';
import { getPatch, patchSchema } from '../src/lib/patch.ts';
import { prepareImport } from '../src/lib/import-backup.ts';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { legacyDefinition, legacySession } from './helpers/legacy-progress.mjs';

const date = '2026-11-01';
function fixture() {
  return { ...initialState(), jars: [structuredClone(legacyDefinition)],
    days: { [date]: { ...blankDay(), pages: 12, book: 'Kitap', notes: 'Korunacak not', progressSessions: [structuredClone(legacySession)] } } };
}
test('Eski tanım ve ilerleme geçmişi JSON yedeğinde kayıpsız korunur', () => {
  const source = fixture(), parsed = stateSchema.parse(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(parsed.jars, source.jars);
  assert.deepEqual(parsed.days[date], source.days[date]);
});
test('Yeni ve eski kayıtlarda uyumluluk alanı yoksa boş veriyle açılır', () => {
  const { jars, ...old } = initialState();
  const { progressSessions, ...day } = blankDay();
  assert.deepEqual(stateSchema.parse(old).jars, []);
  assert.deepEqual(daySchema.parse(day).progressSessions, []);
});
test('Eski ilerleme yeni okuma sayısını sınırlamaz veya raporda yeniden sayılmaz', () => {
  const state = fixture(); state.days[date].pages = 1;
  assert.ok(daySchema.safeParse(state.days[date]).success);
  const summary = summarise(state, date, date);
  assert.equal(summary.pages, 1); assert.equal(summary.studySeconds, 0);
  assert.equal(summary.attempted, 0);
});
test('Okuma yaması eski alanları korur ve kaldırılan özellik için yeni ayar üretmez', () => {
  const source = fixture();
  const next = { ...source, days: { ...source.days, [date]: { ...source.days[date], pages: 1 } } };
  const patch = getPatch(source, next);
  assert.ok(patchSchema.safeParse(patch).success);
  assert.equal(patch.config, undefined);
  assert.deepEqual(patch.days.upsert[date].progressSessions, source.days[date].progressSessions);
});
test('Yedek aktarım hazırlığı eski veriyi silmez veya aktif okuma toplamına eklemez', () => {
  const source = fixture(), before = structuredClone(source);
  const prepared = prepareImport(source, 3);
  assert.deepEqual(prepared.begin.config.jars, source.jars);
  assert.deepEqual(prepared.days.flat()[0].data.progressSessions, source.days[date].progressSessions);
  assert.equal(prepared.days.flat()[0].data.pages, 12);
  assert.deepEqual(source, before);
});
test('Worker: normal okuma ve eski istemcinin eksik alanları kayıt geçmişini silmez', async () => {
  const db = sqliteD1(), source = fixture();
  try {
    const { entries, days, habitDays, ...config } = source;
    db.sqlite.prepare("INSERT INTO tracker_meta(id,revision,config) VALUES('owner',0,?)").run(JSON.stringify(config));
    db.sqlite.prepare('INSERT INTO tracker_days(day,payload) VALUES(?,?)').run(date, JSON.stringify(days[date]));
    const token = 'c'.repeat(64);
    db.sqlite.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').run(createHash('sha256').update(token).digest('hex'), Date.now() + 60000);
    async function call(method, payload) {
      const response = await worker.fetch(new Request('https://ritim.test/api/state', { method,
        headers: { Origin: 'https://ritim.test', Cookie: 'ritim_session=' + token, 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      }), { DB: db.DB });
      return { status: response.status, data: await response.json() };
    }
    let saved = await call('GET');
    const reduced = { ...saved.data.data.days[date], pages: 1 };
    assert.equal((await call('PUT', { revision: saved.data.revision, patch: { days: { upsert: { [date]: reduced }, remove: [] } } })).status, 200);
    saved = await call('GET');
    assert.deepEqual(saved.data.data.jars, source.jars);
    assert.deepEqual(saved.data.data.days[date].progressSessions, source.days[date].progressSessions);
    assert.equal(saved.data.data.days[date].pages, 1);
    const { progressSessions, ...oldDay } = saved.data.data.days[date];
    const oldConfig = { ...config }; delete oldConfig.jars;
    assert.equal((await call('PUT', { revision: saved.data.revision, patch: { config: oldConfig,
      days: { upsert: { [date]: { ...oldDay, notes: 'Yeni not' } }, remove: [] },
    } })).status, 200);
    saved = await call('GET');
    assert.deepEqual(saved.data.data.jars, source.jars);
    assert.deepEqual(saved.data.data.days[date].progressSessions, source.days[date].progressSessions);
    assert.equal(saved.data.data.days[date].notes, 'Yeni not');
  } finally { db.close(); }
});
