import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../worker/index.ts';
import { prepareImport } from '../src/lib/import-backup.ts';
import { blankDay, initialState, shiftDate, stateSchema } from '../src/lib/model.ts';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const date = '2026-11-08';
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function largeBackup() {
  const state = initialState();
  const logs = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i), {
    status: 'done', note: 'ş'.repeat(1000), obstacle: 'ğ'.repeat(300),
  }]));
  state.habitDays = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [shiftDate(date, -i), { logs }]));
  return stateSchema.parse(state);
}
function setup(options) {
  const db = sqliteD1(options);
  const { entries, days, habitDays, ...config } = initialState();
  db.sqlite.prepare("INSERT INTO tracker_meta(id,revision,config) VALUES('owner',7,?)").run(JSON.stringify(config));
  db.sqlite.prepare('INSERT INTO tracker_days(day,payload) VALUES(?,?)').run(date, JSON.stringify({ ...blankDay(), notes: 'Mevcut not' }));
  const token = 'a'.repeat(64);
  db.sqlite.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').run(createHash('sha256').update(token).digest('hex'), Date.now() + 60000);
  const env = { DB: db.DB, ASSETS: { fetch() { throw Error('Unexpected asset request'); } } };
  async function call(path, payload) {
    db.resetQueries();
    const response = await worker.fetch(new Request('https://ritim.test' + path, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { Origin: 'https://ritim.test', Cookie: 'ritim_session=' + token, 'Content-Type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }), env);
    return { status: response.status, data: await response.json() };
  }
  const snapshot = () => JSON.stringify(['tracker_meta', 'tracker_entries', 'tracker_days', 'tracker_habit_days'].map(table =>
    db.sqlite.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()));
  return { ...db, call, snapshot };
}

test('Öğrenmeler: eski ve yeni JSON yedeği paket ve son onaydan kayıpsız geçer', async () => {
  const db = setup();
  try {
    const state = initialState(), oldDay = blankDay();
    delete oldDay.learnings;
    state.days[date] = oldDay;
    state.days[shiftDate(date, -1)] = { ...blankDay(), learnings: [
      { id: 'course', text: 'Fourier serisini öğrendim.', tag: 'ss' },
      { id: 'general', text: 'Genel bilgi.' },
      { id: 'old-tag', text: 'Faaliyet bilgisi.', tag: 'Kaldırılan faaliyet' },
    ] };
    const exported = JSON.parse(JSON.stringify({ data: state }));
    const incoming = stateSchema.parse(exported.data), prepared = prepareImport(incoming, 7);
    const begin = await db.call('/api/import/begin', prepared.begin);
    const base = '/api/import/' + begin.data.id;
    for (const batch of prepared.days) assert.equal((await db.call(base + '/days', batch)).status, 200);
    assert.equal((await db.call(base + '/commit', {})).status, 200);
    assert.deepEqual((await db.call('/api/state')).data.data.days, incoming.days);
  } finally { db.close(); }
});

test('Öğrenmeler: ham eski günlük paketinde alan eksikliği boş listeye dönüşür', async () => {
  const db = setup();
  try {
    const prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 1 });
    const base = '/api/import/' + begin.data.id, legacy = blankDay();
    delete legacy.learnings;
    assert.equal((await db.call(base + '/days', [{ date, data: legacy }])).status, 200);
    assert.equal((await db.call(base + '/commit', {})).status, 200);
    assert.deepEqual((await db.call('/api/state')).data.data.days[date].learnings, []);
  } finally { db.close(); }
});

test('Öğrenmeler: bozuk madde hem pakette hem önceden hazırlanmış işin son onayında reddedilir', async () => {
  const db = setup();
  try {
    const before = db.snapshot(), prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 1 });
    const base = '/api/import/' + begin.data.id;
    const invalid = { ...blankDay(), learnings: [{ id: 'bad', text: '  ' }] };
    assert.equal((await db.call(base + '/days', [{ date, data: invalid }])).status, 400);
    db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)').run(begin.data.id, date, JSON.stringify(invalid));
    assert.equal((await db.call(base + '/commit', {})).status, 400);
    assert.equal(db.snapshot(), before);
  } finally { db.close(); }
});

test('Büyük UTF-8 alışkanlık yedeği tüm türler için önceden ve kayıpsız küçük paketlere ayrılır', () => {
  const backup = largeBackup(), before = JSON.stringify(backup);
  const oldBatch = Object.entries(backup.habitDays).map(([date, data]) => ({ date, data }));
  assert.ok(bytes(oldBatch) > 250000, 'Old fixed-size batch exceeds Worker body limit');
  const prepared = prepareImport(backup, 7);
  assert.equal(prepared.begin.habitDays, 20);
  assert.deepEqual(prepared.habitDays.flat(), oldBatch);
  for (const batches of [prepared.entries, prepared.days, prepared.habitDays])
    for (const batch of batches) { assert.ok(batch.length <= 20); assert.ok(bytes(batch) <= 220000); }
  assert.equal(JSON.stringify(backup), before);
});

test('1200 günlük yedek son onayı 50 D1 çağrısı sınırı altında tamamlanır', async () => {
  const db = setup({ maxQueries: 50 });
  try {
    const count = 1200, prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: count });
    const insert = db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)');
    const payload = JSON.stringify(blankDay());
    db.sqlite.exec('BEGIN');
    for (let i = 0; i < count; i++) insert.run(begin.data.id, shiftDate('2020-01-01', i), payload);
    db.sqlite.exec('COMMIT');
    const result = await db.call('/api/import/' + begin.data.id + '/commit', {});
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(db.metrics.queries < 50, String(db.metrics.queries));
    assert.ok(db.metrics.maxPayloadBytes <= 1000000);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tracker_days').get().n, count);
  } finally { db.close(); }
});
test('Geçersiz uyku veya tek büyük kayıt/ayar aktarım başlamadan reddedilir; yedek değişmez', () => {
  const backup = initialState();
  backup.days[date] = { ...blankDay(), bedtime: '02:30', wake: '08:00', sleepDate: shiftDate(date, -1) };
  const before = JSON.stringify(backup);
  assert.throws(() => prepareImport(backup, 7), /2026-11-08.*uyku kaydı geçersiz/);
  assert.equal(JSON.stringify(backup), before);
  delete backup.days[date];
  backup.habitDays[date] = { logs: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), { status: 'done', note: 'ş'.repeat(1000), obstacle: 'ğ'.repeat(300) }])) };
  assert.throws(() => prepareImport(backup, 7), /tek bir kayıt/);
  backup.habitDays = {};
  backup.exams = Array.from({ length: 500 }, (_, i) => ({ id: String(i), course: 'ss', label: 'Sınav', start: '', end: '', note: 'ş'.repeat(1000), source: '' }));
  assert.throws(() => prepareImport(backup, 7), /ayarları tek aktarım sınırını/);
});
test('Worker HTTP + SQLite: büyük alışkanlık yedeği commit öncesi mevcut veriye dokunmadan aktarılır', async () => {
  const db = setup();
  try {
    const backup = largeBackup(), prepared = prepareImport(backup, 7), before = db.snapshot();
    const begin = await db.call('/api/import/begin', prepared.begin);
    assert.equal(begin.status, 200);
    const base = '/api/import/' + begin.data.id;
    const oldBatch = Object.entries(backup.habitDays).map(([date, data]) => ({ date, data }));
    assert.equal((await db.call(base + '/habit-days', oldBatch)).status, 413);
    for (const batch of prepared.habitDays) assert.equal((await db.call(base + '/habit-days', batch)).status, 200);
    assert.equal(db.snapshot(), before);
    assert.equal((await db.call(base + '/commit', {})).status, 200);
    const saved = await db.call('/api/state');
    assert.equal(saved.data.revision, 8);
    assert.deepEqual(saved.data.data.habitDays, backup.habitDays);
    assert.deepEqual(saved.data.data.days, {});
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM import_jobs').get().n, 0);
  } finally { db.close(); }
});
test('Worker günlük paketindeki tek geçersiz uyku bütün paketi ve eksik commit işlemini reddeder', async () => {
  const db = setup();
  try {
    const before = db.snapshot(), prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 2 });
    const base = '/api/import/' + begin.data.id;
    const result = await db.call(base + '/days', [
      { date, data: blankDay() },
      { date: shiftDate(date, 1), data: { ...blankDay(), bedtime: '02:30', wake: '08:00', sleepDate: date } },
    ]);
    assert.equal(result.status, 400); assert.match(result.data.error, /uyku kaydı geçersiz/);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM import_days').get().n, 0);
    assert.equal((await db.call(base + '/commit', {})).status, 409);
    assert.equal(db.snapshot(), before);
  } finally { db.close(); }
});
test('Eski Worker ile hazırlanmış geçersiz uyku commit sırasında da reddedilir', async () => {
  const db = setup();
  try {
    const before = db.snapshot(), prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 25 });
    for (let i = 0; i < 25; i++) {
      const day = shiftDate(date, i);
      db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)').run(begin.data.id, day, JSON.stringify(i === 24
        ? { ...blankDay(), bedtime: '02:30', wake: '08:00', sleepDate: shiftDate(day, -1) }
        : blankDay()));
    }
    const result = await db.call('/api/import/' + begin.data.id + '/commit', {});
    assert.equal(result.status, 400); assert.match(result.data.error, /uyku kaydı geçersiz/);
    assert.equal(db.snapshot(), before);
  } finally { db.close(); }
});

test('50000 küçük günlük sayım üst sınırında dahi son onay sorgu ve sayfa boyutu sınırında kalır', async () => {
  const db = setup({ maxQueries: 50 });
  try {
    const count = 50000, prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: count });
    const insert = db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)');
    const payload = JSON.stringify(blankDay());
    db.sqlite.exec('BEGIN');
    for (let i = 0; i < count; i++) insert.run(begin.data.id, shiftDate('1800-01-01', i), payload);
    db.sqlite.exec('COMMIT');
    assert.equal((await db.call('/api/import/' + begin.data.id + '/commit', {})).status, 200);
    assert.ok(db.metrics.queries < 50, String(db.metrics.queries));
    assert.ok(db.metrics.maxPayloadBytes <= 1000000);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tracker_days').get().n, count);
  } finally { db.close(); }
});

test('Büyük günlükler bayt sayfasını aşınca sonraki sayfadaki geçersiz uyku da bulunur', async () => {
  const db = setup({ maxQueries: 50 });
  try {
    const before = db.snapshot(), prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 300 });
    const insert = db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)');
    for (let i = 0; i < 300; i++) {
      const day = shiftDate('2020-01-01', i);
      insert.run(begin.data.id, day, JSON.stringify({ ...blankDay(), notes: 'ş'.repeat(2000),
        ...(i === 299 ? { bedtime: '02:30', wake: '08:00', sleepDate: shiftDate(day, -1) } : {}),
      }));
    }
    const result = await db.call('/api/import/' + begin.data.id + '/commit', {});
    assert.equal(result.status, 400); assert.match(result.data.error, /uyku kaydı geçersiz/);
    assert.ok(db.metrics.queries >= 6, 'Must inspect a second payload page');
    assert.ok(db.metrics.maxPayloadBytes <= 1000000);
    assert.equal(db.snapshot(), before);
  } finally { db.close(); }
});

for (const [name, payload] of [
  ['JSON', '{broken'],
  ['schema', '{"wake":17}'],
  ['blocks-null', JSON.stringify({ ...blankDay(), blocks: [null] })],
  ['planMoves-null', JSON.stringify({ ...blankDay(), planMoves: [null] })],
  ['progressSessions-null', JSON.stringify({ ...blankDay(), progressSessions: [null] })],
  ['blocks-conflict', JSON.stringify({
    ...blankDay(),
    blocks: [
      { id: 'b1', lane: 'activity', title: 'A', start: 540, end: 600, category: 'study', status: 'planned', approximate: false, notes: '' },
      { id: 'b2', lane: 'activity', title: 'B', start: 570, end: 630, category: 'study', status: 'planned', approximate: false, notes: '' },
    ],
  })],
]) {
  test(`Eski aktarım işindeki bozuk ${name} verisi son onaydan önce reddedilir`, async () => {
    const db = setup();
    try {
      const before = db.snapshot(), prepared = prepareImport(initialState(), 7);
      const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 1 });
      db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)').run(begin.data.id, date, payload);
      assert.equal((await db.call('/api/import/' + begin.data.id + '/commit', {})).status, 400);
      assert.equal(db.snapshot(), before);
    } finally { db.close(); }
  });
}

test('Doğrulama bütçesini aşan doğrudan API yedeği 50 çağrıya ulaşmadan güvenli reddedilir', async () => {
  const db = setup({ maxQueries: 50 });
  try {
    const count = 4000, before = db.snapshot(), prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: count });
    const insert = db.sqlite.prepare('INSERT INTO import_days(job,day,payload) VALUES(?,?,?)');
    const payload = JSON.stringify({ ...blankDay(), notes: '漢'.repeat(2000) });
    db.sqlite.exec('BEGIN');
    for (let i = 0; i < count; i++) insert.run(begin.data.id, shiftDate('2000-01-01', i), payload);
    db.sqlite.exec('COMMIT');
    const result = await db.call('/api/import/' + begin.data.id + '/commit', {});
    assert.equal(result.status, 400); assert.match(result.data.error, /doğrulama sınırını/);
    assert.ok(db.metrics.queries < 50, String(db.metrics.queries));
    assert.equal(db.snapshot(), before);
  } finally { db.close(); }
});

test('Çok paketli uzun oturumlar ve günlükler gerçek Worker üzerinden eksiksiz aktarılır', async () => {
  const db = setup();
  try {
    const incoming = initialState();
    incoming.entries = Array.from({ length: 40 }, (_, i) => ({
      id: 'entry-' + i, date, kind: 'study', subject: 'ss', seconds: 600,
      topic: '漢'.repeat(500), method: '漢'.repeat(100), focus: null,
      learning: '', result: '漢'.repeat(2000), attempted: null, correct: null, obstacle: '漢'.repeat(500),
    }));
    for (let i = 0; i < 6; i++) incoming.days[shiftDate(date, -i)] = {
      ...blankDay(), blocks: Array.from({ length: 40 }, (_, id) => ({
        id: 'block-' + id, lane: 'activity', title: 'Örnek iş', start: 0, end: 60,
        flexible: true, category: 'study', subject: 'ss', status: 'planned', approximate: false, notes: '漢'.repeat(500),
      })),
    };
    const expected = stateSchema.parse(incoming);
    const prepared = prepareImport(expected, 7);
    assert.ok(prepared.entries.length > 1); assert.ok(prepared.days.length > 1);
    const begin = await db.call('/api/import/begin', prepared.begin);
    const base = '/api/import/' + begin.data.id;
    for (const type of ['entries', 'days']) for (const batch of prepared[type]) {
      assert.ok(bytes(batch) <= 220000);
      assert.equal((await db.call(base + '/' + type, batch)).status, 200);
    }
    assert.equal((await db.call(base + '/commit', {})).status, 200);
    const saved = (await db.call('/api/state')).data.data;
    const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const byId = entries => [...entries].sort((a, b) => a.id.localeCompare(b.id));
    const byDate = days => Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
    assert.equal(saved.entries.length, expected.entries.length);
    assert.equal(digest(byId(saved.entries)), digest(byId(expected.entries)));
    assert.equal(digest(byDate(saved.days)), digest(byDate(expected.days)));
  } finally { db.close(); }
});
test('Geçerli kısmi/eski günlük yedeği kabul edilir; arada değişen revision mevcut veriyi korur', async () => {
  const db = setup();
  try {
    const legacy = { ...blankDay(), wake: '08:00' };
    delete legacy.planMoves; delete legacy.progressSessions; delete legacy.blocks;
    const prepared = prepareImport(initialState(), 7);
    const begin = await db.call('/api/import/begin', { ...prepared.begin, days: 1 });
    const base = '/api/import/' + begin.data.id;
    assert.equal((await db.call(base + '/days', [{ date, data: legacy }])).status, 200);
    db.sqlite.prepare("UPDATE tracker_meta SET revision=8 WHERE id='owner'").run();
    const before = db.snapshot();
    assert.equal((await db.call(base + '/commit', {})).status, 409);
    assert.equal(db.snapshot(), before);
    const again = await db.call('/api/import/begin', { ...prepared.begin, revision: 8, days: 1 });
    const newBase = '/api/import/' + again.data.id;
    assert.equal((await db.call(newBase + '/days', [{ date, data: legacy }])).status, 200);
    assert.equal((await db.call(newBase + '/commit', {})).status, 200);
    const saved = await db.call('/api/state');
    assert.equal(saved.data.data.days[date].wake, '08:00');
    assert.equal(saved.data.data.days[date].sleepDate, '');
    assert.deepEqual(saved.data.data.days[date].blocks, []);
  } finally { db.close(); }
});
