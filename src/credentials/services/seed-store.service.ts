import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { AppConfigService } from '../../config/config.service';
import { CredentialRecord, RedactedCredentialEntry, SeedFile } from '../credential.types';

/**
 * Reads/writes the on-disk JSON seed file backing this stub.
 *
 * Deliberately uncached: every read hits disk fresh so a developer editing
 * `credentials.seed.json` by hand sees the change on the very next request, no restart
 * needed. Writes (from POST /v1/credentials/internal/:id) are serialised through a mutex
 * and land via write-to-temp-file + rename so a crash mid-write can never corrupt the
 * seed file, and a merge never clobbers sibling entries.
 *
 * Never logs auth *values* — only ids, node names, and auth type/key names.
 */
@Injectable()
export class SeedStoreService {
  private readonly logger = new Logger(SeedStoreService.name);
  private readonly writeMutex = new Mutex();
  private hasWarnedMissingFile = false;

  constructor(private readonly configService: AppConfigService) {}

  private get filePath(): string {
    return this.configService.seedFilePath;
  }

  /** Reads and parses the seed file fresh from disk. Missing file -> empty store. */
  async readAll(): Promise<SeedFile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        if (!this.hasWarnedMissingFile) {
          this.logger.warn(
            `Seed file not found at ${this.filePath} — treating as empty. ` +
              `Copy credentials.seed.example.json to get started.`,
          );
          this.hasWarnedMissingFile = true;
        }
        return {};
      }
      throw new InternalServerErrorException(
        `Failed to read seed file at ${this.filePath}: ${(err as Error).message}`,
      );
    }

    return this.parse(raw);
  }

  private parse(raw: string): SeedFile {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new InternalServerErrorException(
        `Seed file at ${this.filePath} is not valid JSON: ${(err as Error).message}. ` +
          `Fix or restore it from credentials.seed.example.json.`,
      );
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new InternalServerErrorException(
        `Seed file at ${this.filePath} must contain a JSON object keyed by credentialId.`,
      );
    }

    return parsed as SeedFile;
  }

  async getById(credentialId: number): Promise<CredentialRecord | undefined> {
    const all = await this.readAll();
    return all[String(credentialId)];
  }

  async listRedacted(): Promise<RedactedCredentialEntry[]> {
    const all = await this.readAll();
    return Object.values(all).map((record) => ({
      credentialId: record.credentialId,
      nodeName: record.nodeName,
      authType: record.authType,
      status: record.status,
      expiresOn: record.expiresOn,
      authKeys: record.auth && typeof record.auth === 'object' ? Object.keys(record.auth) : [],
    }));
  }

  /**
   * Merges `updatedAuth` into the stored record for `credentialId`, replacing its `auth`
   * field wholesale (this is what ap-executor's token-refresh flow POSTs — the full
   * updated auth object, not a patch) while leaving every other credential entry, and
   * every other field on this entry, untouched.
   *
   * Returns the updated record, or `undefined` if no credential exists for that id — the
   * caller (controller) turns that into a 404, mirroring GET.
   */
  async mergeAuth(
    credentialId: number,
    updatedAuth: Record<string, unknown>,
  ): Promise<CredentialRecord | undefined> {
    return this.writeMutex.runExclusive(async () => {
      const all = await this.readAll();
      const key = String(credentialId);
      const existing = all[key];
      if (!existing) {
        return undefined;
      }

      const authType = typeof updatedAuth.type === 'string' ? updatedAuth.type : existing.authType;
      const updated: CredentialRecord = {
        ...existing,
        auth: updatedAuth,
        authType,
        expiresOn: this.deriveExpiresOn(updatedAuth, existing.expiresOn),
      };

      const next: SeedFile = { ...all, [key]: updated };
      await this.writeAtomically(next);

      this.logger.log(
        `Merged updated auth into credential ${credentialId} (nodeName=${existing.nodeName}, authType=${authType})`,
      );
      return updated;
    });
  }

  /**
   * Best-effort recompute of `expiresOn` from a refreshed OAuth2 token's `claimed_at` +
   * `expires_in`, so a refreshed credential doesn't keep looking expired to ap-executor's
   * proactive-refresh check after a POST. Falls back to the previous value when the fields
   * aren't present (e.g. SECRET_TEXT credentials have neither).
   */
  private deriveExpiresOn(auth: Record<string, unknown>, fallback: string): string {
    const claimedAt = typeof auth.claimed_at === 'number' ? auth.claimed_at : undefined;
    const expiresIn = typeof auth.expires_in === 'number' ? auth.expires_in : undefined;
    if (claimedAt !== undefined && expiresIn !== undefined) {
      return new Date(claimedAt + expiresIn * 1000).toISOString();
    }
    return fallback;
  }

  private async writeAtomically(data: SeedFile): Promise<void> {
    const dir = path.dirname(this.filePath);
    const tmpPath = path.join(
      dir,
      `${path.basename(this.filePath)}.tmp-${randomBytes(6).toString('hex')}`,
    );
    const contents = JSON.stringify(data, null, 2) + '\n';

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, contents, 'utf-8');
    try {
      await fs.rename(tmpPath, this.filePath);
    } catch (err) {
      await fs.unlink(tmpPath).catch(() => undefined);
      throw err;
    }
  }
}
