import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDay, initialState, shiftDate, today, stateSchema, summarise } from '../src/lib/model.ts';
import { movePlanBlock, recordPlanSession, setPlanOutcome, startPlanTimer } from '../src/lib/plan-actions.ts';
import { pendingPlans, planSummary } from '../src/lib/plan-summary.ts';
import { getPatch, patchSchema } from '../src/lib/patch.ts';

const date = today(), yesterday = shiftDate(date, -1), tomorrow = shiftDate(date, 1);
const block = { id: 'task', lane: 'activity', title: 'Sunumu hazırla', category: 'study', subject: 'eng', start: 600, end: 720, status: 'planned', approximate: false, notes: '' };
const entry = { id: 'session', date, kind: 'study', subject: 'eng', seconds: 1200, topic: block.title, method: '', focus: null, learning: '', result: '', attempted: null, correct: null, obstacle: '', planId: block.id, planDate: date };
function state(d = date) {
  return { ...initialState(), days: { [d]: { ...blankDay(), pages: 12, notes: 'Korunmalı', blocks: [block] } } };
}

test('Geçmişteki kayıtsız iş başarısız sayılmaz; konumlar ve gelecek günler geçmiş listesine girmez', () => {
  const s = state(yesterday);
  s.days[date] = { ...blankDay(), blocks: [{ ...block, id: 'today' }] };
  s.days[tomorrow] = { ...blankDay(), blocks: [{ ...block, id: 'future' }] };
  s.days[yesterday].blocks.push({ ...block, id: 'place', lane: 'location', start: 0, end: 60 });
  assert.deepEqual(pendingPlans(s).map(item => item.block.id), ['task']);
  assert.deepEqual(planSummary(s, yesterday), { total: 1, done: 0, missed: 0, moved: 0, cancelled: 0, pending: 1 });
  assert.equal(planSummary(s, '2020-01-01').total, 0);
});

test('İki tamamlanan ve iki ertelenen iş eski günde 2/4 kalır; taşımalar tek yamadadır', () => {
  const s = state(yesterday);
  s.days[yesterday].blocks = [
    { ...block, id: 'done1', status: 'happened', flexible: true },
    { ...block, id: 'done2', status: 'happened', flexible: true },
    { ...block, flexible: true },
    { ...block, id: 'other', flexible: true },
  ];
  const next = movePlanBlock(movePlanBlock(s, yesterday, 'task', date), yesterday, 'other', date);
  assert.deepEqual(planSummary(next, yesterday), { total: 4, done: 2, moved: 2, missed: 0, cancelled: 0, pending: 0 });
  assert.equal(planSummary(next, date).pending, 2);
  assert.equal(pendingPlans(next).length, 0);
  const patch = getPatch(s, next);
  assert.deepEqual(Object.keys(patch.days.upsert).sort(), [yesterday, date].sort());
  assert.ok(patchSchema.safeParse(patch).success);
  assert.ok(stateSchema.safeParse(next).success);
  assert.equal(next.days[yesterday].pages, 12);
  assert.equal(s.days[yesterday].blocks.length, 4);
});

test('Bir iş farklı günlere tekrar taşınabilir; geri geldiğinde aynı günde iki kez sayılmaz', () => {
  const a = state(yesterday);
  const b = movePlanBlock(a, yesterday, 'task', date);
  const c = movePlanBlock(b, date, 'task', tomorrow);
  assert.equal(planSummary(c, yesterday).moved, 1);
  assert.equal(planSummary(c, date).moved, 1);
  assert.equal(c.days[tomorrow].blocks[0].original.date, yesterday);
  const back = movePlanBlock(c, tomorrow, 'task', yesterday);
  assert.equal(back.days[yesterday].planMoves.length, 0);
  assert.equal(planSummary(back, yesterday).total, 1);
  assert.equal(planSummary(back, yesterday).pending, 1);
  const sameDay = movePlanBlock(back, yesterday, 'task', yesterday, 780);
  assert.equal(planSummary(sameDay, yesterday).moved, 0);
  assert.equal(planSummary(sameDay, yesterday).total, 1);
});

test('Bugüne al esnek iş ekler; mevcut saatlerle çakışmaz ve süreyi korur', () => {
  const s = state(yesterday);
  s.days[date] = { ...blankDay(), blocks: [{ ...block, id: 'existing' }] };
  const next = movePlanBlock(s, yesterday, 'task', date, undefined, true);
  const moved = next.days[date].blocks.find(item => item.id === 'task');
  assert.equal(moved.flexible, true);
  assert.equal(moved.start, 0);
  assert.equal(moved.end, 120);
  assert.equal(moved.original.start, 600);
  assert.ok(stateSchema.safeParse(next).success);
});

test('Yapılmadı ve vazgeçildi ayrı sonuçlardır; geri alınabilir, süre üretmez', () => {
  const s = state(yesterday);
  const missed = setPlanOutcome(s, yesterday, 'task', 'missed');
  assert.equal(planSummary(missed, yesterday).missed, 1);
  assert.equal(pendingPlans(missed).length, 0);
  assert.equal(missed.entries.length, 0);
  const cancelled = setPlanOutcome(missed, yesterday, 'task', 'cancelled');
  assert.equal(planSummary(cancelled, yesterday).cancelled, 1);
  assert.equal(planSummary(cancelled, yesterday).missed, 0);
  const restored = setPlanOutcome(cancelled, yesterday, 'task', 'planned');
  assert.equal(pendingPlans(restored).length, 1);
  assert.equal(restored.days[yesterday].notes, 'Korunmalı');
  assert.throws(() => setPlanOutcome(state(tomorrow), tomorrow, 'task', 'missed'));
});

test('Devam edeceğim seçimi 20 dakikayı kaydeder, 2 saatlik işi tamamlamaz; tamamlandı seçimi atomiktir', () => {
  const before = startPlanTimer(state(), date, 'task');
  assert.throws(() => recordPlanSession(before, entry, ''));
  assert.equal(before.timer.planId, 'task');
  const continuing = recordPlanSession(before, entry, 'continue');
  assert.equal(continuing.timer, null);
  assert.equal(continuing.days[date].blocks[0].status, 'planned');
  assert.equal(summarise(continuing, date, date).studySeconds, 1200);
  const complete = recordPlanSession(before, entry, 'complete');
  assert.equal(planSummary(complete, date).done, 1);
  const patch = getPatch(before, complete);
  assert.equal(patch.config.timer, null);
  assert.equal(patch.entries.upsert[0].seconds, 1200);
  assert.equal(patch.days.upsert[date].blocks[0].status, 'happened');
  assert.ok(patchSchema.safeParse(patch).success);
  assert.equal(summarise(complete, date, date).studySeconds, 1200);
  assert.throws(() => setPlanOutcome(before, date, 'task', 'missed'));
});

test('Eski yedekler erteleme alanı olmadan açılır; yeni yedekler sonuç ve geçmişi korur', () => {
  const old = state(yesterday);
  delete old.days[yesterday].planMoves;
  const parsed = stateSchema.parse(old);
  assert.deepEqual(parsed.days[yesterday].planMoves, []);
  const next = movePlanBlock(parsed, yesterday, 'task', date);
  const roundtrip = stateSchema.parse(JSON.parse(JSON.stringify(next)));
  assert.equal(roundtrip.days[yesterday].planMoves[0].to, date);
  assert.equal(roundtrip.days[date].blocks[0].original.date, yesterday);
  assert.equal(planSummary(roundtrip, yesterday).total, 1);
});

test('Çakışmalı yeniden açma ve kapalı işi taşıma atomik olarak reddedilir', () => {
  const s = setPlanOutcome(state(), date, 'task', 'missed');
  s.days[date].blocks.push({ ...block, id: 'replacement' });
  const before = JSON.stringify(s);
  assert.throws(() => setPlanOutcome(s, date, 'task', 'planned'));
  assert.throws(() => movePlanBlock(s, date, 'task', tomorrow));
  assert.throws(() => startPlanTimer(s, date, 'task'));
  assert.equal(JSON.stringify(s), before);
});
