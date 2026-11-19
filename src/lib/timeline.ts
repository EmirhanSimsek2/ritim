import { z } from 'zod';

export const blockSchema = z
  .object({
    id: z.string().min(1).max(100),
    lane: z.enum(['location', 'activity']),
    title: z.string().trim().min(1).max(100),
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
    category: z.enum(['study', 'personal', 'rest', 'chores', 'other']),
    status: z.enum(['planned', 'happened', 'missed', 'cancelled']),
    approximate: z.boolean(),
    notes: z.string().max(1000),
    place: z.string().max(100).optional(),
    subject: z.string().max(100).optional(),
    flexible: z.boolean().optional(),
    priority: z.boolean().optional(),
    original: z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((value) => {
            const parsed = new Date(value + 'T12:00Z');
            return (
              Number.isFinite(parsed.valueOf()) &&
              parsed.toISOString().slice(0, 10) === value
            );
          }),
        start: z.number().int().min(0).max(1439),
        end: z.number().int().min(1).max(1440),
        flexible: z.boolean().optional(),
      })
      .refine((value) => value.end > value.start)
      .optional(),
    templateSource: z.string().max(201).optional(),
  })
  .refine(
    (b) => b.end > b.start,
    'Bitiş başlangıçtan sonra olmalı. Geceyi aşan bir bloğu iki güne böl.',
  )
  .refine(
    (block) => block.lane !== 'location' || !block.flexible,
    'Konum için bir saat aralığı seç.',
  );
export type TimeBlock = z.infer<typeof blockSchema>;
export type PlanKind = 'study' | 'activity';

/** Maps stored TimeBlock.category values to the two-way form selector. */
export function planKind(category: TimeBlock['category'] | undefined): PlanKind {
  return category === undefined || category === 'study' ? 'study' : 'activity';
}

/** Derives TimeBlock.category from the simplified plan form while preserving existing block colors when unchanged. */
export function blockCategoryForPlan(
  kind: PlanKind,
  subject: string,
  previousCategory?: TimeBlock['category'],
  previousSubject = '',
): TimeBlock['category'] {
  if (kind === 'study') return 'study';
  if (
    previousCategory &&
    previousCategory !== 'study' &&
    subject === previousSubject
  ) {
    return previousCategory;
  }
  const normalized = subject.trim().toLocaleLowerCase('tr-TR');
  if (
    normalized === 'dinlenme' ||
    normalized === 'yemek / dinlenme' ||
    normalized === 'yemek'
  ) {
    return 'rest';
  }
  if (normalized === 'kişisel proje') {
    return 'personal';
  }
  if (
    normalized === 'günlük işler / yol' ||
    normalized === 'günlük işler' ||
    normalized === 'yol'
  ) {
    return 'chores';
  }
  return 'other';
}

export function conflictingBlock(blocks: TimeBlock[], candidate: TimeBlock) {
  if (candidate.flexible) return undefined;
  if (candidate.status === 'missed' || candidate.status === 'cancelled')
    return undefined;
  return blocks.find(
    (b) =>
      !b.flexible &&
      b.status !== 'missed' &&
      b.status !== 'cancelled' &&
      b.id !== candidate.id &&
      b.lane === candidate.lane &&
      b.start < candidate.end &&
      candidate.start < b.end,
  );
}
export const blocksSchema = z
  .array(blockSchema)
  .max(60)
  .superRefine((blocks, ctx) => {
    if (new Set(blocks.map((b) => b.id)).size !== blocks.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Aynı blok iki kez eklenemez.',
      });
    for (const b of blocks) {
      if (conflictingBlock(blocks, b)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Aynı sütundaki bloklar çakışıyor. Konum ve faaliyet farklı sütunlarda üst üste gelebilir.',
        });
        break;
      }
    }
  });
export function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function toMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function adjustBlock(
  block: TimeBlock,
  mode: 'move' | 'start' | 'end',
  delta: number,
): TimeBlock {
  const step = Math.round(delta / 15) * 15;
  if (mode === 'move') {
    const start = Math.max(
      0,
      Math.min(1440 - (block.end - block.start), block.start + step),
    );
    return { ...block, start, end: start + block.end - block.start };
  }
  if (mode === 'start')
    return {
      ...block,
      start: Math.max(0, Math.min(block.end - 15, block.start + step)),
    };
  return {
    ...block,
    end: Math.min(1440, Math.max(block.start + 15, block.end + step)),
  };
}
export function dayExample(): TimeBlock[] {
  const base = {
    category: 'other' as const,
    status: 'planned' as const,
    approximate: true,
    notes: '',
  };
  return [
    {
      ...base,
      id: crypto.randomUUID(),
      lane: 'location',
      title: 'Yurt',
      start: 8 * 60,
      end: 11 * 60,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      lane: 'location',
      title: 'Yol · yurt → okul',
      start: 11 * 60,
      end: 11 * 60 + 30,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      lane: 'location',
      title: 'Okul',
      start: 11 * 60 + 30,
      end: 22 * 60,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      lane: 'activity',
      title: 'VS Code / Codex',
      category: 'personal',
      start: 11 * 60 + 30,
      end: 13 * 60,
    },
  ];
}
export function coveredMinutes(blocks: TimeBlock[], lane: TimeBlock['lane']) {
  return blocks
    .filter((b) => b.lane === lane)
    .reduce((sum, b) => sum + b.end - b.start, 0);
}
export function copyableBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const kept = blocks.filter(
    (block) => block.status !== 'missed' && block.status !== 'cancelled',
  );
  const planned = kept.map((block) => ({
    ...block,
    status: 'planned' as const,
  }));
  for (const block of blocks) {
    if (block.status !== 'missed') continue;
    const candidate = { ...block, status: 'planned' as const };
    if (!conflictingBlock(planned, candidate)) {
      kept.push(block);
      planned.push(candidate);
    }
  }
  return kept;
}
export const planTemplatesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      name: z.string().trim().min(1).max(100),
      weekday: z.number().int().min(0).max(6),
      blocks: blocksSchema,
    }),
  )
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Şablon kimlikleri tekrarlanamaz.',
  );
