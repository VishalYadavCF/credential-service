import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { AppConfigService } from './config.service';

describe('AppConfigService', () => {
  async function build(values: Record<string, unknown>): Promise<AppConfigService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppConfigService,
        { provide: ConfigService, useValue: { get: (key: string) => values[key] } },
      ],
    }).compile();
    return module.get(AppConfigService);
  }

  it('CFG-001: exposes port, host, globalPrefix, nodeEnv, logLevel from ConfigService', async () => {
    const config = await build({
      PORT: 8096,
      HOST: '127.0.0.1',
      GLOBAL_PREFIX: 'wfcd',
      NODE_ENV: 'development',
      LOG_LEVEL: 'log',
    });

    expect(config.port).toBe(8096);
    expect(config.host).toBe('127.0.0.1');
    expect(config.globalPrefix).toBe('wfcd');
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('log');
  });

  it('CFG-002: resolves a relative SEED_FILE_PATH against process.cwd()', async () => {
    const config = await build({ SEED_FILE_PATH: './credentials.seed.json' });
    expect(config.seedFilePath).toBe(path.resolve(process.cwd(), './credentials.seed.json'));
  });

  it('CFG-003: leaves an absolute SEED_FILE_PATH untouched', async () => {
    const absolute = path.resolve('/tmp/somewhere/credentials.seed.json');
    const config = await build({ SEED_FILE_PATH: absolute });
    expect(config.seedFilePath).toBe(absolute);
  });
});
