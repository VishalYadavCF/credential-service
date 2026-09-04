#!/usr/bin/env node
/**
 * Converts a merchant-UI credential-creation payload into a seed entry for this stub.
 *
 * The UI API (`POST /merchantuiapisvc/merchant/wfcd/v1/credentials`) takes the WRITE shape — a flat
 * `attributes: [{key, value}]` list. ap-executor reads the READ shape from
 * `GET /v1/credentials/internal/:id` — `{ credentialId, nodeName, authType, status, expiresOn, auth }`
 * where `auth` is `{ type, props: {...} }`. This translates the former into the latter so a payload you
 * already have (or copied out of the browser) can be reused locally without hand-editing JSON.
 *
 * Usage:
 *   node scripts/seed-from-ui-payload.js <payload.json> <credentialId> [--merchant 1000]
 *
 * Merges into credentials.seed.json without disturbing other entries. Never prints secret values.
 */
const fs = require('fs');
const path = require('path');

const [, , payloadPath, idArg, ...rest] = process.argv;

if (!payloadPath || !idArg) {
  console.error(
    'usage:\n' +
      '  npm run seed -- <payload.json> <credentialId> [--merchant N]\n' +
      '  npm run seed -- - <credentialId> [--merchant N]     # read the payload from stdin\n' +
      '\n' +
      'stdin avoids writing real tokens to a file at all:\n' +
      "  npm run seed -- - 5 <<'EOF'\n" +
      '  { "nodeName": "gmail", "authType": "OAUTH2", "status": 1, "attributes": [ ... ] }\n' +
      '  EOF',
  );
  process.exit(2);
}

const credentialId = Number(idArg);
if (!Number.isInteger(credentialId) || credentialId <= 0) {
  console.error(`credentialId must be a positive integer, got "${idArg}"`);
  process.exit(2);
}

const merchantIdx = rest.indexOf('--merchant');
const merchantId = merchantIdx >= 0 ? Number(rest[merchantIdx + 1]) : 1000;

/**
 * `-` reads stdin, which is the recommended path: a real access token never lands on disk outside the
 * gitignored seed file. A missing file is reported as one line, not a Node stack trace — this is a dev
 * tool and the usual cause is a mistyped path.
 */
function readPayload(source) {
  let raw;
  if (source === '-') {
    try {
      raw = fs.readFileSync(0, 'utf-8');
    } catch {
      console.error('could not read the payload from stdin');
      process.exit(1);
    }
    if (raw.trim() === '') {
      console.error('stdin was empty — pipe the JSON payload in, or pass a file path instead');
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(source)) {
      console.error(`no such file: ${source}`);
      console.error('pass a real path, or use `-` to read the payload from stdin.');
      process.exit(1);
    }
    raw = fs.readFileSync(source, 'utf-8');
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`payload is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

const payload = readPayload(payloadPath);

if (!Array.isArray(payload.attributes)) {
  console.error('payload has no `attributes` array — is this a merchant-UI credential payload?');
  process.exit(1);
}

// Flatten attributes into props. `type` belongs on the auth root, not inside props: ap-executor rejects
// a credential whose auth has no top-level `type` (CREDENTIAL_ERROR).
const props = {};
for (const { key, value } of payload.attributes) {
  if (key !== 'type') props[key] = value;
}

const authType = payload.authType ?? 'CUSTOM_AUTH';

/**
 * Stamp the token's freshness AT SEED TIME. Both fields, always — overwriting whatever the payload had.
 *
 * This is the single most confusing failure in local agent testing, and it is worth spelling out.
 *
 * A payload copied out of the browser carries no `claimed_at`, or carries a stale one from an example
 * file. ap-executor's `isOAuth2TokenExpired` reads **`expires_on` only**, and returns `false` when it is
 * absent — so a token with no `expires_on` is treated as never expiring and the proactive refresh never
 * runs. The stale access token then reaches the piece, which tries to refresh it itself via
 * google-auth-library's OAuth2Client — an object the piece builds with tokens but no client credentials.
 * Google answers `invalid_request: "Could not determine client ID from request."`, which looks like a bad
 * credential and is not: the client_id is right there, it was simply never sent.
 *
 * Writing both fields means the token is genuinely fresh for `expires_in` seconds from now, so nothing
 * along that chain gets a chance to fire.
 */
if (authType === 'OAUTH2') {
  const expiresInSeconds = Number(props.expires_in) || 3599;
  const now = Date.now();

  // Epoch millis — the shape the OAuth exchange returns, used to compute age.
  props.claimed_at = now;
  // ISO-8601, because ap-executor does `Date.parse(auth.expires_on)`. This is the field that actually
  // drives the proactive-refresh decision.
  props.expires_on = new Date(now + expiresInSeconds * 1000).toISOString();
}

const entry = {
  credentialId,
  merchantId,
  nodeName: payload.nodeName,
  authType,
  status: payload.status ?? 1,
  // Far future: this is the credential RECORD's expiry, not the OAuth token's. ap-executor only warns
  // when it is past, but a warning per run is noise.
  expiresOn: '2099-12-31T23:59:59.000Z',
  auth: { type: authType, props },
  config: {},
};

const seedPath = path.join(__dirname, '..', 'credentials.seed.json');
let seed = {};
if (fs.existsSync(seedPath)) {
  seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
}
seed[String(credentialId)] = entry;

// Atomic, so an interrupted write cannot corrupt a file holding real tokens.
const tmp = `${seedPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(seed, null, 2)}\n`);
fs.renameSync(tmp, seedPath);

console.log(`seeded credentialId=${credentialId}`);
console.log(`  nodeName : ${entry.nodeName}`);
console.log(`  authType : ${entry.authType}`);
console.log(`  status   : ${entry.status}`);
console.log(`  props    : ${Object.keys(props).join(', ')}   (values not printed)`);
if (props.expires_on) {
  const secondsLeft = Math.round((Date.parse(props.expires_on) - Date.now()) / 1000);
  console.log(`  claimed_at: ${new Date(props.claimed_at).toISOString()}  (stamped now)`);
  console.log(`  expires_on: ${props.expires_on}  (~${secondsLeft}s from now)`);
  console.log(
    `\n  The access token is treated as fresh for ~${Math.floor(secondsLeft / 60)} minutes. ` +
      `Re-run this script to re-stamp it before a later test.`,
  );
}

// Scope check: a token with the wrong scopes fails at Google with a confusing 403, so say so now.
const REQUIRED_SCOPES = {
  gmail: ['gmail.send', 'gmail.compose'],
  'google-sheets': ['spreadsheets'],
};
const needed = REQUIRED_SCOPES[entry.nodeName];
if (needed && typeof props.scope === 'string') {
  const missing = needed.filter((s) => !props.scope.includes(s));
  if (missing.length > 0) {
    console.warn(
      `\n  WARNING: this token's scopes do not include ${missing.join(', ')} — ` +
        `calls to ${entry.nodeName} will fail at Google with a 403.`,
    );
  }
}
