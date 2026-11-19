import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDay, initialState, stateSchema } from '../src/lib/model.ts';
import { getPatch, patchSchema } from '../src/lib/patch.ts';
import {
  convertGoalInputs, dailyStudyProgress, goalIdentity, goalSchedule, goalsAt,
  goalsForWeek, goalsFromForm, protectGoalHistory, scheduleGoals,
} from '../src/lib/goals.ts';

const current = '2026-11-16', earlier = '2026-11-09', later = '2026-11-23';
const weekly = { from: earlier, courseHours: { ss: 6 }, studyTotal: 6, pages: 10, sleepHours: 8 };
const daily = { from: current, studyMode: 'daily', studyDays: [1, 3, 5], courseHours: { ss: 3, eng: 1.5 }, studyTotal: 4.5, pages: 20, sleepHours: 7.5 };
function state() { return { ...initialState(), goals: structuredClone(weekly) }; }
function form(overrides = {}, days = [1, 2, 3, 4, 5]) {
  const values = new FormData();
  for (const [key, value] of Object.entries({ from: current, studyMode: 'daily', ss: '2', eng: '', pages: '', sleepHours: '', ...overrides })) values.set(key, value);
  for (const day of days) values.append('studyDays', String(day));
  return values;
}

test('Hedef karşılaştırması yalnız alan sırasından değişiklik üretmez; gerçek dönem değişikliklerini ayırır', () => {
  const goal = { ...daily, courseHours: { ss: 3, eng: 1.5 } };
  assert.equal(goalIdentity(goal), goalIdentity({ ...goal, courseHours: { eng: 1.5, ss: 3 }, studyDays: [5, 3, 1] }));
  assert.equal(goalIdentity(weekly), goalIdentity({ ...weekly, studyMode: 'weekly' }));
  for (const change of [
    { pages: 44 }, { sleepHours: 9 }, { from: later },
    { studyDays: [1, 2, 3] }, { studyMode: 'weekly' },
    { courseHours: { ss: 4, eng: 0.5 } },
  ]) assert.notEqual(goalIdentity(goal), goalIdentity({ ...goal, ...change }));
});

test('Eski haftalık hedef yeni tarihçe olmadan aynı hafta ve tarihte okunur', () => {
  const s = state();
  assert.deepEqual(goalSchedule(s), [weekly]);
  assert.equal(goalsAt(s, '2026-11-08'), undefined);
  assert.deepEqual(goalsForWeek(s, earlier), weekly);
  assert.equal(dailyStudyProgress(s, current), undefined);
  assert.ok(stateSchema.safeParse(s).success);
});

test('Günlük 2 saat ve beş gün tek bir 10 saatlik haftalık hedef üretir; boş ve sıfır ayrıdır', () => {
  const goal = goalsFromForm(form({ eng: '0' }));
  assert.deepEqual(goal.courseHours, { eng: 0, ss: 10 });
  assert.equal(goal.studyTotal, 10);
  assert.equal(goal.pages, null);
  assert.equal(goal.sleepHours, null);
  assert.equal(goal.studyMode, 'daily');
  assert.equal(goal.studyDays.length, 5);
  const normal = goalsFromForm(form({ studyMode: 'weekly', ss: '6' }, []));
  assert.equal(normal.courseHours.ss, 6);
  assert.equal(normal.studyDays, undefined);
});

test('Günlük hedef günsüz/tekrarlı/geçersiz günle kaydedilmez; 24/168 toplamları denetlenir', () => {
  assert.throws(() => goalsFromForm(form({}, [])));
  assert.throws(() => goalsFromForm(form({}, [1, 1])));
  assert.throws(() => goalsFromForm(form({}, [9])));
  assert.throws(() => goalsFromForm(form({ ss: '20', eng: '5' }, [1])));
  assert.throws(() => goalsFromForm(form({ studyMode: 'weekly', ss: '100', eng: '100' }, [])));
  assert.throws(() => goalsFromForm(form({ ss: 'NaN' })));
  assert.throws(() => goalsFromForm(form({ ss: '-1' })));
});

test('Haftalık/günlük geçiş haftalık toplamı korur ve boş alanlara hedef eklemez', () => {
  const values = { ss: '6', eng: '', la: '0' };
  assert.deepEqual(convertGoalInputs(values, 'weekly', 'daily', 3), { ss: '2', eng: '', la: '0' });
  assert.deepEqual(convertGoalInputs(convertGoalInputs(values, 'weekly', 'daily', 3), 'daily', 'weekly', 3), values);
  const fraction = convertGoalInputs({ ss: '5' }, 'weekly', 'daily', 3);
  assert.ok(Math.abs(Number(convertGoalInputs(fraction, 'daily', 'weekly', 3).ss) - 5) < 0.000001);
  assert.equal(goalsFromForm(form({ ss: '1.5' }, [2])).studyTotal, 1.5);
});

test('Yeni dönem geçmiş ders/okuma/uyku hedeflerini korur; gelecek hedef erkenden uygulanmaz', () => {
  const before = state();
  const s = scheduleGoals(before, daily, current);
  const next = scheduleGoals(s, { ...daily, from: later, courseHours: { ss: 9 }, studyTotal: 9, pages: 30 }, current);
  assert.deepEqual(goalsAt(next, '2026-11-15'), weekly);
  assert.deepEqual(goalsAt(next, '2026-11-22'), daily);
  assert.equal(goalsAt(next, later).pages, 30);
  assert.equal(goalsForWeek(next, earlier).courseHours.ss, 6);
  assert.equal(goalsForWeek(next, current).courseHours.ss, 3);
  assert.equal(goalsForWeek(next, later).courseHours.ss, 9);
  assert.equal(before.goalHistory, undefined);
  assert.equal(before.goals.pages, 10);
});

test('Aynı başlangıç dönemi güncellenir; geçmiş haftaya veya pazartesi dışına yazılmaz', () => {
  const s = scheduleGoals(state(), daily, current);
  const next = scheduleGoals(s, { ...daily, pages: 25 }, current);
  assert.equal(next.goalHistory.length, 2);
  assert.equal(goalsAt(next, current).pages, 25);
  assert.equal(goalsAt(next, earlier).pages, 10);
  assert.throws(() => scheduleGoals(next, { ...daily, from: earlier }, current));
  assert.throws(() => scheduleGoals(next, { ...daily, from: '2026-11-17' }, current));
});

test('Araya eklenen gelecek dönem sıralanır; en ileri dönem ve önceki hedefler kaybolmaz', () => {
  const s = scheduleGoals(state(), { ...daily, from: '2026-11-30' }, current);
  const next = scheduleGoals(s, { ...daily, from: later, pages: 12 }, current);
  assert.deepEqual(next.goalHistory.map(goal => goal.from), [earlier, later, '2026-11-30']);
  assert.equal(next.goals.from, '2026-11-30');
  assert.equal(goalsAt(next, later).pages, 12);
});

test('Günlük ilerleme sadece seçili tarihteki ders sürelerini sayar; görev/aktivite süre üretmez', () => {
  const s = scheduleGoals(state(), daily, current);
  const entry = { id: 'study', date: current, kind: 'study', subject: 'ss', seconds: 2700, topic: '', method: '', focus: null, learning: '', result: '', attempted: null, correct: null, obstacle: '' };
  s.entries = [entry, { ...entry, id: 'activity', kind: 'activity', seconds: 3600 }, { ...entry, id: 'past', date: earlier, seconds: 7200 }];
  s.days[current] = { ...blankDay(), blocks: [{ id: 'planned', lane: 'activity', title: 'Çalış', start: 0, end: 120, flexible: true, category: 'study', status: 'happened', approximate: false, notes: '' }] };
  assert.deepEqual(dailyStudyProgress(s, current), { seconds: 2700, targetSeconds: 5400 });
  assert.equal(dailyStudyProgress(s, '2026-11-17'), undefined);
  assert.equal(dailyStudyProgress(s, earlier), undefined);
  s.entries.push({ ...entry, id: 'extra', seconds: 7200 });
  assert.equal(dailyStudyProgress(s, current).seconds, 9900);
});

test('Hedef kaldırma yalnız yeni dönemden itibaren geçerlidir; günlük sıfır hedef çubuğu üretmez', () => {
  const s = scheduleGoals(state(), { ...daily, courseHours: {}, studyTotal: null, pages: null, sleepHours: null }, current);
  assert.equal(goalsAt(s, earlier).pages, 10);
  assert.equal(goalsAt(s, current).pages, null);
  assert.equal(dailyStudyProgress(s, current), undefined);
});

test('Hedef kaydı yalnız config yamasına girer; eski/yeni JSON yedekleri ve günlükler korunur', () => {
  const before = state();
  before.days[earlier] = { ...blankDay(), pages: 7, notes: 'Korunmalı' };
  const next = scheduleGoals(before, daily, current);
  const patch = getPatch(before, next);
  assert.equal(patch.days, undefined);
  assert.equal(patch.entries, undefined);
  assert.equal(patch.config.goalHistory.length, 2);
  assert.ok(patchSchema.safeParse(patch).success);
  const copy = stateSchema.parse(JSON.parse(JSON.stringify(next)));
  assert.equal(goalsAt(copy, earlier).pages, 10);
  assert.equal(goalsAt(copy, current).studyMode, 'daily');
  assert.equal(copy.days[earlier].notes, 'Korunmalı');
});

test('Eski istemcinin eksik tarihçesi günlük düzeni silmez; eski hedef düzenlemesi reddedilir', () => {
  const s = scheduleGoals(state(), daily, current);
  const legacy = { ...daily }; delete legacy.studyMode; delete legacy.studyDays;
  assert.deepEqual(protectGoalHistory(s, { goals: legacy }, false, current), { goals: s.goals, goalHistory: s.goalHistory });
  assert.throws(() => protectGoalHistory(s, { goals: { ...legacy, pages: 99 } }, false, current));
});

test('Tarihçe/son hedef uyuşmazlığı, geçmişin değiştirilmesi ve silinmesi reddedilir', () => {
  const s = scheduleGoals(state(), daily, current);
  assert.throws(() => protectGoalHistory(s, { ...s, goalHistory: [] }, true, current));
  assert.throws(() => protectGoalHistory(s, { ...s, goals: weekly }, true, current));
  assert.throws(() => protectGoalHistory(s, { ...s, goalHistory: [{ ...weekly, pages: 1 }, daily] }, true, current));
  assert.deepEqual(protectGoalHistory(state(), s, true, current).goalHistory, s.goalHistory);
});
