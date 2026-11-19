import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Execute the actual Worker SQL against a disposable in-memory SQLite database.
// This adapter models D1's result shape and batch transaction, not the Cloudflare runtime.
export function sqliteD1({ maxQueries = Infinity } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const migration of ['0001_initial.sql', '0002_habits.sql'])
    sqlite.exec(readFileSync(new URL('../../migrations/' + migration, import.meta.url), 'utf8'));
  const metrics = { queries: 0, statements: 0, maxPayloadBytes: 0 };
  function query() {
    metrics.queries++;
    if (metrics.queries > maxQueries) throw Error('Too many D1 queries in one invocation');
  }
  function prepare(sql, values = []) {
    return {
      sql, values,
      bind(...bound) { return prepare(sql, bound); },
      async first(column) {
        query(); metrics.statements++;
        const row = sqlite.prepare(sql).get(...values);
        return row ? (column ? row[column] : { ...row }) : null;
      },
      async all() { query(); return execute(this); },
      async run() { query(); return execute(this); },
    };
  }
  function execute(statement) {
    metrics.statements++;
    const results = sqlite.prepare(statement.sql).all(...statement.values).map(row => ({ ...row }));
    metrics.maxPayloadBytes = Math.max(metrics.maxPayloadBytes,
      results.reduce((size, row) => size + (typeof row.payload === 'string' ? Buffer.byteLength(row.payload) : 0), 0));
    const changes = sqlite.prepare('SELECT changes() AS changes').get().changes;
    return { results, success: true, meta: { changes } };
  }
  const DB = {
    prepare,
    async batch(statements) {
      query();
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(execute);
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { DB, sqlite, metrics,
    resetQueries() { metrics.queries = 0; metrics.statements = 0; metrics.maxPayloadBytes = 0; },
    close: () => sqlite.close() };
}
