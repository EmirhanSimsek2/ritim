import test from 'node:test';
import assert from 'node:assert/strict';
import {clearReadingDay} from '../src/lib/reading.ts';
import {blankDay,daySchema} from '../src/lib/model.ts';
import {legacySession} from './helpers/legacy-progress.mjs';

test('Okuma temizleme sadece sayfa toplamı ve kitap adını değiştirir', () => {
  const day = { ...blankDay(), pages: 20, book: 'Kitap', wake: '08:00', notes: 'Tut', amEnergy: 4 };
  const next = clearReadingDay(day);
  assert.deepEqual(next, { ...day, pages: null, book: '' });
  assert.equal(day.pages, 20);
  assert.ok(daySchema.safeParse(next).success);
});
test('Okuma temizlenirken eski ilerleme arşivi korunur ve boş sayfa geçerli kalır', () => {
  const day = { ...blankDay(), pages: 5, book: 'Kitap', progressSessions: [structuredClone(legacySession)] };
  const next = clearReadingDay(day);
  assert.equal(next.pages, null); assert.equal(next.book, '');
  assert.deepEqual(next.progressSessions, day.progressSessions);
  assert.ok(daySchema.safeParse(next).success);
});
