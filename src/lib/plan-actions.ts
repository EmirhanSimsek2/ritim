import {
  blankDay,
  COURSES,
  dateSchema,
  today,
  type Entry,
  type TrackerState,
} from './model.ts';
import { blocksSchema, copyableBlocks, type TimeBlock } from './timeline.ts';

export function startPlanTimer(
  state: TrackerState,
  date: string,
  id: string,
  now = Date.now(),
): TrackerState {
  if (state.timer) throw Error('Devam eden oturumunu bitir veya sayaca dön.');
  if (date !== today())
    throw Error('Sayacı başlatmak için bugünün planını seç.');
  const block = state.days[date]?.blocks?.find((item) => item.id === id);
  if (!block || block.lane !== 'activity' || block.status !== 'planned')
    throw Error('Başlatılabilecek bir iş seç.');
  const kind = block.category === 'study' ? 'study' : 'activity';
  const activity =
    block.category === 'personal'
      ? 'Kişisel proje'
      : block.category === 'rest'
        ? 'Dinlenme'
        : 'Diğer';
  const subject =
    block.subject ||
    (kind === 'activity'
      ? state.activities.includes(activity)
        ? activity
        : state.activities[0]
      : '');
  if (kind === 'study' && !COURSES.some((course) => course.id === subject))
    throw Error('Bu işin dersini Düzenle üzerinden bir kez seç.');
  return {
    ...state,
    timer: {
      id: crypto.randomUUID(),
      kind,
      subject,
      topic: block.title,
      method: '',
      mode: 'free',
      accumulated: 0,
      runningSince: now,
      startedAt: now,
      date,
      planId: id,
      planDate: date,
    },
  };
}

export function completeEntryPlan(
  state: TrackerState,
  entry: Entry,
): TrackerState {
  if (!entry.planId || !entry.planDate) return state;
  const day = state.days[entry.planDate];
  if (!day?.blocks?.some((block) => block.id === entry.planId)) return state;
  return {
    ...state,
    days: {
      ...state.days,
      [entry.planDate]: {
        ...day,
        blocks: day.blocks.map((block) =>
          block.id === entry.planId ? { ...block, status: 'happened' } : block,
        ),
      },
    },
  };
}

export function recordPlanSession(
  state: TrackerState,
  entry: Entry,
  outcome: string,
): TrackerState {
  if (
    entry.planId &&
    entry.planDate &&
    outcome !== 'complete' &&
    outcome !== 'continue'
  ) {
    throw Error('Planladığın işin tamamlanıp tamamlanmadığını seç.');
  }
  const next = { ...state, entries: [...state.entries, entry], timer: null };
  return outcome === 'complete' ? completeEntryPlan(next, entry) : next;
}

export function setPlanOutcome(
  state: TrackerState,
  date: string,
  id: string,
  status: TimeBlock['status'],
): TrackerState {
  const day = state.days[date];
  const block = day?.blocks?.find((item) => item.id === id);
  if (!block) throw Error('İş bulunamadı. Planı yenile.');
  if (date > today() && status !== 'planned')
    throw Error('Gelecek güne yalnızca plan ekleyebilirsin.');
  if (state.timer?.planId === id && state.timer.planDate === date)
    throw Error('Sonucu değiştirmeden önce devam eden oturumu bitir.');
  const parsed = blocksSchema.safeParse(
    day.blocks.map((item) => (item.id === id ? { ...item, status } : item)),
  );
  if (!parsed.success)
    throw Error('Bu saatte başka bir iş var. Önce işin saatini düzenle.');
  return {
    ...state,
    days: { ...state.days, [date]: { ...day, blocks: parsed.data } },
  };
}

export function movePlanBlock(
  state: TrackerState,
  date: string,
  id: string,
  targetDate: string,
  start?: number,
  flexible = false,
): TrackerState {
  if (!dateSchema.safeParse(targetDate).success)
    throw Error('Geçerli bir gün seç.');
  const source = state.days[date],
    block = source?.blocks?.find((item) => item.id === id);
  if (!block) throw Error('İş bulunamadı. Planı yenile.');
  if (block.status !== 'planned')
    throw Error('Taşımadan önce işi yeniden bekleyenlere al.');
  if (state.timer?.planId === id && state.timer.planDate === date)
    throw Error('Bu işi taşımadan önce devam eden oturumu bitir.');
  const nextStart = flexible ? 0 : (start ?? block.start);
  const moved = {
    ...block,
    flexible: flexible || !!block.flexible,
    start: nextStart,
    end: nextStart + block.end - block.start,
    original: block.original ?? {
      date,
      start: block.start,
      end: block.end,
      flexible: !!block.flexible,
    },
  };
  const target = state.days[targetDate] ?? blankDay();
  const targetBlocks = (target.blocks ?? []).filter(
    (item) => !(targetDate === date && item.id === id),
  );
  if (targetBlocks.some((item) => item.id === id))
    throw Error('Bu iş hedef günde zaten bulunuyor.');
  const parsed = blocksSchema.safeParse([...targetBlocks, moved]);
  if (!parsed.success)
    throw Error(
      'Hedef saat başka bir blokla çakışıyor veya gün sınırını aşıyor. Başka bir saat seç.',
    );
  if (targetDate === date)
    return {
      ...state,
      days: { ...state.days, [date]: { ...source, blocks: parsed.data } },
    };
  const history = [
    ...(source.planMoves ?? []).filter((item) => item.block.id !== id),
    { block, to: targetDate },
  ];
  if (history.length > 300)
    throw Error('Bu günde en fazla 300 erteleme kaydı tutulabilir.');
  const days = {
    ...state.days,
    [date]: {
      ...source,
      blocks: source.blocks.filter((item) => item.id !== id),
      planMoves: history,
    },
  };
  days[targetDate] = {
    ...target,
    blocks: parsed.data,
    planMoves: (target.planMoves ?? []).filter((item) => item.block.id !== id),
  };
  return { ...state, days };
}

export function applyPlanTemplate(
  state: TrackerState,
  date: string,
  id: string,
): TrackerState {
  if (!dateSchema.safeParse(date).success) throw Error('Geçerli bir gün seç.');
  const template = state.planTemplates?.find((item) => item.id === id);
  if (!template) throw Error('Şablon bulunamadı.');
  const day = state.days[date] ?? blankDay();
  const source = copyableBlocks(template.blocks);
  if (!source.length)
    throw Error('Bu şablonda uygulanabilecek aktif iş bulunmuyor.');
  const copies = source
    .filter(
      (block) =>
        !(day.blocks ?? []).some(
          (item) => item.templateSource === `${id}/${block.id}`,
        ),
    )
    .map((block) => {
      const { original, ...copy } = block;
      return {
        ...copy,
        id: crypto.randomUUID(),
        status: 'planned' as const,
        templateSource: `${id}/${block.id}`,
      };
    });
  const parsed = blocksSchema.safeParse([...(day.blocks ?? []), ...copies]);
  if (!parsed.success)
    throw Error(
      'Şablondaki saatler bu günün planıyla çakışıyor. Önce saatleri düzenle.',
    );
  return {
    ...state,
    days: { ...state.days, [date]: { ...day, blocks: parsed.data } },
  };
}
