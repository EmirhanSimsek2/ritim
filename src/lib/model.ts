import { z } from 'zod';
import { blockSchema, blocksSchema, planTemplatesSchema } from './timeline.ts';
import { legacyJarSchema, legacyProgressSchema } from './legacy-progress.ts';

export const COURSES = [
  {
    id: 'de',
    name: 'Differential Equations',
    code: 'MATH 207',
    color: '#6c7be4',
  },
  { id: 'eng', name: 'English 101', code: 'ENG 101', color: '#c98056' },
  {
    id: 'prog',
    name: 'Introduction to Programming',
    code: 'EE 101',
    color: '#389789',
  },
  { id: 'la', name: 'Linear Algebra', code: 'MATH 103/165', color: '#ae77bd' },
  { id: 'na', name: 'Numerical Analysis', code: 'MATH 261', color: '#ceab45' },
  { id: 'ss', name: 'Signals and Systems', code: 'EE 204', color: '#6b9eca' },
];
const nullableScore = z.number().int().min(1).max(5).nullable();
const optionalNumber = z.number().int().min(0).max(100000).nullable();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T12:00:00Z');
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, 'Geçerli bir tarih gir.');
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .or(z.literal(''));
const habitScheduleSchema = z.object({
  from: dateSchema,
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((ds) => new Set(ds).size === ds.length),
});
export const habitSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['build', 'break']),
  area: z.string().max(100),
  why: z.string().max(500),
  identity: z.string().max(300),
  cue: z.string().max(300),
  place: z.string().max(200),
  smallStep: z.string().trim().min(1).max(300),
  environment: z.string().max(500),
  reward: z.string().max(300),
  schedules: z
    .array(habitScheduleSchema)
    .min(1)
    .max(200)
    .refine(
      (ss) => ss.every((s, i) => i === 0 || s.from > ss[i - 1].from),
      'Gün planları tarih sırasıyla gelmeli.',
    ),
  pauses: z
    .array(z.object({ from: dateSchema, to: dateSchema.nullable() }))
    .max(200)
    .refine(
      (ps) =>
        ps.every(
          (p, i) =>
            (p.to === null || p.to >= p.from) &&
            (p.to !== null || i === ps.length - 1) &&
            (i === 0 || (ps[i - 1].to !== null && p.from >= ps[i - 1].to!)),
        ),
      'Ara tarihlerini kontrol et.',
    ),
});
export const habitLogSchema = z.object({
  status: z.enum(['done', 'minimum', 'missed', 'skip']),
  note: z.string().max(1000),
  obstacle: z.string().max(300),
});
export const habitDaySchema = z.object({
  logs: z.record(z.string().min(1).max(100), habitLogSchema),
  review: z
    .object({
      worked: z.string().max(1000),
      blocked: z.string().max(1000),
      change: z.string().max(1000),
    })
    .optional(),
});
export type Habit = z.infer<typeof habitSchema>;
export type HabitLog = z.infer<typeof habitLogSchema>;
export type HabitDay = z.infer<typeof habitDaySchema>;
export const entrySchema = z
  .object({
    id: z.string().min(1).max(100),
    date: dateSchema,
    kind: z.enum(['study', 'activity']),
    subject: z.string().min(1).max(100),
    seconds: z.number().int().min(1).max(86400).nullable(),
    topic: z.string().max(500),
    method: z.string().max(100),
    focus: nullableScore,
    learning: z.enum(['', 'independent', 'partial', 'stuck']),
    result: z.string().max(2000),
    attempted: optionalNumber,
    correct: optionalNumber,
    obstacle: z.string().max(500),
    planId: z.string().min(1).max(100).optional(),
    planDate: dateSchema.optional(),
    actualStartedAt: z.number().finite().min(0).optional(),
    actualEndedAt: z.number().finite().min(0).optional(),
  })
  .refine(
    (e) => e.kind === 'activity' || e.seconds !== null,
    'Ders çalışması için süre gir. Süresiz kayıt ders dışı faaliyetlerde kullanılabilir.',
  )
  .refine(
    (e) =>
      e.correct === null || (e.attempted !== null && e.correct <= e.attempted),
    'Doğru sayısı denenen sorudan fazla olamaz.',
  );
export const learningSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(300),
  tag: z.string().trim().max(100).optional(),
});
export type Learning = z.infer<typeof learningSchema>;

export const daySchema = z
  .object({
    blocks: blocksSchema.default([]),
    learnings: z.array(learningSchema).max(50).default([]),
    planMoves: z
      .array(z.object({ block: blockSchema, to: dateSchema }))
      .max(300)
      .refine(
        (items) =>
          new Set(items.map((item) => item.block.id)).size === items.length,
        'Erteleme kayıtları tekrarlanamaz.',
      )
      .default([]),
    progressSessions: legacyProgressSchema.default([]),
    bedtime: time,
    wake: time,
    sleepDate: dateSchema.or(z.literal('')),
    pages: z.number().int().min(0).max(10000).nullable(),
    book: z.string().max(300),
    amEnergy: nullableScore,
    amMood: nullableScore,
    pmEnergy: nullableScore,
    pmMood: nullableScore,
    notes: z.string().max(2000),
  });
export const examSchema = z
  .object({
    id: z.string().min(1).max(100),
    course: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    start: dateSchema.or(z.literal('')),
    end: dateSchema.or(z.literal('')),
    note: z.string().max(2000),
    source: z.string().max(500),
  })
  .refine(
    (e) => !e.end || (!!e.start && e.end >= e.start),
    'Bitiş tarihi başlangıçtan önce olamaz.',
  );
export const goalSchema = z
  .object({
    from: dateSchema.or(z.literal('')),
    studyTotal: z.number().min(0).max(168).nullable(),
    courseHours: z.record(z.string(), z.number().min(0).max(168)),
    pages: z.number().int().min(0).max(10000).nullable(),
    sleepHours: z.number().min(0).max(24).nullable(),
    studyMode: z.enum(['weekly', 'daily']).optional(),
    studyDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine(
        (days) => new Set(days).size === days.length,
        'Çalışma günleri tekrarlanamaz.',
      )
      .optional(),
  })
  .superRefine((goal, context) => {
    const total = Object.values(goal.courseHours).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (total > 168)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Haftalık ders hedeflerinin toplamı 168 saati aşamaz.',
      });
    if (goal.studyMode === 'daily') {
      if (!goal.studyDays?.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'En az bir çalışma günü seç.',
        });
      else if (total / goal.studyDays.length > 24)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Günlük ders hedeflerinin toplamı 24 saati aşamaz.',
        });
    }
  });
export type Goals = z.infer<typeof goalSchema>;
export const goalHistorySchema = z
  .array(goalSchema)
  .max(200, 'En fazla 200 hedef dönemi kaydedebilirsin.')
  .refine(
    (goals) =>
      goals.every(
        (goal, index) =>
          !!goal.from && (index === 0 || goal.from > goals[index - 1].from),
      ),
    'Hedef dönemleri tarih sırasıyla ve farklı başlangıçlarla kaydedilmeli.',
  );

export const stateSchema = z.object({
  schema: z.literal(1),
  startedOn: dateSchema,
  entries: z.array(entrySchema).max(50000),
  days: z.record(dateSchema, daySchema),
  habits: z.array(habitSchema).max(50).default([]),
  habitDays: z.record(dateSchema, habitDaySchema).default({}),
  jars: z
    .array(legacyJarSchema)
    .max(30)
    .refine(
      (jars) => new Set(jars.map((j) => j.id)).size === jars.length,
      'Eski kayıt kimlikleri tekrarlanamaz.',
    )
    .default([]),
  planTemplates: planTemplatesSchema.optional(),
  activities: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  goals: goalSchema,
  goalHistory: goalHistorySchema.optional(),
  exams: z.array(examSchema).max(500),
  timer: z
    .object({
      id: z.string(),
      kind: z.enum(['study', 'activity']),
      subject: z.string().min(1).max(100),
      topic: z.string().max(500),
      method: z.string().max(100),
      mode: z.enum(['free', 'pomo']),
      accumulated: z.number().min(0).max(86400000),
      runningSince: z.number().finite().nullable(),
      startedAt: z.number().finite().min(0).optional(),
      date: dateSchema,
      planId: z.string().min(1).max(100).optional(),
      planDate: dateSchema.optional(),
    })
    .nullable(),
});
export type TrackerState = z.infer<typeof stateSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Day = z.infer<typeof daySchema>;
export type Exam = z.infer<typeof examSchema>;
export const blankDay = (): Day => ({
  blocks: [],
  learnings: [],
  planMoves: [],
  progressSessions: [],
  bedtime: '',
  wake: '',
  sleepDate: '',
  pages: null,
  book: '',
  amEnergy: null,
  amMood: null,
  pmEnergy: null,
  pmMood: null,
  notes: '',
});
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  return shiftDate(date, -((d.getUTCDay() + 6) % 7));
}
export function formatDate(date: string, long = false) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { weekday: 'long' as const } : {}),
  });
}
export function duration(seconds: number) {
  if (seconds > 0 && seconds < 60) return `${Math.round(seconds)} sn`;
  const m = Math.round(seconds / 60);
  return m >= 60
    ? `${Math.floor(m / 60)} sa ${m % 60 ? `${m % 60} dk` : ''}`.trim()
    : `${m} dk`;
}
export function getSleepHours(
  day: Day | undefined,
  wakeDate: string,
): number | null {
  if (!day?.bedtime || !day.wake || !day.sleepDate) return null;
  const start = new Date(`${day.sleepDate}T${day.bedtime}:00+03:00`).valueOf();
  const end = new Date(`${wakeDate}T${day.wake}:00+03:00`).valueOf();
  const hours = (end - start) / 3600000;
  return hours > 0 && hours <= 24 ? hours : null;
}
export function inferSleepDate(
  bedtime: string,
  wake: string,
  wakeDate: string,
): string {
  if (!bedtime || !wake) return '';
  return bedtime > wake ? shiftDate(wakeDate, -1) : wakeDate;
}
export function getSleepError(day: Day, wakeDate: string): string | null {
  if (day.sleepDate && day.sleepDate > wakeDate)
    return 'Yatış tarihi kalkış tarihinden sonra olamaz.';
  if (day.bedtime && day.wake && getSleepHours(day, wakeDate) === null)
    return 'Yatış tarihini ve saatleri kontrol et. Kalkış yatıştan sonra, uyku süresi en fazla 24 saat olmalı.';
  return null;
}
export function elapsed(timer: TrackerState['timer'], now = Date.now()) {
  if (!timer) return 0;
  const ms = Math.max(
    0,
    timer.accumulated +
      (timer.runningSince === null ? 0 : now - timer.runningSince),
  );
  return Math.min(timer.mode === 'pomo' ? 1500000 : 86400000, ms);
}
export function initialState(): TrackerState {
  return {
    schema: 1,
    startedOn: today(),
    entries: [],
    days: {},
    habits: [],
    habitDays: {},
    jars: [],
    activities: [
      'Spor',
      'Sosyalleşme',
      'Oyun',
      'Sosyal medya',
      'Kişisel proje',
      'Dinlenme',
      'Diğer',
    ],
    goals: {
      from: '',
      studyTotal: null,
      courseHours: {},
      pages: null,
      sleepHours: null,
    },
    exams: [
      {
        id: 'de-mid',
        course: 'de',
        label: 'Vize · 7. hafta',
        start: '2026-11-09',
        end: '2026-11-13',
        note: 'Syllabus sınav çizelgesi: 7. hafta, 9–13 Kasım. Kesin gün ve saat belirtilmemiş; Canvas üzerinden doğrula.',
        source: 'W01 MATH207-1 Introduction to MATH207 course (1).pdf',
      },
      {
        id: 'de-final',
        course: 'de',
        label: 'Final · 15. hafta',
        start: '2027-01-04',
        end: '2027-01-08',
        note: 'Syllabus sınav çizelgesi: 15. hafta, 4–8 Ocak. Bu bir tarih aralığıdır; kesin sınav günü açıklanmamış.',
        source: 'W01 MATH207-1 Introduction to MATH207 course (1).pdf',
      },
      {
        id: 'prog-mid',
        course: 'prog',
        label: 'Vize · 15.00',
        start: '2026-11-10',
        end: '',
        note: 'Syllabus: 7. hafta, 10 November at 15:00. Güncel duyuruları Canvas üzerinden kontrol et.',
        source: 'Syllabus - EE101 (1).pdf',
      },
      {
        id: 'na-mid',
        course: 'na',
        label: 'Vize',
        start: '2026-11-09',
        end: '2026-11-10',
        note: 'Syllabus: 7. hafta, Nov 9–10. Tek sınav günü belirtilmemiş; Canvas üzerinden doğrula.',
        source: 'MATH261 Fall2026.docx',
      },
      {
        id: 'eng-mid',
        course: 'eng',
        label: 'Vize · 9. hafta',
        start: '',
        end: '',
        note: 'Syllabus yalnızca 9. haftayı belirtiyor. Gün ve saat Canvas üzerinden doğrulanmalı.',
        source: 'Course Syllabus 2026-2027 Fall (1).docx',
      },
      {
        id: 'la-mid',
        course: 'la',
        label: 'Vize · 9. hafta',
        start: '',
        end: '',
        note: 'Syllabus yalnızca 9. haftayı belirtiyor. Final, resmî üniversite sınav takvimine göre yapılacak.',
        source: 'Syllabus.pdf',
      },
      {
        id: 'ss-mid',
        course: 'ss',
        label: 'Vize · tarih açıklanmamış',
        start: '',
        end: '',
        note: 'Syllabus vize ve final için gün belirtmiyor. Canvas duyurularını kontrol et.',
        source: 'EE 204 sylabi_AB.pdf',
      },
      {
        id: 'ss-project',
        course: 'ss',
        label: 'Proje · 14. hafta',
        start: '',
        end: '',
        note: 'Syllabus değerlendirme tablosunda proje için 14. hafta belirtilmiş. Kesin teslim günü açıklanmamış.',
        source: 'EE 204 sylabi_AB.pdf',
      },
    ],
    timer: null,
  };
}
export function summarise(state: TrackerState, from: string, to: string) {
  const entries = state.entries.filter((e) => e.date >= from && e.date <= to);
  const days = Object.entries(state.days).filter(([d]) => d >= from && d <= to);
  const study = entries.filter((e) => e.kind === 'study');
  const sleep = days
    .map(([d, v]) => getSleepHours(v, d))
    .filter((v): v is number => v !== null);
  const scores = study
    .map((e) => e.focus)
    .filter((v): v is number => v !== null);
  const questions = study.filter(
    (e) => e.attempted !== null && e.correct !== null && e.attempted > 0,
  );
  const attempted = questions.reduce((a, e) => a + e.attempted!, 0),
    correct = questions.reduce((a, e) => a + e.correct!, 0);
  const activities = entries.filter((e) => e.kind === 'activity'),
    untimedActivities = activities.filter((e) => e.seconds === null).length;
  return {
    entries,
    study,
    studySeconds: study.reduce((a, e) => a + (e.seconds ?? 0), 0),
    activitySeconds: activities.reduce((a, e) => a + (e.seconds ?? 0), 0),
    activityCount: activities.length,
    untimedActivities,
    pages: days.reduce((a, [, v]) => a + (v.pages ?? 0), 0),
    pageDays: days.filter(([, v]) => v.pages !== null).length,
    sleep: sleep.length
      ? sleep.reduce((a, b) => a + b, 0) / sleep.length
      : null,
    sleepDays: sleep.length,
    focus: scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null,
    focusCount: scores.length,
    attempted,
    correct,
    questionSessions: questions.length,
  };
}
