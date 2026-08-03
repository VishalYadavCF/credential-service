import { EnvConfig } from './env.schema';

/**
 * NestJS ConfigModule factory. Throws (and takes the process down) if any env var fails
 * validation — fail fast and loud rather than limp along with bad config.
 */
export function loadAndValidateConfig(rawEnv: Record<string, unknown>) {
  const parsed = EnvConfig.safeParse(rawEnv);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:', parsed.error.format());
    throw new Error('Invalid environment configuration — see printed errors above.');
  }
  return parsed.data;
}
