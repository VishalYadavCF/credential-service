import { loadAndValidateConfig } from './configuration';

describe('loadAndValidateConfig', () => {
  it('CFGV-001: returns defaults when no env vars are set', () => {
    const result = loadAndValidateConfig({});
    expect(result.PORT).toBe(8096);
    expect(result.HOST).toBe('127.0.0.1');
    expect(result.GLOBAL_PREFIX).toBe('wfcd');
    expect(result.SEED_FILE_PATH).toBe('./credentials.seed.json');
  });

  it('CFGV-002: coerces and honours provided values', () => {
    const result = loadAndValidateConfig({ PORT: '9999', HOST: '0.0.0.0', GLOBAL_PREFIX: 'api' });
    expect(result.PORT).toBe(9999);
    expect(result.HOST).toBe('0.0.0.0');
    expect(result.GLOBAL_PREFIX).toBe('api');
  });

  it('CFGV-003: throws a clear error for an invalid NODE_ENV', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => loadAndValidateConfig({ NODE_ENV: 'staging' })).toThrow(
      'Invalid environment configuration',
    );
    consoleSpy.mockRestore();
  });
});
