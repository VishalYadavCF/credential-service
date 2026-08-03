import { z } from 'zod';

/**
 * All env vars for this stub, validated at startup. Kept deliberately small —
 * this is a local dev tool, not a production service.
 */
export const EnvConfig = z.object({
  // ap-executor's CREDENTIAL_SERVICE_URL defaults to http://localhost:8096/wfcd, so this
  // service defaults its port + prefix to match — zero config needed on the ap-executor side.
  PORT: z.coerce.number().default(8096),

  // Bind to loopback only by default. This is a dev stub with no auth and no encryption —
  // it must never be reachable from outside the developer's own machine.
  HOST: z.string().default('127.0.0.1'),

  // No leading slash — passed straight to app.setGlobalPrefix().
  GLOBAL_PREFIX: z.string().default('wfcd'),

  NODE_ENV: z.enum(['development', 'test']).default('development'),

  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  // Resolved relative to process.cwd() if not absolute.
  SEED_FILE_PATH: z.string().default('./credentials.seed.json'),
});

export type EnvConfigType = z.infer<typeof EnvConfig>;
