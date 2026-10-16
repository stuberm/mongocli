export type ConnectionConfig = {
  uri: string;
  database: string;
  user?: string;
  password?: string;
  authSource?: string;
};

export type AppConfig = {
  version: 1;
  connections: Record<string, ConnectionConfig>;
};

export function validateConnection(value: unknown): asserts value is ConnectionConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid connection');
  const c = value as ConnectionConfig;
  if (typeof c.uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(c.uri)) throw new Error('Expected a mongodb:// or mongodb+srv:// URI');
  if (typeof c.database !== 'string' || !c.database) throw new Error('Missing database');
  for (const key of ['user', 'password', 'authSource'] as const) {
    if (c[key] !== undefined && typeof c[key] !== 'string') throw new Error(`Invalid ${key}`);
  }
  // Keep credentials separate so listing and errors cannot leak URI passwords.
  if (new URL(c.uri).username || new URL(c.uri).password || new URL(c.uri).searchParams.has('authMechanismProperties')) {
    throw new Error('Keep credentials out of the URI; use user/password fields instead');
  }
}
