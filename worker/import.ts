import { z } from 'zod';
import { entrySchema, daySchema, habitDaySchema, dateSchema, getSleepError } from '../src/lib/model.ts';
import { configSchema } from '../src/lib/patch.ts';

const beginSchema = z.object({
  revision: z.number().int().min(0),
  config: configSchema,
  entries: z.number().int().min(0).max(50000),
  days: z.number().int().min(0).max(50000),
  habitDays: z.number().int().min(0).max(50000).default(0),
});

// Recheck jobs staged by an older Worker before replacing any tracking data.
async function stagedSleepError(db: D1Database, id: string) {
  let after = '';
  // Metadata is small; fetch full payloads only up to 1 MB per page. Even a
  // pathological job stops before the Free plan's 50-call invocation limit.
  for (let page = 0; page < 20; page++) {
    const sizes = await db.prepare(
      'SELECT day,length(CAST(payload AS BLOB)) AS bytes FROM import_days WHERE job=? AND day>? ORDER BY day LIMIT 5000',
    ).bind(id, after).all<{ day: string; bytes: number }>();
    if (!sizes.results.length) return null;
    let bytes = 0, count = 0, through = after;
    for (const row of sizes.results) {
      if (row.bytes > 250000) return 'Yedekteki günlük kayıtlarından biri aktarım sınırını aşıyor.';
      if (count && bytes + row.bytes > 1000000) break;
      bytes += row.bytes;
      count++;
      through = row.day;
    }
    const rows = await db.prepare(
      'SELECT day,payload FROM import_days WHERE job=? AND day>? AND day<=? ORDER BY day LIMIT 5000',
    ).bind(id, after, through).all<{ day: string; payload: string }>();
    if (rows.results.length !== count)
      return 'Aktarım kayıtları doğrulama sırasında değişti. Dosyayı yeniden seç.';
    for (const row of rows.results) {
      let raw: unknown;
      try { raw = JSON.parse(row.payload); }
      catch { return 'Yedekteki günlük kayıtları geçerli değil.'; }
      // Includes learnings validation; old backups default the missing list to [].
      const parsed = daySchema.safeParse(raw);
      if (!dateSchema.safeParse(row.day).success || !parsed.success)
        return 'Yedekteki günlük kayıtları geçerli değil.';
      const error = getSleepError(parsed.data, row.day);
      if (error) return `Yedekte ${row.day} gününün uyku kaydı geçersiz. ${error}`;
    }
    after = through;
    if (count === sizes.results.length && count < 5000) return null;
  }
  return 'Yedek doğrulama sınırını aşıyor. Mevcut kayıtların değiştirilmedi.';
}

export async function importRequest(path: string, payload: unknown, db: D1Database) {
  if (path === '/api/import/begin') {
    const parsed = beginSchema.safeParse(payload);
    if (!parsed.success) return { status: 400, error: 'Yedek bilgilerini kontrol et.' };
    const data = parsed.data, id = crypto.randomUUID();
    await db.batch([
      db.prepare('DELETE FROM import_jobs WHERE created_at<?').bind(Date.now() - 86400000),
      db.prepare('INSERT INTO import_jobs(id,base_revision,config,entries_count,days_count,habit_days_count,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(id, data.revision, JSON.stringify(data.config), data.entries, data.days, data.habitDays, Date.now()),
    ]);
    return { status: 200, id };
  }
  const match = path.match(/^\/api\/import\/([a-f0-9-]{36})\/(entries|days|habit-days|commit)$/);
  if (!match) return { status: 404, error: 'İçe aktarma işlemi bulunamadı.' };
  const [, id, action] = match;
  const job = await db.prepare(
    'SELECT base_revision,entries_count,days_count,habit_days_count FROM import_jobs WHERE id=? AND created_at>?',
  ).bind(id, Date.now() - 86400000).first<{
    base_revision: number; entries_count: number; days_count: number; habit_days_count: number;
  }>();
  if (!job) return { status: 404, error: 'İçe aktarma süresi dolmuş. Yeniden dosya seç.' };
  if (action === 'entries') {
    const parsed = z.array(entrySchema).min(1).max(20).safeParse(payload);
    if (!parsed.success) return { status: 400, error: 'Oturum kayıtları geçerli değil.' };
    await db.batch(parsed.data.map((entry) => db.prepare(
      'INSERT INTO import_entries(job,id,payload) VALUES(?,?,?) ON CONFLICT(job,id) DO UPDATE SET payload=excluded.payload',
    ).bind(id, entry.id, JSON.stringify(entry))));
    return { status: 200, ok: true };
  }
  if (action === 'days') {
    const parsed = z.array(z.object({ date: dateSchema, data: daySchema })).min(1).max(20).safeParse(payload);
    if (!parsed.success) return { status: 400, error: 'Günlük kayıtları geçerli değil.' };
    for (const day of parsed.data) {
      const error = getSleepError(day.data, day.date);
      if (error) return { status: 400, error: `Yedekte ${day.date} gününün uyku kaydı geçersiz. ${error}` };
    }
    await db.batch(parsed.data.map((day) => db.prepare(
      'INSERT INTO import_days(job,day,payload) VALUES(?,?,?) ON CONFLICT(job,day) DO UPDATE SET payload=excluded.payload',
    ).bind(id, day.date, JSON.stringify(day.data))));
    return { status: 200, ok: true };
  }
  if (action === 'habit-days') {
    const parsed = z.array(z.object({ date: dateSchema, data: habitDaySchema })).min(1).max(20).safeParse(payload);
    if (!parsed.success) return { status: 400, error: 'Alışkanlık kayıtları geçerli değil.' };
    await db.batch(parsed.data.map((day) => db.prepare(
      'INSERT INTO import_habit_days(job,day,payload) VALUES(?,?,?) ON CONFLICT(job,day) DO UPDATE SET payload=excluded.payload',
    ).bind(id, day.date, JSON.stringify(day.data))));
    return { status: 200, ok: true };
  }
  const sleepError = await stagedSleepError(db, id);
  if (sleepError) return { status: 400, error: sleepError };
  const results = await db.batch([
    db.prepare("UPDATE tracker_meta SET revision=revision+1,config=(SELECT config FROM import_jobs WHERE id=?),last_mutation=? WHERE id='owner' AND revision=? AND (SELECT COUNT(*) FROM import_entries WHERE job=?)=? AND (SELECT COUNT(*) FROM import_days WHERE job=?)=? AND (SELECT COUNT(*) FROM import_habit_days WHERE job=?)=?").bind(id,id,job.base_revision,id,job.entries_count,id,job.days_count,id,job.habit_days_count),
    db.prepare("DELETE FROM tracker_entries WHERE EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)").bind(id),
    db.prepare("INSERT INTO tracker_entries(id,payload) SELECT id,payload FROM import_entries WHERE job=? AND EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)").bind(id,id),
    db.prepare("DELETE FROM tracker_days WHERE EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)").bind(id),
    db.prepare("INSERT INTO tracker_days(day,payload) SELECT day,payload FROM import_days WHERE job=? AND EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)").bind(id,id),
    db.prepare("DELETE FROM tracker_habit_days WHERE EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)").bind(id),
    db.prepare("INSERT INTO tracker_habit_days(day,payload) SELECT day,payload FROM import_habit_days WHERE job=? AND EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)").bind(id,id),
    db.prepare('DELETE FROM import_jobs WHERE id=?').bind(id),
  ]);
  if (!results[0].meta.changes)
    return { status: 409, error: 'Kayıtlar başka bir cihazda değişti veya yedek eksik. Mevcut verilerin korunuyor; sayfayı yenileyip yeniden dene.' };
  return { status: 200, revision: job.base_revision + 1 };
}
