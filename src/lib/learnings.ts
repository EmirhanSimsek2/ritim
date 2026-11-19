import {
  COURSES,
  blankDay,
  daySchema,
  shiftDate,
  today,
  type Learning,
  type TrackerState,
} from './model.ts';

export type LearningAction =
  | { type: 'add'; item: Learning }
  | { type: 'edit'; item: Learning }
  | { type: 'remove'; id: string };

// Called with the latest state at mutation time, preserving other day fields.
export function updateLearnings(
  state: TrackerState,
  date: string,
  action: LearningAction,
): TrackerState {
  if (date > today())
    throw Error('Gelecek bir günün öğrenme maddelerini değiştiremezsin.');
  const day = state.days[date] ?? blankDay();
  const items = day.learnings ?? [];
  const id = action.type === 'remove' ? action.id : action.item.id;
  const exists = items.some((item) => item.id === id);
  if (action.type === 'add' && exists)
    throw Error('Bu öğrenme maddesi zaten mevcut.');
  if (action.type !== 'add' && !exists)
    throw Error('Bu madde artık mevcut değil. Güncel listeyi kontrol et.');
  const learnings = action.type === 'add'
    ? [...items, action.item]
    : action.type === 'remove'
      ? items.filter((item) => item.id !== id)
      : items.map((item) => item.id === id ? action.item : item);
  const nextDay = daySchema.parse({ ...day, learnings });
  return { ...state, days: { ...state.days, [date]: nextDay } };
}

export function learningTagName(tag: string) {
  return COURSES.find((course) => course.id === tag)?.name ?? tag;
}

export function weekLearnings(state: TrackerState, week: string) {
  const end = shiftDate(week, 6);
  return Object.entries(state.days)
    .filter(([date, day]) => date >= week && date <= end && day.learnings?.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ date, items: day.learnings }));
}
