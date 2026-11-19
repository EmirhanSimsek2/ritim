import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../worker/index.ts';
import { blankDay, initialState, shiftDate, today, weekStart } from '../src/lib/model.ts';
import { scheduleGoals } from '../src/lib/goals.ts';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const VALID_KEY = 'synthetic-test-key-with-sufficient-length-32-chars';
const KEY_HASH = createHash('sha256').update(VALID_KEY).digest('hex');

function setup() {
  const db = sqliteD1();
  const env = {
    DB: db.DB,
    LOGIN_KEY_HASH: KEY_HASH,
    ASSETS: { fetch() { throw Error('Unexpected asset request'); } },
  };
  async function call(path, { method = 'GET', body, cookie, origin = 'https://ritim.test', ip = '203.0.113.10' } = {}) {
    const headers = { 'CF-Connecting-IP': ip };
    if (origin !== null) headers.Origin = origin;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await worker.fetch(
      new Request('https://ritim.test' + path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      }),
      env,
    );
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  return { ...db, call };
}

test('Worker öğrenmeler: eski istemci eksik alanı korur, açık boş liste siler, 409 veriyi ezmez', async () => {
  const db = setup();
  try {
    const login = await db.call('/api/login', { method: 'POST', body: { key: VALID_KEY } });
    const cookie = login.headers.get('Set-Cookie').split(';')[0];
    await db.call('/api/state', { cookie });
    const date = today(), item = { id: 'learn-1', text: 'Bir bilgi.', tag: 'ss' };
    const put = (revision, day) => db.call('/api/state', {
      method: 'PUT', cookie, body: { revision, patch: { days: { upsert: { [date]: day }, remove: [] } } },
    });
    assert.equal((await put(0, { ...blankDay(), learnings: [item] })).status, 200);
    const oldClient = { ...blankDay(), notes: 'Eski istemci notu' };
    delete oldClient.learnings;
    assert.equal((await put(1, oldClient)).status, 200);
    let stored = (await db.call('/api/state', { cookie })).data.data.days[date];
    assert.deepEqual(stored.learnings, [item]);
    assert.equal(stored.notes, oldClient.notes);
    assert.equal((await put(1, blankDay())).status, 409);
    assert.deepEqual((await db.call('/api/state', { cookie })).data.data.days[date], stored);
    assert.equal((await put(2, { ...stored, learnings: [{ ...item, text: 'Düzenlenen bilgi.' }] })).status, 200);
    stored = (await db.call('/api/state', { cookie })).data.data.days[date];
    assert.equal(stored.learnings[0].text, 'Düzenlenen bilgi.');
    assert.equal((await put(3, { ...stored, learnings: [] })).status, 200);
    assert.deepEqual((await db.call('/api/state', { cookie })).data.data.days[date].learnings, []);
    // Also accepts a legacy daily record with no prior learnings at all.
    assert.equal((await put(4, oldClient)).status, 200);
  } finally { db.close(); }
});

test('Worker öğrenmeler: gelecek güne ekleme/değiştirme/boşaltma/gün silme 400; değişmeyen plan geçer', async () => {
  const db = setup();
  try {
    const login = await db.call('/api/login', { method: 'POST', body: { key: VALID_KEY } });
    const cookie = login.headers.get('Set-Cookie').split(';')[0];
    await db.call('/api/state', { cookie });
    const date = shiftDate(today(), 1), item = { id: 'future-learning', text: 'Yedekten gelen bilgi.' };
    const call = (day, remove = []) => db.call('/api/state', {
      method: 'PUT', cookie, body: { revision: 0, patch: { days: { upsert: day ? { [date]: day } : {}, remove } } },
    });
    assert.equal((await call({ ...blankDay(), learnings: [item] })).status, 400);
    // Existing future backup data may be kept, but never changed by a state patch.
    const stored = { ...blankDay(), learnings: [item] };
    db.sqlite.prepare('INSERT INTO tracker_days(day,payload) VALUES(?,?)').run(date, JSON.stringify(stored));
    for (const learnings of [[], [{ ...item, text: 'Değişen bilgi.' }], [item, { id: 'new', text: 'Yeni bilgi.' }]])
      assert.equal((await call({ ...stored, learnings })).status, 400);
    assert.equal((await call(null, [date])).status, 400);
    assert.equal(db.sqlite.prepare("SELECT revision FROM tracker_meta WHERE id='owner'").get().revision, 0);
    assert.deepEqual(JSON.parse(db.sqlite.prepare('SELECT payload FROM tracker_days WHERE day=?').get(date).payload), stored);
    const oldClientPlan = { ...stored, blocks: [{ id: 'plan', lane: 'activity', title: 'Plan', start: 540, end: 600, category: 'study', status: 'planned', approximate: false, notes: '' }] };
    delete oldClientPlan.learnings;
    assert.equal((await call(oldClientPlan)).status, 200);
    assert.deepEqual((await db.call('/api/state', { cookie })).data.data.days[date].learnings, [item]);
  } finally { db.close(); }
});

test('Worker auth: giriş, oturum, çıkış, Origin koruması ve hız sınırı çalışır', async () => {
  const db = setup();
  try {
    assert.equal((await db.call('/api/session')).status, 401);
    assert.equal((await db.call('/api/state')).status, 401);
    assert.equal((await db.call('/api/login', { method: 'POST', body: { key: VALID_KEY }, origin: 'https://evil.example' })).status, 403);
    assert.equal((await db.call('/api/login', { method: 'POST', body: 'null', ip: '203.0.113.9' })).status, 400);

    for (let i = 0; i < 10; i++) {
      assert.equal((await db.call('/api/login', { method: 'POST', body: { key: 'wrong-key-with-at-least-32-characters-' + i } })).status, 401);
    }
    const limited = await db.call('/api/login', { method: 'POST', body: { key: VALID_KEY } });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '900');

    const ok = await db.call('/api/login', { method: 'POST', body: { key: VALID_KEY }, ip: '203.0.113.11' });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.get('Set-Cookie') ?? '';
    assert.match(setCookie, /ritim_session=[a-f0-9]{64}/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Secure/);
    const sessionCookie = setCookie.split(';')[0];

    assert.equal((await db.call('/api/session', { cookie: sessionCookie })).status, 200);
    const stateRes = await db.call('/api/state', { cookie: sessionCookie });
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.data.revision, 0);

    const out = await db.call('/api/logout', { method: 'POST', cookie: sessionCookie });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('Set-Cookie') ?? '', /Max-Age=0/);
    assert.equal((await db.call('/api/state', { cookie: sessionCookie })).status, 401);
  } finally {
    db.close();
  }
});

test('Worker PUT /api/state: 409 revision çakışması, hedef geçmişi ve gelecek/uyku doğrulaması atomik kalır', async () => {
  const db = setup();
  try {
    const currentWeek = weekStart(today());
    const pastWeek = shiftDate(currentWeek, -7);
    const seed = initialState();
    seed.goals = { from: pastWeek, courseHours: { ss: 4 }, studyTotal: 4, pages: 10, sleepHours: 8 };
    const { entries, days, habitDays, ...seedConfig } = seed;
    db.sqlite.prepare("INSERT INTO tracker_meta(id,revision,config) VALUES('owner',0,?)").run(JSON.stringify(seedConfig));

    const login = await db.call('/api/login', { method: 'POST', body: { key: VALID_KEY } });
    const cookie = login.headers.get('Set-Cookie').split(';')[0];
    const initial = await db.call('/api/state', { cookie });
    const withCurrentGoal = scheduleGoals(
      initial.data.data,
      { from: currentWeek, courseHours: { ss: 6 }, studyTotal: 6, pages: 15, sleepHours: 8 },
      today(),
    );
    const { entries: _e, days: _d, habitDays: _h, ...config } = withCurrentGoal;
    const saved = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: { revision: 0, patch: { config } },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.revision, 1);

    // Null body -> 400
    assert.equal((await db.call('/api/state', { method: 'PUT', cookie, body: 'null' })).status, 400);

    // Stale revision -> 409 without partial writes
    const conflict = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 0,
        patch: {
          entries: { upsert: [{ id: 'e1', date: today(), kind: 'study', subject: 'ss', seconds: 600, topic: 'Test', method: '', focus: null, learning: '', result: '', attempted: null, correct: null, obstacle: '' }], remove: [] },
        },
      },
    });
    assert.equal(conflict.status, 409);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tracker_entries').get().n, 0);

    // Past goal tampering -> 409
    const tamperedConfig = structuredClone(config);
    tamperedConfig.goalHistory[0].pages = 99;
    const tampered = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: { revision: 1, patch: { config: tamperedConfig } },
    });
    assert.equal(tampered.status, 409);

    // Future day non-planned block -> 400
    const tomorrow = shiftDate(today(), 1);
    const futureBlock = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 1,
        patch: {
          days: {
            upsert: {
              [tomorrow]: { ...blankDay(), blocks: [{ id: 'b1', lane: 'activity', title: 'Test', start: 540, end: 600, category: 'study', status: 'happened', approximate: false, notes: '' }] },
            },
            remove: [],
          },
        },
      },
    });
    assert.equal(futureBlock.status, 400);

    // Future habit log -> 400
    const futureHabit = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 1,
        patch: { habitDays: { upsert: { [tomorrow]: { logs: {} } }, remove: [] } },
      },
    });
    assert.equal(futureHabit.status, 400);

    // Future study entry -> 400
    const futureEntry = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 1,
        patch: {
          entries: {
            upsert: [{ id: 'e-future', date: tomorrow, kind: 'study', subject: 'ss', seconds: 600, topic: '', method: '', focus: null, learning: '', result: '', attempted: null, correct: null, obstacle: '' }],
            remove: [],
          },
        },
      },
    });
    assert.equal(futureEntry.status, 400);

    // Future reading/day log -> 400, while future planned block -> 200
    const futureReading = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 1,
        patch: {
          days: { upsert: { [tomorrow]: { ...blankDay(), pages: 12 } }, remove: [] },
        },
      },
    });
    assert.equal(futureReading.status, 400);

    const futurePlanned = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 1,
        patch: {
          days: {
            upsert: {
              [tomorrow]: { ...blankDay(), blocks: [{ id: 'b-plan', lane: 'activity', title: 'Plan', start: 540, end: 600, category: 'study', status: 'planned', approximate: false, notes: '' }] },
            },
            remove: [],
          },
        },
      },
    });
    assert.equal(futurePlanned.status, 200);

    // Invalid sleep interval -> 400
    const badSleep = await db.call('/api/state', {
      method: 'PUT',
      cookie,
      body: {
        revision: 2,
        patch: {
          days: {
            upsert: { [today()]: { ...blankDay(), bedtime: '02:30', wake: '08:00', sleepDate: shiftDate(today(), -1) } },
            remove: [],
          },
        },
      },
    });
    assert.equal(badSleep.status, 400);
  } finally {
    db.close();
  }
});
