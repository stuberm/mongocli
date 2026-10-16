import type { CommandDefinition } from '../cli/types.js';
import { loadConfig } from '../config/load-config.js';
import { formatResult, runQuery, type OutputFormat } from '../db/mongo.js';

export const queryCommand: CommandDefinition = {
  name: 'query', aliases: ['q'], summary: 'Evaluate a MongoDB JavaScript expression',
  description: 'Evaluate a trusted JavaScript expression using the MongoDB driver. Cursor output defaults to 100 documents. Not a full mongosh interpreter.',
  arguments: [{ name: 'expression', description: 'JavaScript expression', variadic: true }],
  flags: [
    { name: 'connection', aliases: ['c'], type: 'string', required: true, description: 'Saved connection name' },
    { name: 'eval', aliases: ['e'], type: 'string', description: 'JavaScript expression' },
    { name: 'output', aliases: ['o'], type: 'string', defaultValue: 'table', choices: ['table', 'json', 'csv'], description: 'Output format' },
    { name: 'limit', type: 'string', defaultValue: '100', description: 'Maximum documents for returned cursors' },
  ],
  examples: ["mongocli query -c local 'db.products.find({ active: true })'", "mongocli query -c local -o json 'db.products.findOne()'"],
  execute: async ({ values, positionals }) => {
    const expression = (typeof values.eval === 'string' ? values.eval : positionals.join(' ')) || (!process.stdin.isTTY ? (await Bun.stdin.text()).trim() : '');
    if (!expression) throw new Error('Pass an expression, --eval, or pipe it via stdin');
    const limit = Number(values.limit ?? '100');
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
    const config = await loadConfig();
    const name = values.connection as string;
    if (!Object.hasOwn(config.connections, name)) throw new Error(`Unknown connection: ${name}`);
    const result = await runQuery(config.connections[name]!, expression, limit);
    console.log(formatResult(result, (values.output ?? 'table') as OutputFormat));
  },
};
