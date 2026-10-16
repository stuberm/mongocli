import { promptForConnection, promptForPassword } from './prompts.js';
import { loadConfig, saveConfig } from '../config/load-config.js';
import { validateConnection, type AppConfig } from '../config/types.js';
import type { CommandDefinition } from '../cli/types.js';

export function formatConnections(config: AppConfig) {
  return { connections: Object.fromEntries(Object.entries(config.connections).map(([name, c]) => {
    validateConnection(c);
    return [name, { ...c, ...(c.password !== undefined ? { password: '*****' } : {}) }];
  })) };
}

export const connectionCommand: CommandDefinition = {
  name: 'connection', aliases: ['connections', 'conns'], summary: 'Manage saved connections',
  subcommands: [
    {
      name: 'list', aliases: ['ls'], summary: 'List configured connections',
      flags: [{ name: 'verbose', type: 'boolean', description: 'Show details with masked passwords' }],
      execute: async ({ values }) => {
        const config = await loadConfig();
        const masked = formatConnections(config);
        if (values.verbose) console.log(JSON.stringify(masked, null, 2));
        else console.table(Object.entries(masked.connections).map(([name, c]) => ({ name, uri: c.uri, database: c.database })));
      },
    },
    {
      name: 'add', summary: 'Add a connection from flags or interactive prompts',
      arguments: [{ name: 'name', description: 'Connection name', required: true }],
      flags: [
        { name: 'uri', type: 'string', description: 'MongoDB URI without credentials' },
        { name: 'database', type: 'string', description: 'Database name' },
        { name: 'user', type: 'string', description: 'Username' },
        { name: 'auth-source', type: 'string', description: 'Authentication database (driver default if omitted)' },
        { name: 'password-stdin', type: 'boolean', description: 'Read password from stdin' },
        { name: 'force', type: 'boolean', description: 'Replace an existing connection' },
      ],
      execute: async ({ values, positionals }) => {
        const name = positionals[0];
        if (!name || positionals.length !== 1) throw new Error('Expected exactly one connection name');
        let config: AppConfig;
        try { config = await loadConfig(); } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          config = { version: 1, connections: {} };
        }
        if (Object.hasOwn(config.connections, name) && !values.force) throw new Error('Connection already exists; use --force');
        await promptForConnection(values);
        // Validate connection details before requesting a secret.
        validateConnection({ uri: values.uri, database: values.database });
        let password: string | undefined;
        if (values['password-stdin']) {
          if (!values.user) throw new Error('--password-stdin requires --user');
          if (process.stdin.isTTY) throw new Error('Pipe a password into stdin');
          password = await Bun.stdin.text();
          password = password.replace(/\r?\n$/, '');
          if (!password) throw new Error('Empty password');
        } else if (values.user) {
          password = await promptForPassword();
          if (!password) throw new Error('Empty password');
        }
        const connection = {
          uri: values.uri as string, database: values.database as string,
          ...(values.user ? { user: values.user as string, password } : {}),
          ...(values['auth-source'] ? { authSource: values['auth-source'] as string } : {}),
        };
        validateConnection(connection);
        Object.defineProperty(config.connections, name, { value: connection, enumerable: true, writable: true, configurable: true });
        await saveConfig(config);
        console.log(`Connection added: ${name}`);
      },
    },
  ],
};
