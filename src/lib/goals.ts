import {
  COURSES,
  goalHistorySchema,
  goalSchema,
  shiftDate,
  today,
  weekStart,
  type Goals,
  type TrackerState,
} from './model.ts';

type GoalState = Pick<TrackerState, 'goals' | 'goalHistory'>;
export const STUDY_DAYS = [
  { id: 1, label: 'Pzt' },
  { id: 2, label: 'Sal' },
  { id: 3, label: 'Çrş' },
  { id: 4, label: 'Per' },
  { id: 5, label: 'Cum' },
  { id: 6, label: 'Cmt' },
  { id: 0, label: 'Paz' },
];
export const DEFAULT_STUDY_DAYS = [1, 2, 3, 4, 5];

export function goalSchedule(state: GoalState): Goals[] {
  return state.goalHistory?.length
    ? state.goalHistory
    : state.goals.from
      ? [state.goals]
      : [];
}

export function goalsAt(state: GoalState, date: string): Goals | undefined {
  return goalSchedule(state)
    .filter((goal) => goal.from <= date)
    .at(-1);
}

export function hasGoalValues(goal: Goals | undefined): boolean {
  return (
    !!goal &&
    (Object.keys(goal.courseHours).length > 0 ||
      goal.pages !== null ||
      goal.sleepHours !== null)
  );
}

export function weeklyGoalHours(goal: Goals | undefined): number {
  return goal
    ? (goal.studyTotal ??
        Object.values(goal.courseHours).reduce((sum, value) => sum + value, 0))
    : 0;
}

export function dailyStudyProgress(state: TrackerState, date: string) {
  const goal = goalsAt(state, date);
  const weekday = new Date(date + 'T12:00Z').getUTCDay();
  if (!goal || goal.studyMode !== 'daily' || !goal.studyDays?.includes(weekday))
    return undefined;
  const targetSeconds = (weeklyGoalHours(goal) / goal.studyDays.length) * 3600;
  if (targetSeconds <= 0) return undefined;
  const seconds = state.entries
    .filter((entry) => entry.date === date && entry.kind === 'study')
    .reduce((sum, entry) => sum + (entry.seconds ?? 0), 0);
  return { seconds, targetSeconds };
}

export function convertGoalInputs(
  values: Record<string, string>,
  from: 'weekly' | 'daily',
  to: 'weekly' | 'daily',
  dayCount: number,
) {
  if (from === to || dayCount < 1) return { ...values };
  const factor = to === 'daily' ? 1 / dayCount : dayCount;
  return Object.fromEntries(
    Object.entries(values).map(([id, value]) => [
      id,
      value === '' ? '' : String(Number((Number(value) * factor).toFixed(9))),
    ]),
  );
}

export function goalsFromForm(form: FormData): Goals {
  const mode = String(form.get('studyMode') ?? 'weekly');
  if (mode !== 'weekly' && mode !== 'daily')
    throw Error('Günlük veya haftalık hedef seç.');
  const days = form.getAll('studyDays').map(Number);
  if (mode === 'daily' && !days.length)
    throw Error('En az bir çalışma günü seç.');
  const hours: Record<string, number> = {};
  for (const course of COURSES) {
    const input = String(form.get(course.id) ?? '').trim();
    if (input !== '')
      hours[course.id] = Number(
        (Number(input) * (mode === 'daily' ? days.length : 1)).toFixed(8),
      );
  }
  const nullable = (name: string) => {
    const value = String(form.get(name) ?? '').trim();
    return value === '' ? null : Number(value);
  };
  const parsed = goalSchema.safeParse({
    from: String(form.get('from') ?? ''),
    studyMode: mode,
    ...(mode === 'daily' ? { studyDays: days } : {}),
    courseHours: hours,
    studyTotal: Object.keys(hours).length
      ? Object.values(hours).reduce((sum, value) => sum + value, 0)
      : null,
    pages: nullable('pages'),
    sleepHours: nullable('sleepHours'),
  });
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  return parsed.data;
}

export function scheduleGoals(
  state: TrackerState,
  goal: Goals,
  currentDate = today(),
): TrackerState {
  const parsed = goalSchema.safeParse(goal);
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  if (!goal.from || weekStart(goal.from) !== goal.from)
    throw Error('Hedeflerin başlangıcı için Pazartesi seç.');
  if (goal.from < weekStart(currentDate))
    throw Error(
      'Geçmiş haftaların hedefleri değiştirilemez. Bu haftayı veya sonraki bir haftayı seç.',
    );
  const history = goalHistorySchema.safeParse(
    [
      ...goalSchedule(state).filter((item) => item.from !== goal.from),
      parsed.data,
    ].sort((a, b) => a.from.localeCompare(b.from)),
  );
  if (!history.success) throw Error(history.error.issues[0].message);
  return { ...state, goals: history.data.at(-1)!, goalHistory: history.data };
}

export function goalsForWeek(state: GoalState, week: string) {
  return goalsAt(state, shiftDate(week, 6));
}

export function goalIdentity(goal: Goals, legacy = false) {
  return JSON.stringify([
    goal.from,
    Object.entries(goal.courseHours).sort(([a], [b]) => a.localeCompare(b)),
    goal.studyTotal,
    goal.pages,
    goal.sleepHours,
    ...(legacy
      ? []
      : [
          goal.studyMode ?? 'weekly',
          goal.studyMode === 'daily' ? [...(goal.studyDays ?? [])].sort() : [],
        ]),
  ]);
}

// Configs from older clients may omit the schedule. Preserve it or reject edits that would erase it.
export function protectGoalHistory(
  previous: GoalState,
  next: GoalState,
  includesHistory: boolean,
  currentDate = today(),
): GoalState {
  const oldHistory = goalSchedule(previous);
  if (!includesHistory && previous.goalHistory?.length) {
    if (goalIdentity(next.goals, true) !== goalIdentity(previous.goals, true)) {
      throw Error(
        'Hedefleri değiştirmek için güncel uygulamayı aç. Mevcut hedef geçmişin korundu.',
      );
    }
    return { goals: previous.goals, goalHistory: previous.goalHistory };
  }
  if (next.goalHistory?.length) {
    if (goalIdentity(next.goals) !== goalIdentity(next.goalHistory.at(-1)!))
      throw Error('Hedef ve hedef geçmişi eşleşmiyor.');
    const oldPast = oldHistory.filter(
      (goal) => goal.from < weekStart(currentDate),
    );
    const nextPast = next.goalHistory.filter(
      (goal) => goal.from < weekStart(currentDate),
    );
    if (
      JSON.stringify(oldPast.map((goal) => goalIdentity(goal))) !==
      JSON.stringify(nextPast.map((goal) => goalIdentity(goal)))
    )
      throw Error('Geçmiş haftaların hedefleri korunmalı.');
  } else if (previous.goalHistory?.length) {
    throw Error('Hedef geçmişi kaldırılamaz.');
  }
  return {
    goals: next.goals,
    ...(next.goalHistory ? { goalHistory: next.goalHistory } : {}),
  };
}
