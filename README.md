# credential-service (local dev stub)

> ⚠️ **This is a local development stub. It is NOT a real credential service.**
> It has **no encryption** and **no authentication**, and stores secrets as **plaintext JSON on
> disk**. It binds to `127.0.0.1` by default. **Never deploy this. Never point a real
> environment at it. Never commit real tokens into this repo.**

## Why this exists

[`ap-executor`](../ap-executor) resolves piece credentials (Gmail, Google Sheets, Google Gemini,
…) by calling an upstream credential service over HTTP when
`CREDENTIAL_STORAGE_TYPE=db_encrypted`. In production it instead reads HashiCorp Vault via
Kubernetes service-account auth — which **cannot work on a laptop** (there is no k8s JWT to
present). This stub reimplements just enough of the HTTP contract
(`DbEncryptedCredentialService` in ap-executor) so a developer can run `ap-executor` fully
locally, with real Google OAuth2 tokens / Gemini API keys, end to end.

## Quick start

```bash
npm install
cp credentials.seed.example.json credentials.seed.json   # then paste real tokens into it
npm run start:dev
```

The server logs a loud warning banner on every start, and binds to `http://127.0.0.1:8096/wfcd`
by default — matching ap-executor's default `CREDENTIAL_SERVICE_URL`.

## Seeding credentials

Credentials live in `credentials.seed.json` (gitignored — **never commit this file**). Start
from the committed template:

```bash
cp credentials.seed.example.json credentials.seed.json
```

Then edit `credentials.seed.json` and replace the `PASTE_..._HERE` placeholders with real
values. **The file is read fresh from disk on every request** — no restart needed after an
edit.

Each entry is keyed by `credentialId` (as a string) and must match this shape (exactly what
`ap-executor`'s `AuthResolverService` expects back):

```jsonc
{
  "1": {
    "credentialId": 1,
    "merchantId": 1000,
    "nodeName": "gmail",
    "authType": "OAUTH2",
    "status": 1,              // 1 = active. Anything else -> ap-executor raises CREDENTIAL_INACTIVE.
    "expiresOn": "2099-12-31T23:59:59.000Z",
    "auth": {
      "type": "OAUTH2",
      "props": {
        "access_token": "...",
        "refresh_token": "...",
        "expires_in": 3599,
        "claimed_at": 1700000000000,
        "client_id": "...",     // needed for ap-executor's token-refresh flow
        "client_secret": "..."
      }
    },
    "config": {}
  }
}
```

Both auth nestings are accepted — `{ "type": "OAUTH2", "props": { ... } }` and a flat
`{ "type": "SECRET_TEXT", "secret_text": "..." }` both work, since ap-executor normalises them
on read. This stub stores and returns whatever you seed **verbatim** — it does not try to
normalise `auth` itself.

### Getting a Google OAuth2 token (Gmail / Google Sheets)

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the gear icon (top right) → check **"Use your own OAuth credentials"** → paste your own
   Google Cloud OAuth **Client ID** and **Client Secret** (create one in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials) if you don't have
   one — type "Web application", add `https://developers.google.com/oauthplayground` as an
   authorized redirect URI).
3. In **Step 1**, select the scopes you need, e.g.:
   - Gmail: `https://mail.google.com/` (or the narrower `gmail.send` / `gmail.readonly`)
   - Google Sheets: `https://www.googleapis.com/auth/spreadsheets`
4. Click **Authorize APIs**, sign in, grant access.
5. In **Step 2**, click **Exchange authorization code for tokens**.
6. Copy the resulting `access_token` and `refresh_token` into the matching seed entry, along
   with the Client ID / Client Secret from step 2 (`client_id` / `client_secret` — ap-executor's
   token-refresh flow needs these to mint a new access token once this one expires).

### Getting a Gemini API key (`google-gemini`, `SECRET_TEXT`)

Create one at [Google AI Studio](https://aistudio.google.com/app/apikey) and paste it into the
`secret_text` field of the `google-gemini` entry.

### Testing the inactive-credential path

`credentials.seed.example.json` ships credential id `4` with `"status": 0` — seed it as-is (no
real token needed) to exercise ap-executor's `CREDENTIAL_INACTIVE` error path.

## Configuring ap-executor to use this stub

In `ap-executor`'s environment (`.env` / shell):

```bash
CREDENTIAL_STORAGE_TYPE=db_encrypted
CREDENTIAL_SERVICE_URL=http://localhost:8096/wfcd
```

That's it — no ap-executor code changes needed; this stub's default port (`8096`) and global
prefix (`wfcd`) match that URL exactly.

## API

Base URL: `http://127.0.0.1:8096/wfcd` (configurable — see [Configuration](#configuration)).

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/credentials/internal` | Redacted inventory of every seeded credential — ids, node names, auth type, status, expiry, and the auth object's **key names only**. Never returns a secret value. |
| `GET` | `/v1/credentials/internal/:credentialId` | Full credential record for one id. `404` if unseeded. |
| `POST` | `/v1/credentials/internal/:credentialId` | Body is the **full updated auth object** (not a patch) — this is how ap-executor writes back a refreshed OAuth2 token. Body must include a non-empty `type` field (else `400`). `404` if the id isn't already seeded. Persists to `credentials.seed.json` atomically, merging into the existing file without disturbing other entries. |

## Configuration

All via env vars (see `src/config/env.schema.ts`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8096` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address — **do not change this to `0.0.0.0` unless you know exactly why** |
| `GLOBAL_PREFIX` | `wfcd` | Route prefix (no leading slash) |
| `SEED_FILE_PATH` | `./credentials.seed.json` | Path to the seed file, resolved against `process.cwd()` if relative |
| `NODE_ENV` | `development` | `development` or `test` |
| `LOG_LEVEL` | `log` | Nest logger level |

## Development

```bash
npm run start:dev   # nodemon + ts-node, restarts on src/ changes
npm run build       # tsc -> dist/
npm start           # node dist/main.js
npm run lint        # eslint --fix
npm run format      # prettier --write
npm test            # jest, with coverage
```

## Design notes / deviations from a "real" service

- **No caching, no file watcher.** The seed file is re-read from disk on every request. This is
  simpler than `fs.watch()` and correct as long as you're comfortable with one extra disk read
  per call — for a local dev tool serving a handful of requests, that's the right trade-off.
- **Writes are serialised** through an in-process mutex and land via write-to-temp-file +
  `rename()` (atomic on the same filesystem), so a crash mid-write can't corrupt the seed file
  and two concurrent `POST`s can't race each other into a lost update.
- **`POST` to an unseeded id returns 404** rather than silently creating a new entry. In
  production this path is only ever hit after a prior `GET`, so treating an unknown id as an
  error (not an implicit create) mirrors real behaviour and catches typos/misconfiguration
  early.
- **`expiresOn` is recomputed on `POST`** from the refreshed auth's `claimed_at` + `expires_in`
  when both are present, so a refreshed token doesn't keep looking expired to ap-executor's
  proactive-refresh check. Falls back to the previous `expiresOn` otherwise (e.g. `SECRET_TEXT`
  credentials have neither field).
- **Never logs secret values** — only credential ids, node names, auth types, and (for the
  inventory endpoint) auth object *key names*. Covered by a test that asserts a seeded token
  string never appears in captured logger output.

## Seeding from a merchant-UI payload

The merchant UI's credential-creation API takes a flat `attributes: [{key, value}]` list. This service
serves the **read** shape ap-executor consumes (`auth: { type, props }`). To convert one into the other:

```bash
npm run seed -- path/to/payload.json <credentialId> [--merchant 1000]
```

It flattens `attributes` into `props`, keeps `type` on the auth root (ap-executor rejects a credential
whose auth has no top-level `type`), merges into `credentials.seed.json` without touching other entries,
and warns if the token's scopes do not cover what the target piece needs.

### It stamps `claimed_at` and `expires_on` at run time — and this matters

ap-executor's `isOAuth2TokenExpired` reads **`expires_on` only**, and returns `false` when it is absent.
So a credential with no `expires_on` is treated as never expiring: the proactive refresh never runs, the
stale access token reaches the piece, and the piece tries to refresh it itself using an OAuth2Client it
built with tokens but no client credentials. Google replies:

```
invalid_request  "Could not determine client ID from request."
```

which looks like a broken credential and is not — the `client_id` is present, it was simply never sent.

Stamping both fields at seed time makes the token genuinely fresh for `expires_in` seconds, so nothing in
that chain fires. **A token is only good for ~59 minutes; re-run the script to re-stamp before a later
test.**
