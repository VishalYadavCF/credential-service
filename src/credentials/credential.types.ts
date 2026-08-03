/**
 * Mirrors `CredentialApiResponse` from ap-executor's
 * `src/auth/auth-resolver.service.ts` — this is the exact shape the consumer expects
 * back from `GET /v1/credentials/internal/:credentialId`.
 *
 * `auth` is intentionally untyped here (not `AppConnectionValue` from
 * `@activepieces/shared`) — this service has no dependency on activepieces and must not
 * gain one just to describe a passthrough field. We store and return whatever was
 * seeded, verbatim; normalising `auth` (nested `props` vs flat) is the consumer's job
 * (`transformAuthFormat`), not ours.
 */
export interface CredentialRecord {
  credentialId: number;
  merchantId: number;
  nodeName: string;
  authType: string;
  /** 1 = active. Anything else → consumer raises CREDENTIAL_INACTIVE. */
  status: number;
  expiresOn: string;
  auth: Record<string, unknown>;
  config: Record<string, string>;
}

/** The on-disk shape of the seed file: credentialId (as a string key) -> record. */
export type SeedFile = Record<string, CredentialRecord>;

/** Redacted inventory entry — never carries auth *values*, only its key names. */
export interface RedactedCredentialEntry {
  credentialId: number;
  nodeName: string;
  authType: string;
  status: number;
  expiresOn: string;
  authKeys: string[];
}
