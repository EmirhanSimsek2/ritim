import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDay, daySchema, initialState, learningSchema, shiftDate, stateSchema, today, weekStart } from '../src/lib/model.ts';
import { learningTagName, updateLearnings, weekLearnings } from '../src/lib/learnings.ts';
import { getPatch } from '../src/lib/patch.ts';

const item = { id: 'fourier', text: 'Ayrık spektrumu öğrendim.', tag: 'ss' };

test('Öğrenme şeması eski gün/yedekleri boş listeyle açar ve yeni yedeği kayıpsız okur', () => {
  const legacy = blankDay();
  delete legacy.learnings;
  assert.deepEqual(daySchema.parse(legacy).learnings, []);
  assert.deepEqual(blankDay().learnings, []);
  const state = initialState();
  state.days[today()] = legacy;
  assert.deepEqual(stateSchema.parse(state).days[today()].learnings, []);
  state.days[today()].learnings = [item, { id: 'general', text: 'Etiketsiz bilgi.' }];
  const exported = JSON.parse(JSON.stringify({ data: state }));
  assert.deepEqual(stateSchema.parse(exported.data).days[today()].learnings, state.days[today()].learnings);
});

test('Öğrenme şeması boş/uzun metni, kimliği, etiketi ve günlük 50 madde sınırını denetler', () => {
  assert.deepEqual(learningSchema.parse({ id: '1', text: '  Bilgi  ', tag: '  Spor  ' }), { id: '1', text: 'Bilgi', tag: 'Spor' });
  for (const bad of [
    { ...item, id: '' }, { ...item, id: 'a'.repeat(101) },
    { ...item, text: '  ' }, { ...item, text: 'a'.repeat(301) },
    { ...item, tag: 'a'.repeat(101) }, { ...item, tag: null },
  ]) assert.equal(learningSchema.safeParse(bad).success, false);
  const learnings = Array.from({ length: 50 }, (_, i) => ({ id: String(i), text: 'Bilgi' }));
  assert.equal(daySchema.safeParse({ ...blankDay(), learnings }).success, true);
  assert.equal(daySchema.safeParse({ ...blankDay(), learnings: [...learnings, item] }).success, false);
});

test('Günlük ekleme/düzenleme/silme güncel diğer kayıtları korur, silinen maddeyi diriltmez', () => {
  const date = today(), state = initialState();
  state.days[date] = { ...blankDay(), notes: 'Güncel günlük', pages: 12 };
  state.days[shiftDate(date, -1)] = { ...blankDay(), learnings: [{ id: 'past', text: 'Dünkü bilgi.' }] };
  const before = JSON.stringify(state);
  const added = updateLearnings(state, date, { type: 'add', item });
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(Object.keys(getPatch(state, added).days.upsert), [date]);
  const concurrent = { ...added, days: { ...added.days, [date]: { ...added.days[date], notes: 'Son not', book: 'Son kitap' } } };
  const edited = updateLearnings(concurrent, date, { type: 'edit', item: { ...item, text: 'Yeni bilgi.', tag: undefined } });
  assert.equal(edited.days[date].notes, 'Son not');
  assert.equal(edited.days[date].book, 'Son kitap');
  assert.equal(edited.days[date].pages, 12);
  assert.equal(edited.days[date].learnings[0].text, 'Yeni bilgi.');
  const removed = updateLearnings(edited, date, { type: 'remove', id: item.id });
  assert.deepEqual(removed.days[date].learnings, []);
  assert.deepEqual(removed.days[shiftDate(date, -1)], state.days[shiftDate(date, -1)]);
  assert.throws(() => updateLearnings(removed, date, { type: 'edit', item }), /artık mevcut değil/);
  assert.throws(() => updateLearnings(added, date, { type: 'add', item }), /zaten mevcut/);
});

test('Günlük mutasyonlar gelecek gün için ekleme, düzenleme ve silmeyi reddeder', () => {
  const state = initialState(), tomorrow = shiftDate(today(), 1);
  state.days[tomorrow] = { ...blankDay(), learnings: [item] };
  const before = JSON.stringify(state);
  for (const action of [{ type: 'add', item: { ...item, id: 'new' } }, { type: 'edit', item }, { type: 'remove', id: item.id }])
    assert.throws(() => updateLearnings(state, tomorrow, action), /Gelecek/);
  assert.equal(JSON.stringify(state), before);
});

test('Haftalık öğrenmeler seçili Pazartesi–Pazar aralığında gün sırasına göre gruplanır', () => {
  const state = initialState(), monday = weekStart(today()), sunday = shiftDate(monday, 6);
  state.days[sunday] = { ...blankDay(), learnings: [item] };
  state.days[shiftDate(monday, -1)] = { ...blankDay(), learnings: [item] };
  state.days[shiftDate(monday, 7)] = { ...blankDay(), learnings: [item] };
  const legacy = blankDay();
  delete legacy.learnings;
  state.days[shiftDate(monday, 1)] = legacy;
  state.days[monday] = { ...blankDay(), learnings: [{ id: 'general', text: 'Genel bilgi.' }, { id: 'sport', text: 'Spor bilgisi.', tag: 'Spor' }] };
  const result = weekLearnings(state, monday);
  assert.deepEqual(result.map(day => day.date), [monday, sunday]);
  assert.deepEqual(result[0].items, state.days[monday].learnings);
  assert.deepEqual(weekLearnings(initialState(), monday), []);
});

test('Ders etiketleri adlarıyla, silinmiş/yeniden adlandırılmış faaliyetler kayıtlı metniyle gösterilir', () => {
  assert.equal(learningTagName('ss'), 'Signals and Systems');
  assert.equal(learningTagName('Eski faaliyet'), 'Eski faaliyet');
  assert.equal(learningTagName('<script>'), '<script>');
});
