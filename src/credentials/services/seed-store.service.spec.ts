import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SeedStoreService } from './seed-store.service';
import { AppConfigService } from '../../config/config.service';
import { CredentialRecord, SeedFile } from '../credential.types';

const gmailRecord: CredentialRecord = {
  credentialId: 1,
  merchantId: 1000,
  nodeName: 'gmail',
  authType: 'OAUTH2',
  status: 1,
  expiresOn: '2099-01-01T00:00:00.000Z',
  auth: {
    type: 'OAUTH2',
    props: {
      access_token: 'access-token-abc',
      refresh_token: 'refresh-token-xyz',
      expires_in: 3599,
      claimed_at: 1700000000000,
    },
  },
  config: {},
};

const sheetsRecord: CredentialRecord = {
  ...gmailRecord,
  credentialId: 2,
  nodeName: 'google-sheets',
};

const inactiveRecord: CredentialRecord = {
  ...gmailRecord,
  credentialId: 4,
  status: 0,
};

async function makeTempSeed(data: SeedFile): Promise<{ dir: string; filePath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cred-svc-test-'));
  const filePath = path.join(dir, 'credentials.seed.json');
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return { dir, filePath };
}

describe('SeedStoreService', () => {
  let tempDir: string;
  let filePath: string;
  let service: SeedStoreService;

  async function buildService(seed: SeedFile): Promise<SeedStoreService> {
    const created = await makeTempSeed(seed);
    tempDir = created.dir;
    filePath = created.filePath;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedStoreService,
        { provide: AppConfigService, useValue: { seedFilePath: filePath } },
      ],
    }).compile();

    return module.get(SeedStoreService);
  }

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ─── readAll / getById ────────────────────────────────────────────────────

  it('SST-001: readAll parses an existing valid seed file', async () => {
    service = await buildService({ '1': gmailRecord, '2': sheetsRecord });
    const all = await service.readAll();
    expect(Object.keys(all)).toEqual(['1', '2']);
    expect(all['1'].nodeName).toBe('gmail');
  });

  it('SST-002: readAll returns an empty store when the file is missing (no crash)', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cred-svc-test-'));
    const missingPath = path.join(tempDir, 'does-not-exist.json');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedStoreService,
        { provide: AppConfigService, useValue: { seedFilePath: missingPath } },
      ],
    }).compile();
    service = module.get(SeedStoreService);

    await expect(service.readAll()).resolves.toEqual({});
  });

  it('SST-003: readAll throws a clear error (not a crash) on malformed JSON', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cred-svc-test-'));
    filePath = path.join(tempDir, 'credentials.seed.json');
    await fs.writeFile(filePath, '{ this is not valid json');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedStoreService,
        { provide: AppConfigService, useValue: { seedFilePath: filePath } },
      ],
    }).compile();
    service = module.get(SeedStoreService);

    await expect(service.readAll()).rejects.toThrow(InternalServerErrorException);
    await expect(service.readAll()).rejects.toThrow(/not valid JSON/);
  });

  it('SST-003b: readAll throws a clear error when the seed file root is not an object', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cred-svc-test-'));
    filePath = path.join(tempDir, 'credentials.seed.json');
    await fs.writeFile(filePath, JSON.stringify([1, 2, 3]));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedStoreService,
        { provide: AppConfigService, useValue: { seedFilePath: filePath } },
      ],
    }).compile();
    service = module.get(SeedStoreService);

    await expect(service.readAll()).rejects.toThrow(/must contain a JSON object/);
  });

  it('SST-004: getById returns undefined for an unknown id', async () => {
    service = await buildService({ '1': gmailRecord });
    await expect(service.getById(999)).resolves.toBeUndefined();
  });

  it('SST-005: getById returns the record verbatim, including an inactive (status 0) one', async () => {
    service = await buildService({ '4': inactiveRecord });
    const record = await service.getById(4);
    expect(record?.status).toBe(0);
    expect(record?.auth).toEqual(inactiveRecord.auth);
  });

  // ─── listRedacted ──────────────────────────────────────────────────────────

  it('SST-006: listRedacted never includes auth values, only key names', async () => {
    service = await buildService({ '1': gmailRecord });
    const list = await service.listRedacted();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      credentialId: 1,
      nodeName: 'gmail',
      authType: 'OAUTH2',
      status: 1,
      expiresOn: gmailRecord.expiresOn,
      authKeys: ['type', 'props'],
    });
    // Absolutely no secret value should leak into the redacted view.
    expect(JSON.stringify(list)).not.toContain('access-token-abc');
    expect(JSON.stringify(list)).not.toContain('refresh-token-xyz');
  });

  // ─── mergeAuth (POST) ──────────────────────────────────────────────────────

  it('SST-007: mergeAuth replaces auth for the target id without clobbering sibling entries', async () => {
    service = await buildService({ '1': gmailRecord, '2': sheetsRecord });

    const newAuth = { type: 'OAUTH2', access_token: 'new-access-token' };
    const updated = await service.mergeAuth(1, newAuth);

    expect(updated?.auth).toEqual(newAuth);

    const all = await service.readAll();
    expect(all['1'].auth).toEqual(newAuth);
    // Sibling entry untouched.
    expect(all['2']).toEqual(sheetsRecord);
  });

  it('SST-008: mergeAuth returns undefined for an unknown credential id', async () => {
    service = await buildService({ '1': gmailRecord });
    await expect(service.mergeAuth(999, { type: 'OAUTH2' })).resolves.toBeUndefined();
  });

  it('SST-009: mergeAuth persists to disk — a fresh read after the merge reflects the change', async () => {
    service = await buildService({ '1': gmailRecord });
    await service.mergeAuth(1, { type: 'OAUTH2', access_token: 'persisted-token' });

    const raw = await fs.readFile(filePath, 'utf-8');
    const onDisk = JSON.parse(raw) as SeedFile;
    expect(onDisk['1'].auth).toEqual({ type: 'OAUTH2', access_token: 'persisted-token' });
  });

  it('SST-010: mergeAuth writes atomically — no leftover .tmp- file after a successful write', async () => {
    service = await buildService({ '1': gmailRecord });
    await service.mergeAuth(1, { type: 'OAUTH2', access_token: 'atomic-token' });

    const dirEntries = await fs.readdir(tempDir);
    const tmpLeftovers = dirEntries.filter((f) => f.includes('.tmp-'));
    expect(tmpLeftovers).toEqual([]);
    expect(dirEntries).toContain('credentials.seed.json');
  });

  it('SST-011: derives expiresOn from claimed_at + expires_in on refresh', async () => {
    service = await buildService({ '1': gmailRecord });
    const claimedAt = 1_700_000_000_000;
    const expiresIn = 3600;
    const updated = await service.mergeAuth(1, {
      type: 'OAUTH2',
      access_token: 'refreshed',
      claimed_at: claimedAt,
      expires_in: expiresIn,
    });

    expect(updated?.expiresOn).toBe(new Date(claimedAt + expiresIn * 1000).toISOString());
  });

  it('SST-012: keeps the previous expiresOn when the new auth has no claimed_at/expires_in', async () => {
    service = await buildService({
      '3': { ...gmailRecord, credentialId: 3, authType: 'SECRET_TEXT' },
    });
    const updated = await service.mergeAuth(3, { type: 'SECRET_TEXT', secret_text: 'new-key' });
    expect(updated?.expiresOn).toBe(gmailRecord.expiresOn);
  });

  it('SST-013: concurrent merges to different ids both persist (mutex serialises writes)', async () => {
    service = await buildService({ '1': gmailRecord, '2': sheetsRecord });

    await Promise.all([
      service.mergeAuth(1, { type: 'OAUTH2', access_token: 'concurrent-1' }),
      service.mergeAuth(2, { type: 'OAUTH2', access_token: 'concurrent-2' }),
    ]);

    const all = await service.readAll();
    expect(all['1'].auth).toEqual({ type: 'OAUTH2', access_token: 'concurrent-1' });
    expect(all['2'].auth).toEqual({ type: 'OAUTH2', access_token: 'concurrent-2' });
  });

  // ─── Never log secret values ────────────────────────────────────────────────

  it('SST-014: never logs the secret token value, across read and merge', async () => {
    const SECRET = 'super-secret-value-should-never-be-logged-9f3c';
    service = await buildService({
      '1': {
        ...gmailRecord,
        auth: { type: 'OAUTH2', props: { access_token: SECRET, refresh_token: 'r' } },
      },
    });

    const logSpy = jest.spyOn(Logger.prototype, 'log');
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    await service.getById(1);
    await service.mergeAuth(1, { type: 'OAUTH2', access_token: SECRET, refresh_token: 'new-r' });

    const allLoggedText = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

    expect(allLoggedText).not.toContain(SECRET);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
