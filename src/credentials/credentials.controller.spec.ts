import { Test, TestingModule } from '@nestjs/testing';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './services/credentials.service';

describe('CredentialsController', () => {
  let controller: CredentialsController;
  let service: jest.Mocked<CredentialsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CredentialsController],
      providers: [
        {
          provide: CredentialsService,
          useValue: {
            getCredential: jest.fn(),
            listCredentials: jest.fn(),
            updateCredential: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(CredentialsController);
    service = module.get(CredentialsService);
  });

  it('CCT-001: list() delegates to CredentialsService.listCredentials', async () => {
    service.listCredentials.mockResolvedValue([]);
    await controller.list();
    expect(service.listCredentials).toHaveBeenCalledTimes(1);
  });

  it('CCT-002: getOne() delegates to CredentialsService.getCredential with the parsed id', async () => {
    service.getCredential.mockResolvedValue({} as any);
    await controller.getOne(42);
    expect(service.getCredential).toHaveBeenCalledWith(42);
  });

  it('CCT-003: update() delegates to CredentialsService.updateCredential with id + body', async () => {
    service.updateCredential.mockResolvedValue({} as any);
    const body = { type: 'OAUTH2', access_token: 'new-token' };
    await controller.update(42, body);
    expect(service.updateCredential).toHaveBeenCalledWith(42, body);
  });
});
