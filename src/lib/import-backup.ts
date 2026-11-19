import { elapsed, getSleepError, type TrackerState } from './model.ts';
import { importChunks } from './import-chunks.ts';

// Prepare every batch before beginning a server-side import job.
export function prepareImport(incoming: TrackerState, revision: number) {
  if (new Set(incoming.entries.map((entry) => entry.id)).size !== incoming.entries.length)
    throw Error('Yedekte tekrar eden oturum kimlikleri var.');
  for (const [date, day] of Object.entries(incoming.days)) {
    const error = getSleepError(day, date);
    if (error) throw Error(`Yedekte ${date} gününün uyku kaydı geçersiz. ${error}`);
  }
  const { entries, days, habitDays, ...config } = incoming;
  if (config.timer)
    config.timer = { ...config.timer, accumulated: elapsed(config.timer), runningSince: null };
  const dayRecords = Object.entries(days).map(([date, data]) => ({ date, data }));
  const habitRecords = Object.entries(habitDays).map(([date, data]) => ({ date, data }));
  const begin = {
    revision,
    config,
    entries: entries.length,
    days: dayRecords.length,
    habitDays: habitRecords.length,
  };
  if (new TextEncoder().encode(JSON.stringify(begin)).byteLength > 220000)
    throw Error('Yedeğin ayarları tek aktarım sınırını aşıyor. Mevcut kayıtların değiştirilmedi.');
  return {
    begin,
    entries: importChunks(entries),
    days: importChunks(dayRecords),
    habitDays: importChunks(habitRecords),
  };
}
