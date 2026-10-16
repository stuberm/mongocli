import { createInterface } from 'node:readline/promises';
import type { ParsedValues } from '../cli/types.js';

export async function promptForConnection(values: ParsedValues) {
  const missing = ['uri', 'database'].filter(key => !values[key]);
  if (values['password-stdin'] && (missing.length || !values.user)) {
    throw new Error('--password-stdin requires --uri, --database, and --user');
  }
  const interactive = missing.length > 0;
  if (!interactive) return;
  if (!process.stdin.isTTY) throw new Error('Missing --uri or --database; interactive setup requires a terminal');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const key of missing) {
      const answer = (await rl.question(key === 'uri' ? 'MongoDB URI (without credentials): ' : 'Database: ')).trim();
      if (!answer) throw new Error(`Missing ${key}`);
      values[key] = answer;
    }
    if (!values.user) values.user = (await rl.question('User (leave blank for no authentication): ')).trim();
    if (values.user && !values['auth-source']) {
      const source = (await rl.question('Authentication database (leave blank for driver default): ')).trim();
      if (source) values['auth-source'] = source;
    }
  } finally { rl.close(); }
}

export async function promptForPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Password prompt requires a terminal; use --password-stdin');
  }
  const input = process.stdin;
  const wasRaw = input.isRaw;
  process.stdout.write('Password: ');
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(password);
    };
    const onEnd = () => finish(new Error('Password input closed'));
    const onError = (error: Error) => finish(error);
    const onData = (chunk: Buffer | string) => {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003' || char === '\u0004') return finish(new Error('Password prompt cancelled'));
        if (char === '\u007f' || char === '\b') password = Array.from(password).slice(0, -1).join('');
        else if (char >= ' ') password += char;
      }
    };
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onError);
  });
}
