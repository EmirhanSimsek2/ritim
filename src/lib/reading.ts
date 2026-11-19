import type { Day } from './model.ts';

export function clearReadingDay<T extends Day>(day: T): T {
  return { ...day, pages: null, book: '' };
}
