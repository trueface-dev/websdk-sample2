/**
 * TrueFace Web SDK — sample 2 backend.
 *
 * Differs from web-sdk-sample in two ways:
 *   1. The SDK is loaded from jsDelivr, not from a sibling checkout, so this
 *      page exercises exactly the published artifact a merchant would get.
 *   2. `trueface-web-sdk.css` is never loaded. public/theme.css restyles the
 *      SDK's DOM from scratch, so the page shows what a merchant can change
 *      with CSS alone.
 *
 * Zero dependencies (Node 18+). The secret key stays here: sessions are
 * created server-to-server, and the browser only sees the publishable key,
 * the verification id and the client secret.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

loadDotEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 4002);
const API_BASE_URL = stripSlash(process.env.TRUEFACE_API_URL || 'https://api.trueface.dev');
const GRPC_BASE_URL = stripSlash(process.env.TRUEFACE_GRPC_URL || 'https://realtime.trueface.dev');
const SECRET_KEY = (process.env.TRUEFACE_SECRET_KEY || '').trim();
const SDK_VERSION = (process.env.TRUEFACE_SDK_VERSION || 'v0.2.0').trim();
const SDK_URL = `https://cdn.jsdelivr.net/gh/trueface-dev/web-artifact@${SDK_VERSION}/trueface-web-sdk.js`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/config' && req.method === 'GET') {
      return json(res, 200, {
        apiBaseUrl: API_BASE_URL,
        grpcBaseUrl: GRPC_BASE_URL,
        sdkVersion: SDK_VERSION,
        sdkUrl: SDK_URL,
        secretKeyConfigured: Boolean(SECRET_KEY),
        livemode: SECRET_KEY.startsWith('sk_live'),
      });
    }

    if (pathname === '/api/sessions' && req.method === 'POST') {
      return await createSession(req, res);
    }

    const resultMatch = pathname.match(/^\/api\/verifications\/([\w-]+)$/);
    if (resultMatch && req.method === 'GET') {
      return await fetchVerification(res, resultMatch[1]);
    }

    return serveFile(res, PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  } catch (err) {
    console.error('[sample2] unhandled error:', err);
    json(res, 500, { error: 'internal_error', message: String(err && err.message ? err.message : err) });
  }
});

/** Creates a verification with the secret key and hands the browser only client-safe fields. */
async function createSession(req, res) {
  if (!SECRET_KEY) {
    return json(res, 400, {
      error: 'missing_secret_key',
      message: 'Set TRUEFACE_SECRET_KEY in web-sdk-sample-2/.env, or use Manual mode in the UI.',
    });
  }

  const body = await readJson(req);
  const payload = {};
  if (body.challengeCount) payload.challengeCount = Number(body.challengeCount);
  if (Array.isArray(body.allowedChallenges) && body.allowedChallenges.length) {
    payload.allowedChallenges = body.allowedChallenges;
  }
  if (body.userIdentifier) payload.userIdentifier = body.userIdentifier;
  payload.metadata = { source: 'web-sdk-sample-2', ...(body.metadata || {}) };

  const upstream = await fetch(`${API_BASE_URL}/v1/verifications`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error(`[sample2] create verification failed (${upstream.status}):`, text);
    return json(res, upstream.status, {
      error: 'create_failed',
      status: upstream.status,
      message: text || upstream.statusText,
    });
  }

  const created = JSON.parse(text);
  console.log(`[sample2] created verification ${created.id} (${created.challenges?.join(', ') || 'no challenges'})`);
  return json(res, 200, {
    verificationId: created.id,
    clientSecret: created.clientSecret,
    publicKey: created.publicKey,
    challenges: created.challenges,
    expiresAt: created.expiresAt,
  });
}

/** Server-side result lookup — the authoritative outcome, not the browser's copy. */
async function fetchVerification(res, id) {
  if (!SECRET_KEY) {
    return json(res, 400, { error: 'missing_secret_key', message: 'Secret key required to read results.' });
  }
  const upstream = await fetch(`${API_BASE_URL}/v1/verifications/${id}`, {
    headers: { authorization: `Bearer ${SECRET_KEY}` },
  });
  const text = await upstream.text();
  res.writeHead(upstream.status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

function serveFile(res, baseDir, relativePath) {
  const target = path.join(baseDir, path.normalize(relativePath));
  if (!target.startsWith(baseDir)) {
    return json(res, 403, { error: 'forbidden' });
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    const value = (match[2] || '').trim().replace(/^["']|["']$/g, '');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

function stripSlash(value) {
  return value.replace(/\/$/, '');
}

server.listen(PORT, () => {
  console.log(`\n  TrueFace Web SDK sample 2 — hosted SDK, custom theme`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Sample site   http://localhost:${PORT}`);
  console.log(`  SDK (hosted)  ${SDK_URL}`);
  console.log(`  TrueFace API  ${API_BASE_URL}`);
  console.log(`  Secret key    ${SECRET_KEY ? `configured (${SECRET_KEY.slice(0, 8)}…)` : 'NOT SET — manual mode only'}`);
  console.log('');
});
