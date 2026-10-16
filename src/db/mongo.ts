import { MongoClient, ObjectId, BSON } from 'mongodb';
const { EJSON } = BSON;
import { runInNewContext } from 'node:vm';
import type { ConnectionConfig } from '../config/types.js';
import { validateConnection } from '../config/types.js';

export type OutputFormat = 'table' | 'json' | 'csv';

// This is a convenience API for trusted code, NOT a security sandbox.
export async function evaluate(db: object, expression: string, limit = 100): Promise<unknown> {
  const scope = { db, ObjectId, EJSON };
  const result = await runInNewContext(`(async () => (${expression}\n))()`, scope);
  if (result && typeof result.toArray === 'function' && typeof result.limit === 'function') {
    // FindCursor exposes its requested limit; do not widen a smaller query limit.
    const requested = result.options?.limit;
    const cap = typeof requested === 'number' && requested !== 0 ? Math.min(Math.abs(requested), limit) : limit;
    return await result.limit(cap).toArray();
  }
  return result;
}

export function shellDb(db: import('mongodb').Db) {
  return new Proxy(db, {
    get(target, key) {
      if (typeof key !== 'string') return Reflect.get(target, key);
      const value = Reflect.get(target, key);
      if (value !== undefined) return typeof value === 'function' ? value.bind(target) : value;
      return target.collection(key);
    },
  });
}

export function formatResult(result: unknown, format: OutputFormat): string {
  const json = EJSON.stringify(result === undefined ? null : result, { relaxed: true });
  if (format === 'json') return JSON.stringify(JSON.parse(json), null, 2);
  const normalized = JSON.parse(json);
  const rows: Record<string, unknown>[] = (Array.isArray(normalized) ? normalized : [normalized])
    .map(value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : { value });
  if (format === 'table') {
    if (!rows.length) return '(no results)';
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const cells = rows.map(row => columns.map(key => cell(row[key])));
    const widths = columns.map((key, i) => Math.max(key.length, ...cells.map(row => row[i]!.length)));
    return [columns, ...cells].map(row => row.map((s, i) => s.padEnd(widths[i]!)).join('  ').trimEnd()).join('\n');
  }
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [columns, ...rows.map(row => columns.map(key => cell(row[key])))].map(row => row.map(escape).join(',')).join('\n');
}
function cell(value: unknown): string {
  return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export async function runQuery(connection: ConnectionConfig, expression: string, limit: number): Promise<unknown> {
  validateConnection(connection);
  const client = new MongoClient(connection.uri, {
    serverSelectionTimeoutMS: 10000,
    ...(connection.user ? { auth: { username: connection.user, password: connection.password ?? '' } } : {}),
    ...(connection.authSource ? { authSource: connection.authSource } : {}),
  });
  try {
    await client.connect();
    return await evaluate(shellDb(client.db(connection.database)), expression, limit);
  } finally { await client.close(); }
}
