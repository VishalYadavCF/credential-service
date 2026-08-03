import { EnvConfigType } from './env.schema';

/** Typed key list so `configService.get(EnvConsts.X)` can't typo an env var name. */
export const EnvConsts: { [K in keyof EnvConfigType]: K } = {
  PORT: 'PORT',
  HOST: 'HOST',
  GLOBAL_PREFIX: 'GLOBAL_PREFIX',
  NODE_ENV: 'NODE_ENV',
  LOG_LEVEL: 'LOG_LEVEL',
  SEED_FILE_PATH: 'SEED_FILE_PATH',
};
