/**
 * Sample 2 front-end.
 *
 * Two paths to a session: the server mints one with the secret key, or you
 * paste an existing one. Either way the SDK call is the same three lines —
 * construct, start(container), await the result — and the outcome is then
 * re-read from the API server-side, which is the authoritative answer.
 */

const el = (id) => document.getElementById(id);
const mount = el('tf-mount');

function log(message, kind = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${kind}`;
  const time = new Date().toLocaleTimeString([], { hour12: false });
  line.textContent = `${time}  ${message}`;
  el('log').prepend(line);
}

function caption(text) {
  el('stage-caption').innerHTML = text;
}

function showResult(value) {
  el('result').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Clears the mount so a second run starts from a clean container. */
function resetMount() {
  mount.replaceChildren();
  mount.className = '';
  mount.removeAttribute('style');
}

async function createSession() {
  const count = el('challenge-count').value;
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(count ? { challengeCount: Number(count) } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `session creation failed (${res.status})`);
  return body;
}

async function fetchAuthoritativeResult(verificationId) {
  const res = await fetch(`/api/verifications/${verificationId}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `result lookup failed (${res.status})`);
  return body;
}

async function run(session) {
  const config = window.__TF_BOOT__.config;
  resetMount();
  caption('Camera active. Follow the prompts in the frame.');
  log(`session ${session.verificationId} — challenges: ${(session.challenges || []).join(', ') || 'server default'}`);

  const sdk = new window.TrueFaceLiveness({
    publicKey: session.publicKey,
    verificationId: session.verificationId,
    clientSecret: session.clientSecret,
    backendBaseUrl: config.apiBaseUrl,
    grpcBaseUrl: config.grpcBaseUrl,
  });

  try {
    const result = await sdk.start(mount);
    log('liveness flow finished', 'ok');
    showResult(result);
    caption('Verification submitted. Reading the authoritative result…');

    const authoritative = await fetchAuthoritativeResult(session.verificationId);
    log(`server status: ${authoritative.status} / ${authoritative.decision ?? 'no decision yet'}`, 'ok');
    showResult(authoritative);
    caption('Done.');
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    log(message, 'err');
    showResult({ error: message });
    caption('Verification did not complete. See Activity.');
    // A failure mid-flow can still have created server-side state worth seeing.
    try {
      showResult(await fetchAuthoritativeResult(session.verificationId));
    } catch { /* nothing more to add */ }
  } finally {
    setButtonsEnabled(true);
  }
}

function setButtonsEnabled(enabled) {
  el('start').disabled = !enabled || !window.__TF_BOOT__.config?.secretKeyConfigured;
  el('start-manual').disabled = !enabled;
}

el('start').addEventListener('click', async () => {
  setButtonsEnabled(false);
  try {
    log('creating verification server-side…');
    await run(await createSession());
  } catch (err) {
    log(err.message, 'err');
    showResult({ error: err.message });
    setButtonsEnabled(true);
  }
});

el('start-manual').addEventListener('click', async () => {
  const session = {
    verificationId: el('m-vid').value.trim(),
    clientSecret: el('m-secret').value.trim(),
    publicKey: el('m-pk').value.trim(),
    challenges: [],
  };
  if (!session.verificationId || !session.clientSecret || !session.publicKey) {
    log('all three fields are required for an existing session', 'err');
    return;
  }
  setButtonsEnabled(false);
  await run(session);
});

// --- boot ------------------------------------------------------------------

(async () => {
  try {
    const config = await window.__TF_BOOT__.ready;
    el('fact-sdk').textContent = `${config.sdkVersion} (jsDelivr)`;
    el('fact-mode').textContent = config.secretKeyConfigured
      ? `${config.livemode ? 'live' : 'test'} key configured`
      : 'no secret key — existing session only';
    el('footer-sdk').textContent = config.sdkUrl;
    setButtonsEnabled(true);
    log(`hosted SDK ${config.sdkVersion} loaded`, 'ok');
    if (!config.secretKeyConfigured) {
      log('TRUEFACE_SECRET_KEY not set — use "Use an existing session"', 'warn');
    }
  } catch (err) {
    el('fact-sdk').textContent = 'failed to load';
    el('fact-mode').textContent = '—';
    log(err.message, 'err');
    log('if the release tag was just pushed, jsDelivr may need a few minutes to propagate', 'warn');
    caption('The hosted SDK could not be loaded.');
    setButtonsEnabled(false);
  }
})();
