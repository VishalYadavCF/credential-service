import { z } from 'zod';

/**
 * POST /v1/credentials/internal/:credentialId body.
 *
 * This is the *full updated auth object* (not a patch) — ap-executor's
 * `DbEncryptedCredentialService.updateCredential` POSTs the entire refreshed auth value
 * verbatim. The only hard requirement, per the consumer contract, is a `type` field:
 * `AuthResolverService` / the piece SDK reject an auth value with no `type`.
 */
export const UpdateAuthSchema = z
  .record(z.string(), z.unknown())
  .refine((obj) => typeof obj.type === 'string' && obj.type.trim().length > 0, {
    message: "Request body must be an auth object with a non-empty 'type' field",
  });

export type UpdateAuthDto = z.infer<typeof UpdateAuthSchema>;
