import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { SeedStoreService } from './seed-store.service';
import { CredentialRecord } from '../credential.types';

const record: CredentialRecord = {
  credentialId: 1,
  merchantId: 1000,
  nodeName: 'gmail',
  authType: 'OAUTH2',
  status: 1,
  expiresOn: '2099-01-01T00:00:00.000Z',
  auth: { type: 'OAUTH2', access_token: 'tok' },
  config: {},
};

describe('CredentialsService', () => {
  let service: CredentialsService;
  let seedStore: jest.Mocked<SeedStoreService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialsService,
        {
          provide: SeedStoreService,
          useValue: {
            getById: jest.fn(),
            listRedacted: jest.fn(),
            mergeAuth: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CredentialsService);
    seedStore = module.get(SeedStoreService);
  });

  // ─── getCredential ─────────────────────────────────────────────────────────

  it('CST-001: returns the record for a known credential id', async () => {
    seedStore.getById.mockResolvedValue(record);
    const result = await service.getCredential(1);
    expect(result).toBe(record);
    expect(seedStore.getById).toHaveBeenCalledWith(1);
  });

  it('CST-002: throws NotFoundException for an unknown credential id', async () => {
    seedStore.getById.mockResolvedValue(undefined);
    await expect(service.getCredential(999)).rejects.toThrow(NotFoundException);
  });

  it('CST-003: passes through an inactive (status 0) credential unchanged', async () => {
    const inactive = { ...record, status: 0 };
    seedStore.getById.mockResolvedValue(inactive);
    const result = await service.getCredential(1);
    expect(result.status).toBe(0);
  });

  // ─── listCredentials ───────────────────────────────────────────────────────

  it('CST-004: returns the redacted list from the seed store', async () => {
    const redacted = [
      {
        credentialId: 1,
        nodeName: 'gmail',
        authType: 'OAUTH2',
        status: 1,
        expiresOn: record.expiresOn,
        authKeys: ['type', 'access_token'],
      },
    ];
    seedStore.listRedacted.mockResolvedValue(redacted);
    await expect(service.listCredentials()).resolves.toBe(redacted);
  });

  // ─── updateCredential ──────────────────────────────────────────────────────

  it('CST-005: returns the updated record on a successful merge', async () => {
    const updated = { ...record, auth: { type: 'OAUTH2', access_token: 'new' } };
    seedStore.mergeAuth.mockResolvedValue(updated);
    const result = await service.updateCredential(1, { type: 'OAUTH2', access_token: 'new' });
    expect(result).toBe(updated);
    expect(seedStore.mergeAuth).toHaveBeenCalledWith(1, { type: 'OAUTH2', access_token: 'new' });
  });

  it('CST-006: throws NotFoundException when merging into an unknown credential id', async () => {
    seedStore.mergeAuth.mockResolvedValue(undefined);
    await expect(
      service.updateCredential(999, { type: 'OAUTH2', access_token: 'new' }),
    ).rejects.toThrow(NotFoundException);
  });
});
