import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SeedStoreService } from './seed-store.service';
import { CredentialRecord, RedactedCredentialEntry } from '../credential.types';

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(private readonly seedStore: SeedStoreService) {}

  async getCredential(credentialId: number): Promise<CredentialRecord> {
    this.logger.log(`GET credential ${credentialId}`);
    const record = await this.seedStore.getById(credentialId);
    if (!record) {
      this.logger.warn(`Credential ${credentialId} not found`);
      throw new NotFoundException({
        message: `Credential ${credentialId} not found`,
        credentialId,
      });
    }
    this.logger.log(
      `Credential ${credentialId} found — nodeName=${record.nodeName}, authType=${record.authType}, status=${record.status}`,
    );
    return record;
  }

  async listCredentials(): Promise<RedactedCredentialEntry[]> {
    const entries = await this.seedStore.listRedacted();
    this.logger.log(`Listed ${entries.length} seeded credential(s)`);
    return entries;
  }

  async updateCredential(
    credentialId: number,
    updatedAuth: Record<string, unknown>,
  ): Promise<CredentialRecord> {
    this.logger.log(`POST (update) credential ${credentialId} — authType=${updatedAuth.type}`);
    const updated = await this.seedStore.mergeAuth(credentialId, updatedAuth);
    if (!updated) {
      this.logger.warn(`Cannot update credential ${credentialId}: no such credential is seeded`);
      throw new NotFoundException({
        message: `Credential ${credentialId} not found — seed it first via GET /v1/credentials/internal`,
        credentialId,
      });
    }
    return updated;
  }
}
