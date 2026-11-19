import { today, type TrackerState } from './model.ts';
import type { TimeBlock } from './timeline.ts';

export type PlanSummary = {
  total: number;
  done: number;
  missed: number;
  moved: number;
  cancelled: number;
  pending: number;
};

export function planSummary(state: TrackerState, date: string): PlanSummary {
  const day = state.days[date];
  const blocks = (day?.blocks ?? []).filter(
    (block) => block.lane === 'activity',
  );
  const ids = new Set(blocks.map((block) => block.id));
  const moves = (day?.planMoves ?? []).filter(
    (item) => item.block.lane === 'activity' && !ids.has(item.block.id),
  );
  return {
    total: blocks.length + moves.length,
    done: blocks.filter((block) => block.status === 'happened').length,
    missed: blocks.filter((block) => block.status === 'missed').length,
    cancelled: blocks.filter((block) => block.status === 'cancelled').length,
    moved: moves.length,
    pending: blocks.filter((block) => block.status === 'planned').length,
  };
}

export function pendingPlans(
  state: TrackerState,
  before = today(),
): { date: string; block: TimeBlock }[] {
  return Object.entries(state.days)
    .filter(([date]) => date < before)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([date, day]) =>
      (day.blocks ?? [])
        .filter(
          (block) => block.lane === 'activity' && block.status === 'planned',
        )
        .map((block) => ({ date, block })),
    );
}
