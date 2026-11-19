import {
  getSleepError,
  initialState,
  today,
  daySchema,
} from '../src/lib/model.ts';
import { patchSchema } from '../src/lib/patch.ts';
import { importRequest } from './import.ts';
import { protectGoalHistory } from '../src/lib/goals.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  LOGIN_KEY_HASH: string;
}
const COOKIE = 'ritim_session';
const DAY = 86400000;
const reply = (data: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cookie(request: Request) {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1) ?? ''
  );
}
function cookieHeader(request: Request, token: string, age: number) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
async function signedIn(request: Request, env: Env) {
  const token = cookie(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const row = await env.DB.prepare(
    'SELECT expires_at FROM sessions WHERE token_hash=?',
  )
    .bind(await digest(token))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}
async function body(request: Request, max = 250000) {
  if (Number(request.headers.get('content-length') ?? 0) > max)
    throw Error('İstek çok büyük.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > max)
    throw Error('İstek çok büyük.');
  return JSON.parse(text);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      return reply({ error: 'İsteğin kaynağı doğrulanamadı.' }, 403);
    try {
      if (path === '/api/login' && request.method === 'POST') {
        if (!/^[a-f0-9]{64}$/.test(env.LOGIN_KEY_HASH ?? ''))
          return reply({ error: 'Giriş henüz yapılandırılmadı.' }, 503);
        const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
        const bucket = await digest(
          ip + ':' + Math.floor(Date.now() / (15 * 60000)),
        );
        const attempt = await env.DB.prepare(
          'INSERT INTO login_attempts(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
        )
          .bind(bucket, Date.now() + 30 * 60000)
          .first<{ attempts: number }>();
        if ((attempt?.attempts ?? 99) > 10)
          return reply(
            {
              error: 'Çok sayıda deneme yapıldı. 15 dakika sonra tekrar dene.',
            },
            429,
            {
              'Retry-After': '900',
            },
          );
        const raw = await body(request, 1000);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          return reply({ error: 'İstek biçimini kontrol et.' }, 400);
        const data = raw as { key?: unknown };
        const key = typeof data.key === 'string' ? data.key.trim() : '';
        if (
          key.length < 32 ||
          key.length > 200 ||
          !equal(await digest(key), env.LOGIN_KEY_HASH)
        )
          return reply({ error: 'Giriş anahtarını kontrol et.' }, 401);
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        await env.DB.batch([
          env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(
            Date.now(),
          ),
          env.DB.prepare(
            'DELETE FROM login_attempts WHERE expires_at<? OR bucket=?',
          ).bind(Date.now(), bucket),
          env.DB.prepare(
            'INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)',
          ).bind(await digest(token), Date.now() + 30 * DAY),
        ]);
        return reply({ ok: true }, 200, {
          'Set-Cookie': cookieHeader(request, token, 30 * 86400),
        });
      }
      if (path === '/api/logout' && request.method === 'POST') {
        const token = cookie(request);
        if (token)
          await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
            .bind(await digest(token))
            .run();
        return reply({ ok: true }, 200, {
          'Set-Cookie': cookieHeader(request, '', 0),
        });
      }
      if (!(await signedIn(request, env)))
        return reply(
          { error: 'Oturumun sona erdi. Giriş anahtarınla tekrar giriş yap.' },
          401,
        );
      if (path === '/api/session' && request.method === 'GET')
        return reply({ ok: true });
      if (path.startsWith('/api/import/') && request.method === 'POST') {
        const result = await importRequest(path, await body(request), env.DB);
        const { status, ...data } = result;
        return reply(data, status);
      }
      if (path === '/api/state' && request.method === 'GET') {
        const { entries, days, habitDays, ...config } = initialState();
        await env.DB.prepare(
          "INSERT OR IGNORE INTO tracker_meta(id,revision,config) VALUES('owner',0,?)",
        )
          .bind(JSON.stringify(config))
          .run();
        const result = await env.DB.batch([
          env.DB.prepare(
            "SELECT revision,config FROM tracker_meta WHERE id='owner'",
          ),
          env.DB.prepare('SELECT payload FROM tracker_entries ORDER BY rowid'),
          env.DB.prepare('SELECT day,payload FROM tracker_days'),
          env.DB.prepare('SELECT day,payload FROM tracker_habit_days'),
        ]);
        const meta = result[0].results[0] as {
          revision: number;
          config: string;
        };
        const entryRows = result[1].results as { payload: string }[],
          dayRows = result[2].results as { day: string; payload: string }[];
        const habitRows = result[3].results as {
          day: string;
          payload: string;
        }[];
        return reply({
          revision: meta.revision,
          data: {
            ...config,
            ...JSON.parse(meta.config),
            entries: entryRows.map((r) => JSON.parse(r.payload)),
            days: Object.fromEntries(
              dayRows.map((r) => [r.day, JSON.parse(r.payload)]),
            ),
            habitDays: Object.fromEntries(
              habitRows.map((r) => [r.day, JSON.parse(r.payload)]),
            ),
          },
        });
      }
      if (path === '/api/state' && request.method === 'PUT') {
        const raw = await body(request);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          return reply({ error: 'İstek biçimini kontrol et.' }, 400);
        const data = raw as {
          revision: number;
          patch: unknown;
        };
        if (!Number.isSafeInteger(data.revision) || data.revision < 0)
          return reply({ error: 'Geçersiz kayıt sürümü.' }, 400);
        const parsed = patchSchema.safeParse(data.patch);
        if (!parsed.success)
          return reply(
            { error: parsed.error.issues[0]?.message ?? 'Kaydı kontrol et.' },
            400,
          );
        const patch = parsed.data,
          mutation = crypto.randomUUID();
        // Preserve additive fields omitted by older, already-open clients.
        const rawPatch = data.patch as {
          config?: Record<string, unknown>;
          days?: { upsert?: Record<string, Record<string, unknown>> };
        };
        if (patch.config && rawPatch.config) {
          const oldMeta = await env.DB.prepare(
            "SELECT config FROM tracker_meta WHERE id='owner'",
          ).first<{ config: string }>();
          if (oldMeta) {
            const oldConfig = JSON.parse(oldMeta.config);
            if (!Object.prototype.hasOwnProperty.call(rawPatch.config, 'jars'))
              patch.config.jars = oldConfig.jars ?? [];
            if (
              !Object.prototype.hasOwnProperty.call(
                rawPatch.config,
                'planTemplates',
              )
            )
              patch.config.planTemplates = oldConfig.planTemplates;
            try {
              Object.assign(
                patch.config,
                protectGoalHistory(
                  oldConfig,
                  patch.config,
                  Object.prototype.hasOwnProperty.call(
                    rawPatch.config,
                    'goalHistory',
                  ),
                ),
              );
            } catch (cause) {
              return reply(
                {
                  error:
                    cause instanceof Error
                      ? cause.message
                      : 'Hedef geçmişi korunamadı.',
                },
                409,
              );
            }
          }
        }
        const rawDays = rawPatch.days?.upsert;
        for (const [date, day] of Object.entries(patch.days?.upsert ?? {})) {
          if (
            rawDays?.[date] &&
            (!Object.prototype.hasOwnProperty.call(rawDays[date], 'blocks') ||
              !Object.prototype.hasOwnProperty.call(
                rawDays[date],
                'progressSessions',
              ) ||
              !Object.prototype.hasOwnProperty.call(rawDays[date], 'planMoves') ||
              !Object.prototype.hasOwnProperty.call(rawDays[date], 'learnings'))
          ) {
            const row = await env.DB.prepare(
              'SELECT payload FROM tracker_days WHERE day=?',
            )
              .bind(date)
              .first<{ payload: string }>();
            const old = row ? JSON.parse(row.payload) : {};
            if (!Object.prototype.hasOwnProperty.call(rawDays[date], 'blocks'))
              day.blocks = old.blocks ?? [];
            if (
              !Object.prototype.hasOwnProperty.call(
                rawDays[date],
                'progressSessions',
              )
            )
              day.progressSessions = old.progressSessions ?? [];
            if (
              !Object.prototype.hasOwnProperty.call(rawDays[date], 'planMoves')
            )
              day.planMoves = old.planMoves ?? [];
            if (
              !Object.prototype.hasOwnProperty.call(rawDays[date], 'learnings')
            )
              day.learnings = old.learnings ?? [];
          }
          const valid = daySchema.safeParse(day);
          if (!valid.success)
            return reply({ error: valid.error.issues[0].message }, 400);
        }
        for (const [date, day] of Object.entries(patch.days?.upsert ?? {})) {
          const error = getSleepError(day, date);
          if (error) return reply({ error }, 400);
        }
        const currentDay = today();
        if ((patch.entries?.upsert ?? []).some((e) => e.date > currentDay))
          return reply(
            { error: 'Gelecek bir güne oturum kaydı ekleyemezsin.' },
            400,
          );
        const dayLogValues = (d: Record<string, unknown>) =>
          JSON.stringify([
            d.bedtime ?? '',
            d.wake ?? '',
            d.sleepDate ?? '',
            d.pages ?? null,
            d.book ?? '',
            d.amEnergy ?? null,
            d.amMood ?? null,
            d.pmEnergy ?? null,
            d.pmMood ?? null,
            d.notes ?? '',
          ]);
        for (const [date, day] of Object.entries(patch.days?.upsert ?? {})) {
          if (date <= currentDay) continue;
          if (day.blocks.some((b) => b.status !== 'planned'))
            return reply(
              { error: 'Gelecek bir gün için yalnızca plan ekleyebilirsin.' },
              400,
            );
          const hasLog =
            !!day.bedtime ||
            !!day.wake ||
            !!day.sleepDate ||
            day.pages !== null ||
            !!day.book ||
            day.amEnergy !== null ||
            day.amMood !== null ||
            day.pmEnergy !== null ||
            day.pmMood !== null ||
            !!day.notes;
          const row = await env.DB.prepare(
            'SELECT payload FROM tracker_days WHERE day=?',
          )
            .bind(date)
            .first<{ payload: string }>();
          const old = row ? JSON.parse(row.payload) : {};
          if (JSON.stringify(day.learnings) !== JSON.stringify(old.learnings ?? []))
            return reply(
              { error: 'Gelecek bir günün öğrenme maddelerini değiştiremezsin.' },
              400,
            );
          if (hasLog) {
            if (!row || dayLogValues(day) !== dayLogValues(old))
              return reply(
                {
                  error:
                    'Gelecek bir güne günlük veya okuma kaydı ekleyemezsin.',
                },
                400,
              );
          }
        }
        for (const date of patch.days?.remove ?? []) {
          if (date <= currentDay) continue;
          const row = await env.DB.prepare(
            'SELECT payload FROM tracker_days WHERE day=?',
          )
            .bind(date)
            .first<{ payload: string }>();
          if (row && JSON.parse(row.payload).learnings?.length)
            return reply(
              { error: 'Gelecek bir günün öğrenme maddelerini değiştiremezsin.' },
              400,
            );
        }
        if (
          Object.keys(patch.habitDays?.upsert ?? {}).some(
            (d) => d > currentDay,
          )
        )
          return reply(
            { error: 'Gelecek bir güne alışkanlık kaydı ekleyemezsin.' },
            400,
          );
        const statements = [
          env.DB.prepare(
            "UPDATE tracker_meta SET revision=revision+1,config=COALESCE(?,config),last_mutation=? WHERE id='owner' AND revision=?",
          ).bind(
            patch.config ? JSON.stringify(patch.config) : null,
            mutation,
            data.revision,
          ),
        ];
        for (const entry of patch.entries?.upsert ?? [])
          statements.push(
            env.DB.prepare(
              "INSERT INTO tracker_entries(id,payload) SELECT ?,? WHERE EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            ).bind(entry.id, JSON.stringify(entry), mutation),
          );
        for (const id of patch.entries?.remove ?? [])
          statements.push(
            env.DB.prepare(
              "DELETE FROM tracker_entries WHERE id=? AND EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)",
            ).bind(id, mutation),
          );
        for (const [date, day] of Object.entries(patch.days?.upsert ?? {}))
          statements.push(
            env.DB.prepare(
              "INSERT INTO tracker_days(day,payload) SELECT ?,? WHERE EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?) ON CONFLICT(day) DO UPDATE SET payload=excluded.payload",
            ).bind(date, JSON.stringify(day), mutation),
          );
        for (const date of patch.days?.remove ?? [])
          statements.push(
            env.DB.prepare(
              "DELETE FROM tracker_days WHERE day=? AND EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)",
            ).bind(date, mutation),
          );
        for (const [date, day] of Object.entries(patch.habitDays?.upsert ?? {}))
          statements.push(
            env.DB.prepare(
              "INSERT INTO tracker_habit_days(day,payload) SELECT ?,? WHERE EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?) ON CONFLICT(day) DO UPDATE SET payload=excluded.payload",
            ).bind(date, JSON.stringify(day), mutation),
          );
        for (const date of patch.habitDays?.remove ?? [])
          statements.push(
            env.DB.prepare(
              "DELETE FROM tracker_habit_days WHERE day=? AND EXISTS(SELECT 1 FROM tracker_meta WHERE id='owner' AND last_mutation=?)",
            ).bind(date, mutation),
          );
        const result = await env.DB.batch(statements);
        if (!result[0].meta.changes)
          return reply(
            {
              error:
                'Başka bir cihazda kayıtlar değişti. Güncel kayıtlar yüklendi; formunu kontrol edip yeniden kaydet.',
            },
            409,
          );
        return reply({ revision: data.revision + 1 });
      }
      return reply({ error: 'Bu işlem bulunamadı.' }, 404);
    } catch (error) {
      if (error instanceof SyntaxError)
        return reply({ error: 'İstek biçimini kontrol et.' }, 400);
      if (error instanceof Error && error.message === 'İstek çok büyük.')
        return reply({ error: error.message }, 413);
      return reply(
        { error: 'İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.' },
        503,
      );
    }
  },
};
