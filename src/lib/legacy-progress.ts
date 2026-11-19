import { z } from 'zod';

// Storage compatibility only. Retired progress data is kept in existing records
// and backups; it has no screen, mutations or effect on current reading totals.
const unit = z.enum(['page', 'question', 'set', 'custom']);
const mode = z.enum(['one', 'five', 'chapter']);
export const legacyJarSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  unit,
  unitLabel: z.string().trim().min(1).max(30),
  scope: z.enum(['daily', 'session']),
  goal: z.number().int().min(1).max(10000).nullable(),
  mode,
  archived: z.boolean(),
});
const action = z.object({
  id: z.string().min(1).max(100),
  amount: z.number().int().min(1).max(1000),
  at: z.string().datetime(),
  pagesBefore: z.number().int().min(0).max(10000).nullable(),
});
const session = z.object({
  id: z.string().min(1).max(100),
  jarId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  unit,
  unitLabel: z.string().min(1).max(30),
  scope: z.enum(['daily', 'session']),
  goal: z.number().int().min(1).max(10000).nullable(),
  mode,
  startedAt: z.string().datetime(),
  ended: z.boolean(),
  actions: z.array(action).max(500).refine(
    (actions) => new Set(actions.map((item) => item.id)).size === actions.length,
    'Eski ilerleme kayıtlarında tekrar eden kimlikler var.',
  ),
});
export const legacyProgressSchema = z.array(session).max(40).superRefine((sessions, context) => {
  if (new Set(sessions.map((item) => item.id)).size !== sessions.length)
    context.addIssue({ code: 'custom', message: 'Eski oturum kimlikleri tekrarlanamaz.' });
  if (sessions.reduce((sum, item) => sum + item.actions.length, 0) > 1000)
    context.addIssue({ code: 'custom', message: 'Eski ilerleme kayıt sınırı aşılıyor.' });
});
