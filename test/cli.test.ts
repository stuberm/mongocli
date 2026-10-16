import { test, expect } from 'bun:test';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, formatResult, shellDb } from '../src/db/mongo.js';
import { BSON, ObjectId } from 'mongodb';

const entry = join(import.meta.dir, '../src/index.ts');
test('connection add, masking, permissions, duplicates, unknown connection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mongocli-'));
  async function cli(args: string[], stdin = '') {
    const p = Bun.spawn([process.execPath, entry, ...args], { env: { ...process.env, XDG_CONFIG_HOME: dir }, stdin: new Blob([stdin]), stdout: 'pipe', stderr: 'pipe' });
    return { code: await p.exited, out: await new Response(p.stdout).text(), err: await new Response(p.stderr).text() };
  }
  try {
    const args = ['connection', 'add', 'local', '--uri', 'mongodb://localhost:27017', '--database', 'test', '--user', 'reader', '--password-stdin'];
    expect((await cli(args, 'test-secret\n')).code).toBe(0);
    const path = join(dir, 'mongocli/config.json');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, 'utf8')).connections.local.password).toBe('test-secret');
    const listing = await cli(['connection', 'list', '--verbose']);
    expect(listing.code).toBe(0);
    expect(listing.out).toContain('*****');
    expect(listing.out).not.toContain('test-secret');
    expect((await cli(args, 'other')).code).toBe(1);
    expect((await cli(['query', '-c', 'missing', 'db.products.findOne()'])).err).toContain('Unknown connection');
    expect((await cli(['query', '-c', 'local', '--limit', '0', 'db.products.findOne()'])).code).toBe(1);
    expect((await cli(['unknown'])).code).toBe(1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('driver expressions, collection shorthand, cursor cap and BSON helpers', async () => {
  let cap = 0;
  const cursor = { limit(n: number) { cap = n; return this; }, async toArray() { return [{ name: 'test' }]; } };
  const db = shellDb({ collection(name: string) { return { find: () => cursor, findOne: async () => ({ name }) }; } } as any);
  expect(await evaluate(db, 'db.products.find()', 3)).toEqual([{ name: 'test' }]);
  expect(cap).toBe(3);
  expect(await evaluate(db, 'db.products.findOne()')).toEqual({ name: 'products' });
  expect(await evaluate(db, 'new ObjectId("000000000000000000000001").toHexString()')).toBe('000000000000000000000001');
});

test('JSON and CSV preserve BSON and escape nested values', () => {
  expect(JSON.parse(formatResult({ _id: new ObjectId('000000000000000000000001') }, 'json'))).toEqual({ _id: { $oid: '000000000000000000000001' } });
  expect(formatResult([{ name: 'a,"b', count: 2 }, { name: 'c\nd' }], 'csv')).toBe('name,count\n"a,""b",2\n"c\nd",');
  expect(formatResult([], 'table')).toBe('(no results)');
  expect(formatResult(undefined, 'json')).toBe('null');
});
